-- RPC para simular y analizar las condiciones de monitoreo de un remito específico
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
  SELECT r.id, r.mision_estado, r.fecha_probable_entrega, r.estado_asignacion,
         c.nombre_completo, c.telefono, r.ultimo_mensaje_chofer_at,
         COALESCE(public.get_remito_setting_bool(r.id, 'omitir_notificaciones_chofer', false), false) AS omitir_notif,
         COALESCE(public.get_remito_setting_bool(r.id, 'omitir_recordatorios_carga', false), false) AS omitir_recordatorios
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

-- RPC para forzar de inmediato el recordatorio de inactividad de un remito
CREATE OR REPLACE FUNCTION public.ejecutar_alerta_monitoreo_remito(p_remito_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sim jsonb;
  v_mensaje TEXT;
BEGIN
  -- 1. Obtener la simulación
  v_sim := public.simular_monitoreo_remito(p_remito_id);
  
  IF NOT (v_sim->>'success')::boolean THEN
    RETURN v_sim;
  END IF;
  
  v_mensaje := v_sim->>'mensaje_a_enviar';
  
  IF v_mensaje IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay mensaje de recordatorio definido para el estado actual del remito.');
  END IF;

  -- 2. Enviar el mensaje a n8n
  PERFORM public.notify_n8n_whatsapp_requirement(p_remito_id, v_mensaje);

  -- 3. Registrar en historial_eventos
  INSERT INTO public.historial_eventos (
    pedido_instance_id,
    event_type,
    description,
    user_actor,
    details
  ) VALUES (
    (SELECT origen_instance_id FROM public.remito_items WHERE remito_id = p_remito_id LIMIT 1),
    'ALERT_TRIGGERED',
    format('Recordatorio de misión ejecutado manualmente (DevTools): "%s"', v_mensaje),
    'SISTEMA (DevTools)',
    jsonb_build_object('remito_id', p_remito_id, 'mensaje', v_mensaje, 'forced', true)
  );

  RETURN jsonb_build_object('success', true, 'message', 'Recordatorio enviado y registrado correctamente.', 'mensaje_enviado', v_mensaje);
END;
$$;

GRANT ALL ON FUNCTION public.simular_monitoreo_remito(bigint, timestamp with time zone) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.ejecutar_alerta_monitoreo_remito(bigint) TO anon, authenticated, service_role;
