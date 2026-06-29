-- Migration: Workflow de vinculación y confirmación de fotos del chofer
-- Created At: 2026-06-22

-- 1. Función para reconstruir el instrucciones_texto del remito
CREATE OR REPLACE FUNCTION public.rebuild_remito_instrucciones_texto(p_remito_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_protocolo JSONB;
  v_instrucciones_actual TEXT;
  v_pesaje_text TEXT := '';
  v_checklist_text TEXT := '';
  v_item RECORD;
  v_symbol TEXT;
  v_pos INT;
BEGIN
  -- Obtener protocolo y instrucciones actuales
  SELECT protocolo_control, instrucciones_texto
  INTO v_protocolo, v_instrucciones_actual
  FROM public.remitos
  WHERE id = p_remito_id;

  IF v_protocolo IS NULL THEN
    RETURN;
  END IF;

  v_instrucciones_actual := COALESCE(v_instrucciones_actual, '');

  -- Extraer la sección de pesaje (todo lo que precede a '\nProceso de carga:')
  v_pos := position(E'\nProceso de carga:' in v_instrucciones_actual);
  IF v_pos > 0 THEN
    v_pesaje_text := substring(v_instrucciones_actual from 1 for v_pos - 1);
  ELSIF position('Pesaje:' in v_instrucciones_actual) = 1 THEN
    v_pesaje_text := v_instrucciones_actual;
  ELSE
    v_pesaje_text := '';
  END IF;

  IF v_pesaje_text <> '' THEN
    v_pesaje_text := rtrim(v_pesaje_text) || E'\n\n';
  END IF;

  -- Recorrer tareas asignadas al chofer y de tipo CONTROL_GENERAL para generar el listado
  FOR v_item IN 
    SELECT (elem->>'id')::INT AS id,
           elem->>'tarea' AS tarea,
           elem->>'estado' AS estado,
           (elem->>'asignada_a_chofer')::BOOLEAN AS asignada_a_chofer,
           elem->>'tipo_tarea' AS tipo_tarea
    FROM jsonb_array_elements(v_protocolo) AS elem
    WHERE (elem->>'asignada_a_chofer')::BOOLEAN = true
      AND elem->>'tipo_tarea' = 'CONTROL_GENERAL'
    ORDER BY (elem->>'orden_sugerido')::INT ASC, (elem->>'id')::INT ASC
  LOOP
    v_symbol := ' ';
    IF v_item.estado = 'COMPLETADO' THEN v_symbol := 'X';
    ELSIF v_item.estado = 'REPORTADO_CHOFER' THEN v_symbol := '⏳';
    ELSIF v_item.estado = 'NO_REALIZABLE' THEN v_symbol := '⚠️';
    ELSIF v_item.estado = 'RECHAZADO' THEN v_symbol := '❌';
    END IF;

    IF v_checklist_text <> '' THEN
      v_checklist_text := v_checklist_text || E'\n';
    END IF;
    v_checklist_text := v_checklist_text || '   [' || v_symbol || '] ' || v_item.tarea;
  END LOOP;

  -- Actualizar el remito con las instrucciones reconstruidas
  UPDATE public.remitos
  SET instrucciones_texto = v_pesaje_text || 'Proceso de carga:' || E'\n' || v_checklist_text
  WHERE id = p_remito_id;
END;
$$;


-- 2. Función para marcar buffer procesado y generar la pregunta del lote de fotos
CREATE OR REPLACE FUNCTION public.procesar_media_buffer_y_generar_pregunta(
  p_conversation_id BIGINT,
  p_consolidated_desc TEXT
)
RETURNS TABLE (
  text TEXT,
  is_requirement BOOLEAN,
  waid TEXT,
  profile_name TEXT,
  conversation_id BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remito_id BIGINT;
  v_protocolo JSONB;
  v_pending_tasks JSONB := '[]'::jsonb;
  v_task RECORD;
  v_option INT := 0;
  v_question TEXT;
  v_media_urls JSONB := '[]'::jsonb;
  v_msg_id BIGINT;
  v_buffer RECORD;
  v_waid TEXT;
  v_profile_name TEXT;
BEGIN
  -- 1. Obtener el remito actual y el waid de la conversación
  SELECT r.id, c.conversation_key INTO v_remito_id, v_waid
  FROM public.conversations c
  LEFT JOIN public.remitos r ON c.remito_actual_id = r.id
  WHERE c.id = p_conversation_id;

  -- 2. Obtener el nombre del chofer
  SELECT c.nombre_completo INTO v_profile_name
  FROM public.choferes c
  WHERE c.id = (SELECT participant_id FROM public.conversations WHERE id = p_conversation_id);

  -- 3. Recopilar URLs de fotos en el buffer no procesado
  FOR v_buffer IN 
    SELECT mb.storage_path 
    FROM public.media_buffer mb
    WHERE mb.conversation_id = p_conversation_id AND mb.processed = false
    ORDER BY mb.id ASC
  LOOP
    v_media_urls := jsonb_insert(
      v_media_urls,
      '{-1}',
      to_jsonb('https://inatvoknxfzcobnmrjpk.supabase.co/storage/v1/object/public/evidencias/' || v_buffer.storage_path)
    );
  END LOOP;

  -- 4. Marcar buffer como procesado
  UPDATE public.media_buffer 
  SET processed = true 
  WHERE conversation_id = p_conversation_id AND processed = false;

  -- Si no hay remito, no podemos buscar checklist
  IF v_remito_id IS NULL THEN
    RETURN QUERY SELECT p_consolidated_desc, false, v_waid, v_profile_name, p_conversation_id;
    RETURN;
  END IF;

  -- 5. Obtener protocolo del remito
  SELECT protocolo_control INTO v_protocolo
  FROM public.remitos
  WHERE id = v_remito_id;

  IF v_protocolo IS NULL OR jsonb_array_length(v_protocolo) = 0 THEN
    RETURN QUERY SELECT p_consolidated_desc, false, v_waid, v_profile_name, p_conversation_id;
    RETURN;
  END IF;

  -- 6. Buscar tareas que requieren foto y están pendientes o rechazadas (que deban rehacerse)
  v_question := p_consolidated_desc || E'\n\n¿A qué tarea del protocolo corresponde esta foto?';
  
  FOR v_task IN 
    SELECT (elem->>'id')::INT AS id,
           elem->>'tarea' AS tarea
    FROM jsonb_array_elements(v_protocolo) AS elem
    WHERE (elem->>'requiere_foto')::BOOLEAN = true
      AND elem->>'estado' IN ('PENDIENTE', 'RECHAZADO')
    ORDER BY (elem->>'orden_sugerido')::INT ASC, (elem->>'id')::INT ASC
  LOOP
    v_option := v_option + 1;
    v_pending_tasks := jsonb_insert(
      v_pending_tasks,
      '{-1}',
      jsonb_build_object('option', v_option, 'task_id', v_task.id)
    );
    v_question := v_question || E'\n' || v_option || E'️⃣ ' || v_task.tarea;
  END LOOP;

  -- 7. Si no hay tareas pendientes que requieran foto, retornar solo la descripción consolidada
  IF v_option = 0 THEN
    RETURN QUERY SELECT p_consolidated_desc, false, v_waid, v_profile_name, p_conversation_id;
    RETURN;
  END IF;

  -- Completar el texto de la pregunta
  v_question := v_question || E'\n0️⃣ Ninguna de las anteriores / Foto general' || E'\n\nResponde con el o los números separados por coma (ej. 1 o 1,2).';

  -- 8. Insertar el mensaje de requerimiento en conversation_messages
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
    requirement_status,
    raw_payload
  ) VALUES (
    p_conversation_id,
    'out',
    'sistema',
    'text',
    v_question,
    'whatsapp',
    v_remito_id,
    true,
    'REQ_VINCULAR_FOTO',
    'PENDIENTE',
    jsonb_build_object(
      'pending_tasks', v_pending_tasks,
      'media_urls', v_media_urls
    )
  );

  RETURN QUERY SELECT v_question, true, v_waid, v_profile_name, p_conversation_id;
END;
$$;


-- 3. Función para intentar procesar la respuesta del chofer a la pregunta
CREATE OR REPLACE FUNCTION public.intentar_procesar_respuesta_requerimiento(
  p_conversation_id BIGINT,
  p_driver_message TEXT
)
RETURNS TABLE (
  processed BOOLEAN,
  success BOOLEAN,
  response_text TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req RECORD;
  v_clean_msg TEXT;
  v_option_str TEXT;
  v_selected_options INT[];
  v_task_id INT;
  v_linked_tasks_str TEXT := '';
  v_remito_id BIGINT;
  v_protocolo JSONB;
  v_updated_protocolo JSONB;
  v_media_urls JSONB;
  v_task RECORD;
  v_pending_list TEXT := '';
  v_all_valid BOOLEAN := true;
BEGIN
  -- 1. Buscar el requerimiento pendiente más reciente para esta conversación
  SELECT * INTO v_req
  FROM public.conversation_messages
  WHERE conversation_id = p_conversation_id
    AND is_system_requirement = true
    AND requirement_status = 'PENDIENTE'
  ORDER BY id DESC
  LIMIT 1;

  IF v_req IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::TEXT;
    RETURN;
  END IF;

  -- Si es REQ_CONFIRMACION_HORARIO, marcar como contestado y no hacer procesamiento de vinculación aquí
  IF v_req.template_code = 'REQ_CONFIRMACION_HORARIO' THEN
    UPDATE public.conversation_messages
    SET requirement_status = 'CONTESTADO',
        response_to_id = (SELECT id FROM public.conversation_messages WHERE conversation_id = p_conversation_id AND direction = 'in' ORDER BY id DESC LIMIT 1)
    WHERE id = v_req.id;
    
    RETURN QUERY SELECT false, false, NULL::TEXT;
    RETURN;
  END IF;

  IF v_req.template_code = 'REQ_VINCULAR_FOTO' THEN
    -- Limpiar el mensaje dejando solo dígitos y comas
    v_clean_msg := regexp_replace(trim(p_driver_message), '[^0-9,]', '', 'g');
    
    IF v_clean_msg = '' THEN
      -- No tiene números ni comas (es un mensaje libre del chofer)
      -- Cerramos el requerimiento como ESCALADO/EXPIRADO para no bloquear la conversación
      UPDATE public.conversation_messages
      SET requirement_status = 'ESCALADO',
          response_to_id = (SELECT id FROM public.conversation_messages WHERE conversation_id = p_conversation_id AND direction = 'in' ORDER BY id DESC LIMIT 1)
      WHERE id = v_req.id;
      
      RETURN QUERY SELECT false, false, NULL::TEXT;
      RETURN;
    END IF;

    -- Extraer el arreglo de opciones seleccionadas
    BEGIN
      SELECT array_agg(val::int) INTO v_selected_options
      FROM unnest(string_to_array(v_clean_msg, ',')) AS val
      WHERE val <> '';
    EXCEPTION WHEN OTHERS THEN
      v_selected_options := NULL;
    END;

    IF v_selected_options IS NULL OR cardinality(v_selected_options) = 0 THEN
      -- Error de casteo o vacío
      RETURN QUERY SELECT true, false, 'Opción no válida. Por favor, responde con el o los números de opción correspondientes (ej: 1 o 1,2).'::TEXT;
      RETURN;
    END IF;

    v_remito_id := v_req.remito_id;
    v_media_urls := v_req.raw_payload->'media_urls';

    -- Si elige 0 (general/ninguno), cerramos e ignoramos vinculación específica
    IF 0 = ANY(v_selected_options) THEN
      UPDATE public.conversation_messages
      SET requirement_status = 'CONTESTADO',
          response_to_id = (SELECT id FROM public.conversation_messages WHERE conversation_id = p_conversation_id AND direction = 'in' ORDER BY id DESC LIMIT 1)
      WHERE id = v_req.id;

      RETURN QUERY SELECT true, true, 'Entendido, guardo la foto de forma general en el remito.'::TEXT;
      RETURN;
    END IF;

    -- Obtener el protocolo actual del remito
    SELECT protocolo_control INTO v_protocolo
    FROM public.remitos
    WHERE id = v_remito_id;

    -- Validar que todas las opciones seleccionadas sean válidas en el payload
    FOR v_option_str IN SELECT unnest(v_selected_options) LOOP
      SELECT (elem->>'task_id')::INT INTO v_task_id
      FROM jsonb_array_elements(v_req.raw_payload->'pending_tasks') AS elem
      WHERE (elem->>'option')::INT = v_option_str::INT;

      IF v_task_id IS NULL THEN
        v_all_valid := false;
      END IF;
    END LOOP;

    IF NOT v_all_valid THEN
      RETURN QUERY SELECT true, false, 'Una o más opciones no son válidas. Por favor, responde con el o los números de opción correctos (ej: 1 o 1,2).'::TEXT;
      RETURN;
    END IF;

    -- 1. Obtener la cadena con los nombres de las tareas que estamos vinculando
    SELECT string_agg('*' || (elem->>'tarea') || '*', ', ') INTO v_linked_tasks_str
    FROM jsonb_array_elements(v_protocolo) AS elem
    WHERE (elem->>'id')::INT IN (
      SELECT (t->>'task_id')::INT 
      FROM jsonb_array_elements(v_req.raw_payload->'pending_tasks') AS t
      WHERE (t->>'option')::INT = ANY(v_selected_options)
    );

    -- 2. Modificar el JSONB actualizando las tareas correspondientes
    WITH updated_tasks AS (
      SELECT 
        CASE 
          WHEN (elem->>'id')::INT IN (
            SELECT (t->>'task_id')::INT 
            FROM jsonb_array_elements(v_req.raw_payload->'pending_tasks') AS t
            WHERE (t->>'option')::INT = ANY(v_selected_options)
          ) THEN
            elem || jsonb_build_object(
              'estado', 'REPORTADO_CHOFER',
              'chofer_realizo', true,
              'chofer_reporto_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'valor_reportado_chofer', COALESCE(v_media_urls->>0, '')
            )
          ELSE elem
        END AS updated_elem
      FROM jsonb_array_elements(v_protocolo) AS elem
    )
    SELECT json_agg(updated_elem)::JSONB INTO v_updated_protocolo
    FROM updated_tasks;

    -- Guardar protocolo actualizado en el remito
    UPDATE public.remitos
    SET protocolo_control = v_updated_protocolo
    WHERE id = v_remito_id;

    -- Reconstruir instrucciones_texto en la base de datos
    PERFORM public.rebuild_remito_instrucciones_texto(v_remito_id);

    -- 3. Buscar tareas que siguen en PENDIENTE en el protocolo actualizado
    v_pending_list := '';
    FOR v_task IN 
      SELECT elem->>'tarea' AS tarea
      FROM jsonb_array_elements(v_updated_protocolo) AS elem
      WHERE elem->>'estado' = 'PENDIENTE'
        AND (elem->>'asignada_a_chofer')::BOOLEAN = true
      ORDER BY (elem->>'orden_sugerido')::INT ASC, (elem->>'id')::INT ASC
    LOOP
      v_pending_list := v_pending_list || E'\n• ' || v_task.tarea;
    END LOOP;

    IF v_pending_list <> '' THEN
      v_pending_list := E'\n\n*Tareas pendientes para este remito:*' || v_pending_list;
    ELSE
      v_pending_list := E'\n\n*¡Buenísimo! Has completado todas las tareas del protocolo.*';
    END IF;

    -- Marcar el requerimiento como contestado
    UPDATE public.conversation_messages
    SET requirement_status = 'CONTESTADO',
        response_to_id = (SELECT id FROM public.conversation_messages WHERE conversation_id = p_conversation_id AND direction = 'in' ORDER BY id DESC LIMIT 1)
    WHERE id = v_req.id;

    RETURN QUERY SELECT 
      true, 
      true, 
      ('¡Entendido! Foto vinculada a: ' || v_linked_tasks_str || '. Ha quedado registrada para aprobación del operador.' || v_pending_list)::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, false, NULL::TEXT;
END;
$$;;
