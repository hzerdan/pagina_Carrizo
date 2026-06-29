-- Update f_val_p_324 to check columns first, then fall back to metadata_extraida
CREATE OR REPLACE FUNCTION public.f_val_p_324(p_instancia_id bigint, p_datos jsonb) RETURNS jsonb 
LANGUAGE plpgsql AS $$
DECLARE
    v_remito_id BIGINT;
    v_fecha_col TIMESTAMP WITH TIME ZONE;
    v_fecha TEXT;
    v_meta JSONB;
BEGIN
    SELECT r.id, r.fecha_hora_estimada_carga, r.metadata_extraida
    INTO v_remito_id, v_fecha_col, v_meta
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    IF v_fecha_col IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'SUCCESS', 
            'message', 'Fecha de carga estimada: ' || to_char(v_fecha_col AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'), 
            'checked_value', to_jsonb(v_fecha_col)
        );
    END IF;

    v_fecha := COALESCE(
        v_meta->>'fecha_hora_estimada_carga', 
        v_meta->>'fecha_hora_carga_estimada', 
        v_meta->>'fecha_carga'
    );

    IF v_fecha IS NOT NULL AND TRIM(v_fecha) != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Fecha de carga estimada: ' || v_fecha, 'checked_value', to_jsonb(v_fecha));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta la fecha de carga estimada.');
    END IF;
END;
$$;

-- Update f_val_p_327 to check columns first, then fall back to metadata_extraida
CREATE OR REPLACE FUNCTION public.f_val_p_327(p_instancia_id bigint, p_datos jsonb) RETURNS jsonb 
LANGUAGE plpgsql AS $$
DECLARE
    v_remito_id BIGINT;
    v_fecha_col TIMESTAMP WITH TIME ZONE;
    v_fecha TEXT;
    v_meta JSONB;
BEGIN
    SELECT r.id, r.fecha_probable_entrega, r.metadata_extraida
    INTO v_remito_id, v_fecha_col, v_meta
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    IF v_fecha_col IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'SUCCESS', 
            'message', 'Fecha de entrega final: ' || to_char(v_fecha_col AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'), 
            'checked_value', to_jsonb(v_fecha_col)
        );
    END IF;

    v_fecha := COALESCE(
        v_meta->>'fecha_probable_entrega',
        v_meta->>'fecha_entrega', 
        v_meta->>'fecha_hora_entrega_estimada', 
        v_meta->>'fecha_entrega_final'
    );

    IF v_fecha IS NOT NULL AND TRIM(v_fecha) != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Fecha de entrega final: ' || v_fecha, 'checked_value', to_jsonb(v_fecha));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta la fecha de entrega final.');
    END IF;
END;
$$;
