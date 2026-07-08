-- 1. Agregar la columna anticipacion_monitoreo_horas a la tabla de políticas
ALTER TABLE public.logistica_politicas_notificacion 
ADD COLUMN IF NOT EXISTS anticipacion_monitoreo_horas int NOT NULL DEFAULT 6;

-- 2. Agregar la columna anticipacion_monitoreo_horas a la tabla de overrides
ALTER TABLE public.logistica_politicas_notificacion_override 
ADD COLUMN IF NOT EXISTS anticipacion_monitoreo_horas int DEFAULT NULL;

-- 3. Actualizar la fila por defecto de la política estándar para establecer el valor inicial a 6
UPDATE public.logistica_politicas_notificacion
SET anticipacion_monitoreo_horas = 6
WHERE nombre = 'default';

-- 4. Redefinir ejecutar_monitoreo_mision_remitos para aplicar el filtro de anticipación de carga
CREATE OR REPLACE FUNCTION public.ejecutar_monitoreo_mision_remitos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_nombre TEXT;
  v_mensaje TEXT;
  v_intervalo_minutos INT;
  v_anticipacion_horas INT;
BEGIN
  -- Configurar el timeout HTTP a 10 segundos
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');

  -- Recorrer remitos activos que tengan chofer asignado, no completados y no omitidos
  FOR v_rec IN 
    SELECT r.id, r.mision_estado, r.fecha_probable_entrega, r.fecha_hora_estimada_carga, c.nombre_completo, c.telefono, r.ultimo_mensaje_chofer_at
    FROM public.remitos r
    JOIN public.choferes c ON r.chofer_id = c.id
    WHERE r.mision_estado IS NOT NULL 
      AND r.mision_estado <> 'MISION_COMPLETADA'
      AND r.estado_asignacion = 'ASIGNADO'
      AND c.telefono IS NOT NULL 
      AND c.telefono <> ''
      AND COALESCE(public.get_remito_setting_bool(r.id, 'omitir_notificaciones_chofer', false), false) = false
      AND COALESCE(public.get_remito_setting_bool(r.id, 'omitir_recordatorios_carga', false), false) = false
      -- Filtro de anticipación: si hay fecha probable de carga, gestionar solo a partir del umbral programado (ej. 6 horas antes)
      AND (
        r.fecha_hora_estimada_carga IS NULL 
        OR NOW() >= (r.fecha_hora_estimada_carga - (COALESCE(public.get_remito_setting_int(r.id, 'anticipacion_monitoreo_horas', 6), 6) * INTERVAL '1 hour'))
      )
  LOOP
    -- Determinar intervalo de recordatorio
    v_intervalo_minutos := COALESCE(
      public.get_remito_setting_int(v_rec.id, 'espera_respuesta_minutos', NULL),
      public.get_remito_setting_int(v_rec.id, 'intervalo_recordatorio_carga_corta_minutos', 60)
    );

    -- Verificar latencia desde el último mensaje recibido del chofer
    -- Y verificar que no hayamos enviado un recordatorio del sistema en el mismo período para evitar spam
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
      
      -- Definir mensaje basado en el estado
      v_mensaje := CASE v_rec.mision_estado
        WHEN 'ESPERANDO_DOCS' THEN
          'Hola ' || v_nombre || ', ¿confirmas que ya tienes la documentación en mano? Indicame con un SÍ.'
        WHEN 'PESAJE_1_ORIGEN' THEN
          'Hola ' || v_nombre || ', por favor recordá realizar el pesaje de Tara (vacío) antes de la carga de mercadería y confirmame al terminar.'
        WHEN 'EN_CARGA' THEN
          'Hola ' || v_nombre || ', recordá realizar el checklist de carga (bolsas, fotos) y confirmame al finalizar la carga.'
        WHEN 'PESAJE_2_ORIGEN' THEN
          'Hola ' || v_nombre || ', recordá realizar el pesaje Bruto (lleno) al salir. ¡Recordá NO cargar combustible!'
        WHEN 'EN_TRANSITO' THEN
          'Hola ' || v_nombre || ', ¿cómo va el viaje? ¿Mantenés la fecha probable de entrega del ' || COALESCE(to_char(v_rec.fecha_probable_entrega AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), 'viaje') || '?'
        WHEN 'PESAJE_1_DESTINO' THEN
          'Hola ' || v_nombre || ', recordá realizar el pesaje Bruto en destino antes de descargar.'
        WHEN 'EN_DESCARGA' THEN
          'Hola ' || v_nombre || ', confirmame cuando termines de descargar para que te indique dónde hacer la Tara final.'
        WHEN 'PESAJE_2_DESTINO' THEN
          'Hola ' || v_nombre || ', recordá realizar el pesaje de Tara final en destino.'
        ELSE NULL
      END;

      -- Enviar si hay mensaje definido
      IF v_mensaje IS NOT NULL THEN
        PERFORM public.notify_n8n_whatsapp_requirement(v_rec.id, v_mensaje);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 5. Redefinir la simulación para alinearse con el filtro de anticipación y proveer explicaciones detalladas
