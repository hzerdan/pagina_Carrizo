-- ============================================================================
-- Migración: Alertas Telegram, Copia a Supervisores, Cese Inteligente y Escalonamiento
-- Fecha: 2026-09-16
-- Regla AGENTS.md: Incluir siempre DROP FUNCTION IF EXISTS antes de CREATE
-- ============================================================================

-- 1. Actualizar get_inspeccion_by_token para exponer planilla_descargada
DROP FUNCTION IF EXISTS public.get_inspeccion_by_token(text);

CREATE OR REPLACE FUNCTION public.get_inspeccion_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_magic_link RECORD;
    v_inspeccion RECORD;
    v_inspector_nombre text;
BEGIN
    SELECT * INTO v_magic_link 
    FROM public.magic_links 
    WHERE token = p_token::uuid; 
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token inválido o no encontrado.';
    END IF;

    IF v_magic_link.expires_at < now() THEN
        RAISE EXCEPTION 'El enlace ha expirado.';
    END IF;

    IF v_magic_link.used_at IS NOT NULL THEN
        RAISE EXCEPTION 'El enlace ya ha sido utilizado.';
    END IF;

    SELECT * INTO v_inspeccion FROM public.inspecciones WHERE id = v_magic_link.instancia_id;
    SELECT nombre_completo INTO v_inspector_nombre FROM public.personal_ac WHERE id = v_inspeccion.inspector_id;

    RETURN jsonb_build_object(
        'id', v_inspeccion.id,
        'fecha_pactada', v_inspeccion.fecha_hora_carga_pactada,
        'tipo_carga', v_inspeccion.tipo_carga,
        'inspector_nombre', v_inspector_nombre,
        'planilla_personalizada_url', v_inspeccion.planilla_personalizada_url,
        'planilla_descargada', COALESCE((v_inspeccion.current_data->>'planilla_descargada')::boolean, false)
    );
END;
$$;

GRANT ALL ON FUNCTION public.get_inspeccion_by_token(text) TO anon, authenticated, service_role;


-- 2. Función para registrar la descarga de la planilla (Portal Público y Drawer Interno)
DROP FUNCTION IF EXISTS public.registrar_descarga_planilla_inspeccion(text, bigint, text);
DROP FUNCTION IF EXISTS public.registrar_descarga_planilla_inspeccion(text);
DROP FUNCTION IF EXISTS public.registrar_descarga_planilla_inspeccion(bigint, text);

