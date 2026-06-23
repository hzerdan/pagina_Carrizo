-- Migration: Alerta de Inactividad de Choferes
-- Created At: 2026-06-23

-- 1. Función para buscar requerimientos pendientes expirados y notificar al supervisor
CREATE OR REPLACE FUNCTION public.verificar_inactividad_requerimientos()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_nombre_chofer TEXT;
  v_supervisor_id INT;
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
    -- Obtener datos del chofer y supervisor desde el remito
    SELECT 
      COALESCE(r.metadata_extraida->>'nombre_chofer', 'Desconocido') AS nombre_chofer,
      COALESCE((r.metadata_extraida->>'supervisor_id')::INT, (r.metadata_extraida->>'operador_id')::INT, 4) AS supervisor_id
    INTO v_nombre_chofer, v_supervisor_id
    FROM public.remitos r
    WHERE r.id = v_rec.remito_id;

    -- Si no se encuentra el remito, usar valores por defecto
    IF v_nombre_chofer IS NULL THEN
      v_nombre_chofer := 'Desconocido';
      v_supervisor_id := 4;
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
                          '*Remito:* #' || COALESCE(v_rec.remito_id::text, 'Sin Remito') || E'\n' ||
                          '*Chofer:* ' || v_nombre_chofer || E'\n\n' ||
                          'El chofer no ha respondido al requerimiento del bot hace más de 30 minutos.' || E'\n\n' ||
                          '💬 *Requerimiento enviado:*' || E'\n' ||
                          '"' || COALESCE(v_rec.body_text, '') || '"' || E'\n\n' ||
                          '💬 *Responder en la Web:*' || E'\n' ||
                          '[Abrir Chat en Dashboard](https://remitos-logistica.vercel.app/?remito_id=' || COALESCE(v_rec.remito_id::text, '') || ')';

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

-- 2. Programación del Cron Job en pg_cron
-- Eliminar job si ya existía para evitar duplicados
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'verificar-inactividad-choferes') THEN
    PERFORM cron.unschedule('verificar-inactividad-choferes');
  END IF;
END $$;

-- Registrar el cron job para correr cada 5 minutos
SELECT cron.schedule(
  'verificar-inactividad-choferes',
  '*/5 * * * *',
  'SELECT public.verificar_inactividad_requerimientos();'
);
