-- ============================================================================
-- Migración: Upgrade Ciclo de Vida y Alertas de Inspecciones Documentales
-- Fecha: 2026-09-10
-- Reglas AGENTS.md: Incluir siempre DROP FUNCTION IF EXISTS antes de CREATE
-- ============================================================================

-- 1. Actualizar enviar_alerta_inspector (Eliminar force_freeform para permitir Content Template en n8n)
DROP FUNCTION IF EXISTS public.enviar_alerta_inspector(bigint, text, text);
DROP FUNCTION IF EXISTS public.enviar_alerta_inspector(bigint, text);

CREATE OR REPLACE FUNCTION public.enviar_alerta_inspector(
    p_inspeccion_id bigint,
    p_tipo_alerta text, -- 'ASIGNACION' | 'RECORDATORIO_PREVIO_24H' | 'RECORDATORIO_PLANILLAS_POST_24H'
    p_usuario_actor text DEFAULT 'SISTEMA_MONITOREO'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inspeccion RECORD;
    v_inspector RECORD;
    v_lugar_nombre TEXT;
    v_magic_data JSONB;
    v_token TEXT;
    v_portal_url TEXT;
    v_site_url TEXT := 'https://pagina-carrizo.vercel.app';
    v_fecha_str TEXT;
    v_email_subject TEXT;
    v_email_title TEXT;
    v_email_intro TEXT;
    v_email_badge_color TEXT := '#2563eb';
    v_html_body TEXT;
    v_email_payload JSONB;
    v_whatsapp_payload JSONB;
    v_whatsapp_msg TEXT;
    v_clean_phone TEXT;
    v_email_status INT := 0;
    v_whatsapp_status INT := 0;
    v_res_transition JSONB;
    v_updates JSONB := '{}'::jsonb;
    v_response extensions.http_response;
BEGIN
    -- 1. Obtener la inspección
    SELECT i.*, sd.state_code, s.nombre AS servicio_nombre
    INTO v_inspeccion
    FROM public.inspecciones i
    LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
    LEFT JOIN public.servicios s ON i.servicio_id = s.id
    WHERE i.id = p_inspeccion_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Inspección no encontrada');
    END IF;

    IF v_inspeccion.inspector_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La inspección no tiene inspector asignado');
    END IF;

    -- 2. Obtener datos del inspector desde personal_ac
    SELECT * INTO v_inspector
    FROM public.personal_ac
    WHERE id = v_inspeccion.inspector_id;

    IF NOT FOUND OR v_inspector.email IS NULL OR TRIM(v_inspector.email) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El inspector no tiene email válido configurado en personal_ac');
    END IF;

    -- 3. Obtener lugar de carga
    SELECT nombre INTO v_lugar_nombre
    FROM public.depositos
    WHERE id = v_inspeccion.lugar_carga_id;
    v_lugar_nombre := COALESCE(v_lugar_nombre, 'Depósito Asignado');

    -- 4. Crear o renovar Magic Link seguro
    v_magic_data := public.crear_o_renovar_magic_link_inspeccion(p_inspeccion_id);
    v_token := v_magic_data->>'token';
    v_portal_url := v_site_url || '/inspect/' || v_token;

    -- Formatear fecha legible
    IF v_inspeccion.fecha_hora_carga_pactada IS NOT NULL THEN
        v_fecha_str := TO_CHAR(v_inspeccion.fecha_hora_carga_pactada AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI "hs"');
    ELSE
        v_fecha_str := 'A confirmar';
    END IF;

    -- 5. Configurar textos según tipo de alerta
    IF p_tipo_alerta = 'RECORDATORIO_PREVIO_24H' THEN
        v_email_subject := 'Recordatorio: Mañana tienes la Inspección #INS-' || p_inspeccion_id;
        v_email_title := 'Recordatorio de Inspección (Próximas 24hs)';
        v_email_badge_color := '#2563eb';
        v_email_intro := 'Te recordamos que tienes una tarea de inspección programada para el día de mañana. Por favor revisa los detalles a continuación y descarga la planilla correspondiente:';
        v_whatsapp_msg := 'Hola ' || initcap(split_part(v_inspector.nombre_completo, ' ', 1)) || 
            ', te recordamos que mañana tienes programada la Inspección #INS-' || p_inspeccion_id || 
            ' a las ' || v_fecha_str || ' en ' || v_lugar_nombre || 
            '. Accede al portal para descargar la planilla: ' || v_portal_url;
    ELSIF p_tipo_alerta = 'RECORDATORIO_PLANILLAS_POST_24H' THEN
        v_email_subject := '⚠️ Recordatorio: Planillas Pendientes - Inspección #INS-' || p_inspeccion_id;
        v_email_title := 'Planillas de Inspección Pendientes';
        v_email_badge_color := '#d97706';
        v_email_intro := 'La fecha pactada para la inspección (' || v_fecha_str || ') ya se ha cumplido y el sistema aún registra la recepción de planillas como pendiente. Por favor ingresa al portal y sube los resultados completados:';
        v_whatsapp_msg := 'Hola ' || initcap(split_part(v_inspector.nombre_completo, ' ', 1)) || 
            ', te recordamos que estamos esperando las planillas completas de la Inspección #INS-' || p_inspeccion_id || 
            ' (pactada el ' || v_fecha_str || '). Por favor súbelas aquí: ' || v_portal_url;
    ELSE -- ASIGNACION
        v_email_subject := 'Inspección Documental Asignada #INS-' || p_inspeccion_id;
        v_email_title := 'Inspección Documental Asignada';
        v_email_badge_color := '#2563eb';
        v_email_intro := 'Se te ha asignado una nueva tarea de inspección de carga. A continuación tienes los detalles:';
        v_whatsapp_msg := 'Hola ' || initcap(split_part(v_inspector.nombre_completo, ' ', 1)) || 
            ', se te ha asignado la Inspección #INS-' || p_inspeccion_id || 
            ' pactada para el ' || v_fecha_str || ' en ' || v_lugar_nombre || 
            '. Puedes descargar la planilla aquí: ' || v_portal_url;
    END IF;

    -- 6. Construir cuerpo HTML del correo
    v_html_body := '
      <div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
        <div style="background-color: ' || v_email_badge_color || '; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">' || v_email_title || '</h1>
        </div>
        <div style="background-color: #ffffff; padding: 32px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; color: #374151; margin-top: 0;">Hola <strong>' || v_inspector.nombre_completo || '</strong>,</p>
          <p style="font-size: 15px; color: #374151;">' || v_email_intro || '</p>
          
          <div style="background-color: #f3f4f6; border-left: 4px solid ' || v_email_badge_color || '; padding: 16px; margin: 24px 0; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>ID de Inspección:</strong> #INS-' || p_inspeccion_id || '</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Servicio:</strong> ' || COALESCE(v_inspeccion.servicio_nombre, 'Inspección de Exportación') || '</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Tipo de Carga:</strong> <span style="text-transform: capitalize;">' || COALESCE(v_inspeccion.tipo_carga, 'General') || '</span></p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Lugar de Carga:</strong> ' || v_lugar_nombre || '</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Fecha y Hora Pactada:</strong> <span style="text-transform: capitalize;">' || v_fecha_str || '</span></p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="' || v_portal_url || '" style="background-color: ' || v_email_badge_color || '; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Acceder al Portal de Inspección</a>
          </div>

          <p style="font-size: 13px; color: #6b7280; text-align: center; margin-top: 32px; margin-bottom: 0;">
            Este enlace es único y seguro, válido hasta la finalización de la inspección.
          </p>
        </div>
      </div>
    ';

    -- 7. Despachar Email a n8n
    v_email_payload := jsonb_build_object(
        'inspeccionId', p_inspeccion_id,
        'inspectorEmail', v_inspector.email,
        'inspectorNombre', v_inspector.nombre_completo,
        'fechaPactada', v_inspeccion.fecha_hora_carga_pactada,
        'uploadToken', v_token,
        'lugarId', v_inspeccion.lugar_carga_id,
        'subject', v_email_subject,
        'htmlBody', v_html_body
    );

    BEGIN
        PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
        SELECT * INTO v_response
        FROM extensions.http((
            'POST',
            'https://hzerdan.app.n8n.cloud/webhook/envia-email-desde-frontend',
            ARRAY[
                extensions.http_header('Content-Type', 'application/json'),
                extensions.http_header('Authorization', 'Bearer 753159*Arquimedes')
            ],
            'application/json',
            v_email_payload::text
        )::extensions.http_request);
        v_email_status := v_response.status;
    EXCEPTION WHEN OTHERS THEN
        v_email_status := 500;
    END;

    -- 8. Despachar WhatsApp si el inspector tiene celular (Sin forzar freeform para permitir Content Templates de Twilio)
    IF v_inspector.celular IS NOT NULL AND TRIM(v_inspector.celular) <> '' THEN
        v_clean_phone := regexp_replace(v_inspector.celular, '\D', '', 'g');
        v_whatsapp_payload := jsonb_build_object(
            'conversation_key', v_clean_phone,
            'action', 'send_instruction',
            'message', v_whatsapp_msg,
            'nombre_inspector', v_inspector.nombre_completo,
            'metadata', jsonb_build_object(
                'inspeccion_id', p_inspeccion_id,
                'tipo_alerta', p_tipo_alerta
            )
        );

        BEGIN
            SELECT * INTO v_response
            FROM extensions.http((
                'POST',
                'https://hzerdan.app.n8n.cloud/webhook/whatsapp-salida-web',
                ARRAY[extensions.http_header('Content-Type', 'application/json')],
                'application/json',
                v_whatsapp_payload::text
            )::extensions.http_request);
            v_whatsapp_status := v_response.status;
        EXCEPTION WHEN OTHERS THEN
            v_whatsapp_status := 500;
        END;
    END IF;

    -- 9. Transición de Estado FSM automática
    IF p_tipo_alerta = 'RECORDATORIO_PREVIO_24H' AND v_inspeccion.state_code = '3.D0' THEN
        v_res_transition := public.inspeccion_intentar_transicion(p_inspeccion_id, '3.D1', p_usuario_actor);
    ELSIF p_tipo_alerta = 'RECORDATORIO_PLANILLAS_POST_24H' AND v_inspeccion.state_code = '3.D1' THEN
        v_res_transition := public.inspeccion_intentar_transicion(p_inspeccion_id, '3.D2', p_usuario_actor);
    END IF;

    -- 10. Actualizar marcas de auditoría en current_data de la inspección
    IF p_tipo_alerta = 'RECORDATORIO_PREVIO_24H' THEN
        v_updates := jsonb_build_object(
            'alerta_t_menos_24h_enviada', true,
            'alerta_t_menos_24h_at', NOW()
        );
    ELSIF p_tipo_alerta = 'RECORDATORIO_PLANILLAS_POST_24H' THEN
        v_updates := jsonb_build_object(
            'alerta_t_mas_24h_enviada', true,
            'alerta_t_mas_24h_at', NOW()
        );
    END IF;

    IF v_updates <> '{}'::jsonb THEN
        UPDATE public.inspecciones
        SET current_data = COALESCE(current_data, '{}'::jsonb) || v_updates,
            updated_at = NOW()
        WHERE id = p_inspeccion_id;
    END IF;

    -- 11. Registrar en historial_eventos
    PERFORM public.log_inspeccion_evento(
        p_inspeccion_id,
        'ALERTA_INSPECTOR_' || p_tipo_alerta,
        p_usuario_actor,
        jsonb_build_object(
            'tipo_alerta', p_tipo_alerta,
            'email_destinatario', v_inspector.email,
            'celular_destinatario', v_inspector.celular,
            'email_status', v_email_status,
            'whatsapp_status', v_whatsapp_status,
            'token_generado', v_token
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'tipo_alerta', p_tipo_alerta,
        'email_status', v_email_status,
        'whatsapp_status', v_whatsapp_status,
        'transition_result', v_res_transition
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enviar_alerta_inspector(bigint, text, text) TO anon, authenticated, service_role;


-- 2. Actualizar actualizar_datos_inspeccion con reseteo inteligente de ciclo de vida
DROP FUNCTION IF EXISTS public.actualizar_datos_inspeccion(bigint, timestamp with time zone, integer, integer, text);
DROP FUNCTION IF EXISTS public.actualizar_datos_inspeccion(bigint, timestamp with time zone, integer, integer, text, integer);

CREATE OR REPLACE FUNCTION public.actualizar_datos_inspeccion(
    p_id bigint, 
    p_fecha timestamp with time zone, 
    p_lugar_id integer, 
    p_inspector_id integer, 
    p_usuario_actor text,
    p_operador_id integer DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inspeccion RECORD;
    v_hubo_cambios boolean := false;
    v_fecha_cambio boolean := false;
    v_detalles jsonb := '{}'::jsonb;
    v_state_code text;
    v_state_id_d0 integer;
    v_effective_inspector_id integer;
BEGIN
    SELECT i.*, sd.state_code INTO v_inspeccion 
    FROM public.inspecciones i
    LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
    WHERE i.id = p_id 
    FOR UPDATE OF i;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inspección #% no encontrada.', p_id;
    END IF;

    v_state_code := COALESCE(v_inspeccion.state_code, v_inspeccion.export_doc_status);

    IF v_state_code NOT IN ('3.D0', '3.D1', '3.D2') THEN
        RAISE EXCEPTION 'No se pueden modificar datos operativos en estado %', v_state_code;
    END IF;

    IF v_inspeccion.fecha_hora_carga_pactada IS DISTINCT FROM p_fecha THEN
        v_hubo_cambios := true;
        v_fecha_cambio := true;
        v_detalles := v_detalles || jsonb_build_object('fecha_anterior', v_inspeccion.fecha_hora_carga_pactada, 'fecha_nueva', p_fecha);
    END IF;

    IF v_inspeccion.lugar_carga_id IS DISTINCT FROM p_lugar_id THEN
        v_hubo_cambios := true;
        v_detalles := v_detalles || jsonb_build_object('lugar_anterior', v_inspeccion.lugar_carga_id, 'lugar_nuevo', p_lugar_id);
    END IF;

    IF v_inspeccion.inspector_id IS DISTINCT FROM p_inspector_id THEN
        v_hubo_cambios := true;
        v_detalles := v_detalles || jsonb_build_object('inspector_anterior', v_inspeccion.inspector_id, 'inspector_nuevo', p_inspector_id);
    END IF;

    IF v_inspeccion.operador_id IS DISTINCT FROM p_operador_id THEN
        v_hubo_cambios := true;
        v_detalles := v_detalles || jsonb_build_object('operador_anterior', v_inspeccion.operador_id, 'operador_nuevo', p_operador_id);
    END IF;

    IF v_hubo_cambios THEN
        UPDATE public.inspecciones 
        SET 
            fecha_hora_carga_pactada = p_fecha,
            lugar_carga_id = p_lugar_id,
            inspector_id = p_inspector_id,
            operador_id = p_operador_id,
            updated_at = NOW()
        WHERE id = p_id;

        -- Sincronizar magic link si cambió el inspector
        IF v_inspeccion.inspector_id IS DISTINCT FROM p_inspector_id THEN
            UPDATE public.magic_links 
            SET usuario_email = (SELECT email FROM public.personal_ac WHERE id = p_inspector_id)
            WHERE instancia_id = p_id 
              AND tipo_entidad = 'INSPECCION' 
              AND used_at IS NULL;
        END IF;

        -- RESETEO INTELIGENTE DEL CICLO DE VIDA SI SE REPROGRAMA A FECHA FUTURA:
        IF v_fecha_cambio AND p_fecha IS NOT NULL AND p_fecha > NOW() THEN
            -- 1. Limpiar flags de alertas previas
            UPDATE public.inspecciones
            SET current_data = (COALESCE(current_data, '{}'::jsonb) - 'alerta_t_menos_24h_enviada' - 'alerta_t_menos_24h_at' - 'alerta_t_mas_24h_enviada' - 'alerta_t_mas_24h_at')
            WHERE id = p_id;

            -- 2. Si dista más de 24 horas, restablecer estado a 3.D0 (Programado)
            IF p_fecha > (NOW() + INTERVAL '24 hours') THEN
                SELECT id INTO v_state_id_d0 FROM public.state_definitions WHERE state_code = '3.D0';
                IF v_state_id_d0 IS NOT NULL THEN
                    UPDATE public.inspecciones SET current_state_id = v_state_id_d0 WHERE id = p_id;
                END IF;
            ELSE
                -- 3. Si cae dentro de las próximas 24 horas y tiene inspector asignado, alertar de inmediato
                v_effective_inspector_id := COALESCE(p_inspector_id, v_inspeccion.inspector_id);
                IF v_effective_inspector_id IS NOT NULL THEN
                    SELECT id INTO v_state_id_d0 FROM public.state_definitions WHERE state_code = '3.D0';
                    IF v_state_id_d0 IS NOT NULL THEN
                        UPDATE public.inspecciones SET current_state_id = v_state_id_d0 WHERE id = p_id;
                    END IF;
                    PERFORM public.enviar_alerta_inspector(p_id, 'RECORDATORIO_PREVIO_24H', p_usuario_actor);
                END IF;
            END IF;
        END IF;

        PERFORM public.log_inspeccion_evento(
            p_id, 
            'DATOS_INSPECCION_ACTUALIZADOS', 
            p_usuario_actor, 
            v_detalles
        );
    END IF;

    RETURN true;
END;
$$;

GRANT ALL ON FUNCTION public.actualizar_datos_inspeccion(bigint, timestamp with time zone, integer, integer, text, integer) TO anon, authenticated, service_role;


-- 3. Actualizar crear_nueva_inspeccion_v2 con disparo inmediato si cae en ventana < 24hs
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

    -- Si la fecha pactada ya está dentro de las próximas 24 horas y tiene inspector asignado, disparar alerta inmediata
    IF p_fecha_pactada IS NOT NULL AND p_fecha_pactada > NOW() AND p_fecha_pactada <= (NOW() + INTERVAL '24 hours') AND p_inspector_id IS NOT NULL THEN
        PERFORM public.enviar_alerta_inspector(v_inspeccion_id, 'RECORDATORIO_PREVIO_24H', p_usuario_actor);
    END IF;

    RETURN v_inspeccion_id;
END;
$$;

GRANT ALL ON FUNCTION public.crear_nueva_inspeccion_v2(bigint[], integer, integer, text, timestamp with time zone, integer, text, integer, text, integer, integer) TO anon, authenticated, service_role;
