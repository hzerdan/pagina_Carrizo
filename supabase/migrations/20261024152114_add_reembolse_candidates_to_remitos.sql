-- Migration: Add Reembolse (State 5.5) candidates to get_candidatos_para_remito
-- Permite que los pedidos en estado 5.5 (Reembolse / flete largo pendiente)
-- aparezcan disponibles agrupados bajo la planta de reembolse donde se descargó el flete corto.

DROP FUNCTION IF EXISTS public.get_candidatos_para_remito(numeric);

CREATE OR REPLACE FUNCTION public.get_candidatos_para_remito(p_cantidad_remito numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_grupos_validos jsonb := '[]'::jsonb;
    v_grupos_insuficientes jsonb := '[]'::jsonb;
BEGIN
    WITH base_data AS (
        -- 1. Pedidos en 3.1.1 (Esperando Remito) con saldo > 0
        SELECT 
            'PEDIDO' as tipo,
            pi.id as id,
            pi.identificador_compuesto as ref,
            pi.saldo_pendiente as saldo,
            -- Origen: Lugar de carga de la OC vinculada (JSON OC)
            COALESCE(oi.current_data->>'lugar_carga', 'Origen No Especificado') as origen_nombre,
            -- Entidad: Nombre del Cliente (JSON Pedido)
            COALESCE(pi.current_data->>'cliente_nombre', 'Cliente Desconocido') as entidad_nombre,
            false as es_reembolse,
            '3.1.1' as estado_codigo
        FROM pedido_instancias pi
        JOIN vinculaciones_pedido_oc v ON v.pedido_instance_id = pi.id
        JOIN oc_instancias oi ON oi.id = v.oc_instance_id
        JOIN state_definitions sd ON pi.current_state_id = sd.id
        WHERE sd.state_code = '3.1.1' 
          AND pi.status = 'ACTIVA'
          AND pi.saldo_pendiente > 0
        
        UNION ALL

        -- 2. Pedidos en 5.5 (Reembolse - Flete Largo pendiente) con saldo > 0
        SELECT 
            'PEDIDO' as tipo,
            pi.id as id,
            pi.identificador_compuesto as ref,
            pi.saldo_pendiente as saldo,
            -- Origen: Depósito donde se descargó el flete corto (Planta de Reembolse)
            COALESCE(d_reembolse.nombre, 'Planta Reembolse Desconocida') as origen_nombre,
            -- Entidad: Nombre del Cliente
            COALESCE(pi.current_data->>'cliente_nombre', 'Cliente Desconocido') as entidad_nombre,
            true as es_reembolse,
            '5.5' as estado_codigo
        FROM pedido_instancias pi
        JOIN state_definitions sd ON pi.current_state_id = sd.id
        LEFT JOIN LATERAL (
            SELECT COALESCE(d.nombre, 'Planta Reembolse Desconocida') as nombre
            FROM remito_items ri
            JOIN remitos r ON r.id = ri.remito_id
            LEFT JOIN depositos d ON d.id = COALESCE(r.deposito_descarga_id, r.deposito_intermedio_id)
            WHERE ri.destino_instance_id = pi.id OR ri.origen_instance_id = pi.parent_instance_id
            ORDER BY ri.created_at DESC
            LIMIT 1
        ) d_reembolse ON true
        WHERE sd.state_code = '5.5'
          AND pi.status = 'ACTIVA'
          AND pi.saldo_pendiente > 0
        
        UNION ALL
        
        -- 3. OCs en 2 (Disponibles) con saldo > 0
        SELECT 
            'OC' as tipo,
            oi.id as id,
            COALESCE(oi.identificador_compuesto, (SELECT oc_ref_externa FROM ordenes_compra WHERE id = oi.oc_id)) as ref,
            oi.cantidad_disponible as saldo,
            -- Origen: Lugar de carga (JSON OC)
            COALESCE(oi.current_data->>'lugar_carga', 'Origen No Especificado') as origen_nombre,
            -- Entidad: Razón Social Proveedor (JSON OC)
            COALESCE(oi.current_data->'proveedor'->>'razon_social', 'Proveedor Desconocido') as entidad_nombre,
            false as es_reembolse,
            '2' as estado_codigo
        FROM oc_instancias oi
        JOIN state_definitions sd ON oi.current_state_id = sd.id
        WHERE sd.state_code = '2' 
          AND oi.status = 'ACTIVA'
          AND oi.cantidad_disponible > 0
    ),
    grouped_data AS (
        SELECT 
            origen_nombre,
            SUM(saldo) as saldo_total,
            jsonb_agg(jsonb_build_object(
                'tipo', tipo,
                'id', id,
                'ref', ref,
                'saldo', saldo,
                'entidad', entidad_nombre,
                'es_reembolse', es_reembolse,
                'estado_codigo', estado_codigo
            )) as items
        FROM base_data
        GROUP BY origen_nombre
        HAVING SUM(saldo) > 0
    )
    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object('origen', origen_nombre, 'total', saldo_total, 'opciones', items)
        ) FILTER (WHERE saldo_total >= p_cantidad_remito), '[]'::jsonb),
        COALESCE(jsonb_agg(
            jsonb_build_object('origen', origen_nombre, 'total', saldo_total, 'opciones', items)
        ) FILTER (WHERE saldo_total < p_cantidad_remito), '[]'::jsonb)
    INTO v_grupos_validos, v_grupos_insuficientes
    FROM grouped_data;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'cantidad_requerida', p_cantidad_remito,
        'grupos_validos', v_grupos_validos,
        'grupos_insuficientes', v_grupos_insuficientes
    );
END;
$function$;
