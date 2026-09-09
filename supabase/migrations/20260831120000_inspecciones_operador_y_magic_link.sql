-- Migración: Operador Responsable AC, Magic Links Unificados y Alertas Telegram
-- Fecha: 2026-08-31

-- 1. Agregar columna operador_id a public.inspecciones
ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS operador_id INTEGER REFERENCES public.personal_ac(id);

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
    i.planilla_completada_url,
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

GRANT ALL ON TABLE public.v_inspecciones_kanban TO anon;
GRANT ALL ON TABLE public.v_inspecciones_kanban TO authenticated;
GRANT ALL ON TABLE public.v_inspecciones_kanban TO service_role;

-- 3. DROP y CREATE canónico de crear_nueva_inspeccion_v2 con operador_id
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
    v_state_id_d0 INTEGER;
    v_pid BIGINT;
    v_requiere_pedido BOOLEAN := true;
    v_effective_servicio_id INTEGER := p_servicio_id;
    v_current_data JSONB := '{}'::jsonb;
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

    RETURN v_inspeccion_id;
END;
$$;

GRANT ALL ON FUNCTION public.crear_nueva_inspeccion_v2(bigint[], integer, integer, text, timestamp with time zone, integer, text, integer, text, integer, integer) TO anon, authenticated, service_role;

-- 4. DROP y CREATE canónico de actualizar_datos_inspeccion con soporte para operador_id
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
    v_detalles jsonb := '{}'::jsonb;
    v_state_code text;
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

-- 5. RPC para crear o renovar Magic Link con expiración segura (mínimo 72 horas desde emisión)
DROP FUNCTION IF EXISTS public.crear_o_renovar_magic_link_inspeccion(bigint, text);

CREATE OR REPLACE FUNCTION public.crear_o_renovar_magic_link_inspeccion(
    p_inspeccion_id bigint,
    p_usuario_actor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inspeccion RECORD;
    v_inspector RECORD;
    v_token uuid := gen_random_uuid();
    v_expires_at timestamptz;
BEGIN
    SELECT * INTO v_inspeccion FROM public.inspecciones WHERE id = p_inspeccion_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inspección no encontrada.';
    END IF;

    SELECT * INTO v_inspector FROM public.personal_ac WHERE id = v_inspeccion.inspector_id;

    -- Cálculo seguro de expiración: mínimo 72 horas desde ahora, o 48 horas post fecha pactada
    v_expires_at := GREATEST(
        NOW() + INTERVAL '72 hours',
        COALESCE(v_inspeccion.fecha_hora_carga_pactada, NOW()) + INTERVAL '48 hours'
    );

    -- Invalidar tokens previos no usados
    UPDATE public.magic_links
    SET used_at = NOW()
    WHERE instancia_id = p_inspeccion_id
      AND tipo_entidad = 'INSPECCION'
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
        'INSPECCION',
        p_inspeccion_id,
        COALESCE(v_inspector.email, 'inspector@arquimedes.com'),
        v_expires_at
    );

    RETURN jsonb_build_object(
        'token', v_token,
        'expires_at', v_expires_at,
        'inspector_nombre', v_inspector.nombre_completo,
        'inspector_email', v_inspector.email
    );
END;
$$;

GRANT ALL ON FUNCTION public.crear_o_renovar_magic_link_inspeccion(bigint, text) TO anon, authenticated, service_role;

-- 6. RPC para enviar prueba de alerta a Telegram para una inspección
DROP FUNCTION IF EXISTS public.probar_alerta_telegram_inspeccion(bigint, text);

CREATE OR REPLACE FUNCTION public.probar_alerta_telegram_inspeccion(
    p_inspeccion_id bigint,
    p_usuario_actor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row RECORD;
    v_mensaje text;
    v_payload jsonb;
    v_fecha_str text;
BEGIN
    SELECT 
        i.id,
        sd.state_code,
        sd.name AS state_name,
        COALESCE(s.nombre, 'Inspección Documental') AS servicio_nombre,
        COALESCE(op.nombre_completo, 'Sin asignar') AS operador_nombre,
        COALESCE(p.nombre_completo, 'Sin inspector') AS inspector_nombre,
        COALESCE(d.nombre, 'Depósito asignado') AS lugar_nombre,
        i.fecha_hora_carga_pactada
    INTO v_row
    FROM public.inspecciones i
    LEFT JOIN public.personal_ac p ON i.inspector_id = p.id
    LEFT JOIN public.personal_ac op ON i.operador_id = op.id
    LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
    LEFT JOIN public.servicios s ON i.servicio_id = s.id
    LEFT JOIN public.depositos d ON i.lugar_carga_id = d.id
    WHERE i.id = p_inspeccion_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inspección no encontrada.';
    END IF;

    v_fecha_str := TO_CHAR(v_row.fecha_hora_carga_pactada AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI');

    v_mensaje := '🚨 *PRUEBA DE ALERTA - INSPECCIÓN DOCUMENTAL*' || E'\n\n' ||
                 '📋 *Inspección:* #INS-' || v_row.id || E'\n' ||
                 '🏷️ *Estado Actual:* ' || v_row.state_code || ' (' || v_row.state_name || ')' || E'\n' ||
                 '🏢 *Servicio:* ' || v_row.servicio_nombre || E'\n' ||
                 '👤 *Operador AC Responsable:* ' || v_row.operador_nombre || E'\n' ||
                 '🔍 *Inspector:* ' || v_row.inspector_nombre || E'\n' ||
                 '📍 *Lugar de Carga:* ' || v_row.lugar_nombre || E'\n' ||
                 '🗓️ *Fecha Pactada:* ' || COALESCE(v_fecha_str, 'No especificada') || E'\n\n' ||
                 'ℹ️ _Mensaje de prueba emitido manualmente por ' || COALESCE(p_usuario_actor, 'usuario') || '._';

    v_payload := jsonb_build_object('mensaje', v_mensaje);

    -- Enviar HTTP POST a n8n webhook de Telegram
    BEGIN
        PERFORM net.http_post(
            url := 'https://hzerdan.app.n8n.cloud/webhook/notificaciones-telegram',
            body := v_payload,
            headers := jsonb_build_object('Content-Type', 'application/json')
        );
    EXCEPTION WHEN OTHERS THEN
        -- Si net.http_post no está disponible o falla temporalmente, no abortar la transacción
    END;

    PERFORM public.log_inspeccion_evento(
        p_inspeccion_id,
        'ALERTA_TELEGRAM_PRUEBA',
        p_usuario_actor,
        jsonb_build_object('mensaje', v_mensaje)
    );

    RETURN jsonb_build_object(
        'success', true,
        'mensaje', v_mensaje
    );
END;
$$;

GRANT ALL ON FUNCTION public.probar_alerta_telegram_inspeccion(bigint, text) TO anon, authenticated, service_role;
