-- RPC para resetear la misión de un remito
CREATE OR REPLACE FUNCTION public.reset_remito_mision(p_remito_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_instance_id bigint;
BEGIN
  -- 1. Obtener la instancia del pedido para historial_eventos
  SELECT origen_instance_id INTO v_instance_id 
  FROM public.remito_items 
  WHERE remito_id = p_remito_id LIMIT 1;
  
  -- 2. Eliminar mensajes de chat asociados para un inicio limpio
  DELETE FROM public.conversation_messages WHERE remito_id = p_remito_id;
  
  -- 3. Resetear las columnas y las tareas del protocolo_control a PENDIENTE
  UPDATE public.remitos
  SET mision_estado = 'ESPERANDO_DOCS',
      tiene_incidencias_carga = false,
      ultimo_mensaje_chofer_at = NOW(),
      protocolo_control = COALESCE(
        (
          SELECT jsonb_agg(
            (elem - 'done' - 'chofer_realizo' - 'chofer_reporto_at' - 'valor_reporto_chofer') || '{"estado": "PENDIENTE"}'::jsonb
          )
          FROM jsonb_array_elements(protocolo_control) AS elem
        ),
        protocolo_control
      ),
      updated_at = NOW()
  WHERE id = p_remito_id;

  -- 4. Registrar el reset en historial_eventos
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

  RETURN jsonb_build_object('success', true, 'message', 'Misión del remito restablecida con éxito.');
END;
$$;

GRANT ALL ON FUNCTION public.reset_remito_mision(bigint) TO anon, authenticated, service_role;
