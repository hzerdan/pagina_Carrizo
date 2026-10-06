-- ============================================================================
-- Migración: Función RPC para anular pedidos u OCs no vinculados para corrección
-- Objetivo: Liberar la referencia externa original mediante sufijo (_ANULADO_1),
--           pasar a estado 99 (ANULADA) y asentar auditoría completa.
-- ============================================================================

DROP FUNCTION IF EXISTS public.anular_instancia_para_correccion(bigint, text, text, text);

CREATE OR REPLACE FUNCTION public.anular_instancia_para_correccion(
    p_instancia_id bigint,
    p_tipo text, -- 'PEDIDO' o 'OC'
    p_motivo text,
    p_usuario_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tipo TEXT := UPPER(TRIM(COALESCE(p_tipo, '')));
    v_motivo TEXT := TRIM(COALESCE(p_motivo, ''));
    
    -- Variables para Pedido
    v_pedido_inst RECORD;
    v_pedido_ref TEXT;
    
    -- Variables para OC
    v_oc_inst RECORD;
    v_oc_ref TEXT;
    
    -- Estado 99 y Sufijo
    v_state_99_id INT;
    v_seq INT := 1;
    v_new_ref TEXT;
    v_new_compuesto TEXT;
    v_candidate_ref TEXT;
BEGIN
    -- 1. Validaciones básicas de entrada
    IF p_instancia_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'El ID de instancia es obligatorio.');
    END IF;

    IF v_tipo NOT IN ('PEDIDO', 'OC') THEN
        RETURN jsonb_build_object('success', false, 'message', 'El tipo debe ser PEDIDO u OC.');
    END IF;

    IF v_motivo = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Debe especificar un motivo para la anulación.');
    END IF;

    -- =========================================================================
    -- CASO A: ANULACIÓN DE PEDIDO
    -- =========================================================================
    IF v_tipo = 'PEDIDO' THEN
        -- Bloquear y obtener datos de la instancia y pedido
        SELECT pi.*, p.id AS pedido_padre_id, p.pedido_ref_externa, sd.state_code
        INTO v_pedido_inst
        FROM public.pedido_instancias pi
        JOIN public.pedidos p ON pi.pedido_id = p.id
        JOIN public.state_definitions sd ON pi.current_state_id = sd.id
        WHERE pi.id = p_instancia_id
        FOR UPDATE;

        IF v_pedido_inst.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Instancia de pedido no encontrada.');
        END IF;

        IF v_pedido_inst.status = 'ANULADA' OR v_pedido_inst.state_code = '99' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Esta instancia de pedido ya se encuentra anulada.');
        END IF;

        -- Validar que esté en estados previos a vinculación
        IF v_pedido_inst.state_code NOT IN ('1.1', '1.2') THEN
            RETURN jsonb_build_object(
                'success', false, 
                'message', format('Solo se pueden anular pedidos en estado 1.1 o 1.2 (actualmente está en %s).', v_pedido_inst.state_code)
            );
        END IF;

        -- Validar que NO tenga vinculaciones
        IF EXISTS (SELECT 1 FROM public.vinculaciones_pedido_oc WHERE pedido_instance_id = p_instancia_id) THEN
            RETURN jsonb_build_object('success', false, 'message', 'No se puede anular: el pedido ya tiene una vinculación registrada.');
        END IF;

        -- Validar que NO tenga remitos
        IF EXISTS (
            SELECT 1 FROM public.remito_items 
            WHERE origen_instance_id = p_instancia_id OR destino_instance_id = p_instancia_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'No se puede anular: el pedido tiene remitos asociados.');
        END IF;

        -- Obtener ID del estado 99 para Pedido
        SELECT id INTO v_state_99_id
        FROM public.state_definitions
        WHERE fsm_id = 1 AND state_code = '99'
        LIMIT 1;

        v_pedido_ref := v_pedido_inst.pedido_ref_externa;

        -- Calcular sufijo único para liberar el número original
        LOOP
            v_candidate_ref := v_pedido_ref || '_ANULADO_' || v_seq;
            IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE pedido_ref_externa = v_candidate_ref) THEN
                v_new_ref := v_candidate_ref;
                EXIT;
            END IF;
            v_seq := v_seq + 1;
        END LOOP;

        v_new_compuesto := v_pedido_inst.identificador_compuesto || '_ANULADO_' || v_seq;
        WHILE EXISTS (SELECT 1 FROM public.pedido_instancias WHERE identificador_compuesto = v_new_compuesto) LOOP
            v_seq := v_seq + 1;
            v_new_compuesto := v_pedido_inst.identificador_compuesto || '_ANULADO_' || v_seq;
        END LOOP;

        -- Actualizar pedido_instancias
        UPDATE public.pedido_instancias
        SET current_state_id = v_state_99_id,
            status = 'ANULADA'::instance_status,
            identificador_compuesto = v_new_compuesto,
            updated_at = NOW()
        WHERE id = p_instancia_id;

        -- Actualizar pedidos (libera el número)
        UPDATE public.pedidos
        SET pedido_ref_externa = v_new_ref
        WHERE id = v_pedido_inst.pedido_padre_id;

        -- Registrar en historial_eventos
        INSERT INTO public.historial_eventos (
            pedido_instance_id,
            event_type,
            description,
            user_actor,
            details
        ) VALUES (
            p_instancia_id,
            'STATE_TRANSITION'::event_type,
            format('Pedido #%s anulado para corrección. Ref archivada: %s. Motivo: %s', v_pedido_ref, v_new_ref, v_motivo),
            COALESCE(p_usuario_email, 'SISTEMA'),
            jsonb_build_object(
                'accion', 'ANULAR_PARA_CORRECCION',
                'tipo', 'PEDIDO',
                'ref_liberada', v_pedido_ref,
                'ref_archivada', v_new_ref,
                'motivo', v_motivo,
                'to_state_code', '99'
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'message', format('Pedido #%s anulado correctamente. El número ha quedado disponible para cargar la versión corregida.', v_pedido_ref),
            'ref_liberada', v_pedido_ref,
            'ref_archivada', v_new_ref
        );

    -- =========================================================================
    -- CASO B: ANULACIÓN DE ORDEN DE COMPRA (OC)
    -- =========================================================================
    ELSE
        -- Bloquear y obtener datos de la instancia y OC
        SELECT oi.*, oc.id AS oc_padre_id, oc.oc_ref_externa, sd.state_code
        INTO v_oc_inst
        FROM public.oc_instancias oi
        JOIN public.ordenes_compra oc ON oi.oc_id = oc.id
        JOIN public.state_definitions sd ON oi.current_state_id = sd.id
        WHERE oi.id = p_instancia_id
        FOR UPDATE;

        IF v_oc_inst.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Instancia de OC no encontrada.');
        END IF;

        IF v_oc_inst.status = 'ANULADA' OR v_oc_inst.state_code = '99' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Esta instancia de OC ya se encuentra anulada.');
        END IF;

        -- Validar que esté en estados previos a vinculación
        IF v_oc_inst.state_code NOT IN ('1', '2') THEN
            RETURN jsonb_build_object(
                'success', false, 
                'message', format('Solo se pueden anular OCs en estado 1 o 2 (actualmente está en %s).', v_oc_inst.state_code)
            );
        END IF;

        -- Validar que NO tenga vinculaciones
        IF EXISTS (SELECT 1 FROM public.vinculaciones_pedido_oc WHERE oc_instance_id = p_instancia_id) THEN
            RETURN jsonb_build_object('success', false, 'message', 'No se puede anular: la OC ya tiene una vinculación registrada.');
        END IF;

        -- Validar que NO tenga remitos
        IF EXISTS (
            SELECT 1 FROM public.remito_items 
            WHERE origen_instance_id = p_instancia_id OR destino_instance_id = p_instancia_id
        ) THEN
            RETURN jsonb_build_object('success', false, 'message', 'No se puede anular: la OC tiene remitos asociados.');
        END IF;

        -- Obtener ID del estado 99 para OC
        SELECT id INTO v_state_99_id
        FROM public.state_definitions
        WHERE fsm_id = 2 AND state_code = '99'
        LIMIT 1;

        v_oc_ref := v_oc_inst.oc_ref_externa;

        -- Calcular sufijo único para liberar el número original
        LOOP
            v_candidate_ref := v_oc_ref || '_ANULADO_' || v_seq;
            IF NOT EXISTS (SELECT 1 FROM public.ordenes_compra WHERE oc_ref_externa = v_candidate_ref) THEN
                v_new_ref := v_candidate_ref;
                EXIT;
            END IF;
            v_seq := v_seq + 1;
        END LOOP;

        v_new_compuesto := v_oc_inst.identificador_compuesto || '_ANULADO_' || v_seq;
        WHILE EXISTS (SELECT 1 FROM public.oc_instancias WHERE identificador_compuesto = v_new_compuesto) LOOP
            v_seq := v_seq + 1;
            v_new_compuesto := v_oc_inst.identificador_compuesto || '_ANULADO_' || v_seq;
        END LOOP;

        -- Actualizar oc_instancias
        UPDATE public.oc_instancias
        SET current_state_id = v_state_99_id,
            status = 'ANULADA'::instance_status,
            identificador_compuesto = v_new_compuesto,
            updated_at = NOW()
        WHERE id = p_instancia_id;

        -- Actualizar ordenes_compra (libera el número)
        UPDATE public.ordenes_compra
        SET oc_ref_externa = v_new_ref
        WHERE id = v_oc_inst.oc_padre_id;

        -- Registrar en historial_eventos
        INSERT INTO public.historial_eventos (
            oc_instance_id,
            event_type,
            description,
            user_actor,
            details
        ) VALUES (
            p_instancia_id,
            'STATE_TRANSITION'::event_type,
            format('OC #%s anulada para corrección. Ref archivada: %s. Motivo: %s', v_oc_ref, v_new_ref, v_motivo),
            COALESCE(p_usuario_email, 'SISTEMA'),
            jsonb_build_object(
                'accion', 'ANULAR_PARA_CORRECCION',
                'tipo', 'OC',
                'ref_liberada', v_oc_ref,
                'ref_archivada', v_new_ref,
                'motivo', v_motivo,
                'to_state_code', '99'
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'message', format('OC #%s anulada correctamente. El número ha quedado disponible para cargar la versión corregida.', v_oc_ref),
            'ref_liberada', v_oc_ref,
            'ref_archivada', v_new_ref
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_instancia_para_correccion(bigint, text, text, text) TO authenticated, service_role;
