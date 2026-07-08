-- 1. Redefinir verificar_inactividad_requerimientos para incluir remito_ref_externa en el mensaje de Telegram
CREATE OR REPLACE FUNCTION public.verificar_inactividad_requerimientos()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_nombre_chofer TEXT;
  v_supervisor_id INT;
  v_remito_ref TEXT;
  v_mensaje_telegram TEXT;
  v_payload JSONB;
  v_response extensions.http_response;
BEGIN
  -- Configurar el timeout HTTP a 10 segundos para evitar colgar la base de datos
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');

  -- Buscar requerimientos pendientes con más de 30 minutos de inactividad
  FOR v_rec IN 
    SELECT 
      cm.id AS message_id,
      cm.conversation_id,
      cm.remito_id,
      cm.body_text,
      cm.created_at,
      cm.template_code
    FROM public.conversation_messages cm
    WHERE cm.is_system_requirement = true
      AND cm.requirement_status = 'PENDIENTE'
      AND cm.created_at < (now() - interval '30 minutes')
  LOOP
    -- Obtener datos del chofer, supervisor y número de remito externo
    SELECT 
      COALESCE(r.metadata_extraida->>'nombre_chofer', 'Desconocido') AS nombre_chofer,
      COALESCE((r.metadata_extraida->>'supervisor_id')::INT, (r.metadata_extraida->>'operador_id')::INT, 4) AS supervisor_id,
      COALESCE(r.remito_ref_externa, 'Sin Nro') AS remito_ref
    INTO v_nombre_chofer, v_supervisor_id, v_remito_ref
    FROM public.remitos r
    WHERE r.id = v_rec.remito_id;

    -- Si no se encuentra el remito, usar valores por defecto
    IF v_nombre_chofer IS NULL THEN
      v_nombre_chofer := 'Desconocido';
      v_supervisor_id := 4;
      v_remito_ref := 'Sin Nro';
    END IF;

    -- 2. Actualizar el estado del requerimiento a 'EXPIRADO'
    UPDATE public.conversation_messages
    SET requirement_status = 'EXPIRADO'
    WHERE id = v_rec.message_id;

    -- 3. Registrar la alerta en alertas_escalamiento
    INSERT INTO public.alertas_escalamiento (
      trigger_message_id,
      personal_id,
      rol_notificado
    ) VALUES (
      v_rec.message_id,
      v_supervisor_id,
      'operador'
    );

    -- 4. Construir el mensaje para Telegram
    v_mensaje_telegram := '⚠️ *Alerta de Inactividad (Sin Respuesta)*' || E'\n' ||
                          '*Remito:* #' || v_remito_ref || ' (ID: #' || COALESCE(v_rec.remito_id::text, 'Sin ID') || ')' || E'\n' ||
                          '*Chofer:* ' || v_nombre_chofer || E'\n\n' ||
                          'El chofer no ha respondido al requerimiento del bot hace más de 30 minutos.' || E'\n\n' ||
                          '💬 *Requerimiento enviado:*' || E'\n' ||
                          '"' || COALESCE(v_rec.body_text, '') || '"' || E'\n\n' ||
                          '💬 *Responder en la Web:*' || E'\n' ||
                          '[Abrir Chat en Dashboard](https://pagina-carrizo.vercel.app/?remito_id=' || COALESCE(v_rec.remito_id::text, '') || ')';

    -- 5. Enviar el HTTP POST a n8n
    v_payload := jsonb_build_object(
      'mensaje', v_mensaje_telegram
    );

    BEGIN
      SELECT * INTO v_response
      FROM extensions.http_post(
        'https://hzerdan.app.n8n.cloud/webhook/notificaciones-telegram',
        v_payload::text,
        'application/json'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Silenciar errores HTTP para no interrumpir el bucle de procesamiento
      NULL;
    END;

  END LOOP;
END;
$$;

-- 2. Redefinir notify_n8n_whatsapp_requirement para incluir remito_ref_externa en el JSON payload
CREATE OR REPLACE FUNCTION public.notify_n8n_whatsapp_requirement(
  p_remito_id BIGINT,
  p_mensaje TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_chofer_id BIGINT;
  v_telefono TEXT;
  v_nombre_completo TEXT;
  v_fecha_hora TIMESTAMP WITH TIME ZONE;
  v_conversation_id BIGINT;
  v_clean_phone TEXT;
  v_payload JSONB;
  v_response extensions.http_response;
  v_status INT;
  v_nombre_chofer TEXT;
  v_hora_estimada TEXT;
  v_pregunta TEXT;
  v_message_id BIGINT;
  v_remito_ref TEXT;
BEGIN
  -- 1. Obtener chofer, teléfono y datos de carga y referencia externa
  SELECT r.chofer_id, c.telefono, c.nombre_completo, r.fecha_hora_estimada_carga, r.remito_ref_externa
  INTO v_chofer_id, v_telefono, v_nombre_completo, v_fecha_hora, v_remito_ref
  FROM public.remitos r
  JOIN public.choferes c ON r.chofer_id = c.id
  WHERE r.id = p_remito_id;

  IF v_chofer_id IS NULL OR v_telefono IS NULL OR v_telefono = '' THEN
    RAISE EXCEPTION 'No se encontró chofer o teléfono para el remito %', p_remito_id;
  END IF;

  -- 2. Limpieza del teléfono (solo dígitos)
  v_clean_phone := regexp_replace(v_telefono, '\D', '', 'g');

  -- 3. Buscar si ya existe la conversación sin bloquear/modificar (MVCC SELECT)
  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE conversation_key = v_clean_phone
    AND channel = 'whatsapp';

  -- 4. Si no existe, crear la conversación
  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (
      conversation_key,
      participant_id,
      participant_role,
      remito_actual_id,
      estado_atencion,
      channel
    ) VALUES (
      v_clean_phone,
      v_chofer_id,
      'chofer',
      p_remito_id,
      'bot_activo',
      'whatsapp'
    )
    RETURNING id INTO v_conversation_id;
  END IF;

  -- 5. Calcular variables limpias para plantillas
  v_nombre_chofer := initcap(split_part(v_nombre_completo, ' ', 1));
  IF v_fecha_hora IS NOT NULL THEN
    v_hora_estimada := to_char(v_fecha_hora AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
  ELSE
    v_hora_estimada := '00:00';
  END IF;
  v_pregunta := '¿confirmas que cargas a las ' || v_hora_estimada || '? Indicame si hubo algún cambio.';

  -- 6. Configurar el timeout HTTP a 15 segundos
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');

  -- 7. Construir payload para n8n con variables separadas y remito_ref_externa
  v_payload := jsonb_build_object(
    'conversation_id', v_conversation_id,
    'conversation_key', v_clean_phone,
    'action', 'send_instruction',
    'message', p_mensaje,
    'nombre_chofer', v_nombre_chofer,
    'pregunta_confirmacion', v_pregunta,
    'metadata', jsonb_build_object(
      'remito_id', p_remito_id,
      'remito_ref_externa', v_remito_ref,
      'template_code', 'REQ_CONFIRMACION_HORARIO'
    )
  );

  -- 8. Realizar el HTTP POST a n8n
  BEGIN
    SELECT * INTO v_response
    FROM extensions.http_post(
      'https://hzerdan.app.n8n.cloud/webhook/whatsapp-salida-web',
      v_payload::text,
      'application/json'
    );
    v_status := v_response.status;
  EXCEPTION WHEN OTHERS THEN
    v_status := 500;
  END;

  -- 9. Actualizar los vínculos de la conversación
  UPDATE public.conversations
  SET 
    remito_actual_id = p_remito_id,
    participant_id = v_chofer_id,
    participant_role = 'chofer',
    last_activity_at = now()
  WHERE id = v_conversation_id;

  -- 10. Insertar el mensaje en conversation_messages para trazabilidad operativa
  INSERT INTO public.conversation_messages (
    conversation_id,
    direction,
    sender_role,
    message_type,
    body_text,
    provider,
    remito_id,
    is_system_requirement,
    template_code,
    requirement_status
  ) VALUES (
    v_conversation_id,
    'out',
    'sistema',
    'text',
    p_mensaje,
    'whatsapp',
    p_remito_id,
    true,
    'REQ_CONFIRMACION_HORARIO',
    'PENDIENTE'
  )
  RETURNING id INTO v_message_id;

  RETURN json_build_object(
    'success', v_status >= 200 AND v_status < 300,
    'status', v_status,
    'conversation_id', v_conversation_id,
    'message_id', v_message_id
  );
END;
$$;
