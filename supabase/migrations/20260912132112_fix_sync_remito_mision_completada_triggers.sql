-- Migration: Fix synchronization of remito completion triggers to finalize order instances
-- Timestamp: 2026-09-12 13:25:00

-- 1. Actualizar función de finalización de pedidos asociados al remito
DROP FUNCTION IF EXISTS public.fn_finalizar_pedidos_de_remito(bigint);

CREATE OR REPLACE FUNCTION public.fn_finalizar_pedidos_de_remito(p_remito_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remito RECORD;
  v_target_state_code TEXT;
  v_target_state_id INT;
  v_item RECORD;
  v_parent_id BIGINT;
  v_all_children_finalized BOOLEAN;
BEGIN
  -- 1. Obtener datos del remito
  SELECT id, tipo_flete, es_flete_corto, debe_pasar_por_reembolse, remito_ref_externa
  INTO v_remito
  FROM public.remitos
  WHERE id = p_remito_id;

  IF v_remito.id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Determinar estado destino según el tipo de flete:
  -- Si es Flete Corto o pasa por Reembolse -> La sub-instancia pasa a Estado 5.5 (Reembolse)
  -- Si es Flete Directo o Flete Largo Final -> La sub-instancia pasa a Estado 7 (Estado final / Completada)
  IF COALESCE(v_remito.es_flete_corto, false) = true 
     OR COALESCE(v_remito.debe_pasar_por_reembolse, false) = true 
     OR COALESCE(v_remito.tipo_flete, 'DIRECTO') = 'CORTO' THEN
    v_target_state_code := '5.5'; -- 5.5: Reembolse
  ELSE
    v_target_state_code := '7';   -- 7: Estado final / Completada
  END IF;

  SELECT id INTO v_target_state_id 
  FROM public.state_definitions 
  WHERE fsm_id = 1 AND state_code = v_target_state_code 
  LIMIT 1;

  IF v_target_state_id IS NULL THEN
    RETURN;
  END IF;

  -- 3. Recorrer únicamente las sub-instancias de viaje vinculadas al remito
  FOR v_item IN
    SELECT DISTINCT pi.id AS instance_id, pi.current_state_id, sd.state_code, pi.parent_instance_id
    FROM public.remito_items ri
    JOIN public.pedido_instancias pi ON pi.id = COALESCE(ri.destino_instance_id, ri.origen_instance_id)
    JOIN public.state_definitions sd ON pi.current_state_id = sd.id
    WHERE ri.remito_id = p_remito_id
      AND ri.origen_type = 'PEDIDO'
  LOOP
    -- Si la instancia no está ya en el estado destino ni en estados finales terminales (8, 99)
    IF v_item.current_state_id <> v_target_state_id AND v_item.state_code NOT IN ('7', '8', '99') THEN
      UPDATE public.pedido_instancias
      SET current_state_id = v_target_state_id,
          status = CASE WHEN v_target_state_code = '7' THEN 'COMPLETADA'::instance_status ELSE status END,
          updated_at = NOW()
      WHERE id = v_item.instance_id;

      INSERT INTO public.historial_eventos (
        pedido_instance_id,
        event_type,
        description,
        user_actor,
        details
      ) VALUES (
        v_item.instance_id,
        'STATE_TRANSITION',
        format('Transición automática a Estado %s por finalización de Remito #%s (%s)', v_target_state_code, COALESCE(v_remito.remito_ref_externa, p_remito_id::text), CASE WHEN v_target_state_code = '5.5' THEN 'Flete Corto / Reembolse' ELSE 'Remito Completado' END),
        'sistema_fsm',
        jsonb_build_object(
          'remito_id', p_remito_id,
          'from_state_code', v_item.state_code,
          'to_state_code', v_target_state_code
        )
      );
    END IF;

    -- 4. Si la sub-instancia hija tiene madre y quedó en Estado 7, verificar si la madre debe finalizarse
    IF v_target_state_code = '7' AND v_item.parent_instance_id IS NOT NULL THEN
      v_parent_id := v_item.parent_instance_id;

      SELECT COALESCE(bool_and(sd_h.state_code IN ('7', '8', '99')), true)
      INTO v_all_children_finalized
      FROM public.pedido_instancias pi_h
      JOIN public.state_definitions sd_h ON pi_h.current_state_id = sd_h.id
      WHERE pi_h.parent_instance_id = v_parent_id;

      IF v_all_children_finalized THEN
        UPDATE public.pedido_instancias pi_m
        SET current_state_id = v_target_state_id,
            status = 'COMPLETADA'::instance_status,
            updated_at = NOW()
        WHERE pi_m.id = v_parent_id
          AND COALESCE(pi_m.saldo_pendiente, 0) <= 0
          AND pi_m.current_state_id <> v_target_state_id;

        IF FOUND THEN
          INSERT INTO public.historial_eventos (
            pedido_instance_id,
            event_type,
            description,
            user_actor,
            details
          ) VALUES (
            v_parent_id,
            'STATE_TRANSITION',
            format('Transición automática a Estado 7 (Finalizado): todas las sub-instancias de viaje han finalizado con el Remito #%s', COALESCE(v_remito.remito_ref_externa, p_remito_id::text)),
            'sistema_fsm',
            jsonb_build_object(
              'remito_id', p_remito_id,
              'to_state_code', '7'
            )
          );
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT ALL ON FUNCTION public.fn_finalizar_pedidos_de_remito(bigint) TO anon, authenticated, service_role;

-- 2. Actualizar función y trigger de sincronización al completar misión o finalizar remito
DROP FUNCTION IF EXISTS public.trg_fn_remito_mision_completada_sync() CASCADE;

CREATE OR REPLACE FUNCTION public.trg_fn_remito_mision_completada_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Evaluar si la misión está completada o el remito finalizado
  IF (NEW.mision_estado = 'MISION_COMPLETADA' OR NEW.estado_asignacion = 'FINALIZADO') THEN
    IF NEW.estado_asignacion <> 'FINALIZADO' THEN
      UPDATE public.remitos
      SET estado_asignacion = 'FINALIZADO'
      WHERE id = NEW.id AND estado_asignacion <> 'FINALIZADO';
    END IF;
    -- Sincronizar pedidos asociados
    PERFORM public.fn_finalizar_pedidos_de_remito(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remito_mision_completada ON public.remitos;

-- Se agrega protocolo_control a las columnas observadas para que los cambios
-- aplicados por triggers BEFORE UPDATE sobre mision_estado/estado_asignacion disparen la sincronización
CREATE TRIGGER trg_remito_mision_completada
  AFTER UPDATE OF mision_estado, estado_asignacion, protocolo_control ON public.remitos
  FOR EACH ROW
  WHEN (pg_trigger_depth() < 2)
  EXECUTE FUNCTION public.trg_fn_remito_mision_completada_sync();
