-- Migration: Remitos finalizados logic, triggers for order state 7 sync, and get_remitos_filtrados RPC

-- 1. Actualizar restricción CHECK en remitos.estado_asignacion para incluir 'FINALIZADO'
ALTER TABLE public.remitos DROP CONSTRAINT IF EXISTS remitos_estado_asignacion_check;
ALTER TABLE public.remitos ADD CONSTRAINT remitos_estado_asignacion_check 
  CHECK (estado_asignacion IN ('PENDIENTE', 'ASIGNADO', 'FINALIZADO', 'DESCARTADO'));

-- 2. Función auxiliar para forzar todas las instancias de pedido asociadas a un remito al Estado 7 ("Estado final")
CREATE OR REPLACE FUNCTION public.fn_finalizar_pedidos_de_remito(p_remito_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state_7_id INT;
  v_item RECORD;
BEGIN
  -- Obtener ID del estado 7 (FSM 1 = Pedidos)
  SELECT id INTO v_state_7_id 
  FROM public.state_definitions 
  WHERE fsm_id = 1 AND state_code = '7' 
  LIMIT 1;

  IF v_state_7_id IS NULL THEN
    RETURN;
  END IF;

  -- Recorrer instancias de pedido vinculadas
  FOR v_item IN
    SELECT DISTINCT pi.id AS instance_id, pi.current_state_id, sd.state_code
    FROM public.remito_items ri
    JOIN public.pedido_instancias pi ON (ri.origen_instance_id = pi.id OR ri.destino_instance_id = pi.id)
    JOIN public.state_definitions sd ON pi.current_state_id = sd.id
    WHERE ri.remito_id = p_remito_id
      AND ri.origen_type = 'PEDIDO'
  LOOP
    -- Si la instancia no está en estado final (7, 8 o 99), pasarla a 7
    IF v_item.state_code NOT IN ('7', '8', '99') THEN
      UPDATE public.pedido_instancias
      SET current_state_id = v_state_7_id,
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
        format('Transición automática a Estado 7 (Finalizado) por recepción/finalización de Remito #%s', p_remito_id),
        'sistema_fsm',
        jsonb_build_object(
          'remito_id', p_remito_id,
          'from_state_code', v_item.state_code,
          'to_state_code', '7'
        )
      );
    END IF;
  END LOOP;
END;
$$;

GRANT ALL ON FUNCTION public.fn_finalizar_pedidos_de_remito(bigint) TO anon, authenticated, service_role;

