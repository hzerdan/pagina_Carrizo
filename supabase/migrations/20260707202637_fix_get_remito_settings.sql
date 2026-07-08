-- 1. Actualizar get_remito_setting_int para verificar existencia de columnas dinámicamente
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
  -- Buscar en overrides vigentes (si la columna existe)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'logistica_politicas_notificacion_override' 
      AND column_name = p_key
  ) THEN
    EXECUTE format(
      'SELECT %I FROM public.logistica_politicas_notificacion_override WHERE remito_id = $1 AND vigente = true LIMIT 1',
      p_key
    ) INTO v_val USING p_remito_id;

    IF v_val IS NOT NULL THEN
      RETURN v_val;
    END IF;
  END IF;

  -- Buscar en política activa estándar (si la columna existe)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'logistica_politicas_notificacion' 
      AND column_name = p_key
  ) THEN
    EXECUTE format(
      'SELECT %I FROM public.logistica_politicas_notificacion WHERE activa = true ORDER BY id ASC LIMIT 1',
      p_key
    ) INTO v_val;

    IF v_val IS NOT NULL THEN
      RETURN v_val;
    END IF;
  END IF;

  RETURN p_default;
END;
$$;

-- 2. Actualizar get_remito_setting_bool para verificar existencia de columnas dinámicamente
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
  -- Buscar en overrides vigentes (si la columna existe)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'logistica_politicas_notificacion_override' 
      AND column_name = p_key
  ) THEN
    EXECUTE format(
      'SELECT %I FROM public.logistica_politicas_notificacion_override WHERE remito_id = $1 AND vigente = true LIMIT 1',
      p_key
    ) INTO v_val USING p_remito_id;

    IF v_val IS NOT NULL THEN
      RETURN v_val;
    END IF;
  END IF;

  -- Buscar en política activa estándar (si la columna existe)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'logistica_politicas_notificacion' 
      AND column_name = p_key
  ) THEN
    EXECUTE format(
      'SELECT %I FROM public.logistica_politicas_notificacion WHERE activa = true ORDER BY id ASC LIMIT 1',
      p_key
    ) INTO v_val;

    IF v_val IS NOT NULL THEN
      RETURN v_val;
    END IF;
  END IF;

  RETURN p_default;
END;
$$;
