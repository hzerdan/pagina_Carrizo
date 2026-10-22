-- Migración: Corrección del trigger trg_remito_mision_completada para capturar transiciones originadas por actualización de protocolo_control
-- Fecha: 2026-10-22

-- 1. Eliminar trigger y función previas para reemplazo limpio
DROP TRIGGER IF EXISTS trg_remito_mision_completada ON public.remitos;
DROP FUNCTION IF EXISTS public.trg_fn_remito_mision_completada_sync();

-- 2. Definición canónica con guardia anti-recursión y sincronización de pedidos y calificaciones
CREATE OR REPLACE FUNCTION public.trg_fn_remito_mision_completada_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Evitar ejecución recursiva si ya estamos dentro de un trigger
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Solo actuar si efectivamente la misión pasó a MISION_COMPLETADA o el remito a FINALIZADO
  IF (NEW.mision_estado = 'MISION_COMPLETADA' OR NEW.estado_asignacion = 'FINALIZADO') THEN
    IF NEW.estado_asignacion <> 'FINALIZADO' THEN
      UPDATE public.remitos
      SET estado_asignacion = 'FINALIZADO'
      WHERE id = NEW.id AND estado_asignacion <> 'FINALIZADO';
    END IF;

    -- Sincronizar pedidos asociados
    PERFORM public.fn_finalizar_pedidos_de_remito(NEW.id);

    -- Evaluar y asentar la calificación del chofer y transportista en tiempo real
    PERFORM public.reevaluar_calificaciones(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Recrear el trigger AFTER UPDATE en remitos sin restricción de columnas en el evento
-- Se remueve 'OF mision_estado, estado_asignacion' para que PostgreSQL evalúe la condición WHEN
-- ante cualquier UPDATE (incluso si provino de cambios en protocolo_control vía n8n u otros triggers BEFORE)
CREATE TRIGGER trg_remito_mision_completada
  AFTER UPDATE ON public.remitos
  FOR EACH ROW
  WHEN (
    (OLD.mision_estado IS DISTINCT FROM NEW.mision_estado AND NEW.mision_estado = 'MISION_COMPLETADA')
    OR
    (OLD.estado_asignacion IS DISTINCT FROM NEW.estado_asignacion AND NEW.estado_asignacion = 'FINALIZADO')
  )
  EXECUTE FUNCTION public.trg_fn_remito_mision_completada_sync();

-- 4. Sincronización retroactiva de remitos ya finalizados pendientes de impactar en sus pedidos
DO $$
DECLARE
  v_r RECORD;
BEGIN
  FOR v_r IN 
    SELECT id 
    FROM public.remitos 
    WHERE (estado_asignacion = 'FINALIZADO' OR mision_estado = 'MISION_COMPLETADA')
      AND id NOT IN (54, 55)
    ORDER BY id
  LOOP
    PERFORM public.fn_finalizar_pedidos_de_remito(v_r.id);
    PERFORM public.reevaluar_calificaciones(v_r.id);
  END LOOP;
END;
$$;
