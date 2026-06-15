-- Re-define notify_n8n_whatsapp_requirement with increased HTTP timeout and optimized, lock-free transaction order
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
  v_conversation_id BIGINT;
  v_clean_phone TEXT;
  v_payload JSONB;
  v_response extensions.http_response;
  v_status INT;
BEGIN
  -- 1. Obtener chofer y teléfono desde el remito
  SELECT r.chofer_id, c.telefono
  INTO v_chofer_id, v_telefono
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

  -- 4. Si no existe, crear la conversación para obtener su ID
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

  -- 5. Configurar el timeout HTTP a 15 segundos para evitar timeouts prematuros de n8n
  PERFORM set_config('http.timeout_ms', '15000', true);

  -- 6. Construir payload para n8n
  v_payload := jsonb_build_object(
    'conversation_id', v_conversation_id,
    'conversation_key', v_clean_phone,
    'action', 'send_instruction',
    'message', p_mensaje,
    'metadata', jsonb_build_object(
      'remito_id', p_remito_id,
      'template_code', 'REQ_CONFIRMACION_HORARIO'
    )
  );

  -- 7. Realizar el HTTP POST a n8n antes de realizar escrituras/bloqueos en conversaciones existentes
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

  -- 8. Actualizar los vínculos de la conversación una vez completada la llamada HTTP
  UPDATE public.conversations
  SET 
    remito_actual_id = p_remito_id,
    participant_id = v_chofer_id,
    participant_role = 'chofer',
    last_activity_at = now()
  WHERE id = v_conversation_id;

  -- 9. Insertar el mensaje en conversation_messages para trazabilidad operativa
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
  );

  RETURN json_build_object(
    'success', v_status >= 200 AND v_status < 300,
    'status', v_status,
    'conversation_id', v_conversation_id
  );
END;
$$;
