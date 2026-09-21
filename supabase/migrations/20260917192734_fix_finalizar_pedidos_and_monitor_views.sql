-- Migration: Fix finalizacion de pedidos de remito y vistas de monitor
-- Timestamp: 2026-09-17 19:27:34

-- 1. Actualizar función de finalización de pedidos asociados al remito
-- Se elimina el Paso 4 que ascendía incorrectamente las instancias madre de calce/reserva a Estado 7
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
  END LOOP;
END;
$$;

GRANT ALL ON FUNCTION public.fn_finalizar_pedidos_de_remito(bigint) TO anon, authenticated, service_role;

-- 2. Actualizar vista de Monitor de Pedidos para vincular nro_remito a la sub-instancia de viaje (destino)
CREATE OR REPLACE VIEW public.vw_monitor_instancias_activas AS
 WITH tiempos AS (
         SELECT historial_eventos.pedido_instance_id,
            EXTRACT(epoch FROM now() - max(historial_eventos.timestamp)) / 3600::numeric AS horas_en_estado
           FROM historial_eventos
          WHERE historial_eventos.event_type = 'STATE_TRANSITION'::event_type
          GROUP BY historial_eventos.pedido_instance_id
        )
 SELECT pi.id AS instancia_id,
    pi.identificador_compuesto AS referencia_humana,
    p.pedido_ref_externa AS nro_pedido,
    p.tipo_mercado,
    c.razon_social AS cliente,
    prov.razon_social AS proveedor,
    ( SELECT string_agg(DISTINCT r.remito_ref_externa::text, ', '::text) AS string_agg
           FROM remitos r
             JOIN remito_items ri ON ri.remito_id = r.id
          WHERE (ri.destino_instance_id = pi.id OR (ri.origen_instance_id = pi.id AND ri.destino_instance_id IS NULL))
            AND ri.origen_type = 'PEDIDO'::text) AS nro_remito,
    (sd.state_code::text || ': '::text) || sd.name AS estado_actual,
    round(COALESCE(t.horas_en_estado, 0::numeric), 1) AS horas_transcurridas,
        CASE
            WHEN t.horas_en_estado > 24::numeric THEN 'ROJO'::text
            WHEN t.horas_en_estado > 12::numeric THEN 'AMARILLO'::text
            ELSE 'VERDE'::text
        END AS color_alerta,
    pi.cantidad_requerida_original AS toneladas_originales,
    pi.saldo_pendiente AS toneladas_actuales,
    round(pi.cantidad_requerida_original * 1000::numeric / 50::numeric, 0) AS bolsas_50kg_originales,
    ( SELECT jsonb_agg(vd.name) AS jsonb_agg
           FROM state_validation_requirements svr
             JOIN validation_definitions vd ON svr.validation_id = vd.id
          WHERE svr.state_id = pi.current_state_id AND (p.tipo_mercado::text = 'MI'::text AND vd.validation_code::text !~~ '%_ME_%'::text OR p.tipo_mercado::text = 'ME'::text AND vd.validation_code::text !~~ '%_MI_%'::text OR vd.validation_code::text !~~ '%_ME_%'::text AND vd.validation_code::text !~~ '%_MI_%'::text) AND NOT (vd.validation_code::text IN ( SELECT he.details ->> 'validation_code'::text
                   FROM historial_eventos he
                  WHERE he.pedido_instance_id = pi.id AND he.event_type = 'VALIDATION_SUCCESS'::event_type AND he.timestamp > (( SELECT COALESCE(max(historial_eventos.timestamp), '1900-01-01 00:00:00-04:16:48'::timestamp with time zone) AS coalesce
                           FROM historial_eventos
                          WHERE historial_eventos.pedido_instance_id = pi.id AND historial_eventos.event_type = 'STATE_TRANSITION'::event_type))))) AS tareas_faltantes,
    obtener_proximos_estados(pi.current_state_id) AS proximos_estados
   FROM pedido_instancias pi
     JOIN pedidos p ON pi.pedido_id = p.id
     JOIN clientes c ON p.cliente_id = c.id
     JOIN state_definitions sd ON pi.current_state_id = sd.id
     LEFT JOIN vinculaciones_pedido_oc vinc ON vinc.pedido_instance_id = pi.id
     LEFT JOIN oc_instancias oi ON vinc.oc_instance_id = oi.id
     LEFT JOIN ordenes_compra oc ON oi.oc_id = oc.id
     LEFT JOIN proveedores prov ON oc.proveedor_id = prov.id
     LEFT JOIN tiempos t ON t.pedido_instance_id = pi.id
  WHERE pi.status = 'ACTIVA'::instance_status OR (sd.state_code::text = ANY (ARRAY['7'::character varying, '99'::character varying]::text[]));

