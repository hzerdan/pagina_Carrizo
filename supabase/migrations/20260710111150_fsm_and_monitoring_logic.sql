-- Migration: FSM and Monitoring Logic Updates
-- Created: 2026-07-10 11:11:50

-- 1. Helper function: get_current_task_for_mision_state
CREATE OR REPLACE FUNCTION public.get_current_task_for_mision_state(p_remito_id bigint, p_mision_estado text)
RETURNS jsonb AS $$
DECLARE
  v_protocolo jsonb;
  v_elem jsonb;
BEGIN
  SELECT protocolo_control
  INTO v_protocolo
  FROM public.remitos
  WHERE id = p_remito_id;

  IF p_mision_estado = 'CONTROL_ENTREGA' THEN
    -- Tarea virtual para la foto del remito firmado
    RETURN jsonb_build_object(
      'id', 99,
      'tarea', 'Enviar foto del Remito Firmado',
      'tipo_tarea', 'CONTROL_ENTREGA',
      'minutos_gracia', 30,
      'reintentos_max', 2
    );
  END IF;

  IF v_protocolo IS NULL OR jsonb_array_length(v_protocolo) = 0 THEN
    RETURN NULL;
  END IF;

  IF p_mision_estado = 'ESPERANDO_PAPELES' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_protocolo) LOOP
      IF (v_elem->>'id')::int = 1 THEN
        RETURN v_elem;
      END IF;
    END LOOP;

  ELSIF p_mision_estado = 'PESAJE_TARA_ORIGEN' OR p_mision_estado = 'PESAJE_TARA_DESTINO' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_protocolo) LOOP
      IF v_elem->>'tipo_tarea' = 'PESAJE_TARA' THEN
        RETURN v_elem;
      END IF;
    END LOOP;

  ELSIF p_mision_estado = 'PESAJE_BRUTO_ORIGEN' OR p_mision_estado = 'PESAJE_BRUTO_DESTINO' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_protocolo) LOOP
      IF v_elem->>'tipo_tarea' = 'PESAJE_BRUTO' THEN
        RETURN v_elem;
      END IF;
    END LOOP;

  ELSIF p_mision_estado = 'EN_CARGA' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_protocolo) LOOP
      IF (v_elem->>'asignada_a_chofer')::boolean = true 
         AND v_elem->>'estado' = 'PENDIENTE' 
         AND v_elem->>'tipo_tarea' = 'CONTROL_GENERAL' 
         AND (v_elem->>'id')::int <> 1 THEN
        RETURN v_elem;
      END IF;
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger function: trg_fn_fsm_auto_transition
CREATE OR REPLACE FUNCTION public.trg_fn_fsm_auto_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_task_1 text;
  v_task_2 text;
  v_task_9 text;
  v_task_10 text;
  v_nuevo_estado text;
  v_is_origen boolean;
