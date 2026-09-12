-- Migración: Actualizar ejecutar_monitoreo_mision_remitos para incluir la presentación del Asistente Automático al inicio de la conversación

DROP FUNCTION IF EXISTS public.ejecutar_monitoreo_mision_remitos();

CREATE OR REPLACE FUNCTION public.ejecutar_monitoreo_mision_remitos()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_rec RECORD;
  v_nombre TEXT;
  v_mensaje TEXT;
  v_intervalo_minutos INT;
  v_reintentos_max INT;
  v_tarea_id INT;
  v_tarea_desc TEXT;
  v_siguiente_tarea_desc TEXT;
  v_payload JSONB;
  v_mensaje_telegram TEXT;
  v_mensaje_desbloqueo TEXT;
  v_remito_ref TEXT;
  v_supervisor_id INT;
  v_trigger_message_id BIGINT;
  v_response extensions.http_response;
  v_debe_alertar BOOLEAN;
BEGIN
  -- Configurar el timeout HTTP a 10 segundos
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');

  -- RESPONSABILIDAD 1: ACTIVACIÓN (para remitos en OPERACION_PENDIENTE)
  FOR v_rec IN 
    SELECT r.id, r.fecha_hora_estimada_carga, c.nombre_completo, c.telefono
    FROM public.remitos r
    JOIN public.choferes c ON r.chofer_id = c.id
    LEFT JOIN public.conversations conv ON conv.remito_actual_id = r.id OR conv.participant_id = c.id
    WHERE r.mision_estado = 'OPERACION_PENDIENTE'
      AND r.estado_asignacion = 'ASIGNADO'
      AND COALESCE(conv.estado_atencion, 'bot_activo') = 'bot_activo'
      AND c.telefono IS NOT NULL AND c.telefono <> ''
      AND r.fecha_hora_estimada_carga IS NOT NULL
      AND NOW() >= (r.fecha_hora_estimada_carga - INTERVAL '6 hours')
      AND NOT EXISTS (
        SELECT 1 FROM public.conversation_messages cm
        WHERE cm.remito_id = r.id
          AND cm.created_at >= NOW() - INTERVAL '6 hours'
      )
  LOOP
    -- Transicionar a ESPERANDO_PAPELES
    UPDATE public.remitos
    SET mision_estado = 'ESPERANDO_PAPELES',
        ultimo_mensaje_chofer_at = NOW(),
        retry_count = 0
    WHERE id = v_rec.id;

    v_nombre := initcap(split_part(v_rec.nombre_completo, ' ', 1));
    v_mensaje := 'Hola ' || v_nombre || E'\n🤖 Te comento que soy el Asistente Automático de Arquímedes Carrizo, supervisado en todo momento por nuestro equipo de logística humana.\n¿me confirmas si ya tienes la documentación física en mano (remito y órdenes)?';
    PERFORM public.notify_n8n_whatsapp_requirement(v_rec.id, v_mensaje);
  END LOOP;

  -- RESPONSABILIDAD 2: SEGUIMIENTO (para remitos activos ya iniciados)
  FOR v_rec IN 
    SELECT r.id, r.retry_count, r.remito_ref_externa, c.nombre_completo, r.protocolo_control,
           COALESCE(conv.estado_atencion, 'bot_activo') AS estado_atencion,
           COALESCE((r.metadata_extraida->>'supervisor_id')::INT, (r.metadata_extraida->>'operador_id')::INT, 4) AS supervisor_id
    FROM public.remitos r
    JOIN public.choferes c ON r.chofer_id = c.id
    LEFT JOIN public.conversations conv ON conv.remito_actual_id = r.id OR conv.participant_id = c.id
    WHERE r.mision_estado IS NOT NULL 
      AND r.mision_estado <> 'OPERACION_PENDIENTE'
      AND r.mision_estado <> 'MISION_COMPLETADA'
      AND r.estado_asignacion = 'ASIGNADO'
      AND COALESCE(conv.estado_atencion, 'bot_activo') = 'bot_activo'
      AND c.telefono IS NOT NULL AND c.telefono <> ''
      AND COALESCE(public.get_remito_setting_bool(r.id, 'omitir_notificaciones_chofer', false), false) = false
      AND COALESCE(public.get_remito_setting_bool(r.id, 'omitir_recordatorios_carga', false), false) = false
      AND (r.ultimo_mensaje_chofer_at IS NULL OR r.ultimo_mensaje_chofer_at < NOW() - INTERVAL '1 minute')
  LOOP
    -- Llamar a la simulación dinámica
    SELECT (v_sim->>'debe_alertar')::boolean, 
           v_sim->>'mensaje_a_enviar', 
           (v_sim->>'reintentos_maximo')::int, 
           (v_sim->>'intervalo_limite_minutos')::int,
           (v_sim->>'tarea_id')::int
    INTO v_debe_alertar, v_mensaje, v_reintentos_max, v_intervalo_minutos, v_tarea_id
    FROM public.simular_monitoreo_remito(v_rec.id) AS v_sim;

    IF COALESCE(v_debe_alertar, false) = true AND v_mensaje IS NOT NULL AND v_mensaje <> '' THEN
      -- Evaluación de Escalamiento vs. Reintento simple
      IF v_rec.retry_count >= v_reintentos_max THEN
        -- Excedido el límite: enviar ALERTA FINAL a Telegram y destrabar operatoria con chofer
        v_nombre := initcap(split_part(v_rec.nombre_completo, ' ', 1));
        v_remito_ref := COALESCE(v_rec.remito_ref_externa, 'Servicio asignado');
        IF v_remito_ref NOT ILIKE 'remito%' AND v_remito_ref != 'Servicio asignado' THEN
          v_remito_ref := 'Remito ' || v_remito_ref;
        END IF;

        v_supervisor_id := v_rec.supervisor_id;
        
        -- Identificar nombre de la tarea atascada y de la siguiente tarea en la secuencia
        v_tarea_desc := NULL;
        v_siguiente_tarea_desc := NULL;

        IF v_tarea_id IS NOT NULL THEN
          SELECT elem->>'tarea' INTO v_tarea_desc
          FROM jsonb_array_elements(v_rec.protocolo_control) AS elem
          WHERE (elem->>'id')::int = v_tarea_id;

          SELECT elem->>'tarea' INTO v_siguiente_tarea_desc
          FROM jsonb_array_elements(v_rec.protocolo_control) AS elem
          WHERE (elem->>'orden_sugerido')::int > (
            SELECT COALESCE((e->>'orden_sugerido')::int, 0)
            FROM jsonb_array_elements(v_rec.protocolo_control) AS e
            WHERE (e->>'id')::int = v_tarea_id
          ) AND elem->>'estado' = 'PENDIENTE'
          ORDER BY (elem->>'orden_sugerido')::int ASC
          LIMIT 1;
        END IF;

        -- Buscar el trigger_message_id correspondiente
        SELECT id INTO v_trigger_message_id
        FROM public.conversation_messages
        WHERE remito_id = v_rec.id
          AND is_system_requirement = true
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_trigger_message_id IS NULL THEN
          SELECT id INTO v_trigger_message_id
          FROM public.conversation_messages
          WHERE remito_id = v_rec.id
          ORDER BY created_at DESC
          LIMIT 1;
        END IF;
        
        -- 1. Insertar en alertas_escalamiento
        IF v_trigger_message_id IS NOT NULL THEN
          INSERT INTO public.alertas_escalamiento (
            personal_id,
            rol_notificado,
            trigger_message_id
          ) VALUES (
            v_supervisor_id,
            'operador',
            v_trigger_message_id
          );
        END IF;

        -- 2. Construir mensaje de ALERTA FINAL para Telegram
        v_mensaje_telegram := '🚨 *ALERTA FINAL (Reintentos Agotados)*' || E'\n' ||
                              '*Remito:* #' || v_remito_ref || ' (ID: #' || v_rec.id::text || ')' || E'\n' ||
                              '*Chofer:* ' || v_rec.nombre_completo || E'\n\n' ||
                              'El chofer no ha respondido tras ' || v_reintentos_max || ' reintentos a la tarea: "' || COALESCE(v_tarea_desc, 'Tarea pendiente') || '". Se cierra la insistencia automática y se avanza la hoja de ruta.' || E'\n\n' ||
                              '💬 *Requerimiento no respondido:*' || E'\n' ||
                              '\"' || v_mensaje || '\"' || E'\n\n' ||
                              '💬 *Abrir Chat en Dashboard:*' || E'\n' ||
                              '[Ver Dashboard](https://pagina-carrizo.vercel.app/?remito_id=' || v_rec.id::text || ')';

        -- 3. Enviar HTTP POST a Telegram webhook
        v_payload := jsonb_build_object('mensaje', v_mensaje_telegram);
        BEGIN
          SELECT * INTO v_response
          FROM extensions.http_post(
            'https://hzerdan.app.n8n.cloud/webhook/notificaciones-telegram',
            v_payload::text,
            'application/json'
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;

        -- 4. Destrabar operatoria en la base de datos: Marcar la tarea atascada como OMITIDO_POR_INACTIVIDAD en protocolo_control y resetear retry_count (EXCEPTO tarea 15 de papeles que no debe saltarse automáticamente por cron)
        IF v_tarea_id IS NOT NULL AND v_tarea_id <> 15 THEN
          UPDATE public.remitos
          SET retry_count = 0,
              ultimo_mensaje_chofer_at = NOW(),
              protocolo_control = COALESCE((
                SELECT jsonb_agg(
                  CASE 
                    WHEN (elem->>'id')::int = v_tarea_id AND elem->>'estado' = 'PENDIENTE' THEN 
                      elem || jsonb_build_object('estado', 'OMITIDO_POR_INACTIVIDAD', 'chofer_reporto_at', NOW()::text)
                    ELSE elem
                  END
                )
                FROM jsonb_array_elements(protocolo_control) AS elem
              ), protocolo_control)
          WHERE id = v_rec.id;
        ELSE
          UPDATE public.remitos
          SET retry_count = 0,
              ultimo_mensaje_chofer_at = NOW()
          WHERE id = v_rec.id;
        END IF;

        -- 5. Armar el mensaje contextual para el chofer especificando la tarea omitida y proponiendo la siguiente
        IF v_tarea_desc IS NOT NULL AND v_siguiente_tarea_desc IS NOT NULL THEN
          v_mensaje_desbloqueo := 'Hola ' || v_nombre || ', sobre ' || v_remito_ref || ': veo que no has realizado la tarea "' || v_tarea_desc || '". Por favor confírmanos si podés continuar con ' || v_siguiente_tarea_desc || '.';
        ELSIF v_tarea_desc IS NOT NULL THEN
          v_mensaje_desbloqueo := 'Hola ' || v_nombre || ', sobre ' || v_remito_ref || ': veo que no has realizado la tarea "' || v_tarea_desc || '". Por favor confírmanos tu estado actual o si podés avanzar con el siguiente paso de tu hoja de ruta.';
        ELSE
          v_mensaje_desbloqueo := 'Hola ' || v_nombre || ', sobre ' || v_remito_ref || ': para no demorar tu viaje, omitimos el reporte pendiente. Por favor confírmanos tu estado actual o si podés avanzar con el siguiente paso de tu hoja de ruta.';
        END IF;

        PERFORM public.notify_n8n_whatsapp_requirement(v_rec.id, v_mensaje_desbloqueo);
      ELSE
        -- Incrementar retry_count y enviar recordatorio al chofer
        UPDATE public.remitos
        SET retry_count = retry_count + 1,
            ultimo_mensaje_chofer_at = NOW()
        WHERE id = v_rec.id;

        PERFORM public.notify_n8n_whatsapp_requirement(v_rec.id, v_mensaje);
      END IF;
    END IF;
  END LOOP;
END;
$function$;
