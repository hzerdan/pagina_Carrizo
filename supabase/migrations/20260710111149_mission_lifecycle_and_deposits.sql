-- Migration: Mission Lifecycle and Deposits Evolution
-- Created: 2026-07-10 11:11:49

-- 1. Crear tipo ENUM deposito_funcion
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deposito_funcion') THEN
    CREATE TYPE public.deposito_funcion AS ENUM ('CARGA', 'DESCARGA', 'AMBAS');
  END IF;
END $$;

-- 2. Evolución de la tabla depositos
ALTER TABLE public.depositos ADD COLUMN IF NOT EXISTS funcion public.deposito_funcion DEFAULT 'AMBAS';
ALTER TABLE public.depositos ADD COLUMN IF NOT EXISTS google_maps_link text;

-- 3. Evolución de la tabla catalogo_tareas_control
ALTER TABLE public.catalogo_tareas_control ADD COLUMN IF NOT EXISTS gracia_minutos_default integer DEFAULT 30;
ALTER TABLE public.catalogo_tareas_control ADD COLUMN IF NOT EXISTS reintentos_max_default integer DEFAULT 2;

-- 4. Evolución de la tabla remitos
ALTER TABLE public.remitos ADD COLUMN IF NOT EXISTS deposito_carga_id integer REFERENCES public.depositos(id) ON DELETE SET NULL;
ALTER TABLE public.remitos ADD COLUMN IF NOT EXISTS deposito_descarga_id integer REFERENCES public.depositos(id) ON DELETE SET NULL;
ALTER TABLE public.remitos ADD COLUMN IF NOT EXISTS mision_estado text DEFAULT 'OPERACION_PENDIENTE';
ALTER TABLE public.remitos ADD COLUMN IF NOT EXISTS ultimo_mensaje_chofer_at timestamp with time zone DEFAULT now();
ALTER TABLE public.remitos ADD COLUMN IF NOT EXISTS fecha_hora_carga_estimada timestamp with time zone;
ALTER TABLE public.remitos ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;

-- Sincronizar fecha_hora_carga_estimada inicial con fecha_hora_estimada_carga
UPDATE public.remitos SET fecha_hora_carga_estimada = fecha_hora_estimada_carga WHERE fecha_hora_carga_estimada IS NULL;
