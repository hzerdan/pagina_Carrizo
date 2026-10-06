-- ============================================================================
-- Migración: Permitir tipo_entidad 'GF_PAGO_ANTICIPADO' en tabla magic_links
-- Fecha: 2026-10-05
-- Reglas AGENTS.md: Idempotencia en DDL
-- ============================================================================

ALTER TABLE public.magic_links 
  DROP CONSTRAINT IF EXISTS magic_links_tipo_entidad_check;

ALTER TABLE public.magic_links 
  ADD CONSTRAINT magic_links_tipo_entidad_check 
  CHECK (tipo_entidad = ANY (ARRAY[
    'PEDIDO'::text, 
    'OC'::text, 
    'REMITO'::text, 
    'INSPECCION'::text, 
    'USUARIO'::text, 
    'CLIENTE'::text, 
    'PROVEEDOR'::text, 
    'OTRO'::text, 
    'GF_PAGO_ANTICIPADO'::text
  ]));
