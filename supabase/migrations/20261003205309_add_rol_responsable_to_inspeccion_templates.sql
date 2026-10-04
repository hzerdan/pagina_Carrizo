-- Migration: Add rol_responsable column to inspeccion_templates
-- Permite distinguir entre plantillas de responsabilidad del Inspector y del Supervisor
-- Valores permitidos: 'Inspector', 'Supervisor'
-- Valor por defecto: 'Inspector'

DO $$
BEGIN
    -- 1. Agregar columna rol_responsable si no existe
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'inspeccion_templates' 
          AND column_name = 'rol_responsable'
    ) THEN
        ALTER TABLE public.inspeccion_templates 
        ADD COLUMN rol_responsable text NOT NULL DEFAULT 'Inspector';
    END IF;

    -- 2. Asegurar que filas preexistentes tengan 'Inspector' si hubiera valores nulos
    UPDATE public.inspeccion_templates 
    SET rol_responsable = 'Inspector' 
    WHERE rol_responsable IS NULL;

    -- 3. Agregar constraint de check si no existe
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'inspeccion_templates_rol_responsable_check'
    ) THEN
        ALTER TABLE public.inspeccion_templates 
        ADD CONSTRAINT inspeccion_templates_rol_responsable_check 
        CHECK (rol_responsable IN ('Inspector', 'Supervisor'));
    END IF;
END $$;

COMMENT ON COLUMN public.inspeccion_templates.rol_responsable IS 'Rol responsable de completar la plantilla: Inspector o Supervisor';
