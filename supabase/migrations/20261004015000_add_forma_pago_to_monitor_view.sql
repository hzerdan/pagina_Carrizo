-- ============================================================================
-- Migración: Agregar forma_pago y gf_pago_aprobado a la vista del Monitor de Pedidos
-- Fecha: 2026-10-04
-- ============================================================================

DROP VIEW IF EXISTS public.vw_monitor_instancias_activas CASCADE;

CREATE OR REPLACE VIEW public.vw_monitor_instancias_activas AS
 WITH tiempos AS (
         SELECT historial_eventos.pedido_instance_id,
            EXTRACT(epoch FROM now() - max(historial_eventos."timestamp")) / 3600::numeric AS horas_en_estado
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
          WHERE (ri.destino_instance_id = pi.id OR ri.origen_instance_id = pi.id AND ri.destino_instance_id IS NULL) AND ri.origen_type = 'PEDIDO'::text) AS nro_remito,
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
                  WHERE he.pedido_instance_id = pi.id AND he.event_type = 'VALIDATION_SUCCESS'::event_type AND he."timestamp" > (( SELECT COALESCE(max(historial_eventos."timestamp"), '1900-01-01 00:00:00-04:16:48'::timestamp with time zone) AS "coalesce"
                           FROM historial_eventos
                          WHERE historial_eventos.pedido_instance_id = pi.id AND historial_eventos.event_type = 'STATE_TRANSITION'::event_type))))) AS tareas_faltantes,
    obtener_proximos_estados(pi.current_state_id) AS proximos_estados,
    ( SELECT pi_root.current_data->>'forma_pago'
      FROM public.pedido_instancias pi_root
      WHERE pi_root.pedido_id = p.id AND pi_root.parent_instance_id IS NULL
      LIMIT 1
    ) AS forma_pago,
    ( SELECT bool_or(COALESCE(r.gf_pago_aprobado, false))
      FROM public.remitos r
      JOIN public.remito_items ri ON ri.remito_id = r.id
      WHERE (ri.destino_instance_id = pi.id OR ri.origen_instance_id = pi.id) AND ri.origen_type = 'PEDIDO'::text
    ) AS gf_pago_aprobado
   FROM pedido_instancias pi
     JOIN pedidos p ON pi.pedido_id = p.id
     JOIN clientes c ON p.cliente_id = c.id
     JOIN state_definitions sd ON pi.current_state_id = sd.id
     LEFT JOIN vinculaciones_pedido_oc vinc ON vinc.pedido_instance_id = pi.id
     LEFT JOIN oc_instancias oi ON vinc.oc_instance_id = oi.id
     LEFT JOIN ordenes_compra oc ON oi.oc_id = oc.id
     LEFT JOIN proveedores prov ON oc.proveedor_id = prov.id
     LEFT JOIN tiempos t ON t.pedido_instance_id = pi.id
  WHERE pi.status = 'ACTIVA'::instance_status OR (sd.state_code::text = ANY (ARRAY['7'::character varying::text, '99'::character varying::text]));
