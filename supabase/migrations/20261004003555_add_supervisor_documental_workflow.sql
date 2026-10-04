-- ============================================================================
-- Migración: Flujo Documental del Supervisor / Operador Responsable
-- Fecha: 2026-10-04
-- Reglas AGENTS.md:
--   - Idempotencia en DDL
--   - DROP FUNCTION IF EXISTS previa con todas las firmas posibles
-- ============================================================================

-- 1. Nuevas columnas en public.inspecciones
ALTER TABLE public.inspecciones
ADD COLUMN IF NOT EXISTS template_supervisor_id INTEGER REFERENCES public.inspeccion_templates(id);

ALTER TABLE public.inspecciones
ADD COLUMN IF NOT EXISTS planilla_supervisor_personalizada_url TEXT;

ALTER TABLE public.inspecciones
ADD COLUMN IF NOT EXISTS planilla_supervisor_completada_url TEXT;

COMMENT ON COLUMN public.inspecciones.template_supervisor_id IS 'Plantilla documental maestra asignada al supervisor/operador responsable';
COMMENT ON COLUMN public.inspecciones.planilla_supervisor_personalizada_url IS 'Planilla personalizada preparada para el supervisor';
COMMENT ON COLUMN public.inspecciones.planilla_supervisor_completada_url IS 'Planilla rellenada y enviada por el supervisor';

-- 2. Actualizar la vista public.v_inspecciones_kanban
DROP VIEW IF EXISTS public.v_inspecciones_kanban CASCADE;

CREATE OR REPLACE VIEW public.v_inspecciones_kanban AS
 SELECT 
    i.id,
    i.tipo_carga,
    p.nombre_completo AS inspector_nombre,
    p.email AS inspector_email,
    p.celular AS inspector_celular,
    i.operador_id,
    op.nombre_completo AS operador_nombre,
    op.email AS operador_email,
    op.celular AS operador_celular,
    i.fecha_hora_carga_pactada AS fecha_pactada,
    i.export_doc_status,
    i.resultado_final,
    i.template_id,
    i.template_supervisor_id,
    i.planilla_personalizada_url,
    i.planilla_completada_url,
    i.planilla_supervisor_personalizada_url,
    i.planilla_supervisor_completada_url,
    sd.state_code,
    i.servicio_id,
    s.nombre AS servicio_nombre,
    COALESCE(s.requiere_pedido_ac, true) AS servicio_requiere_pedido,
    i.current_data->>'referencia_cliente' AS referencia_cliente,
    COALESCE(i.cantidad_plantillas_requeridas, 1) AS cantidad_plantillas_requeridas,
    (SELECT COUNT(*)::integer FROM public.inspeccion_planillas_recibidas ipr WHERE ipr.inspeccion_id = i.id) AS cantidad_plantillas_recibidas,
    ( SELECT json_agg(
            json_build_object(
                'id', ipr.id,
                'archivo_url', ipr.archivo_url,
                'nombre_archivo', ipr.nombre_archivo,
                'etiqueta_identificador', ipr.etiqueta_identificador,
                'created_at', ipr.created_at,
                'subido_por', ipr.subido_por
            ) ORDER BY ipr.id ASC
        ) FROM public.inspeccion_planillas_recibidas ipr WHERE ipr.inspeccion_id = i.id
    ) AS planillas_recibidas,
    ( SELECT json_agg(json_build_object('identificador_compuesto', pi.identificador_compuesto)) AS json_agg
       FROM public.inspeccion_items_pedido iip
         JOIN public.pedido_instancias pi ON iip.pedido_instance_id = pi.id
      WHERE iip.inspeccion_id = i.id) AS pedidos
   FROM public.inspecciones i
     LEFT JOIN public.personal_ac p ON i.inspector_id = p.id
     LEFT JOIN public.personal_ac op ON i.operador_id = op.id
     LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
     LEFT JOIN public.servicios s ON i.servicio_id = s.id;

GRANT ALL ON TABLE public.v_inspecciones_kanban TO anon, authenticated, service_role;

-- 3. RPC para crear o renovar Magic Link del Supervisor
DROP FUNCTION IF EXISTS public.crear_o_renovar_magic_link_supervisor(bigint, text);
DROP FUNCTION IF EXISTS public.crear_o_renovar_magic_link_supervisor(bigint);

