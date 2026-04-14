BEGIN;

CREATE OR REPLACE FUNCTION public.actualizar_datos_inspeccion(
    p_id bigint,
    p_fecha timestamp with time zone,
    p_lugar_id integer,
    p_inspector_id integer,
    p_usuario_actor text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inspeccion RECORD;
    v_cambios jsonb := '{}'::jsonb;
BEGIN
    -- Verificar existencia y estado
    SELECT * INTO v_inspeccion FROM public.inspecciones WHERE id = p_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inspección no encontrada.';
    END IF;

    IF v_inspeccion.export_doc_status NOT IN ('3.D0', '3.D1', '3.D2') THEN
        RAISE EXCEPTION 'No se pueden modificar datos en estado %', v_inspeccion.export_doc_status;
    END IF;

    -- Validar cambios
    IF v_inspeccion.fecha_hora_carga_pactada IS DISTINCT FROM p_fecha THEN
        v_cambios := v_cambios || jsonb_build_object('fecha_hora_carga_pactada', p_fecha);
    END IF;

    IF v_inspeccion.lugar_carga_id IS DISTINCT FROM p_lugar_id THEN
        v_cambios := v_cambios || jsonb_build_object('lugar_carga_id', p_lugar_id);
    END IF;

    IF v_inspeccion.inspector_id IS DISTINCT FROM p_inspector_id THEN
        v_cambios := v_cambios || jsonb_build_object('inspector_id', p_inspector_id);
    END IF;

    -- Si hay cambios
    IF v_cambios != '{}'::jsonb THEN
        -- Aplicar actualización
        UPDATE public.inspecciones 
        SET 
            fecha_hora_carga_pactada = p_fecha,
            lugar_carga_id = p_lugar_id,
            inspector_id = p_inspector_id
        WHERE id = p_id;

        -- Inactivar Magic Links si el inspector cambió
        IF v_inspeccion.inspector_id IS DISTINCT FROM p_inspector_id THEN
            UPDATE public.magic_links 
            SET used_at = now() 
            WHERE instancia_id = p_id 
              AND tipo_entidad = 'INSPECCION' 
              AND used_at IS NULL;
        END IF;

        -- Guardar auditoría
        PERFORM public.log_inspeccion_evento(
            p_id, 
            'DATOS_INSPECCION_ACTUALIZADOS', 
            p_usuario_actor, 
            v_cambios
        );
    END IF;

    RETURN true;
END;
$$;

COMMIT;
