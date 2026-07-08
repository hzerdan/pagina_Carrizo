-- 1. Agregar minutos_gracia_default a catalogo_tareas_control
ALTER TABLE public.catalogo_tareas_control ADD COLUMN IF NOT EXISTS minutos_gracia_default INT DEFAULT 30;

-- Configurar minutos por defecto para las tareas
UPDATE public.catalogo_tareas_control SET minutos_gracia_default = 30 WHERE tipo_tarea = 'CONTROL_GENERAL';
UPDATE public.catalogo_tareas_control SET minutos_gracia_default = 60 WHERE tipo_tarea IN ('PESAJE_TARA', 'PESAJE_BRUTO');

-- 2. Crear trigger para heredar minutos_gracia al insertar/actualizar protocolo_control en remitos
CREATE OR REPLACE FUNCTION public.trg_fn_initialize_remito_protocol()
RETURNS TRIGGER AS $$
DECLARE
  v_elem jsonb;
  v_new_protocol jsonb := '[]'::jsonb;
  v_default_gracia int;
  v_task_id int;
BEGIN
  -- Si el protocolo está vacío, inicializarlo con todas las tareas activas del catálogo
  IF NEW.protocolo_control IS NULL OR jsonb_array_length(NEW.protocolo_control) = 0 THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'tarea', tarea_template,
        'tarea_template', tarea_template,
        'tipo_tarea', tipo_tarea,
        'requiere_foto', requiere_foto,
        'requiere_aviso', requiere_aviso,
        'orden_sugerido', orden_sugerido,
        'asignada_a_chofer', true,
        'estado', 'PENDIENTE',
        'minutos_gracia', COALESCE(minutos_gracia_default, 30)
      ) ORDER BY orden_sugerido ASC
    ) INTO NEW.protocolo_control
    FROM public.catalogo_tareas_control
    WHERE estado = 'ACTIVO';
  ELSE
    -- Asegurar que todos los elementos tengan la clave minutos_gracia
    FOR v_elem IN SELECT * FROM jsonb_array_elements(NEW.protocolo_control) LOOP
      IF NOT (v_elem ? 'minutos_gracia') THEN
        v_task_id := (v_elem->>'id')::int;
        SELECT minutos_gracia_default INTO v_default_gracia
        FROM public.catalogo_tareas_control
        WHERE id = v_task_id;
        v_elem := v_elem || jsonb_build_object('minutos_gracia', COALESCE(v_default_gracia, 30));
      END IF;
      v_new_protocol := v_new_protocol || jsonb_build_array(v_elem);
    END LOOP;
    NEW.protocolo_control := v_new_protocol;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_initialize_remito_protocol ON public.remitos;
CREATE TRIGGER trg_initialize_remito_protocol
BEFORE INSERT OR UPDATE OF protocolo_control ON public.remitos
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_initialize_remito_protocol();

-- 3. Actualización retroactiva para inyectar minutos_gracia a remitos existentes
UPDATE public.remitos
SET protocolo_control = (
  SELECT jsonb_agg(
    CASE 
      WHEN NOT (elem ? 'minutos_gracia') THEN
        elem || jsonb_build_object(
          'minutos_gracia', 
          COALESCE(
            (SELECT minutos_gracia_default FROM public.catalogo_tareas_control WHERE id = (elem->>'id')::int), 
            CASE WHEN elem->>'tipo_tarea' IN ('PESAJE_TARA', 'PESAJE_BRUTO') THEN 60 ELSE 30 END
          )
        )
      ELSE elem
    END
  )
  FROM jsonb_array_elements(protocolo_control) AS elem
)
WHERE protocolo_control IS NOT NULL AND jsonb_array_length(protocolo_control) > 0;

-- 4. Crear helper para determinar la tarea activa según el estado de la misión
CREATE OR REPLACE FUNCTION public.get_current_task_for_mision_state(p_remito_id bigint, p_mision_estado text)
RETURNS jsonb AS $$
DECLARE
  v_protocolo jsonb;
  v_elem jsonb;
  v_is_origen boolean;
  v_tara_momento text;
  v_bruto_momento text;
