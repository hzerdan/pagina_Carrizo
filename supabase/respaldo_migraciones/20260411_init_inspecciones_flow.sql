BEGIN;

-- 1. Añadir columnas de URLs a inspecciones
ALTER TABLE public.inspecciones
ADD COLUMN IF NOT EXISTS planilla_personalizada_url text,
ADD COLUMN IF NOT EXISTS planilla_completada_url text;

-- 2. Añadir columna inspeccion_id a historial_eventos
ALTER TABLE public.historial_eventos
ADD COLUMN IF NOT EXISTS inspeccion_id bigint REFERENCES public.inspecciones(id);

-- 3. Modificar constraint de tipo_entidad en magic_links
ALTER TABLE public.magic_links DROP CONSTRAINT IF EXISTS magic_links_tipo_entidad_check;
ALTER TABLE public.magic_links ADD CONSTRAINT magic_links_tipo_entidad_check 
  CHECK (tipo_entidad IN ('PEDIDO', 'OC', 'REMITO', 'INSPECCION', 'USUARIO', 'CLIENTE', 'PROVEEDOR', 'OTRO'));

-- 4. Función de auditoría CORREGIDA
CREATE OR REPLACE FUNCTION public.log_inspeccion_evento(
    p_inspeccion_id bigint,
    p_accion text,
    p_usuario_actor text,
    p_detalles jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido RECORD;
    v_count integer := 0;
BEGIN
    -- Insertar un evento en historial_eventos por cada pedido vinculado
    -- CORRECCIÓN: Usamos pedido_instance_id (nombre real de la columna)
    FOR v_pedido IN 
        SELECT pedido_instance_id FROM public.inspeccion_items_pedido WHERE inspeccion_id = p_inspeccion_id
    LOOP
        INSERT INTO public.historial_eventos (
            pedido_instance_id,
            inspeccion_id,
            event_type,      -- Nombre real
            description,     -- Nombre real
            user_actor,      -- Nombre real
            details,         -- Nombre real
            timestamp        -- Nombre real
        ) VALUES (
            v_pedido.pedido_instance_id,
            p_inspeccion_id,
            'STATE_TRANSITION', 
            p_accion,
            p_usuario_actor,
            p_detalles,
            now()
        );
        v_count := v_count + 1;
    END LOOP;

    -- Fallback si no tuviera pedidos
    IF v_count = 0 THEN
        INSERT INTO public.historial_eventos (
            inspeccion_id,
            event_type,
            description,
            user_actor,
            details,
            timestamp
        ) VALUES (
            p_inspeccion_id,
            'STATE_TRANSITION',
            p_accion,
            p_usuario_actor,
            p_detalles,
            now()
        );
    END IF;
END;
$$;

-- 5. Trigger para actualización dinámica del Magic Link
CREATE OR REPLACE FUNCTION public.fn_trg_inspecciones_sync_magic_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.fecha_hora_carga_pactada IS DISTINCT FROM OLD.fecha_hora_carga_pactada THEN
        UPDATE public.magic_links
        SET expires_at = NEW.fecha_hora_carga_pactada + INTERVAL '48 hours'
        WHERE instancia_id = NEW.id 
          AND tipo_entidad = 'INSPECCION' 
          AND used_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspeccion_update_magic_link ON public.inspecciones;
CREATE TRIGGER trg_inspeccion_update_magic_link
AFTER UPDATE OF fecha_hora_carga_pactada ON public.inspecciones
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_inspecciones_sync_magic_link();

-- 6. RPC para recepcionar resultados (Quema de token)
CREATE OR REPLACE FUNCTION public.inspeccion_completar_resultados(
    p_token text,
    p_archivo_url text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_magic_link RECORD;
    v_inspeccion_id bigint;
BEGIN
    SELECT * INTO v_magic_link FROM public.magic_links WHERE token::text = p_token;
    IF NOT FOUND THEN RAISE EXCEPTION 'Token inválido.'; END IF;
    IF v_magic_link.expires_at < now() THEN RAISE EXCEPTION 'Expirado.'; END IF;
    IF v_magic_link.used_at IS NOT NULL THEN RAISE EXCEPTION 'Ya usado.'; END IF;

    v_inspeccion_id := v_magic_link.instancia_id;

    UPDATE public.magic_links SET used_at = now() WHERE token::text = p_token;
    UPDATE public.inspecciones SET planilla_completada_url = p_archivo_url WHERE id = v_inspeccion_id;

    PERFORM public.log_inspeccion_evento(v_inspeccion_id, 'RESULTADOS_SUBIDOS', 'INSPECTOR', jsonb_build_object('url', p_archivo_url));
    PERFORM public.inspeccion_intentar_transicion(v_inspeccion_id, '3.D2', 'INSPECTOR');

    RETURN true;
END;
$$;

-- 7. RPC seguro para obtener datos de la inspección a través del token
CREATE OR REPLACE FUNCTION public.get_inspeccion_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_magic_link RECORD;
    v_inspeccion RECORD;
    v_inspector_nombre text;
BEGIN
    SELECT * INTO v_magic_link FROM public.magic_links WHERE token = p_token;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token inválido o no encontrado.';
    END IF;

    IF v_magic_link.expires_at < now() THEN
        RAISE EXCEPTION 'El enlace ha expirado.';
    END IF;

    IF v_magic_link.used_at IS NOT NULL THEN
        RAISE EXCEPTION 'El enlace ya ha sido utilizado.';
    END IF;

    IF v_magic_link.tipo_entidad != 'INSPECCION' THEN
        RAISE EXCEPTION 'El enlace no corresponde a una inspección.';
    END IF;

    SELECT * INTO v_inspeccion FROM public.inspecciones WHERE id = v_magic_link.instancia_id;
    SELECT nombre_completo INTO v_inspector_nombre FROM public.personal_ac WHERE id = v_inspeccion.inspector_id;

    RETURN jsonb_build_object(
        'id', v_inspeccion.id,
        'fecha_pactada', v_inspeccion.fecha_hora_carga_pactada,
        'tipo_carga', v_inspeccion.tipo_carga,
        'inspector_nombre', v_inspector_nombre,
        'planilla_personalizada_url', v_inspeccion.planilla_personalizada_url
    );
END;
$$;

COMMIT;
