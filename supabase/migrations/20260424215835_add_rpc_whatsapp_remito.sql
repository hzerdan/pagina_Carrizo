CREATE OR REPLACE FUNCTION public.get_or_create_conversation_for_remito(
  p_chofer_id BIGINT,
  p_phone TEXT,
  p_remito_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER -- Para asegurar que se pueda ejecutar desde la API
AS $$
DECLARE
  v_conversation_id BIGINT;
  v_clean_phone TEXT;
BEGIN
  -- Limpieza básica del teléfono: solo números
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');

  -- 1. Buscar si ya existe la conversación
  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE conversation_key = v_clean_phone
    AND channel = 'whatsapp';

  IF v_conversation_id IS NOT NULL THEN
    -- 2. Si existe, actualizamos los vínculos
    UPDATE public.conversations
    SET 
      remito_actual_id = p_remito_id,
      participant_id = p_chofer_id,
      participant_role = 'chofer',
      last_activity_at = now()
    WHERE id = v_conversation_id;
  ELSE
    -- 3. Si no existe, creamos una nueva
    INSERT INTO public.conversations (
      conversation_key,
      participant_id,
      participant_role,
      remito_actual_id,
      estado_atencion,
      channel
    ) VALUES (
      v_clean_phone,
      p_chofer_id,
      'chofer',
      p_remito_id,
      'bot_activo',
      'whatsapp'
    )
    RETURNING id INTO v_conversation_id;
  END IF;

  RETURN v_conversation_id;
END;
$$;
