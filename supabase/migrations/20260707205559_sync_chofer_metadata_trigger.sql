-- 1. Crear la función del trigger para sincronizar metadata_extraida cuando cambia chofer_id
CREATE OR REPLACE FUNCTION public.trg_fn_sync_chofer_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nombre text;
  v_dni text;
  v_tel text;
BEGIN
  IF NEW.chofer_id IS NOT NULL THEN
    -- Obtener datos actualizados del chofer desde public.choferes
    SELECT nombre_completo, dni, telefono 
    INTO v_nombre, v_dni, v_tel
    FROM public.choferes 
    WHERE id = NEW.chofer_id;
    
    IF v_nombre IS NOT NULL THEN
      NEW.metadata_extraida := COALESCE(NEW.metadata_extraida, '{}'::jsonb) || jsonb_build_object(
        'nombre_chofer', v_nombre,
        'dni_chofer', COALESCE(v_dni, ''),
        'telefono_chofer', COALESCE(v_tel, '')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Crear el trigger BEFORE INSERT OR UPDATE en remitos
CREATE OR REPLACE TRIGGER trg_sync_chofer_metadata
BEFORE INSERT OR UPDATE OF chofer_id ON public.remitos
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_sync_chofer_metadata();

-- 3. Backfill para corregir y sincronizar metadata_extraida en todos los remitos existentes
UPDATE public.remitos r
SET metadata_extraida = COALESCE(r.metadata_extraida, '{}'::jsonb) || jsonb_build_object(
  'nombre_chofer', c.nombre_completo,
  'dni_chofer', COALESCE(c.dni, ''),
  'telefono_chofer', COALESCE(c.telefono, '')
)
FROM public.choferes c
WHERE r.chofer_id = c.id;
