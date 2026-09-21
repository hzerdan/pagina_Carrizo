-- ============================================================================
-- Migración: Alertas Automáticas para Inspectores (T-24h y T+24h)
-- Fecha: 2026-09-02
-- Regla AGENTS.md: Incluir siempre DROP FUNCTION IF EXISTS antes de CREATE
-- ============================================================================

-- 1. Función para enviar alerta a un inspector (Email + WhatsApp)
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

    -- 8. Despachar WhatsApp si el inspector tiene celular
    IF v_inspector.celular IS NOT NULL AND TRIM(v_inspector.celular) <> '' THEN
        v_clean_phone := regexp_replace(v_inspector.celular, '\D', '', 'g');
        v_whatsapp_payload := jsonb_build_object(
            'conversation_key', v_clean_phone,
            'action', 'send_instruction',
            'message', v_whatsapp_msg,
            'nombre_inspector', v_inspector.nombre_completo,
            'force_freeform', true,
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

-- 2. Función de Monitoreo Periódico de Inspecciones
DROP FUNCTION IF EXISTS public.ejecutar_monitoreo_inspecciones();

CREATE OR REPLACE FUNCTION public.ejecutar_monitoreo_inspecciones()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rec RECORD;
    v_alertas_previas_count INT := 0;
    v_alertas_posteriores_count INT := 0;
    v_res JSONB;
BEGIN
    -- ──────────────────────────────────────────────────────────────────────────
    -- 1. Evaluador T - 24 Horas: Inspecciones programadas próximas a realizarse
    -- ──────────────────────────────────────────────────────────────────────────
    FOR v_rec IN
        SELECT i.id, i.inspector_id, i.fecha_hora_carga_pactada, sd.state_code
        FROM public.inspecciones i
        LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
        WHERE i.inspector_id IS NOT NULL
          AND i.fecha_hora_carga_pactada IS NOT NULL
          AND i.fecha_hora_carga_pactada BETWEEN NOW() AND (NOW() + INTERVAL '24 hours')
          AND COALESCE((i.current_data->>'alerta_t_menos_24h_enviada')::boolean, false) = false
          AND COALESCE(sd.state_code, '3.D0') IN ('3.D0', '3.D1')
    LOOP
        v_res := public.enviar_alerta_inspector(v_rec.id, 'RECORDATORIO_PREVIO_24H', 'CRON_MONITOREO_INSPECCIONES');
        IF (v_res->>'success')::boolean THEN
            v_alertas_previas_count := v_alertas_previas_count + 1;
        END IF;
    END LOOP;

    -- ──────────────────────────────────────────────────────────────────────────
    -- 2. Evaluador T + 24 Horas: Inspecciones pasadas que aún no subieron planillas
    -- ──────────────────────────────────────────────────────────────────────────
    FOR v_rec IN
        SELECT i.id, i.inspector_id, i.fecha_hora_carga_pactada, sd.state_code,
               (SELECT COUNT(*)::int FROM public.inspeccion_planillas_recibidas ipr WHERE ipr.inspeccion_id = i.id) AS cant_recibidas,
               COALESCE(i.cantidad_plantillas_requeridas, 1) AS cant_requeridas
        FROM public.inspecciones i
        LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
        WHERE i.inspector_id IS NOT NULL
          AND i.fecha_hora_carga_pactada IS NOT NULL
          AND i.fecha_hora_carga_pactada <= (NOW() - INTERVAL '24 hours')
          AND COALESCE((i.current_data->>'alerta_t_mas_24h_enviada')::boolean, false) = false
          AND COALESCE(sd.state_code, '3.D0') IN ('3.D0', '3.D1', '3.D2')
          AND i.resultado_final IS NULL
    LOOP
        -- Solo alertar si faltan planillas por recibir
        IF v_rec.cant_recibidas < v_rec.cant_requeridas THEN
            v_res := public.enviar_alerta_inspector(v_rec.id, 'RECORDATORIO_PLANILLAS_POST_24H', 'CRON_MONITOREO_INSPECCIONES');
            IF (v_res->>'success')::boolean THEN
                v_alertas_posteriores_count := v_alertas_posteriores_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'alertas_previas_t_menos_24h', v_alertas_previas_count,
        'alertas_posteriores_t_mas_24h', v_alertas_posteriores_count,
        'timestamp', NOW()
    );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.enviar_alerta_inspector(bigint, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ejecutar_monitoreo_inspecciones() TO anon, authenticated, service_role;

-- 3. Programación en pg_cron (Cada 10 minutos)
DO $$
BEGIN
    -- Desprogramar job previo si existía con ese comando
    PERFORM cron.unschedule(jobid) 
    FROM cron.job 
    WHERE command ILIKE '%ejecutar_monitoreo_inspecciones%';

    -- Programar nuevo job
    PERFORM cron.schedule(
        'monitoreo_inspecciones_alertas',
        '*/10 * * * *',
        'SELECT public.ejecutar_monitoreo_inspecciones();'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo configurar pg_cron automáticamente: %', SQLERRM;
END $$;