-- 3. Trigger al actualizar remitos: si mision_estado pasa a 'MISION_COMPLETADA' o estado_asignacion pasa a 'FINALIZADO'
CREATE OR REPLACE FUNCTION public.trg_fn_remito_mision_completada_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.mision_estado = 'MISION_COMPLETADA' OR NEW.estado_asignacion = 'FINALIZADO') THEN
    IF NEW.estado_asignacion <> 'FINALIZADO' THEN
      UPDATE public.remitos
      SET estado_asignacion = 'FINALIZADO'
      WHERE id = NEW.id AND estado_asignacion <> 'FINALIZADO';
    END IF;
    -- Finalizar pedidos asociados
    PERFORM public.fn_finalizar_pedidos_de_remito(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remito_mision_completada ON public.remitos;
CREATE TRIGGER trg_remito_mision_completada
  AFTER UPDATE OF mision_estado, estado_asignacion ON public.remitos
  FOR EACH ROW
  WHEN (pg_trigger_depth() < 2)
  EXECUTE FUNCTION public.trg_fn_remito_mision_completada_sync();

-- 4. Trigger al actualizar pedido_instancias: si un pedido pasa a Estado 7, verificar si el remito debe finalizarse
CREATE OR REPLACE FUNCTION public.trg_fn_pedido_finalizado_check_remito()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_state_code TEXT;
  v_remito_rec RECORD;
  v_all_orders_finalized BOOLEAN;
BEGIN
  -- Obtener state_code actual
  SELECT state_code INTO v_state_code
  FROM public.state_definitions
  WHERE id = NEW.current_state_id;

  IF v_state_code = '7' THEN
    -- Buscar remitos vinculados a esta instancia
    FOR v_remito_rec IN
      SELECT DISTINCT ri.remito_id
      FROM public.remito_items ri
      WHERE (ri.origen_instance_id = NEW.id OR ri.destino_instance_id = NEW.id)
        AND ri.origen_type = 'PEDIDO'
    LOOP
      -- Verificar si TODAS las instancias asociadas al remito están en estado 7 (o 8 o 99)
      SELECT COALESCE(bool_and(sd.state_code IN ('7', '8', '99')), true)
      INTO v_all_orders_finalized
      FROM public.remito_items ri
      JOIN public.pedido_instancias pi ON (ri.origen_instance_id = pi.id OR ri.destino_instance_id = pi.id)
      JOIN public.state_definitions sd ON pi.current_state_id = sd.id
      WHERE ri.remito_id = v_remito_rec.remito_id
        AND ri.origen_type = 'PEDIDO';

      IF v_all_orders_finalized THEN
        UPDATE public.remitos
        SET estado_asignacion = 'FINALIZADO',
            mision_estado = 'MISION_COMPLETADA',
            updated_at = NOW()
        WHERE id = v_remito_rec.remito_id
          AND (estado_asignacion <> 'FINALIZADO' OR mision_estado <> 'MISION_COMPLETADA');
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedido_finalizado_check_remito ON public.pedido_instancias;
CREATE TRIGGER trg_pedido_finalizado_check_remito
  AFTER UPDATE OF current_state_id ON public.pedido_instancias
  FOR EACH ROW
  WHEN (pg_trigger_depth() < 2)
  EXECUTE FUNCTION public.trg_fn_pedido_finalizado_check_remito();

-- 5. RPC `get_remitos_filtrados` con filtros de estado, número de remito y rango de fechas
CREATE OR REPLACE FUNCTION public.get_remitos_filtrados(
  p_estado text DEFAULT 'ACTIVOS',
  p_nro_remito text DEFAULT NULL,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL
) 
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
AS $$
WITH items_del_remito AS (
    SELECT 
        r.id as remito_internal_id,
        r.remito_ref_externa as nro_remito,
        r.estado_asignacion,
        r.mision_estado,
        r.created_at,
        ch.nombre_completo as chofer_nombre,
        ch.dni as chofer_dni,
        ch.telefono as chofer_telefono,
        jsonb_build_object(
            'id_instancia', pi.id,
            'identificador_instancia', pi.identificador_compuesto,
            'pedido_ref', p.pedido_ref_externa,
            'cliente', c.razon_social,
            'oc_ref', oc.oc_ref_externa,
            'proveedor', prov.razon_social,
            'cantidad_ton_item', ri.cantidad,
            'estado_pedido_code', sd.state_code
        ) as info_item
    FROM remitos r
    LEFT JOIN choferes ch ON r.chofer_id = ch.id
    JOIN remito_items ri ON ri.remito_id = r.id
    JOIN pedido_instancias pi ON ri.origen_instance_id = pi.id AND ri.origen_type = 'PEDIDO'
    JOIN state_definitions sd ON pi.current_state_id = sd.id
    JOIN pedidos p ON pi.pedido_id = p.id
    JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN vinculaciones_pedido_oc v ON v.pedido_instance_id = pi.id
    LEFT JOIN oc_instancias oi ON v.oc_instance_id = oi.id
    LEFT JOIN ordenes_compra oc ON oi.oc_id = oc.id
    LEFT JOIN proveedores prov ON oc.proveedor_id = prov.id
    WHERE 
        (
          CASE 
            WHEN COALESCE(p_estado, 'ACTIVOS') = 'FINALIZADOS' THEN 
              (r.estado_asignacion = 'FINALIZADO' OR r.mision_estado = 'MISION_COMPLETADA')
            WHEN COALESCE(p_estado, 'ACTIVOS') = 'TODOS' THEN 
              r.estado_asignacion IN ('ASIGNADO', 'FINALIZADO', 'PENDIENTE')
            ELSE -- 'ACTIVOS' por defecto
              r.estado_asignacion = 'ASIGNADO' AND COALESCE(r.mision_estado, '') <> 'MISION_COMPLETADA'
          END
        )
        AND (
          p_nro_remito IS NULL OR TRIM(p_nro_remito) = '' OR 
          r.remito_ref_externa ILIKE '%' || TRIM(p_nro_remito) || '%'
        )
        AND (
          p_fecha_desde IS NULL OR 
          r.created_at >= p_fecha_desde::timestamp
        )
        AND (
          p_fecha_hasta IS NULL OR 
          r.created_at <= (p_fecha_hasta + interval '1 day')::timestamp
        )
),
remitos_agrupados AS (
    SELECT 
        remito_internal_id as id,
        nro_remito,
        estado_asignacion,
        mision_estado,
        created_at,
        chofer_nombre,
        chofer_dni,
        chofer_telefono,
        jsonb_agg(info_item) as instancias_vinculadas
    FROM items_del_remito
    GROUP BY remito_internal_id, nro_remito, estado_asignacion, mision_estado, created_at, chofer_nombre, chofer_dni, chofer_telefono
    ORDER BY created_at DESC
)
SELECT COALESCE(jsonb_agg(to_jsonb(ra.*)), '[]'::jsonb) FROM remitos_agrupados ra;
$$;

GRANT ALL ON FUNCTION public.get_remitos_filtrados(text, text, date, date) TO anon, authenticated, service_role;

-- 6. Retrocompatibilidad para get_remitos_activos invocando get_remitos_filtrados con 'ACTIVOS'
CREATE OR REPLACE FUNCTION public.get_remitos_activos()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT public.get_remitos_filtrados('ACTIVOS', NULL, NULL, NULL);
$$;

-- 7. Sincronización inicial para remitos existentes con mision_estado = 'MISION_COMPLETADA'
UPDATE public.remitos 
SET estado_asignacion = 'FINALIZADO' 
WHERE mision_estado = 'MISION_COMPLETADA' AND estado_asignacion <> 'FINALIZADO';

-- Sincronizar pedidos del remito #21
SELECT public.fn_finalizar_pedidos_de_remito(21);
