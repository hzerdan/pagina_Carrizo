-- Finalizar Inspección logic
-- Implementa la lógica de cierre de la inspección y sincronización con Pedidos

CREATE OR REPLACE FUNCTION public.finalizar_inspeccion(
    p_id bigint, 
    p_resultado text, 
    p_observaciones text, 
    p_usuario text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_state_code text;
    v_target_state_id integer;
    v_log_accion text;
BEGIN
    -- 1. Determinar estado destino y acción de log
    IF p_resultado = 'OK' THEN
        v_target_state_code := '3.D4';
        v_log_accion := 'CIERRE_OK';
    ELSIF p_resultado = 'NO_CONFORME' THEN
        v_target_state_code := '3.D5';
        v_log_accion := 'CIERRE_NO_CONFORME';
    ELSE
        RAISE EXCEPTION 'Resultado inválido: %. Solo se permite OK o NO_CONFORME.', p_resultado;
    END IF;

    -- 2. Obtener ID del estado
    SELECT id INTO v_target_state_id 
    FROM public.state_definitions 
    WHERE state_code = v_target_state_code;
    
    IF v_target_state_id IS NULL THEN
        RAISE EXCEPTION 'Estado no encontrado en state_definitions: %', v_target_state_code;
    END IF;

    -- 3. Actualizar Inspección Maestra
    UPDATE public.inspecciones
    SET 
        current_state_id = v_target_state_id,
        resultado_final = p_resultado,
        current_data = COALESCE(current_data, '{}'::jsonb) || jsonb_build_object('observaciones_finales', p_observaciones)
    WHERE id = p_id;

    -- 4. Sincronización con Pedidos (Cruce de FSMs)
    -- Para cada pedido vinculado, actualizamos su current_data con el operador ||
    UPDATE public.pedido_instancias
    SET current_data = COALESCE(current_data, '{}'::jsonb) || jsonb_build_object('export_doc', p_resultado)
    WHERE id IN (
        SELECT pedido_instance_id 
        FROM public.inspeccion_items_pedido 
        WHERE inspeccion_id = p_id
    );

    -- 5. Auditoría: Fan-out historial_eventos (vía log_inspeccion_evento)
    -- Esta función ya se encarga de recorrer los pedidos vinculados.
    PERFORM public.log_inspeccion_evento(
        p_id, 
        v_log_accion, 
        p_usuario, 
        jsonb_build_object(
            'observaciones', p_observaciones,
            'resultado', p_resultado
        )
    );

    RETURN jsonb_build_object(
        'success', true, 
        'new_state', v_target_state_code,
        'message', 'Inspección finalizada correctamente y pedidos sincronizados.'
    );
END;
$$;
