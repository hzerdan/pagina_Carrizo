-- Add estado column to catalogo_tareas_control table
ALTER TABLE public.catalogo_tareas_control 
ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO'::text;

-- Update existing records to have 'ACTIVO' status (if any)
UPDATE public.catalogo_tareas_control SET estado = 'ACTIVO' WHERE estado IS NULL;

-- Add check constraint for valid states
ALTER TABLE public.catalogo_tareas_control 
ADD CONSTRAINT catalogo_tareas_control_estado_check 
CHECK (estado = ANY (ARRAY['ACTIVO'::text, 'INACTIVO'::text]));
