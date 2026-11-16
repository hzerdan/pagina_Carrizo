-- Migration: Desacoplar envío síncrono de alertas en creación y reprogramación de inspecciones
-- Evita timeout (statement_timeout = 8s) por llamadas HTTP bloqueantes a n8n/Twilio/Telegram durante la creación de la inspección.

DROP FUNCTION IF EXISTS public.crear_nueva_inspeccion_v2(bigint[], integer, integer, text, timestamp with time zone, integer, text);
DROP FUNCTION IF EXISTS public.crear_nueva_inspeccion_v2(bigint[], integer, integer, text, timestamp with time zone, integer, text, integer, text);
DROP FUNCTION IF EXISTS public.crear_nueva_inspeccion_v2(bigint[], integer, integer, text, timestamp with time zone, integer, text, integer, text, integer);
DROP FUNCTION IF EXISTS public.crear_nueva_inspeccion_v2(bigint[], integer, integer, text, timestamp with time zone, integer, text, integer, text, integer, integer);

CREATE OR REPLACE FUNCTION public.crear_nueva_inspeccion_v2(
    p_pedido_instance_ids bigint[], 
    p_inspector_id integer, 
    p_template_id integer, 
    p_tipo_carga text, 
    p_fecha_pactada timestamp with time zone, 
    p_lugar_id integer, 
    p_usuario_actor text, 
    p_servicio_id integer DEFAULT NULL, 
    p_referencia_cliente text DEFAULT NULL, 
    p_cantidad_plantillas_requeridas integer DEFAULT 1,
    p_operador_id integer DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inspeccion_id BIGINT;
    v_pid BIGINT;
    v_effective_servicio_id INTEGER := p_servicio_id;
    v_requiere_pedido BOOLEAN := true;
    v_current_data JSONB := '{}'::jsonb;
    v_state_id_d0 INTEGER;
    v_cant_req INTEGER := COALESCE(p_cantidad_plantillas_requeridas, 1);
BEGIN
    IF v_cant_req < 1 THEN
        v_cant_req := 1;
    END IF;

    -- Servicio por defecto si no viene indicado
    IF v_effective_servicio_id IS NULL THEN
        SELECT id INTO v_effective_servicio_id FROM public.servicios WHERE codigo_servicio = 'INSP_EXP' LIMIT 1;
        IF v_effective_servicio_id IS NULL THEN
            SELECT id INTO v_effective_servicio_id FROM public.servicios ORDER BY id LIMIT 1;
        END IF;
    END IF;

    IF v_effective_servicio_id IS NOT NULL THEN
        SELECT COALESCE(requiere_pedido_ac, true) INTO v_requiere_pedido FROM public.servicios WHERE id = v_effective_servicio_id;
    END IF;

    IF v_requiere_pedido AND (p_pedido_instance_ids IS NULL OR array_length(p_pedido_instance_ids, 1) IS NULL OR array_length(p_pedido_instance_ids, 1) = 0) THEN
        RAISE EXCEPTION 'El servicio seleccionado requiere asociar al menos un pedido de AC.';
    END IF;

    IF p_referencia_cliente IS NOT NULL AND TRIM(p_referencia_cliente) != '' THEN
        v_current_data := jsonb_build_object('referencia_cliente', TRIM(p_referencia_cliente));
    END IF;

    SELECT id INTO v_state_id_d0 FROM public.state_definitions WHERE state_code = '3.D0';

    INSERT INTO public.inspecciones (
        inspector_id, 
        operador_id,
        template_id, 
        tipo_carga, 
        fecha_hora_carga_pactada, 
        lugar_carga_id, 
        current_state_id,
        servicio_id,
        current_data,
        cantidad_plantillas_requeridas
    ) VALUES (
        p_inspector_id, 
        p_operador_id,
        p_template_id, 
        p_tipo_carga, 
        p_fecha_pactada, 
        p_lugar_id, 
        v_state_id_d0,
        v_effective_servicio_id,
        v_current_data,
        v_cant_req
    ) RETURNING id INTO v_inspeccion_id;

    IF p_pedido_instance_ids IS NOT NULL AND array_length(p_pedido_instance_ids, 1) > 0 THEN
        FOREACH v_pid IN ARRAY p_pedido_instance_ids LOOP
            INSERT INTO public.inspeccion_items_pedido (inspeccion_id, pedido_instance_id)
            VALUES (v_inspeccion_id, v_pid);

            INSERT INTO public.historial_eventos (
                pedido_instance_id, event_type, description, user_actor, details
            ) VALUES (
                v_pid, 'STATE_TRANSITION', 'Inspección Iniciada con plantilla ID: ' || p_template_id, 
                p_usuario_actor, jsonb_build_object('inspeccion_id', v_inspeccion_id, 'servicio_id', v_effective_servicio_id, 'operador_id', p_operador_id)
            );
        END LOOP;
    ELSE
        INSERT INTO public.historial_eventos (
            inspeccion_id, event_type, description, user_actor, details
        ) VALUES (
            v_inspeccion_id, 'STATE_TRANSITION', 'Inspección Externa Iniciada con plantilla ID: ' || p_template_id, 
            p_usuario_actor, jsonb_build_object('inspeccion_id', v_inspeccion_id, 'servicio_id', v_effective_servicio_id, 'referencia_cliente', p_referencia_cliente, 'operador_id', p_operador_id)
        );
    END IF;

    -- Nota de arquitectura: Se eliminó el PERFORM enviar_alerta_inspector síncrono.
    -- Las alertas se gestionan por pg_cron (ejecutar_monitoreo_inspecciones cada 10 min) 
    -- o de forma asíncrona no bloqueante desde el cliente web.

    RETURN v_inspeccion_id;
END;
$$;

GRANT ALL ON FUNCTION public.crear_nueva_inspeccion_v2(bigint[], integer, integer, text, timestamp with time zone, integer, text, integer, text, integer, integer) TO anon, authenticated, service_role;
