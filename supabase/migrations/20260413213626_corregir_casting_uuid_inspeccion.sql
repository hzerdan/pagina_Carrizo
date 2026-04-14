BEGIN;

-- 1. Corregir función de consulta por token
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
    -- Aplicamos ::uuid al parámetro para que coincida con el tipo de la columna
    SELECT * INTO v_magic_link 
    FROM public.magic_links 
    WHERE token = p_token::uuid; 
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token inválido o no encontrado.';
    END IF;

    IF v_magic_link.expires_at < now() THEN
        RAISE EXCEPTION 'El enlace ha expirado.';
    END IF;

    IF v_magic_link.used_at IS NOT NULL THEN
        RAISE EXCEPTION 'El enlace ya ha sido utilizado.';
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

-- 2. Corregir función de completar resultados
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
    -- Aplicamos ::uuid aquí también
    SELECT * INTO v_magic_link 
    FROM public.magic_links 
    WHERE token = p_token::uuid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token inválido.';
    END IF;

    IF v_magic_link.expires_at < now() THEN
        RAISE EXCEPTION 'Expirado.';
    END IF;

    IF v_magic_link.used_at IS NOT NULL THEN
        RAISE EXCEPTION 'Ya usado.';
    END IF;

    v_inspeccion_id := v_magic_link.instancia_id;

    UPDATE public.magic_links SET used_at = now() WHERE token = p_token::uuid;
    UPDATE public.inspecciones SET planilla_completada_url = p_archivo_url WHERE id = v_inspeccion_id;

    PERFORM public.log_inspeccion_evento(v_inspeccion_id, 'RESULTADOS_SUBIDOS', 'INSPECTOR', jsonb_build_object('url', p_archivo_url));
    PERFORM public.inspeccion_intentar_transicion(v_inspeccion_id, '3.D3', 'INSPECTOR');

    RETURN true;
END;
$$;

COMMIT;