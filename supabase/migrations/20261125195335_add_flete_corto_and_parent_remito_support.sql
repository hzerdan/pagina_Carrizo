-- Migración: Soporte integral para Flete Corto y Remito Troncal / Padre
-- 1. Actualización de trigger trg_remito_mision_completada para transición automática en WhatsApp
DROP TRIGGER IF EXISTS trg_remito_mision_completada ON public.remitos;
DROP FUNCTION IF EXISTS public.trg_fn_remito_mision_completada_sync();

CREATE OR REPLACE FUNCTION public.trg_fn_remito_mision_completada_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Evitar ejecución recursiva si ya estamos dentro de un trigger
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Solo actuar si efectivamente la misión pasó a MISION_COMPLETADA o el remito a FINALIZADO
  IF (NEW.mision_estado = 'MISION_COMPLETADA' OR NEW.estado_asignacion = 'FINALIZADO') THEN
    IF NEW.estado_asignacion <> 'FINALIZADO' THEN
      UPDATE public.remitos
      SET estado_asignacion = 'FINALIZADO'
      WHERE id = NEW.id AND estado_asignacion <> 'FINALIZADO';
    END IF;

    -- Si es un flete corto que finalizó y tiene remito padre asociado:
    -- Transferir automáticamente la conversación activa del chofer al remito padre
    IF NEW.es_flete_corto IS TRUE AND NEW.parent_remito_id IS NOT NULL AND NEW.chofer_id IS NOT NULL THEN
      UPDATE public.conversations
      SET remito_actual_id = NEW.parent_remito_id,
          estado_atencion = 'bot_activo',
          last_activity_at = NOW()
      WHERE (participant_id = NEW.chofer_id OR remito_actual_id = NEW.id)
        AND channel = 'whatsapp';
    END IF;

    -- Sincronizar pedidos asociados
    PERFORM public.fn_finalizar_pedidos_de_remito(NEW.id);

    -- Evaluar y asentar la calificación del chofer y transportista en tiempo real
    PERFORM public.reevaluar_calificaciones(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_remito_mision_completada
AFTER UPDATE ON public.remitos
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_remito_mision_completada_sync();

-- 2. Actualización de get_remitos_filtrados para incluir es_flete_corto y parent_remito_id
DROP FUNCTION IF EXISTS public.get_remitos_filtrados(text, text, text, text);

CREATE OR REPLACE FUNCTION public.get_remitos_filtrados(
    p_estado text DEFAULT 'ACTIVOS'::text,
    p_nro_remito text DEFAULT NULL::text,
    p_fecha_desde text DEFAULT NULL::text,
    p_fecha_hasta text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
WITH items_del_remito AS (
    SELECT 
        r.id as remito_internal_id,
        r.remito_ref_externa as nro_remito,
        r.estado_asignacion,
        r.mision_estado,
        r.created_at,
        r.cantidad_total,
        r.es_flete_corto,
        r.parent_remito_id,
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
        es_flete_corto,
        parent_remito_id,
        chofer_nombre,
        chofer_dni,
        chofer_telefono,
        COALESCE(jsonb_agg(info_item) FILTER (WHERE info_item IS NOT NULL), '[]'::jsonb) as instancias_vinculadas
    FROM items_del_remito
    GROUP BY remito_internal_id, nro_remito, estado_asignacion, mision_estado, created_at, cantidad_total, es_flete_corto, parent_remito_id, chofer_nombre, chofer_dni, chofer_telefono
    ORDER BY created_at DESC
)
SELECT COALESCE(jsonb_agg(to_jsonb(ra.*)), '[]'::jsonb) FROM remitos_agrupados ra;
$function$;
