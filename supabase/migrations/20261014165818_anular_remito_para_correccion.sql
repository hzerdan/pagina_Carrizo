-- ============================================================================
-- Migración: Función RPC para anular remitos para corrección
-- Objetivo: Liberar la referencia externa original del remito mediante sufijo (_ANULADO_1),
--           pasar estado_asignacion a 'ANULADO', revertir asignaciones si corresponde,
--           y asentar auditoría completa en metadata_extraida e historial_eventos.
-- ============================================================================

DROP FUNCTION IF EXISTS public.anular_remito_para_correccion(bigint, text, text, boolean);

CREATE OR REPLACE FUNCTION public.anular_remito_para_correccion(
    p_remito_id bigint,
    p_motivo text,
    p_usuario_email text DEFAULT 'SISTEMA',
    p_force_rollback_items boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_motivo TEXT := TRIM(COALESCE(p_motivo, ''));
    v_remito RECORD;
    v_remito_ref TEXT;
    v_items_count INT := 0;
    v_item RECORD;
    v_rollback_res JSONB;
    v_seq INT := 1;
    v_new_ref TEXT;
    v_candidate_ref TEXT;
BEGIN
    -- 1. Validaciones básicas de entrada
    IF p_remito_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'El ID de remito es obligatorio.');
    END IF;

    IF v_motivo = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Debe especificar un motivo para la anulación.');
    END IF;

    -- 2. Bloquear y obtener datos del remito
    SELECT * INTO v_remito 
    FROM public.remitos 
    WHERE id = p_remito_id 
    FOR UPDATE;

    IF v_remito.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Remito no encontrado.');
    END IF;

    IF v_remito.estado_asignacion = 'ANULADO' OR v_remito.remito_ref_externa LIKE '%_ANULADO_%' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este remito ya se encuentra anulado.');
    END IF;

    -- 3. Validar estado de la misión (no permitir anular si el viaje ya está en tránsito o finalizado)
    IF v_remito.mision_estado IN ('EN_TRANSITO', 'CONTROL_ENTREGA', 'MISION_COMPLETADA') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', format('No se puede anular: la misión del remito está en estado avanzado (%s).', v_remito.mision_estado)
        );
    END IF;

    -- 4. Validar o revertir asignaciones activas (remito_items)
    SELECT count(*) INTO v_items_count 
    FROM public.remito_items 
    WHERE remito_id = p_remito_id;

    IF v_items_count > 0 THEN
        IF NOT p_force_rollback_items THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', format('No se puede anular: el remito tiene %s asignación(es) activa(s). Reviértalas primero con rollback_asignacion_remito o active p_force_rollback_items.', v_items_count)
            );
        ELSE
            -- Revertir cada asignación restaurando saldos en las instancias madre
            FOR v_item IN SELECT id FROM public.remito_items WHERE remito_id = p_remito_id LOOP
                v_rollback_res := public.rollback_asignacion_remito(v_item.id, p_usuario_email);
                IF (v_rollback_res->>'status') = 'ERROR' THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'message', format('Error al revertir asignación (item %s): %s', v_item.id, v_rollback_res->>'message')
                    );
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- 5. Calcular sufijo único para liberar el número original
    v_remito_ref := v_remito.remito_ref_externa;
    LOOP
        v_candidate_ref := v_remito_ref || '_ANULADO_' || v_seq;
        IF NOT EXISTS (SELECT 1 FROM public.remitos WHERE remito_ref_externa = v_candidate_ref) THEN
            v_new_ref := v_candidate_ref;
            EXIT;
        END IF;
        v_seq := v_seq + 1;
    END LOOP;

    -- 6. Actualizar remito archivando la referencia y asentando el estado ANULADO
    UPDATE public.remitos
    SET remito_ref_externa = v_new_ref,
        estado_asignacion = 'ANULADO',
        mision_estado = 'OPERACION_PENDIENTE',
        metadata_extraida = jsonb_set(
            COALESCE(metadata_extraida, '{}'::jsonb),
            '{anulacion}',
            jsonb_build_object(
                'fecha', NOW(),
                'motivo', v_motivo,
                'usuario', COALESCE(p_usuario_email, 'SISTEMA'),
                'ref_original', v_remito_ref,
                'ref_archivada', v_new_ref
            )
        ),
        updated_at = NOW()
    WHERE id = p_remito_id;

    -- 7. Registrar auditoría en historial_eventos
    INSERT INTO public.historial_eventos (
        event_type,
        description,
        user_actor,
        details
    ) VALUES (
        'MANUAL_OVERRIDE'::event_type,
        format('Remito #%s (ID %s) anulado para corrección. Ref archivada: %s. Motivo: %s', v_remito_ref, p_remito_id, v_new_ref, v_motivo),
        COALESCE(p_usuario_email, 'SISTEMA'),
        jsonb_build_object(
            'accion', 'ANULAR_REMITO_PARA_CORRECCION',
            'remito_id', p_remito_id,
            'ref_liberada', v_remito_ref,
            'ref_archivada', v_new_ref,
            'motivo', v_motivo
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Remito #%s anulado correctamente. El número ha quedado disponible para cargar la versión corregida.', v_remito_ref),
        'remito_id', p_remito_id,
        'ref_liberada', v_remito_ref,
        'ref_archivada', v_new_ref
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_remito_para_correccion(bigint, text, text, boolean) TO postgres, service_role, authenticated;
