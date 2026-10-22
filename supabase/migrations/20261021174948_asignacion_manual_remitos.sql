-- Migration: Asignación Manual de Pedidos/OC para Remitos
-- Permite vincular remitos pendientes desde el frontend respetando el ciclo de vida y registrando discrepancias.

DROP FUNCTION IF EXISTS public.ejecutar_asignacion_manual_remito(bigint, jsonb, text, boolean);

CREATE OR REPLACE FUNCTION public.ejecutar_asignacion_manual_remito(
    p_remito_id bigint,
    p_asignaciones jsonb,
    p_usuario_email text DEFAULT 'desconocido',
    p_forzar_diferencia boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_remito RECORD;
    v_items_count INT;
    v_total_asignado NUMERIC := 0;
    v_diferencia NUMERIC := 0;
    v_item RECORD;
    v_res JSONB;
    v_nueva_inst_id BIGINT;
    v_items_procesados JSONB := '[]'::jsonb;
BEGIN
    -- 1. Verificar existencia del remito
    SELECT * INTO v_remito FROM public.remitos WHERE id = p_remito_id;
    IF v_remito.id IS NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'El remito indicado no existe.');
    END IF;

    -- 2. Verificar que no esté finalizado
    IF v_remito.estado_asignacion = 'FINALIZADO' OR v_remito.mision_estado = 'MISION_COMPLETADA' THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'El remito ya se encuentra finalizado y no puede ser modificado.');
    END IF;

    -- 3. Verificar que no tenga ya ítems vinculados
    SELECT COUNT(*) INTO v_items_count FROM public.remito_items WHERE remito_id = p_remito_id;
    IF v_items_count > 0 THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'El remito ya posee pedidos u órdenes de compra vinculadas.');
    END IF;

    -- 4. Validar que vengan asignaciones
    IF p_asignaciones IS NULL OR jsonb_array_length(p_asignaciones) = 0 THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Debe seleccionar al menos una opción para asignar.');
    END IF;

    -- 5. Validar cada ítem y calcular total
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_asignaciones) AS x(origen_type text, origen_instance_id bigint, cantidad numeric)
    LOOP
        IF v_item.origen_type NOT IN ('PEDIDO', 'OC') THEN
            RETURN jsonb_build_object('status', 'ERROR', 'message', 'Tipo de origen no válido: ' || COALESCE(v_item.origen_type, 'NULL'));
        END IF;

        IF v_item.origen_instance_id IS NULL THEN
            RETURN jsonb_build_object('status', 'ERROR', 'message', 'Falta identificar la instancia origen a asignar.');
        END IF;

        IF v_item.cantidad IS NULL OR v_item.cantidad <= 0 THEN
            RETURN jsonb_build_object('status', 'ERROR', 'message', 'La cantidad asignada para cada opción debe ser mayor a 0 Ton.');
        END IF;

        v_total_asignado := v_total_asignado + v_item.cantidad;
    END LOOP;

    -- 6. Validar diferencia contra cantidad del remito
    v_diferencia := v_total_asignado - COALESCE(v_remito.cantidad_total, 0);
    IF abs(v_diferencia) > 0.01 AND NOT p_forzar_diferencia THEN
        RETURN jsonb_build_object(
            'status', 'DIFERENCIA_DETECTADA',
            'message', 'Las cantidades asignadas (' || v_total_asignado || ' Ton) no coinciden con el total del remito (' || COALESCE(v_remito.cantidad_total, 0) || ' Ton).',
            'cantidad_remito', v_remito.cantidad_total,
            'cantidad_asignada', v_total_asignado,
            'diferencia', v_diferencia
        );
    END IF;

    -- 7. Ejecutar asignaciones individuales
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_asignaciones) AS x(origen_type text, origen_instance_id bigint, cantidad numeric)
    LOOP
        v_res := public.ejecutar_asignacion_remito(p_remito_id, v_item.origen_type, v_item.origen_instance_id, v_item.cantidad);
        IF (v_res->>'status') <> 'SUCCESS' THEN
            RAISE EXCEPTION 'Fallo al procesar asignación: %', (v_res->>'message');
        END IF;

        v_nueva_inst_id := (v_res->>'nueva_instancia_id')::bigint;
        v_items_procesados := v_items_procesados || jsonb_build_array(v_res);

        -- Registrar en historial_eventos para auditoría de trazabilidad
        IF v_item.origen_type = 'PEDIDO' THEN
            INSERT INTO public.historial_eventos (
                pedido_instance_id,
                event_type,
                description,
                user_actor,
                details
            ) VALUES (
                v_nueva_inst_id,
                'MANUAL_OVERRIDE'::event_type,
                'Asignación manual de remito #' || v_remito.remito_ref_externa || ' por ' || p_usuario_email,
                p_usuario_email,
                jsonb_build_object(
                    'remito_id', p_remito_id,
                    'remito_ref', v_remito.remito_ref_externa,
                    'cantidad_asignada_item', v_item.cantidad,
                    'total_asignado_remito', v_total_asignado,
                    'total_declarado_remito', v_remito.cantidad_total,
                    'diferencia_total', v_diferencia,
                    'asignacion_manual', true
                )
            );
        ELSE
            INSERT INTO public.historial_eventos (
                oc_instance_id,
                event_type,
                description,
                user_actor,
                details
            ) VALUES (
                v_nueva_inst_id,
                'MANUAL_OVERRIDE'::event_type,
                'Asignación manual de remito #' || v_remito.remito_ref_externa || ' por ' || p_usuario_email,
                p_usuario_email,
                jsonb_build_object(
                    'remito_id', p_remito_id,
                    'remito_ref', v_remito.remito_ref_externa,
                    'cantidad_asignada_item', v_item.cantidad,
                    'total_asignado_remito', v_total_asignado,
                    'total_declarado_remito', v_remito.cantidad_total,
                    'diferencia_total', v_diferencia,
                    'asignacion_manual', true
                )
            );
        END IF;
    END LOOP;

    -- 8. Actualizar remito con metadata de asignación manual
    UPDATE public.remitos
    SET estado_asignacion = 'ASIGNADO',
        metadata_extraida = jsonb_set(
            COALESCE(metadata_extraida, '{}'::jsonb),
            '{asignacion_manual}',
            jsonb_build_object(
                'asignado_por', p_usuario_email,
                'fecha', NOW(),
                'cantidad_remito', v_remito.cantidad_total,
                'cantidad_asignada', v_total_asignado,
                'diferencia', v_diferencia,
                'items_count', jsonb_array_length(p_asignaciones)
            ),
            true
        ),
        updated_at = NOW()
    WHERE id = p_remito_id;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'message', 'Asignación completada exitosamente.',
        'remito_id', p_remito_id,
        'total_asignado', v_total_asignado,
        'diferencia', v_diferencia,
        'items', v_items_procesados
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ejecutar_asignacion_manual_remito(bigint, jsonb, text, boolean) TO authenticated, service_role, anon;