BEGIN
  SELECT protocolo_control, tara_pesaje_momento, bruto_pesaje_momento
  INTO v_protocolo, v_tara_momento, v_bruto_momento
  FROM public.remitos
  WHERE id = p_remito_id;

  IF v_protocolo IS NULL OR jsonb_array_length(v_protocolo) = 0 THEN
    RETURN NULL;
  END IF;

  -- Resuelto: si tara es antes de cargar y bruto es después de cargar (tratando nulls) -> Origen
  v_is_origen := (COALESCE(v_tara_momento, 'Antes de cargar') = 'Antes de cargar' 
                  AND COALESCE(v_bruto_momento, 'Después de cargar') = 'Después de cargar');

  IF p_mision_estado = 'ESPERANDO_DOCS' THEN
    -- Tarea de confirmación de documentos (ID = 1)
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_protocolo) LOOP
      IF (v_elem->>'id')::int = 1 THEN
        RETURN v_elem;
      END IF;
    END LOOP;

  ELSIF p_mision_estado = 'PESAJE_1_ORIGEN' THEN
    -- Tara en Origen (tipo_tarea = PESAJE_TARA)
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_protocolo) LOOP
      IF v_elem->>'tipo_tarea' = 'PESAJE_TARA' THEN
        RETURN v_elem;
      END IF;
    END LOOP;

  ELSIF p_mision_estado = 'PESAJE_2_ORIGEN' THEN
    -- Bruto en Origen (tipo_tarea = PESAJE_BRUTO)
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_protocolo) LOOP
      IF v_elem->>'tipo_tarea' = 'PESAJE_BRUTO' THEN
        RETURN v_elem;
      END IF;
    END LOOP;

  ELSIF p_mision_estado = 'PESAJE_1_DESTINO' THEN
    -- Bruto en Destino (tipo_tarea = PESAJE_BRUTO)
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_protocolo) LOOP
      IF v_elem->>'tipo_tarea' = 'PESAJE_BRUTO' THEN
        RETURN v_elem;
      END IF;
    END LOOP;

  ELSIF p_mision_estado = 'PESAJE_2_DESTINO' THEN
    -- Tara en Destino (tipo_tarea = PESAJE_TARA)
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_protocolo) LOOP
      IF v_elem->>'tipo_tarea' = 'PESAJE_TARA' THEN
        RETURN v_elem;
      END IF;
    END LOOP;

  ELSIF p_mision_estado = 'EN_CARGA' THEN
    -- Primera tarea de control general pendiente en el checklist (excluyendo ID 1)
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

-- 5. Refactorizar la función del Cron Job: ejecutar_monitoreo_mision_remitos
CREATE OR REPLACE FUNCTION public.ejecutar_monitoreo_mision_remitos()
RETURNS void AS $$
DECLARE
  v_rec RECORD;
  v_nombre TEXT;
  v_mensaje TEXT;
  v_intervalo_minutos INT;
  v_tarea jsonb;
  v_tarea_desc TEXT;
  v_lugar_pesaje TEXT;
