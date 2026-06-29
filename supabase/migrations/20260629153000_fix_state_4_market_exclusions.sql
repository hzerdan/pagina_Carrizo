-- Update get_checklist_instancia to exclude market-specific validations globally for all states
CREATE OR REPLACE FUNCTION "public"."get_checklist_instancia"("p_instancia_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_state_id INT;
    v_current_data JSONB;
    v_tipo_mercado TEXT;
    v_prefix_to_exclude TEXT;
    r RECORD;
    v_func_name TEXT;
    v_result JSONB;
    v_status TEXT;
    v_message TEXT;
    v_cumplido BOOLEAN;
    v_checklist JSONB := '[]'::jsonb;
BEGIN
    -- Obtener datos de la instancia
    SELECT
        pi.current_state_id, p.tipo_mercado, pi.current_data
    INTO v_current_state_id, v_tipo_mercado, v_current_data
    FROM public.pedido_instancias pi
    JOIN public.pedidos p ON pi.pedido_id = p.id
    WHERE pi.id = p_instancia_id;

    IF v_current_state_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Instancia no encontrada.');
    END IF;

    -- Determinar filtro de exclusión (mismo criterio de ejecutar_validaciones_iniciales)
    IF v_tipo_mercado = 'MI' THEN v_prefix_to_exclude := 'VAL_P_ME_%';
    ELSIF v_tipo_mercado = 'ME' THEN v_prefix_to_exclude := 'VAL_P_MI_%';
    ELSE v_prefix_to_exclude := '@@@@';
    END IF;

    -- Iterar sobre las validaciones requeridas
    FOR r IN (
        SELECT vd.validation_code, vd.name as validation_name, vd.is_blocking
        FROM public.validation_definitions vd
        JOIN public.state_validation_requirements svr ON vd.id = svr.validation_id
        WHERE svr.state_id = v_current_state_id
          AND vd.validation_code NOT LIKE v_prefix_to_exclude
        ORDER BY vd.is_blocking DESC, vd.name ASC
    )
    LOOP
        v_func_name := 'f_' || lower(r.validation_code);
        v_status := 'FAILURE';
        v_message := '';

        BEGIN
            EXECUTE format('SELECT %I(%L::bigint, %L::jsonb)', v_func_name, p_instancia_id, v_current_data)
            INTO v_result;
            v_status := v_result->>'status';
            v_message := COALESCE(v_result->>'message', '');
        EXCEPTION
            WHEN undefined_function THEN
                v_status := 'FAILURE';
                v_message := 'Validación pendiente o función de validación no definida.';
            WHEN others THEN
                v_status := 'FAILURE';
                v_message := 'Error al evaluar validación: ' || SQLERRM;
        END;

        v_cumplido := (v_status = 'SUCCESS');

        v_checklist := v_checklist || jsonb_build_array(jsonb_build_object(
            'codigo', r.validation_code,
            'nombre', r.validation_name,
            'es_bloqueante', r.is_blocking,
            'cumplido', v_cumplido,
            'mensaje', v_message
        ));
    END LOOP;

    RETURN v_checklist;
END;
$$;

-- Update ejecutar_validaciones_iniciales to exclude market-specific validations globally for all states
CREATE OR REPLACE FUNCTION public.ejecutar_validaciones_iniciales(p_instancia_id bigint, p_json_data jsonb) RETURNS jsonb 
LANGUAGE plpgsql AS $$
DECLARE
    v_current_state_id INT;
    v_tipo_mercado TEXT;
    v_prefix_to_exclude TEXT;
    r RECORD;
    v_func_name TEXT;
    v_result JSONB;
    v_status TEXT;
    v_message TEXT; 
    v_checked_value JSONB;
    v_validation_code TEXT;
    v_is_blocking BOOLEAN;
    v_summary JSONB;
    v_last_transition_time TIMESTAMPTZ;
    v_transition_summary JSONB; 
    v_margen_calculado NUMERIC;
BEGIN
    -- 1. Obtener datos y la hora de la última transición
    SELECT
        pi.current_state_id, p.tipo_mercado,
        (SELECT COALESCE(MAX("timestamp"), '1970-01-01') FROM historial_eventos
         WHERE pedido_instance_id = pi.id AND event_type = 'STATE_TRANSITION')
    INTO v_current_state_id, v_tipo_mercado, v_last_transition_time
    FROM pedido_instancias pi
    JOIN pedidos p ON pi.pedido_id = p.id
    WHERE pi.id = p_instancia_id;

    IF v_current_state_id IS NULL THEN RAISE EXCEPTION 'Instancia de Pedido ID % no encontrada.', p_instancia_id; END IF;

    -- 2. Determinar filtro de exclusión
    IF v_tipo_mercado = 'MI' THEN v_prefix_to_exclude := 'VAL_P_ME_%';
    ELSIF v_tipo_mercado = 'ME' THEN v_prefix_to_exclude := 'VAL_P_MI_%';
    ELSE v_prefix_to_exclude := '@@@@';
    END IF;

    -- 3. Iterar sobre las validaciones
    FOR r IN (
        SELECT vd.validation_code, vd.is_blocking
        FROM validation_definitions vd
        JOIN state_validation_requirements svr ON vd.id = svr.validation_id
        WHERE svr.state_id = v_current_state_id
          AND vd.validation_code NOT LIKE v_prefix_to_exclude
    )
    LOOP
        v_validation_code := r.validation_code;
        v_is_blocking := r.is_blocking;
        v_func_name := 'f_' || lower(v_validation_code); 

        BEGIN
            EXECUTE format('SELECT %I(%L::bigint, %L::jsonb)', v_func_name, p_instancia_id, p_json_data)
            INTO v_result;
            v_status := v_result->>'status';
            v_message := COALESCE(v_result->>'message', 'ERROR: Mensaje de validación no retornado por ' || v_func_name || '.');
            v_checked_value := v_result->'checked_value';
        EXCEPTION
            WHEN undefined_function THEN
                v_status := 'FAILURE'; v_message := 'Error: Función ' || v_func_name || ' no definida.'; v_checked_value := null;
            WHEN others THEN
                v_status := 'FAILURE'; v_message := 'Error en ' || v_func_name || ': ' || SQLERRM; v_checked_value := null;
        END;

        -- 4. Registrar el resultado
        INSERT INTO historial_eventos (
            pedido_instance_id, event_type, description, user_actor, details
        ) VALUES (
            p_instancia_id,
            CASE
                WHEN v_status = 'SUCCESS' THEN 'VALIDATION_SUCCESS'::event_type
                WHEN v_status = 'DENIED'  THEN 'VALIDATION_DENIED'::event_type
                ELSE 'VALIDATION_FAILURE'::event_type
            END,
            v_message,
            'SISTEMA',
            jsonb_build_object('validation_code', v_validation_code, 'is_blocking', v_is_blocking, 'checked_value', v_checked_value, 'status_code', v_status)
        );
    END LOOP;

    -- 5. Construir el resumen de validación
    SELECT jsonb_build_object(
        'hay_denegaciones_bloqueantes',
        EXISTS ( SELECT 1 FROM historial_eventos WHERE pedido_instance_id = p_instancia_id AND event_type = 'VALIDATION_DENIED' AND (details->>'is_blocking')::boolean = true AND "timestamp" > v_last_transition_time ),
        'hay_fallos_bloqueantes',
        EXISTS ( SELECT 1 FROM historial_eventos WHERE pedido_instance_id = p_instancia_id AND event_type = 'VALIDATION_FAILURE' AND (details->>'is_blocking')::boolean = true AND "timestamp" > v_last_transition_time ),
        'denegaciones',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('mensaje', description, 'es_bloqueante', (details->>'is_blocking')::boolean)), '[]'::jsonb) FROM historial_eventos WHERE pedido_instance_id = p_instancia_id AND event_type = 'VALIDATION_DENIED' AND "timestamp" > v_last_transition_time),
        'fallos_pendientes',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('mensaje', description, 'es_bloqueante', (details->>'is_blocking')::boolean)), '[]'::jsonb) FROM historial_eventos WHERE pedido_instance_id = p_instancia_id AND event_type = 'VALIDATION_FAILURE' AND "timestamp" > v_last_transition_time)
    ) INTO v_summary;

    -- 5.5. ANEXAR EL MARGEN DE RENTABILIDAD CALCULADO (si existe)
    SELECT margen_rentabilidad_calculado INTO v_margen_calculado
    FROM vinculaciones_pedido_oc
    WHERE pedido_instance_id = p_instancia_id;
    
    IF v_margen_calculado IS NOT NULL THEN
        v_summary := v_summary || jsonb_build_object('margen_rentabilidad_calculado', v_margen_calculado);
    END IF;

    -- 6. LLAMAR A LA LÓGICA DE TRANSICIÓN DE PEDIDOS
    SELECT * FROM intentar_transicion_automatica_pedido(p_instancia_id)
    INTO v_transition_summary;

    -- 7. Devolver el resumen combinado
    RETURN v_summary || v_transition_summary;

END;
$$;
