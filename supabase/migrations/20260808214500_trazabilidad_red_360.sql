-- Migración para la función RPC de Trazabilidad 360° agrupada por Ordenes y Pedidos físicos
CREATE OR REPLACE FUNCTION public.get_trazabilidad_red_360(
    p_instancia_id INT,
    p_entity_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedidos JSONB;
    v_ocs JSONB;
    v_remitos JSONB;
    v_root_pedido_id INT;
    v_root_oc_id INT;
BEGIN
    IF p_entity_type = 'PEDIDO' THEN
        SELECT pedido_id INTO v_root_pedido_id FROM pedido_instancias WHERE id = p_instancia_id;
        
        -- 1. OCs Vinculadas al Pedido (Agrupadas por OC física única)
        WITH grouped_ocs AS (
            SELECT 
                MIN(oi.id) as id,
                'OC'::text as type,
                COALESCE(oc.oc_ref_externa, MIN(oi.identificador_compuesto)) as ref_number,
                COALESCE(prov.razon_social, 'Proveedor sin especificar') as title,
                COALESCE(sd.name, oi.status::text) as status_badge,
                SUM(v.cantidad_vinculada)::text as cantidad_vinculada
            FROM vinculaciones_pedido_oc v
            JOIN pedido_instancias pi ON v.pedido_instance_id = pi.id
            JOIN oc_instancias oi ON v.oc_instance_id = oi.id
            JOIN ordenes_compra oc ON oi.oc_id = oc.id
            LEFT JOIN state_definitions sd ON oi.current_state_id = sd.id
            LEFT JOIN proveedores prov ON oc.proveedor_id = prov.id
            WHERE pi.pedido_id = v_root_pedido_id
            GROUP BY oc.id, oc.oc_ref_externa, prov.razon_social, sd.name, oi.status
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', g.id,
            'type', g.type,
            'ref_number', g.ref_number,
            'title', g.title,
            'status_badge', g.status_badge,
            'cantidad_vinculada', g.cantidad_vinculada
        )), '[]'::jsonb)
        INTO v_ocs
        FROM grouped_ocs g;

        -- 2. Pedidos en la familia
        SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
            'id', pi.id,
            'type', 'PEDIDO',
            'ref_number', COALESCE(p.pedido_ref_externa, pi.identificador_compuesto),
            'title', COALESCE(c.razon_social, 'Cliente sin especificar'),
            'status_badge', COALESCE(sd.name, pi.status::text),
            'cantidad_vinculada', ''
        )), '[]'::jsonb)
        INTO v_pedidos
        FROM pedido_instancias pi
        LEFT JOIN state_definitions sd ON pi.current_state_id = sd.id
        LEFT JOIN pedidos p ON pi.pedido_id = p.id
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE pi.pedido_id = v_root_pedido_id;

        -- 3. Remitos asociados al Pedido
        SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
            'id', r.id,
            'type', 'REMITO',
            'ref_number', COALESCE(r.remito_ref_externa, 'Remito #' || r.id::text),
            'title', COALESCE('Chofer: ' || ch.nombre_completo, 'Sin chofer asignado'),
            'status_badge', COALESCE(r.mision_estado, 'EN_PROCESO')
        )), '[]'::jsonb)
        INTO v_remitos
        FROM remito_items ri
        JOIN remitos r ON ri.remito_id = r.id
        LEFT JOIN choferes ch ON r.chofer_id = ch.id
        WHERE ri.origen_instance_id IN (SELECT id FROM pedido_instancias WHERE pedido_id = v_root_pedido_id) AND ri.origen_type = 'PEDIDO';

    ELSE
        SELECT oc_id INTO v_root_oc_id FROM oc_instancias WHERE id = p_instancia_id;

        -- 1. Pedidos Vinculados a la OC (Agrupados por Pedido físico único)
        WITH grouped_peds AS (
            SELECT 
                MIN(pi.id) as id,
                'PEDIDO'::text as type,
                COALESCE(p.pedido_ref_externa, MIN(pi.identificador_compuesto)) as ref_number,
                COALESCE(c.razon_social, 'Cliente sin especificar') as title,
                COALESCE(sd.name, pi.status::text) as status_badge,
                SUM(v.cantidad_vinculada)::text as cantidad_vinculada
            FROM vinculaciones_pedido_oc v
            JOIN oc_instancias oi ON v.oc_instance_id = oi.id
            JOIN pedido_instancias pi ON v.pedido_instance_id = pi.id
            JOIN pedidos p ON pi.pedido_id = p.id
            LEFT JOIN state_definitions sd ON pi.current_state_id = sd.id
            LEFT JOIN clientes c ON p.cliente_id = c.id
            WHERE oi.oc_id = v_root_oc_id
            GROUP BY p.id, p.pedido_ref_externa, c.razon_social, sd.name, pi.status
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', g.id,
            'type', g.type,
            'ref_number', g.ref_number,
            'title', g.title,
            'status_badge', g.status_badge,
            'cantidad_vinculada', g.cantidad_vinculada
        )), '[]'::jsonb)
        INTO v_pedidos
        FROM grouped_peds g;

        -- 2. OCs en la familia
        SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
            'id', oi.id,
            'type', 'OC',
            'ref_number', COALESCE(oc.oc_ref_externa, oi.identificador_compuesto),
            'title', COALESCE(prov.razon_social, 'Proveedor sin especificar'),
            'status_badge', COALESCE(sd.name, oi.status::text),
            'cantidad_vinculada', ''
        )), '[]'::jsonb)
        INTO v_ocs
        FROM oc_instancias oi
        LEFT JOIN state_definitions sd ON oi.current_state_id = sd.id
        LEFT JOIN ordenes_compra oc ON oi.oc_id = oc.id
        LEFT JOIN proveedores prov ON oc.proveedor_id = prov.id
        WHERE oi.oc_id = v_root_oc_id;

        -- 3. Remitos asociados a la OC (o a sus Pedidos calzados)
        SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
            'id', r.id,
            'type', 'REMITO',
            'ref_number', COALESCE(r.remito_ref_externa, 'Remito #' || r.id::text),
            'title', COALESCE('Chofer: ' || ch.nombre_completo, 'Sin chofer asignado'),
            'status_badge', COALESCE(r.mision_estado, 'EN_PROCESO')
        )), '[]'::jsonb)
        INTO v_remitos
        FROM remito_items ri
        JOIN remitos r ON ri.remito_id = r.id
        LEFT JOIN choferes ch ON r.chofer_id = ch.id
        WHERE (ri.origen_instance_id IN (SELECT id FROM oc_instancias WHERE oc_id = v_root_oc_id) AND ri.origen_type = 'OC')
           OR (ri.origen_instance_id IN (
               SELECT pi.id FROM vinculaciones_pedido_oc v 
               JOIN oc_instancias oi ON v.oc_instance_id = oi.id 
               JOIN pedido_instancias pi ON v.pedido_instance_id = pi.id 
               WHERE oi.oc_id = v_root_oc_id
           ) AND ri.origen_type = 'PEDIDO');

    END IF;

    RETURN jsonb_build_object(
        'pedidos', v_pedidos,
        'ocs', v_ocs,
        'remitos', v_remitos
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_trazabilidad_red_360(INT, TEXT) TO authenticated, anon, service_role;
