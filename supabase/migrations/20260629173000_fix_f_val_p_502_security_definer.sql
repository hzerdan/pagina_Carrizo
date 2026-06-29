-- Modificar f_val_p_502 a SECURITY DEFINER para evitar problemas de RLS al obtener el nombre del operador
CREATE OR REPLACE FUNCTION public.f_val_p_502(p_instancia_id bigint, p_datos jsonb) RETURNS jsonb 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_remito_id BIGINT;
    v_operador_id INT;
    v_operador_nombre TEXT;
BEGIN
    SELECT r.id, r.operador_id, p.nombre_completo INTO v_remito_id, v_operador_id, v_operador_nombre
    FROM public.remito_items ri 
    JOIN public.remitos r ON ri.remito_id = r.id
    LEFT JOIN public.personal_ac p ON r.operador_id = p.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN 
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.'); 
    END IF;

    IF v_operador_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'SUCCESS', 
            'message', 'Operador asignado: ' || v_operador_nombre, 
            'checked_value', to_jsonb(v_operador_id)
        );
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta asignar operador al remito.');
    END IF;
END;
$$;
