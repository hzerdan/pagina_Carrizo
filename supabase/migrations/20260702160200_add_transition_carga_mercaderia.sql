-- Migración para añadir la función de transición automática y controlada del estado 5.1 Carga de Mercadería

CREATE OR REPLACE FUNCTION public.intentar_transicion_carga_mercaderia(p_instancia_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_remito_id BIGINT;
    v_protocolo JSONB;
    v_task RECORD;
    v_all_completed BOOLEAN := true;
    v_next_state_id INT;
    v_next_state_code TEXT := '5.5'; -- Siguiente estado (Reembolse)
    v_estado_actual_code TEXT;
    v_error_msg TEXT;
BEGIN
    -- 1. Verificar estado actual
    SELECT sd.state_code INTO v_estado_actual_code
    FROM public.pedido_instancias pi
    JOIN public.state_definitions sd ON pi.current_state_id = sd.id
    WHERE pi.id = p_instancia_id;

    IF v_estado_actual_code IS NULL THEN
        RETURN jsonb_build_object('transicion_exitosa', false, 'mensaje_debug', 'Instancia de pedido no encontrada.');
    END IF;

    IF v_estado_actual_code != '5.1' THEN
        RETURN jsonb_build_object('transicion_exitosa', false, 'mensaje_debug', 'La instancia no está en el estado 5.1 Carga de Mercadería (estado actual: ' || v_estado_actual_code || ').');
    END IF;

    -- 2. Buscar remito asociado
    SELECT r.id, r.protocolo_control INTO v_remito_id, v_protocolo
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) 
      AND ri.origen_type = 'PEDIDO'
    LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('transicion_exitosa', false, 'mensaje_debug', 'No hay remito asociado a esta instancia.');
    END IF;

    -- 3. Evaluar protocolo del chofer
    IF v_protocolo IS NULL OR jsonb_array_length(v_protocolo) = 0 THEN
        v_all_completed := true;
    ELSE
        FOR v_task IN SELECT * FROM jsonb_to_recordset(v_protocolo) AS x(
            tarea text,
            estado text,
            asignada_a_chofer boolean
        )
        LOOP
            IF COALESCE(v_task.asignada_a_chofer, false) = true AND COALESCE(v_task.estado, 'PENDIENTE') != 'COMPLETADO' THEN
                v_all_completed := false;
                v_error_msg := 'Falta completar la tarea del chofer: ' || v_task.tarea;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- 4. Transicionar si aplica
    IF v_all_completed THEN
        SELECT id INTO v_next_state_id FROM public.state_definitions WHERE state_code = v_next_state_code AND fsm_id = 1;
        
        IF v_next_state_id IS NULL THEN
            RETURN jsonb_build_object('transicion_exitosa', false, 'mensaje_debug', 'No se encontró la definición del estado 5.5.');
        END IF;

        -- Registrar éxito de validación para trazabilidad
        INSERT INTO public.historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
        VALUES (p_instancia_id, 'VALIDATION_SUCCESS', 'Verificación de tareas del chofer completada exitosamente', 'SISTEMA', jsonb_build_object('validation_code', 'VAL_P_511', 'status_code', 'SUCCESS'));

        -- Actualizar estado
        UPDATE public.pedido_instancias 
        SET current_state_id = v_next_state_id,
            updated_at = NOW()
        WHERE id = p_instancia_id;

        -- Registrar transición en historial
        INSERT INTO public.historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
        VALUES (
            p_instancia_id, 
            'STATE_TRANSITION', 
            'Transición automática a Estado 5.5 (Carga de Mercadería completada)', 
            'SISTEMA', 
            jsonb_build_object(
                'from_state_id', (SELECT id FROM public.state_definitions WHERE state_code = '5.1' AND fsm_id = 1), 
                'to_state_id', v_next_state_id, 
                'metodo', 'AUTOMATICO_5.1'
            )
        );

        RETURN jsonb_build_object('transicion_exitosa', true, 'nuevo_estado_code', v_next_state_code);
    ELSE
        RETURN jsonb_build_object('transicion_exitosa', false, 'mensaje_debug', COALESCE(v_error_msg, 'No se han completado todas las tareas del chofer.'));
    END IF;
END;
$$;

GRANT ALL ON FUNCTION public.intentar_transicion_carga_mercaderia(bigint) TO anon, authenticated, service_role;