BEGIN
  -- Configurar el timeout HTTP a 10 segundos
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');

  FOR v_rec IN 
    SELECT r.id, r.mision_estado, r.fecha_probable_entrega, r.fecha_hora_estimada_carga, 
           c.nombre_completo, c.telefono, r.ultimo_mensaje_chofer_at,
           r.tara_pesaje_lugar_id, r.bruto_pesaje_lugar_id,
           (SELECT lp.nombre FROM public.lugares_pesaje lp WHERE lp.id = r.tara_pesaje_lugar_id) AS lugar_tara,
           (SELECT lp.nombre FROM public.lugares_pesaje lp WHERE lp.id = r.bruto_pesaje_lugar_id) AS lugar_bruto
    FROM public.remitos r
    JOIN public.choferes c ON r.chofer_id = c.id
    WHERE r.mision_estado IS NOT NULL 
      AND r.mision_estado <> 'MISION_COMPLETADA'
      AND r.estado_asignacion = 'ASIGNADO'
      AND c.telefono IS NOT NULL 
      AND c.telefono <> ''
      AND COALESCE(public.get_remito_setting_bool(r.id, 'omitir_notificaciones_chofer', false), false) = false
      AND COALESCE(public.get_remito_setting_bool(r.id, 'omitir_recordatorios_carga', false), false) = false
      AND (
        r.fecha_hora_estimada_carga IS NULL 
        OR NOW() >= (r.fecha_hora_estimada_carga - (COALESCE(public.get_remito_setting_int(r.id, 'anticipacion_monitoreo_horas', 6), 6) * INTERVAL '1 hour'))
      )
  LOOP
    -- 1. Determinar la tarea pendiente activa y su minutos_gracia correspondientes
    v_tarea := public.get_current_task_for_mision_state(v_rec.id, v_rec.mision_estado);
    
    IF v_tarea IS NOT NULL THEN
      v_intervalo_minutos := COALESCE((v_tarea->>'minutos_gracia')::int, 30);
      v_tarea_desc := v_tarea->>'tarea';
    ELSE
      -- Si no hay tarea específica para el estado (ej. EN_TRANSITO, EN_DESCARGA), usar 60 minutos por defecto
      v_intervalo_minutos := 60;
    END IF;

    -- 2. Verificar inactividad contra la latencia
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
      
      -- 3. Definir mensaje enfocado basándose en la tarea o el estado
      IF v_tarea IS NOT NULL THEN
        -- Si es una tarea del protocolo, pedirla de manera directa (Foco)
        IF v_tarea->>'tipo_tarea' = 'PESAJE_TARA' THEN
          v_lugar_pesaje := COALESCE(v_rec.lugar_tara, 'la balanza asignada');
          v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar el pesaje de Tara (vacío) en ' || v_lugar_pesaje || ' e informarla por este medio antes de cargar.';
        ELSIF v_tarea->>'tipo_tarea' = 'PESAJE_BRUTO' THEN
          v_lugar_pesaje := COALESCE(v_rec.lugar_bruto, 'la balanza asignada');
          v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar el pesaje Bruto (lleno) en ' || v_lugar_pesaje || ' al salir e informarlo por este medio.';
        ELSE
          -- CONTROL_GENERAL
          v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar la siguiente tarea: ' || v_tarea_desc || ' y confirmame por este medio.';
        END IF;
      ELSE
        -- Si está en tránsito o descarga (sin tarea directa en el checklist)
        v_mensaje := CASE v_rec.mision_estado
          WHEN 'EN_TRANSITO' THEN
            'Hola ' || v_nombre || ', ¿cómo va el viaje? ¿Mantenés la fecha probable de entrega del ' || COALESCE(to_char(v_rec.fecha_probable_entrega AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), 'viaje') || '?'
          WHEN 'EN_DESCARGA' THEN
            'Hola ' || v_nombre || ', confirmame cuando termines de descargar para que te indique dónde hacer la Tara final.'
          ELSE NULL
        END;
      END IF;

      -- Enviar el recordatorio
      IF v_mensaje IS NOT NULL THEN
        PERFORM public.notify_n8n_whatsapp_requirement(v_rec.id, v_mensaje);
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. Refactorizar la función de simulación: simular_monitoreo_remito
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
  v_ultimo_mensaje_at timestamp with time zone;
  v_now timestamp with time zone;
  v_diff_minutos INT;
  v_alerta_enviada_reciente boolean;
  v_debe_alertar boolean;
  v_motivo TEXT;
  v_tarea jsonb;
  v_tarea_desc TEXT;
  v_lugar_pesaje TEXT;
