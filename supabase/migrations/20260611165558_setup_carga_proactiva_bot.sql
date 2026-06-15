-- Activar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";

-- Evolución de conversation_messages para trazabilidad operativa (idempotente)
ALTER TABLE public.conversation_messages ADD COLUMN IF NOT EXISTS remito_id BIGINT REFERENCES public.remitos(id);
ALTER TABLE public.conversation_messages ADD COLUMN IF NOT EXISTS is_system_requirement BOOLEAN DEFAULT false;
ALTER TABLE public.conversation_messages ADD COLUMN IF NOT EXISTS template_code TEXT;
ALTER TABLE public.conversation_messages ADD COLUMN IF NOT EXISTS requirement_status TEXT;
ALTER TABLE public.conversation_messages ADD COLUMN IF NOT EXISTS response_to_id BIGINT REFERENCES public.conversation_messages(id);

-- Restricción de verificación para requirement_status si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversation_messages_requirement_status_check'
  ) THEN
    ALTER TABLE public.conversation_messages 
      ADD CONSTRAINT conversation_messages_requirement_status_check 
      CHECK (requirement_status IN ('PENDIENTE', 'CONTESTADO', 'EXPIRADO', 'ESCALADO'));
  END IF;
END $$;

-- Índice de rendimiento
CREATE INDEX IF NOT EXISTS idx_messages_remito_req 
ON public.conversation_messages (remito_id, is_system_requirement);

-- Función auxiliar para evaluar políticas y overrides de notificaciones
CREATE OR REPLACE FUNCTION public.should_request_loading_confirmation(p_remito_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_override RECORD;
  v_policy RECORD;
BEGIN
  -- 1. Buscar override vigente para el remito
  SELECT * INTO v_override
  FROM public.logistica_politicas_notificacion_override
  WHERE remito_id = p_remito_id AND vigente = true
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    -- Si el override indica omitir notificaciones del chofer
    IF COALESCE(v_override.omitir_notificaciones_chofer, false) = true THEN
      RETURN false;
    END IF;
    -- Si el override indica omitir confirmación de carga
    IF COALESCE(v_override.omitir_confirmacion_fecha_carga, false) = true THEN
      RETURN false;
    END IF;
    -- Si el override define explícitamente el valor de pedir_confirmacion_fecha_carga
    IF v_override.pedir_confirmacion_fecha_carga IS NOT NULL THEN
      RETURN v_override.pedir_confirmacion_fecha_carga;
    END IF;
  END IF;

  -- 2. Buscar política activa estándar (la primera disponible)
  SELECT * INTO v_policy
  FROM public.logistica_politicas_notificacion
  WHERE activa = true
  ORDER BY id ASC
  LIMIT 1;

  IF v_policy IS NOT NULL THEN
    RETURN v_policy.pedir_confirmacion_fecha_carga;
  END IF;

  -- Por defecto, pedir confirmación si no hay políticas ni overrides
  RETURN true;
END;
$$;

-- Función principal para notificar a n8n y registrar en conversation_messages
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

  -- 3. Obtener o crear conversación en base de datos
  v_conversation_id := public.get_or_create_conversation_for_remito(
    v_chofer_id,
    v_clean_phone,
    p_remito_id
  );

  -- 4. Construir payload para n8n
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

  -- 5. Realizar el http post a n8n de manera controlada
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

  -- 6. Insertar en conversation_messages para trazabilidad operativa
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

-- Programación del Cron Job
-- 1. Eliminar job si ya existía para evitar duplicados (de forma segura)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notificar-choferes-carga-proxima') THEN
    PERFORM cron.unschedule('notificar-choferes-carga-proxima');
  END IF;
END $$;

-- 2. Registrar el cron job
SELECT cron.schedule(
  'notificar-choferes-carga-proxima',
  '0 * * * *',
  $cron_job$
  DO $$
  DECLARE
    v_rec RECORD;
    v_nombre TEXT;
    v_hora TEXT;
    v_mensaje TEXT;
  BEGIN
    FOR v_rec IN 
      SELECT r.id, c.nombre_completo, r.fecha_hora_estimada_carga
      FROM public.remitos r
      JOIN public.choferes c ON r.chofer_id = c.id
      WHERE r.estado_asignacion = 'ASIGNADO'
        AND r.fecha_hora_estimada_carga BETWEEN now() AND (now() + interval '3 hours')
        AND c.telefono IS NOT NULL 
        AND c.telefono <> ''
        AND public.should_request_loading_confirmation(r.id) = true
        AND NOT EXISTS (
          SELECT 1 
          FROM public.conversation_messages cm
          WHERE cm.remito_id = r.id
            AND cm.is_system_requirement = true
            AND cm.created_at >= now() - interval '1 hour'
        )
    LOOP
      v_nombre := initcap(split_part(v_rec.nombre_completo, ' ', 1));
      v_hora := to_char(v_rec.fecha_hora_estimada_carga AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI');
      v_mensaje := 'Hola ' || v_nombre || ', ¿confirmas que cargas a las ' || v_hora || '? Indicame si hubo algún cambio.';
      
      PERFORM public.notify_n8n_whatsapp_requirement(v_rec.id, v_mensaje);
    END LOOP;
  END $$;
  $cron_job$
);
