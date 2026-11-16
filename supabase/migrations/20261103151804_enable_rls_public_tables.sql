-- Migración: Habilitar Row Level Security (RLS) en 38 tablas públicas
-- Resuelve la advertencia crítica 'rls_disabled_in_public' reportada por el linter de seguridad de Supabase.
--
-- Estándar de acceso:
-- - Rol 'authenticated': Acceso total para usuarios autenticados del panel operativo.
-- - Rol 'service_role' (n8n / scripts backend): Posee 'bypassrls' nativo en PostgreSQL.
-- - Rol 'anon' (público sin autenticar): Acceso revocado por defecto a todas las tablas directas.
--   Los accesos públicos legítimos (Magic links / inspecciones) se canalizan mediante RPCs SECURITY DEFINER.

DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'alertas_escalamiento',
        'articulos',
        'camiones',
        'catalogo_tareas_control',
        'choferes',
        'clientes',
        'contactos',
        'debug_flags',
        'debug_log_fsm',
        'documentos',
        'fsm_definitions',
        'fsm_transitions',
        'historial_eventos',
        'inspeccion_templates',
        'logistica_politicas_notificacion',
        'logistica_politicas_notificacion_override',
        'lugares_pesaje',
        'magic_links',
        'message_media',
        'metadata_labels',
        'mision_estados_definicion',
        'mision_tipo_pasos',
        'mision_tipos',
        'mv_refresh_events',
        'oc_instancias',
        'ordenes_compra',
        'pedido_instancias',
        'pedidos',
        'proveedores',
        'remito_items',
        'remitos',
        'servicios',
        'state_validation_requirements',
        'status',
        'stock_estacion_intermedia',
        'transportistas',
        'validation_definitions',
        'vinculaciones_pedido_oc'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        -- 1. Habilitar RLS en la tabla
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        
        -- 2. Eliminar política previa si existiera para asegurar idempotencia
        EXECUTE format('DROP POLICY IF EXISTS "Permitir acceso total a usuarios autenticados" ON public.%I;', tbl);
        
        -- 3. Crear política permisiva para el rol autenticado
        EXECUTE format('CREATE POLICY "Permitir acceso total a usuarios autenticados" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;