CREATE OR REPLACE FUNCTION public.crear_o_renovar_magic_link_supervisor(
    p_inspeccion_id bigint,
    p_usuario_actor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inspeccion RECORD;
    v_operador RECORD;
    v_token uuid := gen_random_uuid();
    v_expires_at timestamptz;
BEGIN
    SELECT * INTO v_inspeccion FROM public.inspecciones WHERE id = p_inspeccion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inspección no encontrada.';
    END IF;

    IF v_inspeccion.operador_id IS NULL THEN
        RAISE EXCEPTION 'La inspección no tiene un operador / supervisor asignado.';
    END IF;

    SELECT * INTO v_operador FROM public.personal_ac WHERE id = v_inspeccion.operador_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El operador / supervisor no existe en personal_ac.';
    END IF;

    -- Cálculo seguro de expiración: mínimo 72 horas desde ahora, o 48 horas post fecha pactada
    v_expires_at := GREATEST(
        NOW() + INTERVAL '72 hours',
        COALESCE(v_inspeccion.fecha_hora_carga_pactada, NOW()) + INTERVAL '48 hours'
    );

    -- Invalidar tokens previos de supervisor no usados para esta inspección
    UPDATE public.magic_links
    SET used_at = NOW()
    WHERE instancia_id = p_inspeccion_id
      AND tipo_entidad = 'INSPECCION_SUPERVISOR'
      AND used_at IS NULL;

    -- Insertar nuevo token activo
    INSERT INTO public.magic_links (
        token,
        tipo_entidad,
        instancia_id,
        usuario_email,
        expires_at
    ) VALUES (
        v_token,
        'INSPECCION_SUPERVISOR',
        p_inspeccion_id,
        COALESCE(v_operador.email, 'supervisor@arquimedes.com'),
        v_expires_at
    );

    RETURN jsonb_build_object(
        'token', v_token,
        'expires_at', v_expires_at,
        'supervisor_nombre', v_operador.nombre_completo,
        'supervisor_email', v_operador.email,
        'supervisor_celular', v_operador.celular
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_o_renovar_magic_link_supervisor(bigint, text) TO anon, authenticated, service_role;

-- 4. Adaptar get_inspeccion_by_token para soportar Inspector y Supervisor
DROP FUNCTION IF EXISTS public.get_inspeccion_by_token(uuid);
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
    v_operador_nombre text;
    v_cant_req int;
    v_cant_rec int;
    v_planillas jsonb;
    v_rol text;
    v_token_uuid uuid;
BEGIN
    BEGIN
        v_token_uuid := p_token::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Token inválido.';
    END;

    SELECT * INTO v_magic_link 
    FROM public.magic_links 
    WHERE token = v_token_uuid; 
    
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
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inspección no encontrada.';
    END IF;

    SELECT nombre_completo INTO v_inspector_nombre FROM public.personal_ac WHERE id = v_inspeccion.inspector_id;
    SELECT nombre_completo INTO v_operador_nombre FROM public.personal_ac WHERE id = v_inspeccion.operador_id;

    v_rol := CASE 
        WHEN v_magic_link.tipo_entidad = 'INSPECCION_SUPERVISOR' THEN 'SUPERVISOR'
        ELSE 'INSPECTOR'
    END;

    IF v_rol = 'SUPERVISOR' THEN
        RETURN jsonb_build_object(
            'id', v_inspeccion.id,
            'rol_destinatario', 'SUPERVISOR',
            'fecha_pactada', v_inspeccion.fecha_hora_carga_pactada,
            'tipo_carga', v_inspeccion.tipo_carga,
            'supervisor_nombre', v_operador_nombre,
            'inspector_nombre', v_inspector_nombre,
            'planilla_personalizada_url', v_inspeccion.planilla_supervisor_personalizada_url,
            'planilla_completada_url', v_inspeccion.planilla_supervisor_completada_url,
            'planilla_descargada', COALESCE((v_inspeccion.current_data->>'planilla_supervisor_descargada')::boolean, false)
        );
    ELSE
        v_cant_req := COALESCE(v_inspeccion.cantidad_plantillas_requeridas, 1);

        SELECT 
            COUNT(*)::integer, 
            COALESCE(jsonb_agg(jsonb_build_object(
                'id', id,
                'archivo_url', archivo_url,
                'nombre_archivo', nombre_archivo,
                'etiqueta_identificador', etiqueta_identificador,
                'created_at', created_at
            ) ORDER BY id ASC), '[]'::jsonb)
        INTO v_cant_rec, v_planillas
        FROM public.inspeccion_planillas_recibidas
        WHERE inspeccion_id = v_inspeccion.id;

        RETURN jsonb_build_object(
            'id', v_inspeccion.id,
            'rol_destinatario', 'INSPECTOR',
            'fecha_pactada', v_inspeccion.fecha_hora_carga_pactada,
            'tipo_carga', v_inspeccion.tipo_carga,
            'inspector_nombre', v_inspector_nombre,
            'supervisor_nombre', v_operador_nombre,
            'planilla_personalizada_url', v_inspeccion.planilla_personalizada_url,
            'planilla_descargada', COALESCE((v_inspeccion.current_data->>'planilla_descargada')::boolean, false),
            'cantidad_plantillas_requeridas', v_cant_req,
            'cantidad_plantillas_recibidas', v_cant_rec,
            'planillas_recibidas', v_planillas
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inspeccion_by_token(text) TO anon, authenticated, service_role;

-- 5. RPC para registrar subida de planilla completada del supervisor desde el portal
DROP FUNCTION IF EXISTS public.subir_planilla_supervisor_completada(text, text, text);

CREATE OR REPLACE FUNCTION public.subir_planilla_supervisor_completada(
    p_token text,
    p_archivo_url text,
    p_nombre_archivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_magic_link RECORD;
    v_inspeccion RECORD;
BEGIN
    SELECT * INTO v_magic_link 
    FROM public.magic_links 
    WHERE token = p_token::uuid;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token inválido.';
    END IF;

    SELECT * INTO v_inspeccion FROM public.inspecciones WHERE id = v_magic_link.instancia_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inspección no encontrada.';
    END IF;

    UPDATE public.inspecciones
    SET planilla_supervisor_completada_url = p_archivo_url,
        updated_at = NOW()
    WHERE id = v_magic_link.instancia_id;

    PERFORM public.log_inspeccion_evento(
        v_magic_link.instancia_id,
        'PLANILLA_SUPERVISOR_SUBIDA',
        COALESCE(v_magic_link.usuario_email, 'SUPERVISOR'),
        jsonb_build_object(
            'archivo_url', p_archivo_url,
            'nombre_archivo', p_nombre_archivo
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'inspeccion_id', v_magic_link.instancia_id,
        'planilla_url', p_archivo_url
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.subir_planilla_supervisor_completada(text, text, text) TO anon, authenticated, service_role;

-- 6. RPC para enviar alerta al Supervisor (Email + WhatsApp)
DROP FUNCTION IF EXISTS public.enviar_alerta_supervisor(bigint, text, text);
DROP FUNCTION IF EXISTS public.enviar_alerta_supervisor(bigint, text);

CREATE OR REPLACE FUNCTION public.enviar_alerta_supervisor(
    p_inspeccion_id bigint,
    p_tipo_alerta text, -- 'ASIGNACION' | 'RECORDATORIO_PLANILLAS_POST_48H'
    p_usuario_actor text DEFAULT 'SISTEMA_MONITOREO'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inspeccion RECORD;
    v_operador RECORD;
    v_lugar_nombre TEXT;
    v_magic_data JSONB;
    v_token TEXT;
    v_portal_url TEXT;
    v_site_url TEXT := 'https://pagina-carrizo.vercel.app';
    v_fecha_str TEXT;
    v_email_subject TEXT;
    v_email_title TEXT;
    v_email_intro TEXT;
    v_email_badge_color TEXT := '#7c3aed';
    v_html_body TEXT;
    v_email_payload JSONB;
    v_whatsapp_payload JSONB;
    v_whatsapp_msg TEXT;
    v_clean_phone TEXT;
    v_email_status INT := 0;
    v_whatsapp_status INT := 0;
    v_updates JSONB := '{}'::jsonb;
BEGIN
    SELECT i.*, sd.state_code, s.nombre AS servicio_nombre
    INTO v_inspeccion
    FROM public.inspecciones i
    LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
    LEFT JOIN public.servicios s ON i.servicio_id = s.id
    WHERE i.id = p_inspeccion_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Inspección no encontrada');
    END IF;

    IF v_inspeccion.operador_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La inspección no tiene operador / supervisor asignado');
    END IF;

    SELECT * INTO v_operador
    FROM public.personal_ac
    WHERE id = v_inspeccion.operador_id;

    IF NOT FOUND OR v_operador.email IS NULL OR TRIM(v_operador.email) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El supervisor no tiene email válido configurado en personal_ac');
    END IF;

    SELECT nombre INTO v_lugar_nombre
    FROM public.depositos
    WHERE id = v_inspeccion.lugar_carga_id;
    v_lugar_nombre := COALESCE(v_lugar_nombre, 'Depósito Asignado');

    -- Crear Magic Link de Supervisor
    v_magic_data := public.crear_o_renovar_magic_link_supervisor(p_inspeccion_id);
    v_token := v_magic_data->>'token';
    v_portal_url := v_site_url || '/inspect/' || v_token;

    IF v_inspeccion.fecha_hora_carga_pactada IS NOT NULL THEN
        v_fecha_str := TO_CHAR(v_inspeccion.fecha_hora_carga_pactada AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI "hs"');
    ELSE
        v_fecha_str := 'A confirmar';
    END IF;

    IF p_tipo_alerta = 'RECORDATORIO_PLANILLAS_POST_48H' THEN
        v_email_subject := '⚠️ Planilla de Supervisión Pendiente (+48h) - Inspección #INS-' || p_inspeccion_id;
        v_email_title := 'Planilla de Control de Supervisión Pendiente';
        v_email_badge_color := '#dc2626';
        v_email_intro := 'Han transcurrido más de 48 horas desde la fecha pactada (' || v_fecha_str || ') y el sistema aún registra pendiente la carga de tu planilla de supervisión. Por favor accede al portal y sube el documento rellenado:';
        v_whatsapp_msg := 'Hola ' || initcap(split_part(v_operador.nombre_completo, ' ', 1)) || 
            ', te recordamos que está pendiente la planilla de supervisión para la Inspección #INS-' || p_inspeccion_id || 
            ' (pactada el ' || v_fecha_str || '). Por favor súbela aquí: ' || v_portal_url;
    ELSE -- ASIGNACION
        v_email_subject := 'Planilla de Supervisión Asignada #INS-' || p_inspeccion_id;
        v_email_title := 'Planilla de Supervisión Asignada';
        v_email_badge_color := '#7c3aed';
        v_email_intro := 'Se te ha asignado el control documental de supervisión para la siguiente inspección:';
        v_whatsapp_msg := 'Hola ' || initcap(split_part(v_operador.nombre_completo, ' ', 1)) || 
            ', se te ha asignado la planilla de supervisión para la Inspección #INS-' || p_inspeccion_id || 
            ' pactada para el ' || v_fecha_str || ' en ' || v_lugar_nombre || 
            '. Puedes acceder a tu planilla aquí: ' || v_portal_url;
    END IF;

    v_html_body := '
      <div style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
        <div style="background-color: ' || v_email_badge_color || '; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">' || v_email_title || '</h1>
        </div>
        <div style="background-color: #ffffff; padding: 32px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; color: #374151; margin-top: 0;">Hola <strong>' || v_operador.nombre_completo || '</strong>,</p>
          <p style="font-size: 15px; color: #374151;">' || v_email_intro || '</p>
          
          <div style="background-color: #f3f4f6; border-left: 4px solid ' || v_email_badge_color || '; padding: 16px; margin: 24px 0; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>ID de Inspección:</strong> #INS-' || p_inspeccion_id || '</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Rol:</strong> Supervisor / Operador Responsable</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Servicio:</strong> ' || COALESCE(v_inspeccion.servicio_nombre, 'Inspección') || '</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Lugar de Carga:</strong> ' || v_lugar_nombre || '</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #4b5563;"><strong>Fecha y Hora Pactada:</strong> ' || v_fecha_str || '</p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="' || v_portal_url || '" style="background-color: ' || v_email_badge_color || '; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Acceder al Portal de Supervisión</a>
          </div>

          <p style="font-size: 13px; color: #6b7280; text-align: center; margin-top: 32px; margin-bottom: 0;">
            Enlace de acceso exclusivo para el supervisor responsable.
          </p>
        </div>
      </div>
    ';

    v_email_payload := jsonb_build_object(
        'inspeccionId', p_inspeccion_id,
        'inspectorEmail', v_operador.email,
        'inspectorNombre', v_operador.nombre_completo,
        'fechaPactada', v_inspeccion.fecha_hora_carga_pactada,
        'uploadToken', v_token,
        'magicLinkUrl', v_portal_url,
        'emailSubject', v_email_subject,
        'htmlBody', v_html_body
    );

    BEGIN
        PERFORM net.http_post(
            url := 'https://hzerdan.app.n8n.cloud/webhook/notificaciones-inspecciones-email',
            body := v_email_payload,
            headers := jsonb_build_object('Content-Type', 'application/json')
        );
        v_email_status := 200;
    EXCEPTION WHEN OTHERS THEN
        v_email_status := 500;
    END;

    IF v_operador.celular IS NOT NULL AND TRIM(v_operador.celular) <> '' THEN
        v_clean_phone := REGEXP_REPLACE(v_operador.celular, '[^0-9]', '', 'g');
        IF LENGTH(v_clean_phone) = 10 THEN
            v_clean_phone := '549' || v_clean_phone;
        ELSIF LENGTH(v_clean_phone) = 11 AND v_clean_phone LIKE '0%' THEN
            v_clean_phone := '549' || SUBSTRING(v_clean_phone FROM 2);
        END IF;

        v_whatsapp_payload := jsonb_build_object(
            'telefono', v_clean_phone,
            'mensaje', v_whatsapp_msg,
            'inspeccion_id', p_inspeccion_id,
            'destinatario', v_operador.nombre_completo,
            'rol', 'SUPERVISOR',
            'magic_link', v_portal_url
        );

        BEGIN
            PERFORM net.http_post(
                url := 'https://hzerdan.app.n8n.cloud/webhook/notificaciones-inspecciones-whatsapp',
                body := v_whatsapp_payload,
                headers := jsonb_build_object('Content-Type', 'application/json')
            );
            v_whatsapp_status := 200;
        EXCEPTION WHEN OTHERS THEN
            v_whatsapp_status := 500;
        END;
    END IF;

    IF p_tipo_alerta = 'RECORDATORIO_PLANILLAS_POST_48H' THEN
        v_updates := jsonb_build_object(
            'alerta_supervisor_t_mas_48h_enviada', true,
            'alerta_supervisor_t_mas_48h_at', NOW()
        );
    END IF;

    IF v_updates <> '{}'::jsonb THEN
        UPDATE public.inspecciones
        SET current_data = COALESCE(current_data, '{}'::jsonb) || v_updates,
            updated_at = NOW()
        WHERE id = p_inspeccion_id;
    END IF;

    PERFORM public.log_inspeccion_evento(
        p_inspeccion_id,
        'ALERTA_SUPERVISOR_' || p_tipo_alerta,
        p_usuario_actor,
        jsonb_build_object(
            'tipo_alerta', p_tipo_alerta,
            'email_destinatario', v_operador.email,
            'celular_destinatario', v_operador.celular,
            'email_status', v_email_status,
            'whatsapp_status', v_whatsapp_status,
            'token_generado', v_token
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'tipo_alerta', p_tipo_alerta,
        'email_status', v_email_status,
        'whatsapp_status', v_whatsapp_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enviar_alerta_supervisor(bigint, text, text) TO anon, authenticated, service_role;

-- 7. Actualizar función de monitoreo periódico para incluir T+48h de Supervisor
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
    v_alertas_supervisor_count INT := 0;
    v_res JSONB;
BEGIN
    -- 1. Evaluador T - 24 Horas: Inspector
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

    -- 2. Evaluador T + 24 Horas: Inspector (Planillas faltantes)
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
        IF v_rec.cant_recibidas < v_rec.cant_requeridas THEN
            v_res := public.enviar_alerta_inspector(v_rec.id, 'RECORDATORIO_PLANILLAS_POST_24H', 'CRON_MONITOREO_INSPECCIONES');
            IF (v_res->>'success')::boolean THEN
                v_alertas_posteriores_count := v_alertas_posteriores_count + 1;
            END IF;
        END IF;
    END LOOP;

    -- 3. Evaluador T + 48 Horas: Supervisor (Planilla de supervisión faltante)
    FOR v_rec IN
        SELECT i.id, i.operador_id, i.fecha_hora_carga_pactada, sd.state_code
        FROM public.inspecciones i
        LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
        WHERE i.operador_id IS NOT NULL
          AND (i.template_supervisor_id IS NOT NULL OR i.planilla_supervisor_personalizada_url IS NOT NULL)
          AND i.planilla_supervisor_completada_url IS NULL
          AND i.fecha_hora_carga_pactada IS NOT NULL
          AND i.fecha_hora_carga_pactada <= (NOW() - INTERVAL '48 hours')
          AND COALESCE((i.current_data->>'alerta_supervisor_t_mas_48h_enviada')::boolean, false) = false
          AND COALESCE(sd.state_code, '3.D0') NOT IN ('3.D4', '3.D5')
          AND i.resultado_final IS NULL
    LOOP
        v_res := public.enviar_alerta_supervisor(v_rec.id, 'RECORDATORIO_PLANILLAS_POST_48H', 'CRON_MONITOREO_INSPECCIONES');
        IF (v_res->>'success')::boolean THEN
            v_alertas_supervisor_count := v_alertas_supervisor_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'alertas_previas_t_menos_24h', v_alertas_previas_count,
        'alertas_posteriores_t_mas_24h', v_alertas_posteriores_count,
        'alertas_supervisor_t_mas_48h', v_alertas_supervisor_count,
        'timestamp', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ejecutar_monitoreo_inspecciones() TO anon, authenticated, service_role;
