-- RPC para resetear la misión de un remito
DROP FUNCTION IF EXISTS public.reset_remito_mision(bigint);

CREATE OR REPLACE FUNCTION public.reset_remito_mision(p_remito_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_instance_id bigint;
  v_chofer_id bigint;
  v_conv_id bigint;
BEGIN
  -- 1. Obtener la instancia del pedido y el chofer_id actual del remito
  SELECT r.chofer_id, ri.origen_instance_id 
  INTO v_chofer_id, v_instance_id 
  FROM public.remitos r
  LEFT JOIN public.remito_items ri ON ri.remito_id = r.id 
  WHERE r.id = p_remito_id LIMIT 1;

  -- Obtener conversation_id si existe para este chofer o remito
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE remito_actual_id = p_remito_id
     OR (v_chofer_id IS NOT NULL AND participant_id = v_chofer_id)
  LIMIT 1;
  
  -- 2. Limpieza en orden de dependencias para evitar errores de Foreign Key constraint

  -- 2.a. Eliminar buffers de media vinculados al remito o a mensajes del remito
  DELETE FROM public.media_buffer 
  WHERE remito_id = p_remito_id 
     OR message_id IN (
       SELECT id FROM public.conversation_messages 
       WHERE remito_id = p_remito_id 
          OR (v_conv_id IS NOT NULL AND conversation_id = v_conv_id AND remito_id IS NULL)
     );
  
  -- 2.b. Eliminar alertas de escalamiento vinculadas a los mensajes del remito
  DELETE FROM public.alertas_escalamiento 
  WHERE trigger_message_id IN (
    SELECT id FROM public.conversation_messages 
    WHERE remito_id = p_remito_id
       OR (v_conv_id IS NOT NULL AND conversation_id = v_conv_id AND remito_id IS NULL)
  );

  -- 2.c. Eliminar media adjunta a los mensajes del remito
  DELETE FROM public.message_media 
  WHERE message_id IN (
    SELECT id FROM public.conversation_messages 
    WHERE remito_id = p_remito_id
       OR (v_conv_id IS NOT NULL AND conversation_id = v_conv_id AND remito_id IS NULL)
  );

  -- 2.d. Romper TODAS las referencias autorreferenciales (response_to_id)
  UPDATE public.conversation_messages 
  SET response_to_id = NULL 
  WHERE response_to_id IN (
    SELECT id FROM public.conversation_messages 
    WHERE remito_id = p_remito_id 
       OR (v_conv_id IS NOT NULL AND conversation_id = v_conv_id AND remito_id IS NULL)
  )
  OR remito_id = p_remito_id
  OR (v_conv_id IS NOT NULL AND conversation_id = v_conv_id AND remito_id IS NULL);
  
  -- 2.e. Eliminar mensajes de chat asociados al remito y mensajes huérfanos sin remito de la conversación activa
  DELETE FROM public.conversation_messages 
  WHERE remito_id = p_remito_id
     OR (v_conv_id IS NOT NULL AND conversation_id = v_conv_id AND remito_id IS NULL);

  -- 2.f Resetear el estado de atención a 'bot_activo' en conversaciones y vincular remito
  IF v_conv_id IS NOT NULL THEN
    UPDATE public.conversations 
    SET estado_atencion = 'bot_activo',
        remito_actual_id = p_remito_id,
        last_activity_at = NOW()
    WHERE id = v_conv_id;
  END IF;

  -- 3. Resetear las columnas del remito, asegurar estado_asignacion = 'ASIGNADO', sobres en false, y reiniciar protocolo_control a PENDIENTE
  UPDATE public.remitos
  SET mision_estado = 'ESPERANDO_PAPELES',
      estado_asignacion = 'ASIGNADO',
      mi_sobre_proveedor_preparado = false,
      mi_sobre_cliente_preparado = false,
      tiene_incidencias_carga = false,
      ultimo_mensaje_chofer_at = NULL,
      retry_count = 0,
      protocolo_control = COALESCE(
        (
          SELECT jsonb_agg(
            CASE 
              WHEN (elem->>'id')::int = 11 THEN 
                (elem - 'done' - 'chofer_realizo' - 'chofer_reporto_at' - 'valor_reportado_chofer' - 'observaciones_chofer') 
                || '{"estado": "PENDIENTE", "tarea": "Dirigirse al lugar de carga", "tarea_template": "Dirigirse al lugar de carga"}'::jsonb
              ELSE 
                (elem - 'done' - 'chofer_realizo' - 'chofer_reporto_at' - 'valor_reportado_chofer' - 'observaciones_chofer') 
                || '{"estado": "PENDIENTE"}'::jsonb
            END
          )
          FROM jsonb_array_elements(protocolo_control) AS elem
        ),
        protocolo_control
      ),
      updated_at = NOW()
  WHERE id = p_remito_id;

  -- 4. Ejecutar la sincronización automática de la conversación vinculada
  PERFORM public.fn_sync_active_remito_to_conversation_manual(p_remito_id);

  -- 5. Registrar el reset en historial_eventos
  IF v_instance_id IS NOT NULL THEN
    INSERT INTO public.historial_eventos (
      pedido_instance_id,
      event_type,
      description,
      user_actor,
      details
    ) VALUES (
      v_instance_id,
      'MANUAL_OVERRIDE',
      format('Restablecimiento completo de la misión del remito #%s para pruebas de desarrollo', p_remito_id),
      'SISTEMA (DevTools)',
      jsonb_build_object('remito_id', p_remito_id, 'action', 'RESET_MISION')
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Misión del remito restablecida e integrada con éxito.');
END;
$$;

GRANT ALL ON FUNCTION public.reset_remito_mision(bigint) TO anon, authenticated, service_role;