BEGIN
  IF NEW.protocolo_control IS NULL OR jsonb_array_length(NEW.protocolo_control) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT 
    MAX(CASE WHEN id = 1 THEN estado END),
    MAX(CASE WHEN id = 2 THEN estado END),
    MAX(CASE WHEN id = 9 THEN estado END),
    MAX(CASE WHEN id = 10 THEN estado END)
  INTO v_task_1, v_task_2, v_task_9, v_task_10
  FROM jsonb_to_recordset(NEW.protocolo_control) AS (id int, estado text);

  v_nuevo_estado := COALESCE(NEW.mision_estado, 'OPERACION_PENDIENTE');

  -- Determinar si es Pesaje en Origen (Escenario A)
  v_is_origen := (COALESCE(NEW.tara_pesaje_momento, 'Antes de cargar') = 'Antes de cargar' 
                  AND COALESCE(NEW.bruto_pesaje_momento, 'Después de cargar') = 'Después de cargar');

  IF v_nuevo_estado = 'ESPERANDO_PAPELES' THEN
    IF v_task_1 = 'REPORTADO_CHOFER' OR v_task_1 = 'COMPLETADO' THEN
      IF v_is_origen THEN
        v_nuevo_estado := 'PESAJE_TARA_ORIGEN';
      ELSE
        v_nuevo_estado := 'EN_CARGA';
      END IF;
    END IF;

  ELSIF v_nuevo_estado = 'PESAJE_TARA_ORIGEN' THEN
    IF v_task_2 = 'REPORTADO_CHOFER' OR v_task_2 = 'COMPLETADO' THEN
      v_nuevo_estado := 'EN_CARGA';
    END IF;

  ELSIF v_nuevo_estado = 'EN_CARGA' THEN
    IF v_task_9 = 'REPORTADO_CHOFER' OR v_task_9 = 'COMPLETADO' THEN
      IF v_is_origen THEN
        v_nuevo_estado := 'PESAJE_BRUTO_ORIGEN';
      ELSE
        v_nuevo_estado := 'EN_TRANSITO';
      END IF;
    END IF;

  ELSIF v_nuevo_estado = 'PESAJE_BRUTO_ORIGEN' THEN
    IF v_task_10 = 'REPORTADO_CHOFER' OR v_task_10 = 'COMPLETADO' THEN
      v_nuevo_estado := 'EN_TRANSITO';
    END IF;

  ELSIF v_nuevo_estado = 'PESAJE_BRUTO_DESTINO' THEN
    IF v_task_10 = 'REPORTADO_CHOFER' OR v_task_10 = 'COMPLETADO' THEN
      v_nuevo_estado := 'EN_DESCARGA';
    END IF;

  ELSIF v_nuevo_estado = 'PESAJE_TARA_DESTINO' THEN
    IF v_task_2 = 'REPORTADO_CHOFER' OR v_task_2 = 'COMPLETADO' THEN
      v_nuevo_estado := 'MISION_COMPLETADA';
    END IF;
  END IF;

  -- Si el estado cambió, actualizar mision_estado, resetear reintentos y actualizar timestamp
  IF v_nuevo_estado <> COALESCE(NEW.mision_estado, 'OPERACION_PENDIENTE') THEN
    NEW.mision_estado := v_nuevo_estado;
    NEW.ultimo_mensaje_chofer_at := NOW();
    NEW.retry_count := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger function: trg_fn_fsm_text_transition
CREATE OR REPLACE FUNCTION public.trg_fn_fsm_text_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_remito_id bigint;
  v_mision_estado text;
  v_tara_momento text;
  v_bruto_momento text;
  v_is_origen boolean;
  v_clean_text text;
  v_nuevo_estado text;
  v_pedido_instance_id bigint;
  v_has_image boolean;
