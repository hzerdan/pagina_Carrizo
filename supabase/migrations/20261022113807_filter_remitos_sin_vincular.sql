-- Migration: Soporte de filtro 'SIN_VINCULAR' y cantidad_total en get_remitos_filtrados
-- Permite filtrar remitos pendientes de asignación y separa los activos en curso de los que requieren vinculación.

DROP FUNCTION IF EXISTS public.get_remitos_filtrados(text, text, text, text);

CREATE OR REPLACE FUNCTION public.get_remitos_filtrados(
    p_estado text DEFAULT 'ACTIVOS',
    p_nro_remito text DEFAULT NULL,
    p_fecha_desde text DEFAULT NULL,
    p_fecha_hasta text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH items_del_remito AS (
    SELECT 
        r.id as remito_internal_id,
        r.remito_ref_externa as nro_remito,
        r.estado_asignacion,
        r.mision_estado,
        r.created_at,
        r.cantidad_total,
        ch.nombre_completo as chofer_nombre,
        ch.dni as chofer_dni,
        ch.telefono as chofer_telefono,
        CASE 
          WHEN pi.id IS NOT NULL THEN
            jsonb_build_object(
                'id_instancia', pi.id,
                'identificador_instancia', pi.identificador_compuesto,
                'pedido_ref', p.pedido_ref_externa,
                'cliente', c.razon_social,
                'oc_ref', oc.oc_ref_externa,
                'proveedor', prov.razon_social,
                'cantidad_ton_item', ri.cantidad,
                'estado_pedido_code', sd.state_code
            )
          WHEN oi_direct.id IS NOT NULL THEN
            jsonb_build_object(
                'id_instancia', oi_direct.id,
                'identificador_instancia', oi_direct.identificador_compuesto,
                'pedido_ref', '-',
                'cliente', '-',
                'oc_ref', oc_direct.oc_ref_externa,
                'proveedor', prov_direct.razon_social,
                'cantidad_ton_item', ri.cantidad,
                'estado_pedido_code', sd_oc.state_code
            )
          ELSE NULL
        END as info_item
    FROM remitos r
    LEFT JOIN choferes ch ON r.chofer_id = ch.id
    LEFT JOIN remito_items ri ON ri.remito_id = r.id
    -- Vinculaciones a pedidos
    LEFT JOIN pedido_instancias pi ON COALESCE(ri.destino_instance_id, ri.origen_instance_id) = pi.id AND ri.origen_type = 'PEDIDO'
    LEFT JOIN state_definitions sd ON pi.current_state_id = sd.id
    LEFT JOIN pedidos p ON pi.pedido_id = p.id
    LEFT JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN vinculaciones_pedido_oc v ON (v.pedido_instance_id = pi.id OR v.pedido_instance_id = pi.parent_instance_id)
    LEFT JOIN oc_instancias oi ON v.oc_instance_id = oi.id
    LEFT JOIN ordenes_compra oc ON oi.oc_id = oc.id
    LEFT JOIN proveedores prov ON oc.proveedor_id = prov.id
    -- Vinculaciones directas a OC
    LEFT JOIN oc_instancias oi_direct ON COALESCE(ri.destino_instance_id, ri.origen_instance_id) = oi_direct.id AND ri.origen_type = 'OC'
    LEFT JOIN state_definitions sd_oc ON oi_direct.current_state_id = sd_oc.id
    LEFT JOIN ordenes_compra oc_direct ON oi_direct.oc_id = oc_direct.id
    LEFT JOIN proveedores prov_direct ON oc_direct.proveedor_id = prov_direct.id
    WHERE 
        (
          CASE 
            WHEN COALESCE(p_estado, 'ACTIVOS') = 'FINALIZADOS' THEN 
              (r.estado_asignacion IN ('FINALIZADO', 'COMPLETADO') OR r.mision_estado = 'MISION_COMPLETADA')
            WHEN COALESCE(p_estado, 'ACTIVOS') = 'SIN_VINCULAR' THEN 
              (r.estado_asignacion = 'PENDIENTE' OR NOT EXISTS (SELECT 1 FROM remito_items ri2 WHERE ri2.remito_id = r.id))
              AND r.estado_asignacion NOT IN ('FINALIZADO', 'COMPLETADO')
              AND COALESCE(r.mision_estado, '') <> 'MISION_COMPLETADA'
            WHEN COALESCE(p_estado, 'ACTIVOS') = 'TODOS' THEN 
              TRUE
            ELSE -- 'ACTIVOS' por defecto: remitos asignados y operativos en curso
              (
                r.estado_asignacion NOT IN ('FINALIZADO', 'COMPLETADO')
                AND COALESCE(r.mision_estado, '') <> 'MISION_COMPLETADA'
                AND EXISTS (SELECT 1 FROM remito_items ri3 WHERE ri3.remito_id = r.id)
              )
          END
        )
        AND (
          p_nro_remito IS NULL OR TRIM(p_nro_remito) = '' OR 
          r.remito_ref_externa ILIKE '%' || TRIM(p_nro_remito) || '%'
        )
        AND (
          p_fecha_desde IS NULL OR TRIM(p_fecha_desde) = '' OR 
          r.created_at >= p_fecha_desde::timestamp
        )
        AND (
          p_fecha_hasta IS NULL OR TRIM(p_fecha_hasta) = '' OR 
          r.created_at <= (p_fecha_hasta::timestamp + interval '1 day')
        )
),
remitos_agrupados AS (
    SELECT 
        remito_internal_id as id,
        nro_remito,
        estado_asignacion,
        mision_estado,
        created_at,
        cantidad_total,
        chofer_nombre,
        chofer_dni,
        chofer_telefono,
        COALESCE(jsonb_agg(info_item) FILTER (WHERE info_item IS NOT NULL), '[]'::jsonb) as instancias_vinculadas
    FROM items_del_remito
    GROUP BY remito_internal_id, nro_remito, estado_asignacion, mision_estado, created_at, cantidad_total, chofer_nombre, chofer_dni, chofer_telefono
    ORDER BY created_at DESC
)
SELECT COALESCE(jsonb_agg(to_jsonb(ra.*)), '[]'::jsonb) FROM remitos_agrupados ra;
$$;

GRANT EXECUTE ON FUNCTION public.get_remitos_filtrados(text, text, text, text) TO authenticated, service_role, anon;
