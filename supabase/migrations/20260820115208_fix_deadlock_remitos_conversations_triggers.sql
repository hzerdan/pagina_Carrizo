-- Migración: fix_deadlock_remitos_conversations_triggers
-- Evita bloqueo pesimista FOR UPDATE en trg_fn_fsm_text_transition para prevenir deadlocks en conversaciones concurrentes

DROP FUNCTION IF EXISTS public.trg_fn_fsm_text_transition() CASCADE;

CREATE OR REPLACE FUNCTION public.trg_fn_fsm_text_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remito_id bigint;
  v_mision_estado text;
  v_clean_text text;
  v_nuevo_estado text;
  v_pedido_instance_id bigint;
  v_has_image boolean;
BEGIN
  -- Solo actuar si el mensaje proviene del chofer
  IF NEW.direction <> 'in' THEN
    RETURN NEW;
  END IF;

  -- Obtener remito
  v_remito_id := NEW.remito_id;
  IF v_remito_id IS NULL THEN
    SELECT remito_actual_id INTO v_remito_id
    FROM public.conversations
    WHERE id = NEW.conversation_id;
  END IF;

  IF v_remito_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lectura limpia sin bloqueo pesimista FOR UPDATE para evitar deadlocks
  SELECT mision_estado INTO v_mision_estado
  FROM public.remitos
  WHERE id = v_remito_id;

  IF v_mision_estado IS NULL OR v_mision_estado = 'MISION_COMPLETADA' OR v_mision_estado = 'OPERACION_PENDIENTE' THEN
    RETURN NEW;
  END IF;

  -- Normalizar entrada
  v_clean_text := lower(translate(NEW.body_text, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'));
  v_has_image := (NEW.message_type = 'image' OR (NEW.media_urls IS NOT NULL AND cardinality(NEW.media_urls) > 0));

  v_nuevo_estado := v_mision_estado;

  IF v_mision_estado = 'EN_TRANSITO' THEN
    IF v_clean_text LIKE '%llegue%' OR v_clean_text LIKE '%llegado%' OR v_clean_text LIKE '%estoy en destino%' OR v_clean_text LIKE '%ingres%' THEN
      v_nuevo_estado := COALESCE(public.get_next_mision_estado(v_remito_id, v_mision_estado), v_mision_estado);
    END IF;
    
  ELSIF v_mision_estado = 'EN_DESCARGA' THEN
    IF v_clean_text LIKE '%termine%' OR v_clean_text LIKE '%vacio%' OR v_clean_text LIKE '%descargado%' OR v_clean_text LIKE '%listo%' OR v_clean_text LIKE '%complete%' THEN
      v_nuevo_estado := COALESCE(public.get_next_mision_estado(v_remito_id, v_mision_estado), v_mision_estado);
    END IF;
    
  ELSIF v_mision_estado = 'CONTROL_ENTREGA' THEN
    IF v_has_image THEN
      v_nuevo_estado := COALESCE(public.get_next_mision_estado(v_remito_id, v_mision_estado), v_mision_estado);
    END IF;
  END IF;

  -- Guardar transición y auditar si cambió el estado
  IF v_nuevo_estado <> v_mision_estado THEN
    UPDATE public.remitos
    SET mision_estado = v_nuevo_estado,
        ultimo_mensaje_chofer_at = COALESCE(NEW.created_at, NOW()),
        retry_count = 0,
        updated_at = NOW()
    WHERE id = v_remito_id;

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
      format('Transición FSM automática de misión del remito #%s a %s basada en chat del chofer', v_remito_id, v_nuevo_estado),
      'sistema_fsm_texto',
      jsonb_build_object(
        'remito_id', v_remito_id,
        'to_state', v_nuevo_estado,
        'forced', false,
        'comentarios', format('Mensaje: "%s", Tipo: %s, Tiene imagen: %s', NEW.body_text, NEW.message_type, v_has_image)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fsm_text_transition ON public.messages;
CREATE TRIGGER trg_fsm_text_transition
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_fsm_text_transition();