BEGIN
  v_now := COALESCE(p_simulate_now, NOW());

  SELECT r.id, r.mision_estado, r.fecha_probable_entrega, r.fecha_hora_estimada_carga, r.estado_asignacion,
         c.nombre_completo, c.telefono, r.ultimo_mensaje_chofer_at,
         r.tara_pesaje_lugar_id, r.bruto_pesaje_lugar_id,
         (SELECT lp.nombre FROM public.lugares_pesaje lp WHERE lp.id = r.tara_pesaje_lugar_id) AS lugar_tara,
         (SELECT lp.nombre FROM public.lugares_pesaje lp WHERE lp.id = r.bruto_pesaje_lugar_id) AS lugar_bruto,
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

  -- 1. Determinar la tarea pendiente activa y su minutos_gracia correspondientes
  v_tarea := public.get_current_task_for_mision_state(p_remito_id, v_rec.mision_estado);
  
  IF v_tarea IS NOT NULL THEN
    v_intervalo_minutos := COALESCE((v_tarea->>'minutos_gracia')::int, 30);
    v_tarea_desc := v_tarea->>'tarea';
  ELSE
    v_intervalo_minutos := 60;
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
    v_motivo := format('El chofer superó el tiempo de inactividad de la tarea (%s min > %s min) y no se enviaron alertas recientes.', v_diff_minutos, v_intervalo_minutos);
  END IF;

  -- 2. Definir mensaje para la simulación
  IF v_tarea IS NOT NULL THEN
    IF v_tarea->>'tipo_tarea' = 'PESAJE_TARA' THEN
      v_lugar_pesaje := COALESCE(v_rec.lugar_tara, 'la balanza asignada');
      v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar el pesaje de Tara (vacío) en ' || v_lugar_pesaje || ' e informarla por este medio antes de cargar.';
    ELSIF v_tarea->>'tipo_tarea' = 'PESAJE_BRUTO' THEN
      v_lugar_pesaje := COALESCE(v_rec.lugar_bruto, 'la balanza asignada');
      v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar el pesaje Bruto (lleno) en ' || v_lugar_pesaje || ' al salir e informarlo por este medio.';
    ELSE
      v_mensaje := 'Hola ' || v_nombre || ', por favor recordá realizar la siguiente tarea: ' || v_tarea_desc || ' y confirmame por este medio.';
    END IF;
  ELSE
    v_mensaje := CASE v_rec.mision_estado
      WHEN 'EN_TRANSITO' THEN
        'Hola ' || v_nombre || ', ¿cómo va el viaje? ¿Mantenés la fecha probable de entrega del ' || COALESCE(to_char(v_rec.fecha_probable_entrega AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), 'viaje') || '?'
      WHEN 'EN_DESCARGA' THEN
        'Hola ' || v_nombre || ', confirmame cuando termines de descargar para que te indique dónde hacer la Tara final.'
      ELSE NULL
    END;
  END IF;

  v_nombre := initcap(split_part(v_rec.nombre_completo, ' ', 1));

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
$$ LANGUAGE plpgsql;

-- 7. Crear trigger de auditoría centralizado para cambios en mision_estado
CREATE OR REPLACE FUNCTION public.trg_fn_log_mision_estado_change()
RETURNS TRIGGER AS $$
DECLARE
  v_pedido_instance_id bigint;
  v_user_actor text;
