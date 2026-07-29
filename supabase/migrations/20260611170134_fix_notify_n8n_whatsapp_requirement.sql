-- Re-define notify_n8n_whatsapp_requirement with increased HTTP timeout and optimized, lock-free transaction order
CREATE OR REPLACE FUNCTION public.notify_n8n_whatsapp_requirement(
  p_remito_id BIGINT,
  p_mensaje TEXT,
  p_template_code TEXT DEFAULT NULL
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
  v_num_remito TEXT;
  v_ref_visible TEXT;
  v_template_code_resolved TEXT;
  v_mision_estado TEXT;
BEGIN
  -- 1. Obtener chofer, teléfono, datos de carga, referencia externa y número de remito del JSON
  SELECT 
    r.chofer_id, 
    c.telefono, 
    c.nombre_completo, 
    r.fecha_hora_estimada_carga, 
    r.remito_ref_externa, 
    r.metadata_extraida->>'remito',
    r.mision_estado
  INTO 
    v_chofer_id, 
    v_telefono, 
    v_nombre_completo, 
    v_fecha_hora, 
    v_remito_ref, 
    v_num_remito,
    v_mision_estado
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

  -- Referencia humana/externa visible para el chofer (NUNCA el ID interno de base de datos)
  v_ref_visible := COALESCE(NULLIF(v_remito_ref, ''), NULLIF(v_num_remito, ''), 'Servicio asignado');
  IF v_ref_visible NOT ILIKE 'remito%' AND v_ref_visible != 'Servicio asignado' THEN
    v_ref_visible := 'Remito ' || v_ref_visible;
  END IF;

  -- Determinar código de plantilla dinámicamente según el contenido del mensaje
  v_template_code_resolved := COALESCE(p_template_code, 
    CASE 
      WHEN p_mensaje LIKE '%fecha y hora de carga%' OR p_mensaje LIKE '%horario de carga%' THEN 'REQ_CONFIRMACION_HORARIO'
      ELSE 'REQ_CONFIRMACION_DOCS'
    END
  );

  -- Definir la pregunta de confirmación incorporando la Referencia Humana del Remito
  IF v_template_code_resolved = 'REQ_CONFIRMACION_HORARIO' THEN
    v_pregunta := v_ref_visible || E'\n¿confirmas que cargas a las ' || v_hora_estimada || ' hs? ¿Es correcto o si ha cambiado pasame el nuevo horario por aquí.';
  ELSE
    v_pregunta := v_ref_visible || E'\n¿me confirmas si ya tienes la documentación física en mano (remito y órdenes)?';
  END IF;

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
      'remito_ref_externa', COALESCE(v_remito_ref, v_num_remito),
      'template_code', v_template_code_resolved
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

  RETURN jsonb_build_object(
    'status', v_status,
    'conversation_id', v_conversation_id
  )::json;
END;
$$;
