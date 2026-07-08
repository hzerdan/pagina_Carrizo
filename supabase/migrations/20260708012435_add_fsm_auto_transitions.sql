-- 1. Crear la función del trigger para transición de FSM basada en cambios del checklist
CREATE OR REPLACE FUNCTION public.trg_fn_fsm_auto_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_1 text;
  v_task_2 text;
  v_task_9 text;
  v_task_10 text;
  v_nuevo_estado text;
  v_pedido_instance_id bigint;
BEGIN
  -- Si el protocolo es nulo o vacío, mantener el estado actual
  IF NEW.protocolo_control IS NULL OR jsonb_array_length(NEW.protocolo_control) = 0 THEN
    RETURN NEW;
  END IF;

  -- Obtener estados de las tareas críticas
  SELECT 
    MAX(CASE WHEN id = 1 THEN estado END),
    MAX(CASE WHEN id = 2 THEN estado END),
    MAX(CASE WHEN id = 9 THEN estado END),
    MAX(CASE WHEN id = 10 THEN estado END)
  INTO v_task_1, v_task_2, v_task_9, v_task_10
  FROM jsonb_to_recordset(NEW.protocolo_control) AS (id int, estado text);

  v_nuevo_estado := COALESCE(NEW.mision_estado, 'ESPERANDO_DOCS');

  -- Evaluar según el escenario de pesaje (Origen vs Destino)
  IF COALESCE(NEW.es_flete_corto, false) = false AND NEW.tara_pesaje_momento = 'Antes de cargar' AND NEW.bruto_pesaje_momento = 'Después de cargar' THEN
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
    -- Escenario B (Bruto primero)
    IF v_task_9 = 'REPORTADO_CHOFER' THEN
      v_nuevo_estado := 'EN_TRANSITO';
    ELSIF v_task_1 = 'REPORTADO_CHOFER' THEN
      v_nuevo_estado := 'EN_CARGA';
    END IF;
  END IF;

  -- Si el estado cambió, registrar la transición en historial_eventos y actualizar mision_estado
  IF v_nuevo_estado <> COALESCE(NEW.mision_estado, 'ESPERANDO_DOCS') THEN
    NEW.mision_estado := v_nuevo_estado;
    NEW.ultimo_mensaje_chofer_at := NOW();

    -- Obtener la instancia del pedido para historial_eventos
    SELECT origen_instance_id INTO v_pedido_instance_id 
    FROM public.remito_items 
    WHERE remito_id = NEW.id LIMIT 1;

    INSERT INTO public.historial_eventos (
      pedido_instance_id,
      event_type,
      description,
      user_actor,
      details
    ) VALUES (
      v_pedido_instance_id,
      'STATE_TRANSITION',
      format('Transición FSM automática de misión de transporte del remito #%s a %s basada en checklist', NEW.id, v_nuevo_estado),
      'sistema_fsm',
      jsonb_build_object(
        'remito_id', NEW.id,
        'to_state', v_nuevo_estado,
        'forced', false,
        'comentarios', 'Actualización automática por cambios en el checklist'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Crear el trigger BEFORE UPDATE OF protocolo_control en remitos
CREATE OR REPLACE TRIGGER trg_fsm_auto_transition
BEFORE UPDATE OF protocolo_control ON public.remitos
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_fsm_auto_transition();

-- 3. Crear la función del trigger para transición de FSM basada en mensajes de texto del chofer
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
BEGIN
  -- Solo actuar si el mensaje proviene del chofer
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

  -- Obtener el estado actual de la misión
  SELECT mision_estado INTO v_mision_estado
  FROM public.remitos
  WHERE id = v_remito_id;

  IF v_mision_estado IS NULL OR v_mision_estado = 'MISION_COMPLETADA' THEN
    RETURN NEW;
  END IF;

  -- Limpiar y normalizar el texto del chofer (minúsculas, sin acentos)
  v_clean_text := lower(translate(NEW.body_text, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'));

  -- Evaluar transiciones basadas en texto para fases de tránsito y descarga
  v_nuevo_estado := v_mision_estado;

  IF v_mision_estado = 'EN_TRANSITO' THEN
    IF v_clean_text LIKE '%llegue%' OR v_clean_text LIKE '%llegado%' OR v_clean_text LIKE '%estoy en destino%' OR v_clean_text LIKE '%ingres%' THEN
      v_nuevo_estado := 'EN_DESCARGA';
    END IF;
  ELSIF v_mision_estado = 'EN_DESCARGA' THEN
    IF v_clean_text LIKE '%termine%' OR v_clean_text LIKE '%vacio%' OR v_clean_text LIKE '%descargado%' OR v_clean_text LIKE '%listo%' OR v_clean_text LIKE '%complete%' THEN
      v_nuevo_estado := 'MISION_COMPLETADA';
    END IF;
  END IF;

  -- Si el estado cambió, actualizar remitos e insertar en historial_eventos
  IF v_nuevo_estado <> v_mision_estado THEN
    UPDATE public.remitos
    SET mision_estado = v_nuevo_estado,
        ultimo_mensaje_chofer_at = NOW(),
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
        'comentarios', format('Mensaje del chofer: "%s"', NEW.body_text)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Crear el trigger AFTER INSERT en conversation_messages
CREATE OR REPLACE TRIGGER trg_fsm_text_transition
AFTER INSERT ON public.conversation_messages
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_fsm_text_transition();