GRANT ALL ON TABLE public.vw_monitor_instancias_activas TO anon, authenticated, service_role;

-- 3. Actualizar vista de Monitor de OCs para vincular nro_remito a la sub-instancia de viaje (destino)
CREATE OR REPLACE VIEW public.vw_monitor_oc_instancias_activas AS
 WITH tiempos AS (
         SELECT historial_eventos.oc_instance_id,
            EXTRACT(epoch FROM now() - max(historial_eventos.timestamp)) / 3600::numeric AS horas_en_estado
           FROM historial_eventos
          WHERE historial_eventos.event_type = 'STATE_TRANSITION'::event_type AND historial_eventos.oc_instance_id IS NOT NULL
          GROUP BY historial_eventos.oc_instance_id
        )
 SELECT oi.id AS instancia_id,
    oi.identificador_compuesto AS referencia_humana,
    oc.oc_ref_externa AS nro_pedido,
    oc.tipo_operatoria AS tipo_mercado,
    NULL::text AS cliente,
    prov.razon_social AS proveedor,
    ( SELECT string_agg(DISTINCT r.remito_ref_externa::text, ', '::text) AS string_agg
           FROM remitos r
             JOIN remito_items ri ON ri.remito_id = r.id
          WHERE (ri.destino_instance_id = oi.id OR (ri.origen_instance_id = oi.id AND ri.destino_instance_id IS NULL))
            AND ri.origen_type = 'OC'::text) AS nro_remito,
    (sd.state_code::text || ': '::text) || sd.name AS estado_actual,
    round(COALESCE(t.horas_en_estado, 0::numeric), 1) AS horas_transcurridas,
        CASE
            WHEN t.horas_en_estado > 24::numeric THEN 'ROJO'::text
            WHEN t.horas_en_estado > 12::numeric THEN 'AMARILLO'::text
            ELSE 'VERDE'::text
        END AS color_alerta,
    oi.cantidad_total AS toneladas_originales,
    oi.cantidad_disponible AS toneladas_actuales,
    round(oi.cantidad_total * 1000::numeric / 50::numeric, 0) AS bolsas_50kg_originales,
    ( SELECT jsonb_agg(vd.name) AS jsonb_agg
           FROM state_validation_requirements svr
             JOIN validation_definitions vd ON svr.validation_id = vd.id
          WHERE svr.state_id = oi.current_state_id AND (oc.tipo_operatoria::text = 'MI'::text AND vd.validation_code::text !~~ '%_ME_%'::text OR oc.tipo_operatoria::text = 'ME'::text AND vd.validation_code::text !~~ '%_MI_%'::text OR vd.validation_code::text !~~ '%_ME_%'::text AND vd.validation_code::text !~~ '%_MI_%'::text) AND NOT (vd.validation_code::text IN ( SELECT he.details ->> 'validation_code'::text
                   FROM historial_eventos he
                  WHERE he.oc_instance_id = oi.id AND he.event_type = 'VALIDATION_SUCCESS'::event_type AND he.timestamp > (( SELECT COALESCE(max(historial_eventos.timestamp), '1900-01-01 00:00:00-04:16:48'::timestamp with time zone) AS coalesce
                           FROM historial_eventos
                          WHERE historial_eventos.oc_instance_id = oi.id AND historial_eventos.event_type = 'STATE_TRANSITION'::event_type))))) AS tareas_faltantes,
    obtener_proximos_estados(oi.current_state_id) AS proximos_estados
   FROM oc_instancias oi
     JOIN ordenes_compra oc ON oi.oc_id = oc.id
     LEFT JOIN proveedores prov ON oc.proveedor_id = prov.id
     JOIN state_definitions sd ON oi.current_state_id = sd.id
     LEFT JOIN tiempos t ON t.oc_instance_id = oi.id
  WHERE oi.status = 'ACTIVA'::instance_status OR (sd.state_code::text = ANY (ARRAY['7'::character varying, '99'::character varying]::text[]));

GRANT ALL ON TABLE public.vw_monitor_oc_instancias_activas TO anon, authenticated, service_role;

-- 4. Regularizar las instancias intermedias de calce con saldo 0 a Estado 3.1.1 (COMPLETADA)
UPDATE public.pedido_instancias
SET current_state_id = 9, -- Estado 3.1.1: Esperando remitos
    status = 'COMPLETADA'::public.instance_status,
    updated_at = NOW()
WHERE id IN (211, 212, 220, 221, 222, 223, 239, 246, 247, 265, 280, 284, 285)
  AND current_state_id = 18;
