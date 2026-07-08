-- 1. Agregar columnas a la tabla remitos si no existen
ALTER TABLE public.remitos ADD COLUMN IF NOT EXISTS mision_estado text DEFAULT 'ESPERANDO_DOCS';
ALTER TABLE public.remitos ADD COLUMN IF NOT EXISTS tiene_incidencias_carga boolean DEFAULT false;
ALTER TABLE public.remitos ADD COLUMN IF NOT EXISTS ultimo_mensaje_chofer_at timestamp with time zone DEFAULT now();

-- Agregar constraint check_mision_estado
ALTER TABLE public.remitos DROP CONSTRAINT IF EXISTS check_mision_estado;
ALTER TABLE public.remitos ADD CONSTRAINT check_mision_estado CHECK (
  mision_estado IN (
    'ESPERANDO_DOCS',
    'PESAJE_1_ORIGEN',
    'EN_CARGA',
    'PESAJE_2_ORIGEN',
    'EN_TRANSITO',
    'PESAJE_1_DESTINO',
    'EN_DESCARGA',
    'PESAJE_2_DESTINO',
    'MISION_COMPLETADA'
  )
);

-- 2. Crear funciones para obtener configuraciones del remito (overrides y políticas)
CREATE OR REPLACE FUNCTION public.get_remito_setting_int(
  p_remito_id bigint,
  p_key text,
  p_default int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_val int;
BEGIN
  -- Buscar en overrides vigentes
  EXECUTE format(
    'SELECT %I FROM public.logistica_politicas_notificacion_override WHERE remito_id = $1 AND vigente = true LIMIT 1',
    p_key
  ) INTO v_val USING p_remito_id;

  IF v_val IS NOT NULL THEN
    RETURN v_val;
  END IF;

  -- Buscar en política activa estándar
  EXECUTE format(
    'SELECT %I FROM public.logistica_politicas_notificacion WHERE activa = true ORDER BY id ASC LIMIT 1',
    p_key
  ) INTO v_val;

  IF v_val IS NOT NULL THEN
    RETURN v_val;
  END IF;

  RETURN p_default;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_remito_setting_bool(
  p_remito_id bigint,
  p_key text,
  p_default boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_val boolean;
BEGIN
  -- Buscar en overrides vigentes
  EXECUTE format(
    'SELECT %I FROM public.logistica_politicas_notificacion_override WHERE remito_id = $1 AND vigente = true LIMIT 1',
    p_key
  ) INTO v_val USING p_remito_id;

  IF v_val IS NOT NULL THEN
    RETURN v_val;
  END IF;

  -- Buscar en política activa estándar
  EXECUTE format(
    'SELECT %I FROM public.logistica_politicas_notificacion WHERE activa = true ORDER BY id ASC LIMIT 1',
    p_key
  ) INTO v_val;

  IF v_val IS NOT NULL THEN
    RETURN v_val;
  END IF;

  RETURN p_default;
END;
$$;

-- 3. RPC para transicionar el estado de la misión
CREATE OR REPLACE FUNCTION public.transicionar_mision_remito(
  p_remito_id bigint,
  p_nuevo_estado text,
  p_usuario_actor text,
  p_comentarios text,
  p_forced boolean default false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado_anterior text;
  v_pedido_instance_id bigint;
BEGIN
  -- Obtener estado anterior
  SELECT mision_estado INTO v_estado_anterior FROM public.remitos WHERE id = p_remito_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'No se encontró el remito.');
  END IF;

  -- Obtener la instancia del pedido para historial_eventos
  SELECT origen_instance_id INTO v_pedido_instance_id 
  FROM public.remito_items 
  WHERE remito_id = p_remito_id LIMIT 1;

  -- Actualizar el estado y resetear el timestamp del último contacto
  UPDATE public.remitos
  SET mision_estado = p_nuevo_estado,
      ultimo_mensaje_chofer_at = NOW(),
      updated_at = NOW()
  WHERE id = p_remito_id;

  -- Registrar la transición en historial_eventos
  INSERT INTO public.historial_eventos (
    pedido_instance_id,
    event_type,
    description,
    user_actor,
    details
  ) VALUES (
    v_pedido_instance_id,
    'STATE_TRANSITION',
    format('Transición de misión de transporte del remito #%s: %s -> %s (%s)', p_remito_id, COALESCE(v_estado_anterior, 'INICIAL'), p_nuevo_estado, CASE WHEN p_forced THEN 'FORZADO' ELSE 'AUTOMATICO' END),
    p_usuario_actor,
    jsonb_build_object(
      'remito_id', p_remito_id,
      'from_state', v_estado_anterior,
      'to_state', p_nuevo_estado,
      'forced', p_forced,
      'comentarios', p_comentarios
    )
  );

  RETURN jsonb_build_object('success', true, 'nuevo_estado', p_nuevo_estado);
END;
$$;

GRANT ALL ON FUNCTION public.transicionar_mision_remito(bigint, text, text, text, boolean) TO anon, authenticated, service_role;

-- 4. Trigger en conversation_messages para actualizar ultimo_mensaje_chofer_at automáticamente
CREATE OR REPLACE FUNCTION public.update_remito_ultimo_mensaje_chofer_at()
RETURNS TRIGGER AS $$
DECLARE
  v_remito_id BIGINT;
BEGIN
  v_remito_id := NEW.remito_id;
  
  IF v_remito_id IS NULL THEN
    SELECT remito_actual_id INTO v_remito_id
    FROM public.conversations
    WHERE id = NEW.conversation_id;
  END IF;

  IF v_remito_id IS NOT NULL AND NEW.direction = 'in' THEN
    UPDATE public.remitos
    SET ultimo_mensaje_chofer_at = NEW.created_at
    WHERE id = v_remito_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_remito_ultimo_mensaje_chofer_at ON public.conversation_messages;
CREATE TRIGGER trg_update_remito_ultimo_mensaje_chofer_at
AFTER INSERT ON public.conversation_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_remito_ultimo_mensaje_chofer_at();

-- 5. Actualizar la función RPC save_remito_update_admin
CREATE OR REPLACE FUNCTION public.save_remito_update_admin(
  p_remito_id bigint,
  p_updates jsonb,
  p_admin_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido_instancia_id BIGINT;
    v_campo TEXT;
    v_valor_nuevo TEXT;
BEGIN
    SELECT origen_instance_id INTO v_pedido_instancia_id FROM public.remito_items WHERE remito_id = p_remito_id LIMIT 1;

    FOR v_campo, v_valor_nuevo IN SELECT * FROM jsonb_each_text(p_updates)
    LOOP
        INSERT INTO public.historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
        VALUES (v_pedido_instancia_id, 'DATA_UPDATE', format('Campo [%s] actualizado desde Dashboard Admin', v_campo), p_admin_email, jsonb_build_object('campo', v_campo, 'valor', v_valor_nuevo));
    END LOOP;

    UPDATE public.remitos
    SET 
        chofer_id = CASE WHEN p_updates ? 'chofer_id' THEN NULLIF((p_updates->>'chofer_id')::INT, 0) ELSE chofer_id END,
        camion_id = CASE WHEN p_updates ? 'camion_id' THEN NULLIF((p_updates->>'camion_id')::INT, 0) ELSE camion_id END,
        acoplado_id = CASE WHEN p_updates ? 'acoplado_id' THEN NULLIF((p_updates->>'acoplado_id')::INT, 0) ELSE acoplado_id END,
        supervisor_id = CASE WHEN p_updates ? 'supervisor_id' THEN NULLIF((p_updates->>'supervisor_id')::INT, 0) ELSE supervisor_id END,
        parent_remito_id = CASE WHEN p_updates ? 'parent_remito_id' THEN NULLIF((p_updates->>'parent_remito_id')::BIGINT, 0) ELSE parent_remito_id END,
        inspector_id = CASE WHEN p_updates ? 'inspector_id' THEN NULLIF((p_updates->>'inspector_id')::INT, 0) ELSE inspector_id END,
        
        instrucciones_texto = CASE WHEN p_updates ? 'instrucciones_texto' THEN p_updates->>'instrucciones_texto' ELSE instrucciones_texto END,
        protocolo_control = CASE WHEN p_updates ? 'protocolo_control' THEN p_updates->'protocolo_control' ELSE protocolo_control END,
        
        tara_pesaje_momento = CASE WHEN p_updates ? 'tara_pesaje_momento' THEN p_updates->>'tara_pesaje_momento' ELSE tara_pesaje_momento END,
        tara_pesaje_lugar_id = CASE WHEN p_updates ? 'tara_pesaje_lugar_id' THEN NULLIF((p_updates->>'tara_pesaje_lugar_id')::INT, 0) ELSE tara_pesaje_lugar_id END,
        bruto_pesaje_momento = CASE WHEN p_updates ? 'bruto_pesaje_momento' THEN p_updates->>'bruto_pesaje_momento' ELSE bruto_pesaje_momento END,
        bruto_pesaje_lugar_id = CASE WHEN p_updates ? 'bruto_pesaje_lugar_id' THEN NULLIF((p_updates->>'bruto_pesaje_lugar_id')::INT, 0) ELSE bruto_pesaje_lugar_id END,
        
        fecha_hora_estimada_carga = CASE WHEN p_updates ? 'fecha_hora_estimada_carga' THEN (p_updates->>'fecha_hora_estimada_carga')::timestamp with time zone ELSE fecha_hora_estimada_carga END,
        debe_pasar_por_reembolse = CASE WHEN p_updates ? 'debe_pasar_por_reembolse' THEN (p_updates->>'debe_pasar_por_reembolse')::boolean ELSE debe_pasar_por_reembolse END,
        
        -- Nuevos campos de FSM
        mision_estado = CASE WHEN p_updates ? 'mision_estado' THEN p_updates->>'mision_estado' ELSE mision_estado END,
        tiene_incidencias_carga = CASE WHEN p_updates ? 'tiene_incidencias_carga' THEN (p_updates->>'tiene_incidencias_carga')::boolean ELSE tiene_incidencias_carga END,
        ultimo_mensaje_chofer_at = CASE WHEN p_updates ? 'ultimo_mensaje_chofer_at' THEN (p_updates->>'ultimo_mensaje_chofer_at')::timestamp with time zone ELSE ultimo_mensaje_chofer_at END,
        
        metadata_extraida = COALESCE(metadata_extraida, '{}'::jsonb) || p_updates,
        updated_at = NOW()
    WHERE id = p_remito_id;

    RETURN jsonb_build_object('status', 'SUCCESS');
END;
$$;

-- 6. Actualizar la función RPC get_full_context_by_remito
CREATE OR REPLACE FUNCTION public.get_full_context_by_remito(p_remito_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'remito', (
            SELECT to_jsonb(r.*) || jsonb_build_object(
                'mensajes_sin_respuesta_count', (
                    SELECT COUNT(*)::int
                    FROM public.conversation_messages cm
                    WHERE cm.remito_id = p_remito_id
                      AND cm.direction = 'out'
                      AND cm.created_at > COALESCE(
                        (SELECT MAX(created_at) FROM public.conversation_messages WHERE remito_id = p_remito_id AND direction = 'in'),
                        '1970-01-01 00:00:00+00'::timestamptz
                      )
                )
            )
            FROM public.remitos r 
            WHERE r.id = p_remito_id
        ),
        'pedidos', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'pedido_ref', p.pedido_ref_externa,
                    'cliente', c.razon_social,
                    'cantidad', ri.cantidad,
                    'tipo_mercado', p.tipo_mercado
                )
            ), '[]'::jsonb)
            FROM public.remito_items ri
            JOIN public.pedido_instancias pi ON ri.origen_instance_id = pi.id
            JOIN public.pedidos p ON pi.pedido_id = p.id
            JOIN public.clientes c ON p.cliente_id = c.id
            WHERE ri.remito_id = p_remito_id
        ),
        'catalogos', jsonb_build_object(
            'choferes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre_completo, 'dni', dni, 'telefono', telefono)), '[]'::jsonb) FROM public.choferes),
            'camiones', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'patente', patente, 'tipo', tipo)), '[]'::jsonb) FROM public.camiones),
            'balanzas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre)), '[]'::jsonb) FROM public.lugares_pesaje),
            'inspectores', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre_completo)), '[]'::jsonb) 
                FROM public.personal_ac p
                JOIN public.personal_ac_roles pr ON p.id = pr.personal_ac_id
                JOIN public.roles r ON pr.role_id = r.id
                WHERE r.codigo = 'INSP'
            ),
            'supervisores', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre_completo)), '[]'::jsonb) 
                FROM public.personal_ac p
                JOIN public.personal_ac_roles pr ON p.id = pr.personal_ac_id
                JOIN public.roles r ON pr.role_id = r.id
                WHERE r.codigo = 'SUP'
            ),
            'operadores', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre_completo)), '[]'::jsonb) 
                FROM public.personal_ac p
                JOIN public.personal_ac_roles pr ON p.id = pr.personal_ac_id
                JOIN public.roles r ON pr.role_id = r.id
                WHERE r.codigo = 'OP'
            ),
            'tareas_control', (SELECT COALESCE(jsonb_agg(to_jsonb(tc.*) ORDER BY tc.orden_sugerido ASC), '[]'::jsonb) FROM public.catalogo_tareas_control tc)
        )
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- 7. Función y cron job para monitoreo periódico proactivo de alta frecuencia
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
BEGIN
  -- Configurar el timeout HTTP a 10 segundos
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');

  -- Recorrer remitos activos que tengan chofer asignado, no completados y no omitidos
  FOR v_rec IN 
    SELECT r.id, r.mision_estado, r.fecha_probable_entrega, c.nombre_completo, c.telefono, r.ultimo_mensaje_chofer_at
    FROM public.remitos r
    JOIN public.choferes c ON r.chofer_id = c.id
    WHERE r.mision_estado IS NOT NULL 
      AND r.mision_estado <> 'MISION_COMPLETADA'
      AND r.estado_asignacion = 'ASIGNADO'
      AND c.telefono IS NOT NULL 
      AND c.telefono <> ''
      AND COALESCE(public.get_remito_setting_bool(r.id, 'omitir_notificaciones_chofer', false), false) = false
      AND COALESCE(public.get_remito_setting_bool(r.id, 'omitir_recordatorios_carga', false), false) = false
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

-- Programar el cron job a frecuencia de 5 minutos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitorear-mision-choferes') THEN
    PERFORM cron.unschedule('monitorear-mision-choferes');
  END IF;
END $$;

SELECT cron.schedule(
  'monitorear-mision-choferes',
  '*/5 * * * *',
  'SELECT public.ejecutar_monitoreo_mision_remitos();'
);
