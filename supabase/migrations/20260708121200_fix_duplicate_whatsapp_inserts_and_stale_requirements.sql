-- 1. Redefinir notify_n8n_whatsapp_requirement para eliminar la inserción duplicada en conversation_messages
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

  -- Retornar el objeto de respuesta sin message_id de base de datos
  RETURN json_build_object(
    'success', v_status >= 200 AND v_status < 300,
    'status', v_status,
    'conversation_id', v_conversation_id,
    'message_id', NULL
  );
END;
$$;

-- 2. Crear la función del trigger para limpiar requerimientos pendientes cuando responde el chofer
CREATE OR REPLACE FUNCTION public.trg_fn_clean_pending_requirements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Solo actuar si el mensaje es del chofer (entrante)
  IF NEW.direction = 'in' THEN
    UPDATE public.conversation_messages
    SET requirement_status = 'CONTESTADO',
        response_to_id = NEW.id
    WHERE conversation_id = NEW.conversation_id
      AND is_system_requirement = true
      AND requirement_status = 'PENDIENTE';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Crear el trigger AFTER INSERT en conversation_messages
CREATE OR REPLACE TRIGGER trg_clean_pending_requirements
AFTER INSERT ON public.conversation_messages
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_clean_pending_requirements();