BEGIN
  -- Solo actuar si el mensaje proviene del chofer (inbound)
  IF NEW.direction <> 'in' THEN
    RETURN NEW;
  END IF;

  -- Obtener el remito_id asociado
  v_remito_id := NEW.remito_id;
  IF v_remito_id IS NULL THEN
    SELECT remito_actual_id INTO v_remito_id
    FROM public.conversations
    WHERE id = NEW.conversation_id;
  END IF;

  IF v_remito_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bloquear y obtener el estado actual de la misión y modalidad de pesaje de forma segura (FOR UPDATE)
  SELECT mision_estado, tara_pesaje_momento, bruto_pesaje_momento INTO v_mision_estado, v_tara_momento, v_bruto_momento
  FROM public.remitos
  WHERE id = v_remito_id
  FOR UPDATE;

  IF v_mision_estado IS NULL OR v_mision_estado = 'MISION_COMPLETADA' OR v_mision_estado = 'OPERACION_PENDIENTE' THEN
    RETURN NEW;
  END IF;

  -- Limpiar y normalizar el texto del chofer
  v_clean_text := lower(translate(NEW.body_text, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'));

  -- Evaluar si se envió una imagen/foto
  v_has_image := (NEW.message_type = 'image' OR (NEW.media_urls IS NOT NULL AND cardinality(NEW.media_urls) > 0));

  -- Determinar si es Pesaje en Origen (Escenario A)
  v_is_origen := (COALESCE(v_tara_momento, 'Antes de cargar') = 'Antes de cargar' 
                  AND COALESCE(v_bruto_momento, 'Después de cargar') = 'Después de cargar');

  v_nuevo_estado := v_mision_estado;

  IF v_mision_estado = 'EN_TRANSITO' THEN
    IF v_clean_text LIKE '%llegue%' OR v_clean_text LIKE '%llegado%' OR v_clean_text LIKE '%estoy en destino%' OR v_clean_text LIKE '%ingres%' THEN
      IF v_is_origen THEN
        v_nuevo_estado := 'CONTROL_ENTREGA';
      ELSE
        v_nuevo_estado := 'PESAJE_BRUTO_DESTINO';
      END IF;
    END IF;
    
  ELSIF v_mision_estado = 'EN_DESCARGA' THEN
    IF v_clean_text LIKE '%termine%' OR v_clean_text LIKE '%vacio%' OR v_clean_text LIKE '%descargado%' OR v_clean_text LIKE '%listo%' OR v_clean_text LIKE '%complete%' THEN
      v_nuevo_estado := 'CONTROL_ENTREGA';
    END IF;
    
  ELSIF v_mision_estado = 'CONTROL_ENTREGA' THEN
    -- Validación crítica: Exigir imagen/foto del remito firmado
    IF v_has_image THEN
      IF v_is_origen THEN
        v_nuevo_estado := 'MISION_COMPLETADA';
      ELSE
        v_nuevo_estado := 'PESAJE_TARA_DESTINO';
      END IF;
    END IF;
  END IF;

  -- Si el estado cambió, actualizar remitos e insertar en historial_eventos
  IF v_nuevo_estado <> v_mision_estado THEN
    UPDATE public.remitos
    SET mision_estado = v_nuevo_estado,
        ultimo_mensaje_chofer_at = NOW(),
        retry_count = 0,
        updated_at = NOW()
    WHERE id = v_remito_id;

    -- Obtener la instancia del pedido para historial_eventos
    SELECT origen_instance_id INTO v_pedido_instance_id 
    FROM public.remito_items 
    WHERE remito_id = v_remito_id LIMIT 1;

    INSERT INTO public.historial_eventos (
      pedido_instance_id,
      event_type,
      description,
      user_actor,
      details
    ) VALUES (
      v_pedido_instance_id,
      'STATE_TRANSITION',
      format('Transición FSM automática de misión de transporte del remito #%s a %s basada en mensaje del chofer', v_remito_id, v_nuevo_estado),
      'sistema_fsm_texto',
      jsonb_build_object(
        'remito_id', v_remito_id,
        'to_state', v_nuevo_estado,
        'forced', false,
        'comentarios', format('Mensaje del chofer: "%s", Tipo: %s, Tiene imagen: %s', NEW.body_text, NEW.message_type, v_has_image)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Cron job: ejecutar_monitoreo_mision_remitos
CREATE OR REPLACE FUNCTION public.ejecutar_monitoreo_mision_remitos()
RETURNS void AS $$
DECLARE
  v_rec RECORD;
  v_nombre TEXT;
  v_mensaje TEXT;
  v_intervalo_minutos INT;
  v_reintentos_max INT;
  v_tarea jsonb;
  v_tarea_desc TEXT;
  v_lugar_str TEXT;
  v_lugar_maps TEXT;
  v_payload JSONB;
  v_mensaje_telegram TEXT;
  v_remito_ref TEXT;
  v_supervisor_id INT;
  v_response extensions.http_response;
BEGIN
  -- Configurar el timeout HTTP a 10 segundos
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');

  -- RESPONSABILIDAD 1: ACTIVACIÓN (para remitos en OPERACION_PENDIENTE)
  FOR v_rec IN 
    SELECT r.id, r.fecha_hora_carga_estimada, c.nombre_completo, c.telefono
    FROM public.remitos r
    JOIN public.choferes c ON r.chofer_id = c.id
    WHERE r.mision_estado = 'OPERACION_PENDIENTE'
      AND r.estado_asignacion = 'ASIGNADO'
      AND c.telefono IS NOT NULL AND c.telefono <> ''
      AND r.fecha_hora_carga_estimada IS NOT NULL
      AND NOW() >= (r.fecha_hora_carga_estimada - INTERVAL '6 hours')
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
    v_mensaje := 'Hola ' || v_nombre || ', ¿me confirmas si ya tienes la documentación física en mano (remito y órdenes)?';
    PERFORM public.notify_n8n_whatsapp_requirement(v_rec.id, v_mensaje);
  END LOOP;

  -- RESPONSABILIDAD 2: SEGUIMIENTO (para remitos activos ya iniciados)
  FOR v_rec IN 
    SELECT r.id, r.mision_estado, r.fecha_probable_entrega, r.fecha_hora_carga_estimada, 
           c.nombre_completo, c.telefono, r.ultimo_mensaje_chofer_at, r.retry_count, r.remito_ref_externa,
           r.deposito_carga_id, r.deposito_descarga_id, r.tara_pesaje_lugar_id, r.bruto_pesaje_lugar_id,
           COALESCE((r.metadata_extraida->>'supervisor_id')::INT, (r.metadata_extraida->>'operador_id')::INT, 4) AS supervisor_id
    FROM public.remitos r
    JOIN public.choferes c ON r.chofer_id = c.id
    WHERE r.mision_estado IS NOT NULL 
      AND r.mision_estado <> 'OPERACION_PENDIENTE'
      AND r.mision_estado <> 'MISION_COMPLETADA'
      AND r.estado_asignacion = 'ASIGNADO'
      AND c.telefono IS NOT NULL AND c.telefono <> ''
      AND COALESCE(public.get_remito_setting_bool(r.id, 'omitir_notificaciones_chofer', false), false) = false
      AND COALESCE(public.get_remito_setting_bool(r.id, 'omitir_recordatorios_carga', false), false) = false
  LOOP
    v_tarea := public.get_current_task_for_mision_state(v_rec.id, v_rec.mision_estado);
    
    IF v_tarea IS NOT NULL THEN
      v_intervalo_minutos := COALESCE((v_tarea->>'minutos_gracia')::int, 30);
      v_reintentos_max := COALESCE((v_tarea->>'reintentos_max')::int, 2);
      v_tarea_desc := v_tarea->>'tarea';
    ELSE
      v_intervalo_minutos := 60;
      v_reintentos_max := 2;
    END IF;

    -- Verificar si se cumple el tiempo de gracia (inactividad)
    IF (NOW() - v_rec.ultimo_mensaje_chofer_at) >= (v_intervalo_minutos * interval '1 minute')
       AND NOT EXISTS (
         SELECT 1 
         FROM public.conversation_messages cm
         WHERE cm.remito_id = v_rec.id
           AND cm.is_system_requirement = true
           AND cm.created_at >= NOW() - (v_intervalo_minutos * interval '1 minute')
       )
    THEN
      v_nombre := initcap(split_part(v_rec.nombre_completo, ' ', 1));

      -- Construir el mensaje de recordatorio y geolocalización
      IF v_rec.mision_estado = 'ESPERANDO_PAPELES' THEN
        v_mensaje := 'Hola ' || v_nombre || ', por favor recordá confirmar si ya tenés los papeles (remito y órdenes) para iniciar la misión.';
      
      ELSIF v_rec.mision_estado = 'PESAJE_TARA_ORIGEN' THEN
        SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.lugares_pesaje WHERE id = v_rec.tara_pesaje_lugar_id;
        IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
          v_lugar_str := COALESCE(v_lugar_str, 'balanza') || ' (' || v_lugar_maps || ')';
        END IF;
        v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar el pesaje de TARA (vacío) en ' || COALESCE(v_lugar_str, 'la balanza asignada') || ' antes de cargar e informarlo por este medio.';
      
      ELSIF v_rec.mision_estado = 'EN_CARGA' THEN
        v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar la siguiente tarea: ' || v_tarea_desc || ' y confirmame por este medio.';
      
      ELSIF v_rec.mision_estado = 'PESAJE_BRUTO_ORIGEN' THEN
        SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.lugares_pesaje WHERE id = v_rec.bruto_pesaje_lugar_id;
        IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
          v_lugar_str := COALESCE(v_lugar_str, 'balanza') || ' (' || v_lugar_maps || ')';
        END IF;
        v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar el pesaje BRUTO (lleno) en ' || COALESCE(v_lugar_str, 'la balanza asignada') || ' al salir e informarlo por este medio.';
      
      ELSIF v_rec.mision_estado = 'EN_TRANSITO' THEN
        SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.depositos WHERE id = v_rec.deposito_descarga_id;
        IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
          v_lugar_str := COALESCE(v_lugar_str, 'depósito de descarga') || ' (' || v_lugar_maps || ')';
        END IF;
        v_mensaje := 'Hola ' || v_nombre || ', ¿cómo va el viaje al depósito de destino ' || COALESCE(v_lugar_str, '') || '? ¿Mantenés la fecha probable de entrega del ' || COALESCE(to_char(v_rec.fecha_probable_entrega AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), 'viaje') || '?';
      
      ELSIF v_rec.mision_estado = 'PESAJE_BRUTO_DESTINO' THEN
        SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.lugares_pesaje WHERE id = v_rec.bruto_pesaje_lugar_id;
        IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
          v_lugar_str := COALESCE(v_lugar_str, 'balanza') || ' (' || v_lugar_maps || ')';
        END IF;
        v_mensaje := 'Hola ' || v_nombre || ', recordá que antes de entrar a descargar debés realizar el pesaje BRUTO en ' || COALESCE(v_lugar_str, 'la balanza') || ' y enviarnos el ticket.';
      
      ELSIF v_rec.mision_estado = 'EN_DESCARGA' THEN
        SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.depositos WHERE id = v_rec.deposito_descarga_id;
        IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
          v_lugar_str := COALESCE(v_lugar_str, 'depósito') || ' (' || v_lugar_maps || ')';
        END IF;
        v_mensaje := 'Hola ' || v_nombre || ', por favor confirmame cuando termines de descargar en ' || COALESCE(v_lugar_str, 'destino') || '.';
      
      ELSIF v_rec.mision_estado = 'CONTROL_ENTREGA' THEN
        v_mensaje := 'Hola ' || v_nombre || ', por favor recordá enviarnos la foto del Remito Firmado y sellado por el cliente para completar el control de entrega.';
      
      ELSIF v_rec.mision_estado = 'PESAJE_TARA_DESTINO' THEN
        SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.lugares_pesaje WHERE id = v_rec.tara_pesaje_lugar_id;
        IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
          v_lugar_str := COALESCE(v_lugar_str, 'balanza') || ' (' || v_lugar_maps || ')';
        END IF;
        v_mensaje := 'Hola ' || v_nombre || ', recordá que para finalizar la misión debés realizar el pesaje de TARA (vacío) en ' || COALESCE(v_lugar_str, 'la balanza') || ' y enviarnos el ticket.';
      END IF;

      IF v_mensaje IS NOT NULL THEN
        -- Evaluación de Escalamiento vs. Reintento simple
        IF v_rec.retry_count >= v_reintentos_max THEN
          -- Excedido el límite: registrar alerta a Telegram
          v_remito_ref := COALESCE(v_rec.remito_ref_externa, 'Sin Nro');
          v_supervisor_id := v_rec.supervisor_id;
          
          -- 1. Insertar en alertas_escalamiento
          INSERT INTO public.alertas_escalamiento (
            personal_id,
            rol_notificado,
            details
          ) VALUES (
            v_supervisor_id,
            'operador',
            jsonb_build_object('remito_id', v_rec.id, 'retry_count', v_rec.retry_count, 'ultimo_mensaje_at', v_rec.ultimo_mensaje_chofer_at)
          );

          -- 2. Construir mensaje de Telegram
          v_mensaje_telegram := '⚠️ *Alerta de Inactividad (Sin Respuesta)*' || E'\n' ||
                                '*Remito:* #' || v_remito_ref || ' (ID: #' || v_rec.id::text || ')' || E'\n' ||
                                '*Chofer:* ' || v_rec.nombre_completo || E'\n\n' ||
                                'El chofer no ha respondido al requerimiento del bot hace más de ' || v_intervalo_minutos || ' minutos y se superó el límite de ' || v_reintentos_max || ' reintentos.' || E'\n\n' ||
                                '💬 *Requerimiento pendiente:*' || E'\n' ||
                                '"' || v_mensaje || '"' || E'\n\n' ||
                                '💬 *Responder en la Web:*' || E'\n' ||
                                '[Abrir Chat en Dashboard](https://pagina-carrizo.vercel.app/?remito_id=' || v_rec.id::text || ')';

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
        ELSE
          -- Incrementar retry_count y enviar recordatorio
          UPDATE public.remitos
          SET retry_count = retry_count + 1
          WHERE id = v_rec.id;

          PERFORM public.notify_n8n_whatsapp_requirement(v_rec.id, v_mensaje);
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 5. DevTools simulation helper: simular_monitoreo_remito
CREATE OR REPLACE FUNCTION public.simular_monitoreo_remito(
  p_remito_id bigint, 
  p_simulate_now timestamp with time zone DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_rec RECORD;
  v_nombre TEXT;
  v_mensaje TEXT;
  v_intervalo_minutos INT;
  v_reintentos_max INT;
  v_ultimo_mensaje_at timestamp with time zone;
  v_now timestamp with time zone;
  v_diff_minutos INT;
  v_alerta_enviada_reciente boolean;
  v_debe_alertar boolean;
  v_motivo TEXT;
  v_tarea jsonb;
  v_tarea_desc TEXT;
  v_lugar_str TEXT;
  v_lugar_maps TEXT;
BEGIN
  v_now := COALESCE(p_simulate_now, NOW());

  SELECT r.id, r.mision_estado, r.fecha_probable_entrega, r.fecha_hora_carga_estimada, r.estado_asignacion,
         c.nombre_completo, c.telefono, r.ultimo_mensaje_chofer_at, r.retry_count,
         r.deposito_carga_id, r.deposito_descarga_id, r.tara_pesaje_lugar_id, r.bruto_pesaje_lugar_id,
         COALESCE(public.get_remito_setting_bool(r.id, 'omitir_notificaciones_chofer', false), false) AS omitir_notif,
         COALESCE(public.get_remito_setting_bool(r.id, 'omitir_recordatorios_carga', false), false) AS omitir_recordatorios,
         COALESCE(public.get_remito_setting_int(r.id, 'anticipacion_monitoreo_horas', 6), 6) AS anticipacion_horas
  INTO v_rec
  FROM public.remitos r
  JOIN public.choferes c ON r.chofer_id = c.id
  WHERE r.id = p_remito_id;

  IF v_rec.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se encontró el remito o no tiene chofer asignado.');
  END IF;

  IF v_rec.mision_estado IS NULL OR v_rec.mision_estado = 'MISION_COMPLETADA' THEN
    RETURN jsonb_build_object('success', true, 'debe_alertar', false, 'motivo', 'La misión está completada o no está inicializada.');
  END IF;

  IF v_rec.estado_asignacion <> 'ASIGNADO' THEN
    RETURN jsonb_build_object('success', true, 'debe_alertar', false, 'motivo', 'El remito no está en estado ASIGNADO.');
  END IF;

  IF v_rec.omitir_notif OR v_rec.omitir_recordatorios THEN
    RETURN jsonb_build_object('success', true, 'debe_alertar', false, 'motivo', 'Las notificaciones o recordatorios están desactivados por política.');
  END IF;

  -- Regla de activación especial para OPERACION_PENDIENTE
  IF v_rec.mision_estado = 'OPERACION_PENDIENTE' THEN
    IF v_rec.fecha_hora_carga_estimada IS NOT NULL AND v_now < (v_rec.fecha_hora_carga_estimada - (v_rec.anticipacion_horas * INTERVAL '1 hour')) THEN
      RETURN jsonb_build_object(
        'success', true, 
        'debe_alertar', false, 
        'motivo', format(
          'Misión en OPERACION_PENDIENTE. Faltan %s para la carga estimada. El monitoreo se activará a las %s.',
          to_char(v_rec.fecha_hora_carga_estimada - v_now, 'HH24 "horas" MI "min"'),
          to_char((v_rec.fecha_hora_carga_estimada - (v_rec.anticipacion_horas * INTERVAL '1 hour')) AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI')
        )
      );
    ELSE
      v_nombre := initcap(split_part(v_rec.nombre_completo, ' ', 1));
      RETURN jsonb_build_object(
        'success', true,
        'debe_alertar', true,
        'motivo', 'Faltan menos de 6 horas para la carga programada. Se activará la misión y enviará el mensaje inicial.',
        'mensaje_a_enviar', 'Hola ' || v_nombre || ', ¿me confirmas si ya tienes la documentación física en mano (remito y órdenes)?'
      );
    END IF;
  END IF;

  -- 1. Determinar la tarea pendiente activa y su minutos_gracia correspondientes
  v_tarea := public.get_current_task_for_mision_state(p_remito_id, v_rec.mision_estado);
  
  IF v_tarea IS NOT NULL THEN
    v_intervalo_minutos := COALESCE((v_tarea->>'minutos_gracia')::int, 30);
    v_reintentos_max := COALESCE((v_tarea->>'reintentos_max')::int, 2);
    v_tarea_desc := v_tarea->>'tarea';
  ELSE
    v_intervalo_minutos := 60;
    v_reintentos_max := 2;
  END IF;

  v_ultimo_mensaje_at := COALESCE(v_rec.ultimo_mensaje_chofer_at, v_now - INTERVAL '10 days');
  v_diff_minutos := (EXTRACT(EPOCH FROM (v_now - v_ultimo_mensaje_at))::int) / 60;

  SELECT EXISTS (
    SELECT 1 
    FROM public.conversation_messages cm
    WHERE cm.remito_id = p_remito_id
      AND cm.is_system_requirement = true
      AND cm.created_at >= v_now - (v_intervalo_minutos * interval '1 minute')
  ) INTO v_alerta_enviada_reciente;

  IF v_diff_minutos < v_intervalo_minutos THEN
    v_debe_alertar := false;
    v_motivo := format('El chofer estuvo activo hace %s min (límite de inactividad de tarea: %s min).', v_diff_minutos, v_intervalo_minutos);
  ELSIF v_alerta_enviada_reciente THEN
    v_debe_alertar := false;
    v_motivo := format('El tiempo de silencio se cumplió (%s min > %s min), pero ya se envió un recordatorio del sistema recientemente.', v_diff_minutos, v_intervalo_minutos);
  ELSE
    v_debe_alertar := true;
    IF v_rec.retry_count >= v_reintentos_max THEN
      v_motivo := format('ALERTA CRÍTICA: El chofer superó el tiempo de inactividad (%s min > %s min) y excedió el máximo de %s reintentos. Se escalará a Telegram.', v_diff_minutos, v_intervalo_minutos, v_reintentos_max);
    ELSE
      v_motivo := format('El chofer superó el tiempo de inactividad de la tarea (%s min > %s min). Se enviará recordatorio (Reintento: %s/%s).', v_diff_minutos, v_intervalo_minutos, v_rec.retry_count + 1, v_reintentos_max);
    END IF;
  END IF;

  -- 2. Definir mensaje para la simulación
  v_nombre := initcap(split_part(v_rec.nombre_completo, ' ', 1));

  IF v_rec.mision_estado = 'ESPERANDO_PAPELES' THEN
    v_mensaje := 'Hola ' || v_nombre || ', por favor recordá confirmar si ya tenés los papeles (remito y órdenes) para iniciar la misión.';
  
  ELSIF v_rec.mision_estado = 'PESAJE_TARA_ORIGEN' THEN
    SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.lugares_pesaje WHERE id = v_rec.tara_pesaje_lugar_id;
    IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
      v_lugar_str := COALESCE(v_lugar_str, 'balanza') || ' (' || v_lugar_maps || ')';
    END IF;
    v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar el pesaje de TARA (vacío) en ' || COALESCE(v_lugar_str, 'la balanza asignada') || ' antes de cargar e informarlo por este medio.';
  
  ELSIF v_rec.mision_estado = 'EN_CARGA' THEN
    v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar la siguiente tarea: ' || v_tarea_desc || ' y confirmame por este medio.';
  
  ELSIF v_rec.mision_estado = 'PESAJE_BRUTO_ORIGEN' THEN
    SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.lugares_pesaje WHERE id = v_rec.bruto_pesaje_lugar_id;
    IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
      v_lugar_str := COALESCE(v_lugar_str, 'balanza') || ' (' || v_lugar_maps || ')';
    END IF;
    v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar el pesaje BRUTO (lleno) en ' || COALESCE(v_lugar_str, 'la balanza asignada') || ' al salir e informarlo por este medio.';
  
  ELSIF v_rec.mision_estado = 'EN_TRANSITO' THEN
    SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.depositos WHERE id = v_rec.deposito_descarga_id;
    IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
      v_lugar_str := COALESCE(v_lugar_str, 'depósito de descarga') || ' (' || v_lugar_maps || ')';
    END IF;
    v_mensaje := 'Hola ' || v_nombre || ', ¿cómo va el viaje al depósito de destino ' || COALESCE(v_lugar_str, '') || '? ¿Mantenés la fecha probable de entrega del ' || COALESCE(to_char(v_rec.fecha_probable_entrega AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), 'viaje') || '?';
  
  ELSIF v_rec.mision_estado = 'PESAJE_BRUTO_DESTINO' THEN
    SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.lugares_pesaje WHERE id = v_rec.bruto_pesaje_lugar_id;
    IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
      v_lugar_str := COALESCE(v_lugar_str, 'balanza') || ' (' || v_lugar_maps || ')';
    END IF;
    v_mensaje := 'Hola ' || v_nombre || ', recordá que antes de entrar a descargar debés realizar el pesaje BRUTO en ' || COALESCE(v_lugar_str, 'la balanza') || ' y enviarnos el ticket.';
  
  ELSIF v_rec.mision_estado = 'EN_DESCARGA' THEN
    SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.depositos WHERE id = v_rec.deposito_descarga_id;
    IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
      v_lugar_str := COALESCE(v_lugar_str, 'depósito') || ' (' || v_lugar_maps || ')';
    END IF;
    v_mensaje := 'Hola ' || v_nombre || ', por favor confirmame cuando termines de descargar en ' || COALESCE(v_lugar_str, 'destino') || '.';
  
  ELSIF v_rec.mision_estado = 'CONTROL_ENTREGA' THEN
    v_mensaje := 'Hola ' || v_nombre || ', por favor recordá enviarnos la foto del Remito Firmado y sellado por el cliente para completar el control de entrega.';
  
  ELSIF v_rec.mision_estado = 'PESAJE_TARA_DESTINO' THEN
    SELECT nombre, google_maps_link INTO v_lugar_str, v_lugar_maps FROM public.lugares_pesaje WHERE id = v_rec.tara_pesaje_lugar_id;
    IF v_lugar_maps IS NOT NULL AND v_lugar_maps <> '' THEN
      v_lugar_str := COALESCE(v_lugar_str, 'balanza') || ' (' || v_lugar_maps || ')';
    END IF;
    v_mensaje := 'Hola ' || v_nombre || ', recordá que para finalizar la misión debés realizar el pesaje de TARA (vacío) en ' || COALESCE(v_lugar_str, 'la balanza') || ' y enviarnos el ticket.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'remito_id', p_remito_id,
    'mision_estado', v_rec.mision_estado,
    'nombre_chofer', v_nombre,
    'telefono_chofer', v_rec.telefono,
    'ultimo_contacto_at', v_ultimo_mensaje_at,
    'diferencia_minutos', v_diff_minutos,
    'intervalo_limite_minutos', v_intervalo_minutos,
    'reintentos_maximo', v_reintentos_max,
    'retry_count_actual', v_rec.retry_count,
    'alerta_enviada_reciente', v_alerta_enviada_reciente,
    'debe_alertar', v_debe_alertar,
    'motivo', v_motivo,
    'mensaje_a_enviar', v_mensaje
  );
END;
$$ LANGUAGE plpgsql;