CREATE OR REPLACE FUNCTION public.simular_monitoreo_remito(p_remito_id bigint, p_simulate_now timestamp with time zone DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_nombre TEXT;
  v_mensaje TEXT;
  v_intervalo_minutos INT;
  v_anticipacion_horas INT;
  v_ultimo_mensaje_at timestamp with time zone;
  v_now timestamp with time zone;
  v_diff_minutos INT;
  v_alerta_enviada_reciente boolean;
  v_debe_alertar boolean;
  v_motivo TEXT;
BEGIN
  -- 1. Obtener fecha actual o simulada
  v_now := COALESCE(p_simulate_now, NOW());

  -- 2. Buscar datos del remito
  SELECT r.id, r.mision_estado, r.fecha_probable_entrega, r.fecha_hora_estimada_carga, r.estado_asignacion,
         c.nombre_completo, c.telefono, r.ultimo_mensaje_chofer_at,
         COALESCE(public.get_remito_setting_bool(r.id, 'omitir_notificaciones_chofer', false), false) AS omitir_notif,
         COALESCE(public.get_remito_setting_bool(r.id, 'omitir_recordatorios_carga', false), false) AS omitir_recordatorios,
         COALESCE(public.get_remito_setting_int(r.id, 'anticipacion_monitoreo_horas', 6), 6) AS anticipacion_horas
  INTO v_rec
  FROM public.remitos r
  JOIN public.choferes c ON r.chofer_id = c.id
  WHERE r.id = p_remito_id;

  -- Validaciones iniciales
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

  -- 3. Verificar filtro de anticipación de carga
  IF v_rec.fecha_hora_estimada_carga IS NOT NULL AND v_now < (v_rec.fecha_hora_estimada_carga - (v_rec.anticipacion_horas * INTERVAL '1 hour')) THEN
    RETURN jsonb_build_object(
      'success', true, 
      'debe_alertar', false, 
      'motivo', format(
        'El remito tiene fecha probable de carga para el %s (faltan %s). El monitoreo proactivo se activará a partir del %s (umbral: %s horas antes).',
        to_char(v_rec.fecha_hora_estimada_carga AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'),
        to_char(v_rec.fecha_hora_estimada_carga - v_now, 'DD "días" HH24 "horas" MI "min"'),
        to_char((v_rec.fecha_hora_estimada_carga - (v_rec.anticipacion_horas * INTERVAL '1 hour')) AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'),
        v_rec.anticipacion_horas
      )
    );
  END IF;

  -- Determinar intervalo de recordatorio
  v_intervalo_minutos := COALESCE(
    public.get_remito_setting_int(p_remito_id, 'espera_respuesta_minutos', NULL),
    public.get_remito_setting_int(p_remito_id, 'intervalo_recordatorio_carga_corta_minutos', 60)
  );

  v_ultimo_mensaje_at := COALESCE(v_rec.ultimo_mensaje_chofer_at, v_now - INTERVAL '10 days');
  v_diff_minutos := (EXTRACT(EPOCH FROM (v_now - v_ultimo_mensaje_at))::int) / 60;

  -- Verificar si se envió alerta recientemente (en el mismo intervalo de minutos)
  SELECT EXISTS (
    SELECT 1 
    FROM public.conversation_messages cm
    WHERE cm.remito_id = p_remito_id
      AND cm.is_system_requirement = true
      AND cm.created_at >= v_now - (v_intervalo_minutos * interval '1 minute')
  ) INTO v_alerta_enviada_reciente;

  -- Determinar si debe alertar
  IF v_diff_minutos < v_intervalo_minutos THEN
    v_debe_alertar := false;
    v_motivo := format('El chofer estuvo activo hace %s min (límite de inactividad: %s min).', v_diff_minutos, v_intervalo_minutos);
  ELSIF v_alerta_enviada_reciente THEN
    v_debe_alertar := false;
    v_motivo := format('El tiempo de silencio se cumplió (%s min > %s min), pero ya se envió un recordatorio del sistema recientemente.', v_diff_minutos, v_intervalo_minutos);
  ELSE
    v_debe_alertar := true;
    v_motivo := format('El chofer superó el tiempo máximo de inactividad (%s min > %s min) y no se enviaron alertas recientes.', v_diff_minutos, v_intervalo_minutos);
  END IF;

  -- Construir el mensaje que se enviaría
  v_nombre := initcap(split_part(v_rec.nombre_completo, ' ', 1));
  v_mensaje := CASE v_rec.mision_estado
    WHEN 'ESPERANDO_DOCS' THEN
      'Hola ' || v_nombre || ', ¿confirmas que ya tienes la documentación en mano? Indicame con un SÍ.'
    WHEN 'PESAJE_1_ORIGEN' THEN
      'Hola ' || v_nombre || ', por favor recordá realizar el pesaje de Tara (vacío) antes de la carga de mercadería y confirmame al terminar.'
    WHEN 'EN_CARGA' THEN
      'Hola ' || v_nombre || ', recordá realizar el checklist de carga (bolsas, fotos) y confirmame al finalizar la carga.'
    WHEN 'PESAJE_2_ORIGEN' THEN
      'Hola ' || v_nombre || ', recordá realizar el pesaje Bruto (lleno) al salir. ¡Recordá NO cargar combustible!'
    WHEN 'EN_TRANSITO' THEN
      'Hola ' || v_nombre || ', ¿cómo va el viaje? ¿Mantenés la fecha probable de entrega del ' || COALESCE(to_char(v_rec.fecha_probable_entrega AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), 'viaje') || '?'
    WHEN 'PESAJE_1_DESTINO' THEN
      'Hola ' || v_nombre || ', recordá realizar el pesaje Bruto en destino antes de descargar.'
    WHEN 'EN_DESCARGA' THEN
      'Hola ' || v_nombre || ', confirmame cuando termines de descargar para que te indique dónde hacer la Tara final.'
    WHEN 'PESAJE_2_DESTINO' THEN
      'Hola ' || v_nombre || ', recordá realizar el pesaje de Tara final en destino.'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'success', true,
    'remito_id', p_remito_id,
    'mision_estado', v_rec.mision_estado,
    'nombre_chofer', v_nombre,
    'telefono_chofer', v_rec.telefono,
    'ultimo_contacto_at', v_ultimo_mensaje_at,
    'diferencia_minutos', v_diff_minutos,
    'intervalo_limite_minutos', v_intervalo_minutos,
    'alerta_enviada_reciente', v_alerta_enviada_reciente,
    'debe_alertar', v_debe_alertar,
    'motivo', v_motivo,
    'mensaje_a_enviar', v_mensaje
  );
END;
$$;
