-- Migration: Conciliación y corrección de sincronización remitos y pedidos
-- Timestamp: 2026-09-17 10:15:00

-- 1. Eliminar versiones anteriores con ambas firmas para evitar ambigüedad de tipos
DROP FUNCTION IF EXISTS public.get_remitos_filtrados(text, text, text, text);
DROP FUNCTION IF EXISTS public.get_remitos_filtrados(text, text, date, date);

-- 2. Actualizar RPC get_remitos_filtrados canónica
CREATE OR REPLACE FUNCTION public.get_remitos_filtrados(
  p_estado text DEFAULT 'ACTIVOS'::text, 
  p_nro_remito text DEFAULT NULL::text, 
  p_fecha_desde text DEFAULT NULL::text, 
  p_fecha_hasta text DEFAULT NULL::text
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
          ELSE NULL
        END as info_item
    FROM remitos r
    LEFT JOIN choferes ch ON r.chofer_id = ch.id
    LEFT JOIN remito_items ri ON ri.remito_id = r.id
    LEFT JOIN pedido_instancias pi ON COALESCE(ri.destino_instance_id, ri.origen_instance_id) = pi.id AND ri.origen_type = 'PEDIDO'
    LEFT JOIN state_definitions sd ON pi.current_state_id = sd.id
    LEFT JOIN pedidos p ON pi.pedido_id = p.id
    LEFT JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN vinculaciones_pedido_oc v ON (v.pedido_instance_id = pi.id OR v.pedido_instance_id = pi.parent_instance_id)
    LEFT JOIN oc_instancias oi ON v.oc_instance_id = oi.id
    LEFT JOIN ordenes_compra oc ON oi.oc_id = oc.id
    LEFT JOIN proveedores prov ON oc.proveedor_id = prov.id
    WHERE 
        (
          CASE 
            WHEN COALESCE(p_estado, 'ACTIVOS') = 'FINALIZADOS' THEN 
              (r.estado_asignacion IN ('FINALIZADO', 'COMPLETADO') OR r.mision_estado = 'MISION_COMPLETADA')
            WHEN COALESCE(p_estado, 'ACTIVOS') = 'TODOS' THEN 
              TRUE
            ELSE -- 'ACTIVOS' por defecto
              (r.estado_asignacion IN ('ASIGNADO', 'PENDIENTE', 'DATOS_FALTANTES') AND COALESCE(r.mision_estado, '') <> 'MISION_COMPLETADA')
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
        chofer_nombre,
        chofer_dni,
        chofer_telefono,
        COALESCE(jsonb_agg(info_item) FILTER (WHERE info_item IS NOT NULL), '[]'::jsonb) as instancias_vinculadas
    FROM items_del_remito
    GROUP BY remito_internal_id, nro_remito, estado_asignacion, mision_estado, created_at, chofer_nombre, chofer_dni, chofer_telefono
    ORDER BY created_at DESC
)
SELECT COALESCE(jsonb_agg(to_jsonb(ra.*)), '[]'::jsonb) FROM remitos_agrupados ra;
$$;

GRANT ALL ON FUNCTION public.get_remitos_filtrados(text, text, text, text) TO anon, authenticated, service_role;

-- 3. Sincronizar retroactivamente todos los remitos finalizados (excluyendo 54 y 55)
DO $$
DECLARE
  v_r RECORD;
BEGIN
  FOR v_r IN 
    SELECT id 
    FROM public.remitos 
    WHERE (estado_asignacion = 'FINALIZADO' OR mision_estado = 'MISION_COMPLETADA')
      AND id NOT IN (54, 55)
    ORDER BY id
  LOOP
    PERFORM public.fn_finalizar_pedidos_de_remito(v_r.id);
  END LOOP;
END;
$$;
