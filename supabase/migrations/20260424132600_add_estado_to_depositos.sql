-- Add estado column to depositos table
ALTER TABLE public.depositos 
ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO'::text;

-- Update existing records to have 'ACTIVO' status (if any)
UPDATE public.depositos SET estado = 'ACTIVO' WHERE estado IS NULL;

-- Add check constraint for valid states
ALTER TABLE public.depositos 
ADD CONSTRAINT depositos_estado_check 
CHECK (estado = ANY (ARRAY['ACTIVO'::text, 'INACTIVO'::text]));