BEGIN
  IF COALESCE(OLD.mision_estado, '') <> COALESCE(NEW.mision_estado, '') THEN
    -- Obtener la instancia del pedido
    SELECT origen_instance_id INTO v_pedido_instance_id 
    FROM public.remito_items 
    WHERE remito_id = NEW.id LIMIT 1;
    
    -- Determinar el actor de la base de datos (sesión actual o sistema)
    v_user_actor := COALESCE(
      current_setting('request.jwt.claims', true)::jsonb->>'email',
      CASE WHEN NEW.updated_at = NOW() THEN 'sistema_fsm' ELSE 'sistema' END
    );

    INSERT INTO public.historial_eventos (
      pedido_instance_id,
      event_type,
      description,
      user_actor,
      details
    ) VALUES (
      v_pedido_instance_id,
      'STATE_TRANSITION',
      format('Transición de misión de transporte del remito #%s: %s -> %s', NEW.id, COALESCE(OLD.mision_estado, 'INICIAL'), NEW.mision_estado),
      v_user_actor,
      jsonb_build_object(
        'remito_id', NEW.id,
        'from_state', OLD.mision_estado,
        'to_state', NEW.mision_estado,
        'trigger', 'trg_audit_mision_estado_changes'
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_mision_estado_changes ON public.remitos;
CREATE TRIGGER trg_audit_mision_estado_changes
AFTER UPDATE OF mision_estado ON public.remitos
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_log_mision_estado_change();

-- 8. Remover la escritura redundante en historial_eventos de transicionar_mision_remito
CREATE OR REPLACE FUNCTION public.transicionar_mision_remito(
  p_remito_id bigint, 
  p_nuevo_estado text, 
  p_usuario_actor text, 
  p_comentarios text DEFAULT NULL, 
  p_forced boolean DEFAULT false
)
RETURNS jsonb AS $$
DECLARE
  v_estado_anterior text;
BEGIN
  SELECT mision_estado INTO v_estado_anterior FROM public.remitos WHERE id = p_remito_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'No se encontró el remito.');
  END IF;

  -- Actualizar el estado y resetear el timestamp del último contacto
  UPDATE public.remitos
  SET mision_estado = p_nuevo_estado,
      ultimo_mensaje_chofer_at = NOW(),
      updated_at = NOW()
  WHERE id = p_remito_id;

  -- NOTA: El trigger trg_audit_mision_estado_changes registrará automáticamente el cambio en historial_eventos

  RETURN jsonb_build_object('success', true, 'nuevo_estado', p_nuevo_estado);
END;
$$ LANGUAGE plpgsql;

-- 9. Remover la escritura redundante en historial_eventos de trg_fn_fsm_auto_transition
CREATE OR REPLACE FUNCTION public.trg_fn_fsm_auto_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_task_1 text;
  v_task_2 text;
  v_task_9 text;
  v_task_10 text;
  v_nuevo_estado text;
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

  v_nuevo_estado := COALESCE(NEW.mision_estado, 'ESPERANDO_DOCS');

  -- Evaluar según el escenario de pesaje (Origen vs Destino)
  IF COALESCE(NEW.es_flete_corto, false) = false 
     AND COALESCE(NEW.tara_pesaje_momento, 'Antes de cargar') = 'Antes de cargar' 
     AND COALESCE(NEW.bruto_pesaje_momento, 'Después de cargar') = 'Después de cargar' THEN
    -- Escenario A (Tara primero)
    IF v_task_10 = 'REPORTADO_CHOFER' THEN
      v_nuevo_estado := 'EN_TRANSITO';
    ELSIF v_task_9 = 'REPORTADO_CHOFER' THEN
      v_nuevo_estado := 'PESAJE_2_ORIGEN';
    ELSIF v_task_2 = 'REPORTADO_CHOFER' THEN
      v_nuevo_estado := 'EN_CARGA';
    ELSIF v_task_1 = 'REPORTADO_CHOFER' THEN
      v_nuevo_estado := 'PESAJE_1_ORIGEN';
    END IF;
  ELSE
    -- Escenario B (Bruto primero en Destino)
    IF v_task_9 = 'REPORTADO_CHOFER' THEN
      v_nuevo_estado := 'EN_TRANSITO';
    ELSIF v_task_1 = 'REPORTADO_CHOFER' THEN
      v_nuevo_estado := 'EN_CARGA';
    END IF;
  END IF;

  -- Si el estado cambió, actualizar mision_estado y resetear el timestamp del último contacto
  IF v_nuevo_estado <> COALESCE(NEW.mision_estado, 'ESPERANDO_DOCS') THEN
    NEW.mision_estado := v_nuevo_estado;
    NEW.ultimo_mensaje_chofer_at := NOW();
    -- NOTA: El trigger trg_audit_mision_estado_changes registrará automáticamente el cambio en historial_eventos
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
