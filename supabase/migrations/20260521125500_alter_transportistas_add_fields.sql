-- Renombrar columna y su restricción única para estandarizar
ALTER TABLE "public"."transportistas" RENAME COLUMN "nombre_empresa" TO "razon_social";
ALTER TABLE "public"."transportistas" RENAME CONSTRAINT "transportistas_nombre_empresa_key" TO "transportistas_razon_social_key";

-- Agregar campos faltantes detectados
ALTER TABLE "public"."transportistas" ADD COLUMN IF NOT EXISTS "email_general" text;
ALTER TABLE "public"."transportistas" ADD COLUMN IF NOT EXISTS "telefono_general" text;
