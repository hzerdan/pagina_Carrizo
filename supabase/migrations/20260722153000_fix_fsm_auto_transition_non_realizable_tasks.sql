-- Migration: Fix FSM auto transition logic to handle non-realizable, omitted, and reported tasks
CREATE OR REPLACE FUNCTION public.trg_fn_fsm_auto_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE
  v_nuevo_estado text;
  v_next_estado text;
  v_all_done boolean;
BEGIN
  IF NEW.protocolo_control IS NULL OR jsonb_array_length(NEW.protocolo_control) = 0 THEN
    RETURN NEW;
  END IF;

  v_nuevo_estado := COALESCE(NEW.mision_estado, 'OPERACION_PENDIENTE');

  LOOP
    -- Si estamos en un estado final o de espera externa específica, detener el avance automático en esta pasada
    IF v_nuevo_estado IN ('OPERACION_PENDIENTE', 'MISION_COMPLETADA') THEN
      EXIT;
    END IF;

    -- Verificar si todas las tareas de este estado están procesadas (diferentes de PENDIENTE)
    SELECT COALESCE(bool_and(
      COALESCE((elem->>'asignada_a_chofer')::boolean, true) = false OR
      elem->>'estado' IN ('COMPLETADO', 'REPORTADO_CHOFER', 'NO_REALIZABLE', 'OMITIDO', 'NO_APLICA', 'RECHAZADO')
    ), true)
    INTO v_all_done
    FROM jsonb_array_elements(NEW.protocolo_control) AS elem
    WHERE elem->>'estado_id' = v_nuevo_estado;

    IF v_all_done THEN
      v_next_estado := public.get_next_mision_estado(NEW.id, v_nuevo_estado);
      IF v_next_estado IS NOT NULL AND v_next_estado <> v_nuevo_estado THEN
        v_nuevo_estado := v_next_estado;
      ELSE
        EXIT;
      END IF;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  -- Si cambió el estado, actualizar datos correspondientes
  IF v_nuevo_estado <> COALESCE(NEW.mision_estado, 'OPERACION_PENDIENTE') THEN
    NEW.mision_estado := v_nuevo_estado;
    NEW.ultimo_mensaje_chofer_at := NOW();
    NEW.retry_count := 0;
  END IF;

  RETURN NEW;
END;
$$;

-- Recalcular / re-disparar autotransición FSM para el remito #21
UPDATE public.remitos
SET protocolo_control = protocolo_control
WHERE id = 21;
