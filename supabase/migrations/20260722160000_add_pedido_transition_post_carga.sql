-- Migration: Automate order state transitions (5.5, 5.7, 6) post remito cargo phase
CREATE OR REPLACE FUNCTION public.transicionar_pedidos_post_carga_remito(p_remito_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remito RECORD;
  v_item RECORD;
  v_target_state_code TEXT;
  v_target_state_id INT;
  v_es_flete_corto BOOLEAN;
  v_debe_reembolse BOOLEAN;
  v_count INT := 0;
BEGIN
  -- 1. Obtener datos del remito
  SELECT id, remito_ref_externa, es_flete_corto, debe_pasar_por_reembolse, mision_estado
  INTO v_remito
  FROM public.remitos
  WHERE id = p_remito_id;

  IF v_remito.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Remito no encontrado');
  END IF;

  v_es_flete_corto := COALESCE(v_remito.es_flete_corto, false);
  v_debe_reembolse := COALESCE(v_remito.debe_pasar_por_reembolse, false);

  -- 2. Iterar sobre las instancias de pedido asociadas al remito
  FOR v_item IN
    SELECT DISTINCT 
      pi.id AS instance_id,
      pi.current_state_id,
      sd.state_code AS current_state_code,
      p.tipo_mercado
    FROM public.remito_items ri
    JOIN public.pedido_instancias pi 
      ON (ri.destino_instance_id = pi.id OR ri.origen_instance_id = pi.id)
    JOIN public.pedidos p 
      ON pi.pedido_id = p.id
    JOIN public.state_definitions sd 
      ON pi.current_state_id = sd.id
    WHERE ri.remito_id = p_remito_id
      AND ri.origen_type = 'PEDIDO'
  LOOP
    -- Solo transicionar si la instancia está en estado 5.1 (o previo a la fase de tránsito/reembolse/aduana)
    IF v_item.current_state_code IN ('5.1', '5', '3.1.1') THEN
      -- Determinar código de estado destino según la matriz de decisión
      IF v_es_flete_corto OR v_debe_reembolse THEN
        v_target_state_code := '5.5'; -- Reembolse
      ELSIF COALESCE(v_item.tipo_mercado, 'MI') = 'ME' THEN
        v_target_state_code := '5.7'; -- Confirmación de Aduana (ME)
      ELSE
        v_target_state_code := '6';   -- Despacho y Transporte (MI)
      END IF;

      -- Obtener ID del estado destino en state_definitions (FSM 1 = Pedidos)
      SELECT id INTO v_target_state_id 
      FROM public.state_definitions 
      WHERE fsm_id = 1 AND state_code = v_target_state_code 
      LIMIT 1;

      IF v_target_state_id IS NOT NULL AND v_target_state_id <> v_item.current_state_id THEN
        -- Actualizar instancia de pedido
        UPDATE public.pedido_instancias
        SET current_state_id = v_target_state_id,
            updated_at = NOW()
        WHERE id = v_item.instance_id;

        -- Registrar evento en historial_eventos
        INSERT INTO public.historial_eventos (
          pedido_instance_id,
          event_type,
          description,
          user_actor,
          details
        ) VALUES (
          v_item.instance_id,
          'STATE_TRANSITION',
          format(
            'Transición automática a Estado %s por finalización de carga del Remito #%s (Tipo Mercado: %s, Flete Corto: %s, Reembolse: %s)',
            v_target_state_code,
            COALESCE(v_remito.remito_ref_externa, p_remito_id::text),
            COALESCE(v_item.tipo_mercado, 'MI'),
            v_es_flete_corto,
            v_debe_reembolse
          ),
          'sistema_fsm',
          jsonb_build_object(
            'remito_id', p_remito_id,
            'from_state_code', v_item.current_state_code,
            'to_state_code', v_target_state_code,
            'tipo_mercado', COALESCE(v_item.tipo_mercado, 'MI'),
            'es_flete_corto', v_es_flete_corto,
            'debe_pasar_por_reembolse', v_debe_reembolse
          )
        );

        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'instancias_actualizadas', v_count);
END;
$$;

GRANT ALL ON FUNCTION public.transicionar_pedidos_post_carga_remito(bigint) TO anon, authenticated, service_role;

-- 3. Actualizar trigger de autotransición FSM para ejecutar transicionar_pedidos_post_carga_remito al salir de la fase de carga
CREATE OR REPLACE FUNCTION public.trg_fn_fsm_auto_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE
  v_nuevo_estado text;
  v_next_estado text;
  v_all_done boolean;
  v_estado_anterior text;
BEGIN
  IF NEW.protocolo_control IS NULL OR jsonb_array_length(NEW.protocolo_control) = 0 THEN
    RETURN NEW;
  END IF;

  v_estado_anterior := COALESCE(NEW.mision_estado, 'OPERACION_PENDIENTE');
  v_nuevo_estado := v_estado_anterior;

  LOOP
    -- Si estamos en un estado final o de espera externa específica, detener el avance automático en esta pasada
    IF v_nuevo_estado IN ('OPERACION_PENDIENTE', 'MISION_COMPLETADA') THEN
      EXIT;
    END IF;

    -- Verificar si todas las tareas de este estado están procesadas (diferentes de PENDIENTE)
    SELECT COALESCE(bool_and(
      COALESCE((elem->>'asignada_a_chofer')::boolean, true) = false OR
      elem->>'estado' IN ('COMPLETADO', 'REPORTADO_CHOFER', 'NO_REALIZABLE', 'OMITIDO', 'NO_APLICA', 'RECHAZADO')
    ), true)
    INTO v_all_done
    FROM jsonb_array_elements(NEW.protocolo_control) AS elem
    WHERE elem->>'estado_id' = v_nuevo_estado;

    IF v_all_done THEN
      v_next_estado := public.get_next_mision_estado(NEW.id, v_nuevo_estado);
      IF v_next_estado IS NOT NULL AND v_next_estado <> v_nuevo_estado THEN
        v_nuevo_estado := v_next_estado;
      ELSE
        EXIT;
      END IF;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  -- Si cambió el estado, actualizar datos correspondientes
  IF v_nuevo_estado <> v_estado_anterior THEN
    NEW.mision_estado := v_nuevo_estado;
    NEW.ultimo_mensaje_chofer_at := NOW();
    NEW.retry_count := 0;

    -- Si se superó la fase de carga (avanzó hacia EN_TRANSITO, CONTROL_ENTREGA, MISION_COMPLETADA), transicionar pedidos asociados
    IF v_nuevo_estado IN ('EN_TRANSITO', 'PESAJE_BRUTO_DESTINO', 'EN_DESCARGA', 'CONTROL_ENTREGA', 'PESAJE_TARA_DESTINO', 'MISION_COMPLETADA') THEN
      PERFORM public.transicionar_pedidos_post_carga_remito(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Ejecutar la función inmediatamente para el remito #21
SELECT public.transicionar_pedidos_post_carga_remito(21);