CREATE OR REPLACE FUNCTION public.registrar_descarga_planilla_inspeccion(
    p_token text DEFAULT NULL,
    p_inspeccion_id bigint DEFAULT NULL,
    p_usuario_actor text DEFAULT 'SISTEMA'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_id bigint := p_inspeccion_id;
    v_magic_link RECORD;
    v_actor_nombre text := p_usuario_actor;
BEGIN
    -- Si se invoca con token desde el portal público
    IF p_token IS NOT NULL AND TRIM(p_token) <> '' THEN
        SELECT * INTO v_magic_link 
        FROM public.magic_links 
        WHERE token = p_token::uuid;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Token de magic link inválido');
        END IF;

        v_target_id := v_magic_link.instancia_id;

        SELECT p.nombre_completo INTO v_actor_nombre
        FROM public.inspecciones i
        JOIN public.personal_ac p ON i.inspector_id = p.id
        WHERE i.id = v_target_id;
        
        v_actor_nombre := COALESCE(v_actor_nombre, 'INSPECTOR_PORTAL');
    END IF;

    IF v_target_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se especificó inspección ni token válido');
    END IF;

    -- Actualizar current_data asentando que la planilla ya fue descargada
    UPDATE public.inspecciones
    SET current_data = COALESCE(current_data, '{}'::jsonb) || jsonb_build_object(
            'planilla_descargada', true,
            'planilla_descargada_at', NOW()
        ),
        updated_at = NOW()
    WHERE id = v_target_id;

    -- Asentar en historial de eventos
    PERFORM public.log_inspeccion_evento(
        v_target_id,
        'PLANTILLA_MAESTRA_DESCARGADA',
        v_actor_nombre,
        jsonb_build_object(
            'medio', CASE WHEN p_token IS NOT NULL THEN 'PORTAL_PUBLICO' ELSE 'DRAWER_ADMIN' END,
            'descargado_at', NOW()
        )
    );

    RETURN jsonb_build_object('success', true, 'inspeccion_id', v_target_id, 'descargado_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_descarga_planilla_inspeccion(text, bigint, text) TO anon, authenticated, service_role;


-- 3. Actualizar enviar_alerta_inspector con soporte de Telegram y copia a Supervisor
DROP FUNCTION IF EXISTS public.enviar_alerta_inspector(bigint, text, text);
DROP FUNCTION IF EXISTS public.enviar_alerta_inspector(bigint, text);

CREATE OR REPLACE FUNCTION public.enviar_alerta_inspector(
    p_inspeccion_id bigint,
    p_tipo_alerta text, -- 'ASIGNACION' | 'RECORDATORIO_PREVIO_24H' | 'RECORDATORIO_PREVIO_4H' | 'RECORDATORIO_PLANILLAS_POST_24H' | 'RECORDATORIO_PLANILLAS_POST_48H' | 'RECORDATORIO_PLANILLAS_POST_RECURRENTE'
    p_usuario_actor text DEFAULT 'SISTEMA_MONITOREO'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inspeccion RECORD;
    v_inspector RECORD;
    v_supervisor_email TEXT := 'jcarrizo@arquimedescarrizo.com.ar';
    v_supervisor_nombre TEXT := 'Fernando Jesús Carrizo';
    v_operador_nombre TEXT := 'Sin asignar';
    v_lugar_nombre TEXT;
    v_magic_data JSONB;
    v_token TEXT;
    v_portal_url TEXT;
    v_site_url TEXT := 'https://pagina-carrizo.vercel.app';
    v_fecha_str TEXT;
    
    -- Textos y correos
    v_email_subject TEXT;
    v_email_title TEXT;
    v_email_intro TEXT;
    v_email_badge_color TEXT := '#2563eb';
    v_html_body TEXT;
    v_html_body_supervisor TEXT;
    v_telegram_msg TEXT;
    v_whatsapp_msg TEXT;
    v_clean_phone TEXT;
    
    -- Payloads y respuestas
    v_email_payload JSONB;
    v_email_sup_payload JSONB;
    v_whatsapp_payload JSONB;
    v_telegram_payload JSONB;
    v_email_status INT := 0;
    v_email_sup_status INT := 0;
    v_whatsapp_status INT := 0;
    v_telegram_status INT := 0;
    
    v_res_transition JSONB;
    v_updates JSONB := '{}'::jsonb;
    v_cant_deuda INT := 0;
    v_response extensions.http_response;
BEGIN
    -- 1. Obtener la inspección
    SELECT i.*, sd.state_code, sd.name AS state_name, s.nombre AS servicio_nombre
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

    -- 3. Obtener datos del supervisor (rol 'SUP' activo, fallback a Fernando Jesús Carrizo)
    SELECT p.email, p.nombre_completo INTO v_supervisor_email, v_supervisor_nombre
    FROM public.personal_ac p
    JOIN public.personal_ac_roles pr ON p.id = pr.personal_ac_id
    JOIN public.roles r ON pr.role_id = r.id
    WHERE r.codigo = 'SUP' AND p.estado = 'ACTIVO'
    ORDER BY p.id ASC
    LIMIT 1;

    v_supervisor_email := COALESCE(v_supervisor_email, 'jcarrizo@arquimedescarrizo.com.ar');
    v_supervisor_nombre := COALESCE(v_supervisor_nombre, 'Fernando Jesús Carrizo');

    -- Obtener operador asignado si existe
    IF v_inspeccion.operador_id IS NOT NULL THEN
        SELECT p.nombre_completo INTO v_operador_nombre FROM public.personal_ac p WHERE p.id = v_inspeccion.operador_id;
    END IF;
    v_operador_nombre := COALESCE(v_operador_nombre, 'Sin asignar');

    -- 4. Obtener lugar de carga
    SELECT nombre INTO v_lugar_nombre
    FROM public.depositos
    WHERE id = v_inspeccion.lugar_carga_id;
    v_lugar_nombre := COALESCE(v_lugar_nombre, 'Depósito Asignado');

    -- 5. Crear o renovar Magic Link seguro
    v_magic_data := public.crear_o_renovar_magic_link_inspeccion(p_inspeccion_id);
    v_token := v_magic_data->>'token';
    v_portal_url := v_site_url || '/inspect/' || v_token;

    -- Formatear fecha legible
    IF v_inspeccion.fecha_hora_carga_pactada IS NOT NULL THEN
        v_fecha_str := TO_CHAR(v_inspeccion.fecha_hora_carga_pactada AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI "hs"');
    ELSE
        v_fecha_str := 'A confirmar';
    END IF;

    -- 6. Configurar textos y estilos según tipo de alerta
    IF p_tipo_alerta = 'RECORDATORIO_PREVIO_24H' THEN
        v_email_subject := 'Recordatorio: Mañana tienes la Inspección #INS-' || p_inspeccion_id;
        v_email_title := 'Recordatorio de Inspección (Próximas 24hs)';
        v_email_badge_color := '#2563eb';
        v_email_intro := 'Te recordamos que tienes una tarea de inspección programada para el día de mañana. Por favor revisa los detalles a continuación y descarga la planilla correspondiente:';
        v_whatsapp_msg := 'Hola ' || initcap(split_part(v_inspector.nombre_completo, ' ', 1)) || 
            ', te recordamos que mañana tienes programada la Inspección #INS-' || p_inspeccion_id || 
            ' a las ' || v_fecha_str || ' en ' || v_lugar_nombre || 
            '. Accede al portal para descargar la planilla: ' || v_portal_url;
        v_telegram_msg := '📅 *RECORDATORIO DE INSPECCIÓN (Próximas 24hs)*' || E'\n\n' ||
            '📋 *Inspección:* #INS-' || p_inspeccion_id || E'\n' ||
            '🔍 *Inspector:* ' || v_inspector.nombre_completo || E'\n' ||
            '👤 *Supervisor/Operador:* ' || COALESCE(v_operador_nombre, v_supervisor_nombre, 'Sin asignar') || E'\n' ||
            '🏢 *Servicio:* ' || COALESCE(v_inspeccion.servicio_nombre, 'Inspección de Exportación') || E'\n' ||
            '📍 *Lugar:* ' || v_lugar_nombre || E'\n' ||
            '🗓️ *Fecha Pactada:* ' || v_fecha_str || E'\n\n' ||
            '🔗 [Abrir Portal Inspector](' || v_portal_url || ')';

    ELSIF p_tipo_alerta = 'RECORDATORIO_PREVIO_4H' THEN
        v_email_subject := '🚨 Urgente: En 4 horas se realiza la Inspección #INS-' || p_inspeccion_id;
        v_email_title := 'Recordatorio Urgente de Inspección (Próximas 4hs)';
        v_email_badge_color := '#ea580c';
        v_email_intro := 'Te recordamos que en 4 horas está programada la inspección y aún no se registra la descarga de la planilla. Por favor descárgala a continuación:';
        v_whatsapp_msg := 'Hola ' || initcap(split_part(v_inspector.nombre_completo, ' ', 1)) || 
            ', recordatorio urgente: la Inspección #INS-' || p_inspeccion_id || 
            ' está programada para hoy a las ' || v_fecha_str || ' en ' || v_lugar_nombre || 
            '. Por favor descarga la planilla: ' || v_portal_url;
        v_telegram_msg := '⏰ *ALERTA URGENTE: INSPECCIÓN EN 4 HORAS (Sin Planilla Descargada)*' || E'\n\n' ||
            '📋 *Inspección:* #INS-' || p_inspeccion_id || E'\n' ||
            '🔍 *Inspector:* ' || v_inspector.nombre_completo || E'\n' ||
            '👤 *Supervisor/Operador:* ' || COALESCE(v_operador_nombre, v_supervisor_nombre, 'Sin asignar') || E'\n' ||
            '📍 *Lugar:* ' || v_lugar_nombre || E'\n' ||
            '🗓️ *Horario:* ' || v_fecha_str || E'\n\n' ||
            '⚠️ _El inspector aún no ha descargado la planilla maestra._\n' ||
            '🔗 [Abrir Portal Inspector](' || v_portal_url || ')';

    ELSIF p_tipo_alerta = 'RECORDATORIO_PLANILLAS_POST_24H' THEN
        v_email_subject := '⚠️ Recordatorio: Planillas Pendientes (24hs) - Inspección #INS-' || p_inspeccion_id;
        v_email_title := 'Planillas de Inspección Pendientes (24hs)';
        v_email_badge_color := '#d97706';
        v_email_intro := 'La fecha pactada para la inspección (' || v_fecha_str || ') ya se ha cumplido hace 24 horas y el sistema aún registra la recepción de planillas como pendiente. Por favor ingresa al portal y sube los resultados:';
        v_whatsapp_msg := 'Hola ' || initcap(split_part(v_inspector.nombre_completo, ' ', 1)) || 
            ', te recordamos que estamos esperando las planillas completas de la Inspección #INS-' || p_inspeccion_id || 
            ' (pactada el ' || v_fecha_str || '). Por favor súbelas aquí: ' || v_portal_url;
        v_telegram_msg := '⚠️ *DEUDA DE DOCUMENTACIÓN (24hs Vencida)*' || E'\n\n' ||
            '📋 *Inspección:* #INS-' || p_inspeccion_id || E'\n' ||
            '🔍 *Inspector:* ' || v_inspector.nombre_completo || E'\n' ||
            '👤 *Supervisor/Operador:* ' || COALESCE(v_operador_nombre, v_supervisor_nombre, 'Sin asignar') || E'\n' ||
            '📍 *Lugar:* ' || v_lugar_nombre || E'\n' ||
            '🗓️ *Pactada el:* ' || v_fecha_str || E'\n\n' ||
            '⚠️ _Han transcurrido 24 horas y aún no se han subido las planillas requeridas._\n' ||
            '🔗 [Acceso de Carga](' || v_portal_url || ')';

    ELSIF p_tipo_alerta = 'RECORDATORIO_PLANILLAS_POST_48H' THEN
        v_email_subject := '🚨 SEGUNDO AVISO: Planillas Pendientes (48hs) - Inspección #INS-' || p_inspeccion_id;
        v_email_title := 'Segundo Aviso: Planillas Pendientes (48hs)';
        v_email_badge_color := '#dc2626';
        v_email_intro := 'Han transcurrido más de 48 horas desde la fecha pactada de inspección (' || v_fecha_str || ') y no se han recibido las planillas obligatorias. Por favor súbelas con máxima prioridad:';
        v_whatsapp_msg := 'ATENCIÓN ' || initcap(split_part(v_inspector.nombre_completo, ' ', 1)) || 
            ': Segundo aviso de deuda de planillas de la Inspección #INS-' || p_inspeccion_id || 
            ' (pactada el ' || v_fecha_str || '). Por favor súbelas inmediatamente: ' || v_portal_url;
        v_telegram_msg := '🚨 *SEGUNDO AVISO: DEUDA DE PLANILLAS (48hs Vencida)*' || E'\n\n' ||
            '📋 *Inspección:* #INS-' || p_inspeccion_id || E'\n' ||
            '🔍 *Inspector:* ' || v_inspector.nombre_completo || E'\n' ||
            '👤 *Supervisor Responsable:* ' || COALESCE(v_supervisor_nombre, 'Fernando Carrizo') || E'\n' ||
            '📍 *Lugar:* ' || v_lugar_nombre || E'\n' ||
            '🗓️ *Fecha Carga:* ' || v_fecha_str || E'\n\n' ||
            '🚨 _Han pasado más de 48 horas sin entrega de documentación._\n' ||
            '🔗 [Subir Documentación](' || v_portal_url || ')';

    ELSIF p_tipo_alerta = 'RECORDATORIO_PLANILLAS_POST_RECURRENTE' THEN
        v_email_subject := '🛑 REITERACIÓN: Planillas Aún Pendientes - Inspección #INS-' || p_inspeccion_id;
        v_email_title := 'Reiteración: Documentación de Inspección Pendiente';
        v_email_badge_color := '#991b1b';
        v_email_intro := 'Reiteración automática de deuda: Seguimos aguardando la recepción de planillas correspondientes a la inspección #INS-' || p_inspeccion_id || ':';
        v_whatsapp_msg := 'Reiteración: Por favor completa el envío de planillas de la Inspección #INS-' || p_inspeccion_id || ': ' || v_portal_url;
        v_telegram_msg := '🛑 *REITERACIÓN DE DEUDA DE PLANILLAS*' || E'\n\n' ||
            '📋 *Inspección:* #INS-' || p_inspeccion_id || E'\n' ||
            '🔍 *Inspector:* ' || v_inspector.nombre_completo || E'\n' ||
            '👤 *Supervisor:* ' || COALESCE(v_supervisor_nombre, 'Fernando Carrizo') || E'\n' ||
            '🗓️ *Pactada el:* ' || v_fecha_str || E'\n\n' ||
            '🛑 _La inspección continúa adeudando planillas completas._\n' ||
            '🔗 [Subir Documentación](' || v_portal_url || ')';

    ELSE -- ASIGNACION
        v_email_subject := 'Inspección Documental Asignada #INS-' || p_inspeccion_id;
        v_email_title := 'Inspección Documental Asignada';
        v_email_badge_color := '#2563eb';
        v_email_intro := 'Se te ha asignado una nueva tarea de inspección de carga. A continuación tienes los detalles:';
        v_whatsapp_msg := 'Hola ' || initcap(split_part(v_inspector.nombre_completo, ' ', 1)) || 
            ', se te ha asignado la Inspección #INS-' || p_inspeccion_id || 
            ' pactada para el ' || v_fecha_str || ' en ' || v_lugar_nombre || 
            '. Puedes descargar la planilla aquí: ' || v_portal_url;
        v_telegram_msg := '📋 *NUEVA INSPECCIÓN ASIGNADA*' || E'\n\n' ||
            '📋 *Inspección:* #INS-' || p_inspeccion_id || E'\n' ||
            '🔍 *Inspector Asignado:* ' || v_inspector.nombre_completo || E'\n' ||
            '👤 *Supervisor/Operador:* ' || COALESCE(v_operador_nombre, v_supervisor_nombre, 'Sin asignar') || E'\n' ||
            '🏢 *Servicio:* ' || COALESCE(v_inspeccion.servicio_nombre, 'Inspección de Exportación') || E'\n' ||
            '📍 *Lugar de Carga:* ' || v_lugar_nombre || E'\n' ||
            '🗓️ *Fecha Pactada:* ' || v_fecha_str || E'\n\n' ||
            '🔗 [Abrir Portal Inspector](' || v_portal_url || ')';
    END IF;

    -- 7. Construir cuerpo HTML del correo para el Inspector
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
            <a href="' || v_portal_url || '" target="_blank" rel="noopener noreferrer" style="background-color: ' || v_email_badge_color || '; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Acceder al Portal de Inspección</a>
          </div>

          <p style="font-size: 13px; color: #6b7280; text-align: center; margin-top: 32px; margin-bottom: 0;">
            Este enlace es único y seguro, válido hasta la finalización de la inspección.
          </p>
        </div>
      </div>
    ';

    -- 8. Construir cuerpo HTML de copia para el Supervisor
    v_html_body_supervisor := '
      <div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
        <div style="background-color: #4b5563; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px;">[COPIA SUPERVISOR] ' || v_email_title || '</h2>
        </div>
        <div style="background-color: #ffffff; padding: 28px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 15px; color: #374151; margin-top: 0;">Estimado/a Supervisor/a,</p>
          <p style="font-size: 14px; color: #374151;">Se ha emitido una alerta automática al inspector asignado con el siguiente detalle:</p>
          
          <div style="background-color: #f3f4f6; border-left: 4px solid ' || v_email_badge_color || '; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Inspección:</strong> #INS-' || p_inspeccion_id || '</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Inspector:</strong> ' || v_inspector.nombre_completo || ' (' || v_inspector.email || ')</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Operador AC:</strong> ' || COALESCE(v_operador_nombre, 'Sin asignar') || '</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Lugar:</strong> ' || v_lugar_nombre || '</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Fecha y Hora:</strong> ' || v_fecha_str || '</p>
          </div>

          <div style="text-align: center; margin: 24px 0;">
            <a href="https://pagina-carrizo.vercel.app/inspecciones" target="_blank" rel="noopener noreferrer" style="background-color: #4b5563; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">Ver Inspección en Dashboard</a>
          </div>
        </div>
      </div>
    ';

    -- 9. Despachar Email al Inspector vía n8n
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

    -- 10. Despachar Copia por Email al Supervisor
    IF v_supervisor_email IS NOT NULL AND TRIM(v_supervisor_email) <> '' AND v_supervisor_email <> v_inspector.email THEN
        v_email_sup_payload := jsonb_build_object(
            'inspeccionId', p_inspeccion_id,
            'inspectorEmail', v_supervisor_email,
            'inspectorNombre', v_supervisor_nombre,
            'fechaPactada', v_inspeccion.fecha_hora_carga_pactada,
            'uploadToken', v_token,
            'lugarId', v_inspeccion.lugar_carga_id,
            'subject', '[COPIA SUPERVISOR] ' || v_email_subject,
            'htmlBody', v_html_body_supervisor
        );

        BEGIN
            SELECT * INTO v_response
            FROM extensions.http((
                'POST',
                'https://hzerdan.app.n8n.cloud/webhook/envia-email-desde-frontend',
                ARRAY[
                    extensions.http_header('Content-Type', 'application/json'),
                    extensions.http_header('Authorization', 'Bearer 753159*Arquimedes')
                ],
                'application/json',
                v_email_sup_payload::text
            )::extensions.http_request);
            v_email_sup_status := v_response.status;
        EXCEPTION WHEN OTHERS THEN
            v_email_sup_status := 500;
        END;
    END IF;

    -- 11. Despachar WhatsApp al Inspector si tiene celular
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

    -- 12. Despachar Notificación a Telegram (Canal de Supervisores de AC)
    v_telegram_payload := jsonb_build_object('mensaje', v_telegram_msg);
    BEGIN
        SELECT * INTO v_response
        FROM extensions.http((
            'POST',
            'https://hzerdan.app.n8n.cloud/webhook/notificaciones-telegram',
            ARRAY[extensions.http_header('Content-Type', 'application/json')],
            'application/json',
            v_telegram_payload::text
        )::extensions.http_request);
        v_telegram_status := v_response.status;
    EXCEPTION WHEN OTHERS THEN
        v_telegram_status := 500;
    END;

    -- 13. Transición de Estado FSM automática si corresponde
    IF p_tipo_alerta IN ('RECORDATORIO_PREVIO_24H', 'RECORDATORIO_PREVIO_4H') AND v_inspeccion.state_code = '3.D0' THEN
        v_res_transition := public.inspeccion_intentar_transicion(p_inspeccion_id, '3.D1', p_usuario_actor);
    ELSIF p_tipo_alerta IN ('RECORDATORIO_PLANILLAS_POST_24H', 'RECORDATORIO_PLANILLAS_POST_48H', 'RECORDATORIO_PLANILLAS_POST_RECURRENTE') AND v_inspeccion.state_code = '3.D1' THEN
        v_res_transition := public.inspeccion_intentar_transicion(p_inspeccion_id, '3.D2', p_usuario_actor);
    END IF;

    -- 14. Actualizar marcas de auditoría y contadores en current_data
    IF p_tipo_alerta = 'RECORDATORIO_PREVIO_24H' THEN
        v_updates := jsonb_build_object(
            'alerta_t_menos_24h_enviada', true,
            'alerta_t_menos_24h_at', NOW()
        );
    ELSIF p_tipo_alerta = 'RECORDATORIO_PREVIO_4H' THEN
        v_updates := jsonb_build_object(
            'alerta_t_menos_4h_enviada', true,
            'alerta_t_menos_4h_at', NOW()
        );
    ELSIF p_tipo_alerta IN ('RECORDATORIO_PLANILLAS_POST_24H', 'RECORDATORIO_PLANILLAS_POST_48H', 'RECORDATORIO_PLANILLAS_POST_RECURRENTE') THEN
        v_cant_deuda := COALESCE((v_inspeccion.current_data->>'cant_alertas_deuda')::int, 0) + 1;
        v_updates := jsonb_build_object(
            'cant_alertas_deuda', v_cant_deuda,
            'ultima_alerta_deuda_at', NOW()
        );
        IF p_tipo_alerta = 'RECORDATORIO_PLANILLAS_POST_24H' THEN
            v_updates := v_updates || jsonb_build_object('alerta_t_mas_24h_enviada', true, 'alerta_t_mas_24h_at', NOW());
        ELSIF p_tipo_alerta = 'RECORDATORIO_PLANILLAS_POST_48H' THEN
            v_updates := v_updates || jsonb_build_object('alerta_t_mas_48h_enviada', true, 'alerta_t_mas_48h_at', NOW());
        END IF;
    END IF;

    IF v_updates <> '{}'::jsonb THEN
        UPDATE public.inspecciones
        SET current_data = COALESCE(current_data, '{}'::jsonb) || v_updates,
            updated_at = NOW()
        WHERE id = p_inspeccion_id;
    END IF;

    -- 15. Registrar en historial_eventos
    PERFORM public.log_inspeccion_evento(
        p_inspeccion_id,
        'ALERTA_INSPECTOR_' || p_tipo_alerta,
        p_usuario_actor,
        jsonb_build_object(
            'tipo_alerta', p_tipo_alerta,
            'email_destinatario', v_inspector.email,
            'celular_destinatario', v_inspector.celular,
            'email_status', v_email_status,
            'email_supervisor_status', v_email_sup_status,
            'whatsapp_status', v_whatsapp_status,
            'telegram_status', v_telegram_status,
            'token_generado', v_token
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'tipo_alerta', p_tipo_alerta,
        'email_status', v_email_status,
        'email_supervisor_status', v_email_sup_status,
        'whatsapp_status', v_whatsapp_status,
        'telegram_status', v_telegram_status,
        'transition_result', v_res_transition
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enviar_alerta_inspector(bigint, text, text) TO anon, authenticated, service_role;


-- 4. Actualizar ejecutar_monitoreo_inspecciones con Lógica de Cese Inteligente y Alertas Escalonadas
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
    v_max_alertas_deuda INT;
    v_cant_enviadas INT;
    v_ultima_alerta TIMESTAMPTZ;
BEGIN
    -- ──────────────────────────────────────────────────────────────────────────
    -- 1. EVALUADOR DE PRÓXIMAS INSPECCIONES (T-24h y T-4h)
    -- CONDICIÓN DE CESE: Cesa si el inspector ya bajó la planilla maestra
    --                    (planilla_descargada = true) o si el estado ya no es 3.D0
    -- ──────────────────────────────────────────────────────────────────────────
    FOR v_rec IN
        SELECT i.id, i.inspector_id, i.fecha_hora_carga_pactada, sd.state_code, i.current_data
        FROM public.inspecciones i
        LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
        WHERE i.inspector_id IS NOT NULL
          AND i.fecha_hora_carga_pactada IS NOT NULL
          AND COALESCE((i.current_data->>'planilla_descargada')::boolean, false) = false
          AND COALESCE(sd.state_code, '3.D0') IN ('3.D0', '3.D1')
    LOOP
        -- Sub-evaluador A: T - 24 Horas
        IF v_rec.fecha_hora_carga_pactada BETWEEN NOW() AND (NOW() + INTERVAL '24 hours')
           AND COALESCE((v_rec.current_data->>'alerta_t_menos_24h_enviada')::boolean, false) = false THEN
            
            v_res := public.enviar_alerta_inspector(v_rec.id, 'RECORDATORIO_PREVIO_24H', 'CRON_MONITOREO_INSPECCIONES');
            IF (v_res->>'success')::boolean THEN
                v_alertas_previas_count := v_alertas_previas_count + 1;
            END IF;

        -- Sub-evaluador B: T - 4 Horas (Recordatorio de urgencia si aún no descargó la planilla)
        ELSIF v_rec.fecha_hora_carga_pactada BETWEEN NOW() AND (NOW() + INTERVAL '4 hours')
           AND COALESCE((v_rec.current_data->>'alerta_t_menos_4h_enviada')::boolean, false) = false THEN
            
            v_res := public.enviar_alerta_inspector(v_rec.id, 'RECORDATORIO_PREVIO_4H', 'CRON_MONITOREO_INSPECCIONES');
            IF (v_res->>'success')::boolean THEN
                v_alertas_previas_count := v_alertas_previas_count + 1;
            END IF;
        END IF;
    END LOOP;

    -- ──────────────────────────────────────────────────────────────────────────
    -- 2. EVALUADOR DE DEUDA DE DOCUMENTACIÓN (Escalonada: 24h, 48h y tope configurable)
    -- CONDICIÓN DE CESE: Cesa si el inspector/operador ya cargó las planillas requeridas
    --                    o si se registró resultado_final / cierre de inspección
    -- ──────────────────────────────────────────────────────────────────────────
    FOR v_rec IN
        SELECT i.id, i.inspector_id, i.fecha_hora_carga_pactada, sd.state_code, i.current_data,
               (SELECT COUNT(*)::int FROM public.inspeccion_planillas_recibidas ipr WHERE ipr.inspeccion_id = i.id) AS cant_recibidas,
               COALESCE(i.cantidad_plantillas_requeridas, 1) AS cant_requeridas
        FROM public.inspecciones i
        LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
        WHERE i.inspector_id IS NOT NULL
          AND i.fecha_hora_carga_pactada IS NOT NULL
          AND i.fecha_hora_carga_pactada <= (NOW() - INTERVAL '24 hours')
          AND COALESCE(sd.state_code, '3.D0') IN ('3.D0', '3.D1', '3.D2')
          AND i.resultado_final IS NULL
    LOOP
        -- CONDICIÓN DE CESE: Solo alertar si faltan planillas por recibir
        IF v_rec.cant_recibidas < v_rec.cant_requeridas THEN
            v_max_alertas_deuda := COALESCE((v_rec.current_data->>'max_alertas_deuda')::int, 3); -- Default 3 alertas máximas
            v_cant_enviadas := COALESCE((v_rec.current_data->>'cant_alertas_deuda')::int, 0);
            v_ultima_alerta := (v_rec.current_data->>'ultima_alerta_deuda_at')::timestamptz;

            -- Nivel 1: Alerta T + 24 Horas
            IF COALESCE((v_rec.current_data->>'alerta_t_mas_24h_enviada')::boolean, false) = false THEN
                v_res := public.enviar_alerta_inspector(v_rec.id, 'RECORDATORIO_PLANILLAS_POST_24H', 'CRON_MONITOREO_INSPECCIONES');
                IF (v_res->>'success')::boolean THEN
                    v_alertas_posteriores_count := v_alertas_posteriores_count + 1;
                END IF;

            -- Nivel 2: Alerta T + 48 Horas
            ELSIF v_rec.fecha_hora_carga_pactada <= (NOW() - INTERVAL '48 hours')
               AND COALESCE((v_rec.current_data->>'alerta_t_mas_48h_enviada')::boolean, false) = false
               AND (v_ultima_alerta IS NULL OR v_ultima_alerta <= (NOW() - INTERVAL '20 hours')) THEN
                
                v_res := public.enviar_alerta_inspector(v_rec.id, 'RECORDATORIO_PLANILLAS_POST_48H', 'CRON_MONITOREO_INSPECCIONES');
                IF (v_res->>'success')::boolean THEN
                    v_alertas_posteriores_count := v_alertas_posteriores_count + 1;
                END IF;

            -- Nivel 3: Reiteración recurrente cada 24hs hasta alcanzar el tope configurable
            ELSIF v_cant_enviadas < v_max_alertas_deuda
               AND (v_ultima_alerta IS NULL OR v_ultima_alerta <= (NOW() - INTERVAL '20 hours')) THEN
                
                v_res := public.enviar_alerta_inspector(v_rec.id, 'RECORDATORIO_PLANILLAS_POST_RECURRENTE', 'CRON_MONITOREO_INSPECCIONES');
                IF (v_res->>'success')::boolean THEN
                    v_alertas_posteriores_count := v_alertas_posteriores_count + 1;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'alertas_previas_count', v_alertas_previas_count,
        'alertas_posteriores_count', v_alertas_posteriores_count,
        'timestamp', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ejecutar_monitoreo_inspecciones() TO anon, authenticated, service_role;
