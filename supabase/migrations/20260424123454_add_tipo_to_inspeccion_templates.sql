-- Migration: Add tipo column to inspeccion_templates
-- Values: 'Reembolse', 'Consolidación', 'Genérica'
-- Default: 'Consolidación'

ALTER TABLE "public"."inspeccion_templates" 
ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'Consolidación';

ALTER TABLE "public"."inspeccion_templates" 
ADD CONSTRAINT "inspeccion_templates_tipo_check" 
CHECK ("tipo" IN ('Reembolse', 'Consolidación', 'Genérica'));

-- Update existing rows to ensure they have the default value (though DEFAULT already handles this for new columns)
UPDATE "public"."inspeccion_templates" SET "tipo" = 'Consolidación' WHERE "tipo" IS NULL;
