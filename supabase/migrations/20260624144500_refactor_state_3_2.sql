-- Migración: Validación de Requisitos de Transporte (Estado 3.2) y RPC Checklist
-- Creada en: 2026-06-24

-- 1. Funciones de validación f_val_p_321 a f_val_p_331

-- VAL_P_321: Nombre del chofer (Transporte)
CREATE OR REPLACE FUNCTION "public"."f_val_p_321"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_chofer_id INT;
    v_meta JSONB;
    v_nombre TEXT;
BEGIN
    SELECT r.id, r.chofer_id, r.metadata_extraida
    INTO v_remito_id, v_chofer_id, v_meta
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    IF v_chofer_id IS NOT NULL THEN
        SELECT nombre_completo INTO v_nombre FROM public.choferes WHERE id = v_chofer_id;
    END IF;

    v_nombre := COALESCE(v_nombre, v_meta->>'nombre_chofer_nuevo', v_meta->>'nombre_chofer');

    IF v_nombre IS NOT NULL AND TRIM(v_nombre) != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Nombre del chofer: ' || v_nombre, 'checked_value', to_jsonb(v_nombre));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta el nombre del chofer.');
    END IF;
END;
$$;
-- VAL_P_322: Celular del chofer (Transporte)
CREATE OR REPLACE FUNCTION "public"."f_val_p_322"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_chofer_id INT;
    v_meta JSONB;
    v_telefono TEXT;
BEGIN
    SELECT r.id, r.chofer_id, r.metadata_extraida
    INTO v_remito_id, v_chofer_id, v_meta
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    IF v_chofer_id IS NOT NULL THEN
        SELECT telefono INTO v_telefono FROM public.choferes WHERE id = v_chofer_id;
    END IF;

    v_telefono := COALESCE(v_telefono, v_meta->>'celular_chofer_nuevo', v_meta->>'telefono_chofer');

    IF v_telefono IS NOT NULL AND TRIM(v_telefono) != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Celular del chofer: ' || v_telefono, 'checked_value', to_jsonb(v_telefono));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta el celular del chofer.');
    END IF;
END;
$$;
-- VAL_P_323: Satelital del camión (Transporte)
CREATE OR REPLACE FUNCTION "public"."f_val_p_323"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_camion_id INT;
    v_meta JSONB;
    v_patente TEXT;
    v_remito_patente TEXT;
BEGIN
    SELECT r.id, r.camion_id, r.metadata_extraida, r.camion_patente
    INTO v_remito_id, v_camion_id, v_meta, v_remito_patente
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    IF v_camion_id IS NOT NULL THEN
        SELECT patente INTO v_patente FROM public.camiones WHERE id = v_camion_id;
    END IF;

    v_patente := COALESCE(v_patente, v_meta->>'patente_chasis', v_meta->>'camion_patente', v_remito_patente);

    IF v_patente IS NOT NULL AND TRIM(v_patente) != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Patente/Satelital del camión: ' || v_patente, 'checked_value', to_jsonb(v_patente));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta patente/satelital del camión.');
    END IF;
END;
$$;
-- VAL_P_324: Fecha de carga estimada (Transporte)
CREATE OR REPLACE FUNCTION "public"."f_val_p_324"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_fecha TEXT;
    v_meta JSONB;
BEGIN
    SELECT r.id, r.metadata_extraida
    INTO v_remito_id, v_meta
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    v_fecha := COALESCE(v_meta->>'fecha_hora_estimada_carga', v_meta->>'fecha_hora_carga_estimada', v_meta->>'fecha_carga');

    IF v_fecha IS NOT NULL AND TRIM(v_fecha) != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Fecha de carga estimada: ' || v_fecha, 'checked_value', to_jsonb(v_fecha));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta la fecha de carga estimada.');
    END IF;
END;
$$;
-- VAL_P_325: Tarifa del transporte
CREATE OR REPLACE FUNCTION "public"."f_val_p_325"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_tarifa TEXT;
    v_meta JSONB;
BEGIN
    SELECT r.id, r.metadata_extraida
    INTO v_remito_id, v_meta
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    v_tarifa := COALESCE(v_meta->>'tarifa', v_meta->>'tarifa_transporte', v_meta->>'valor_flete');

    IF v_tarifa IS NOT NULL AND TRIM(v_tarifa) != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Tarifa del transporte: ' || v_tarifa, 'checked_value', to_jsonb(v_tarifa));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta la tarifa del transporte.');
    END IF;
END;
$$;
-- VAL_P_326: Tareas del chofer (Transporte)
CREATE OR REPLACE FUNCTION "public"."f_val_p_326"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_protocolo JSONB;
BEGIN
    SELECT r.id, r.protocolo_control
    INTO v_remito_id, v_protocolo
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    IF v_protocolo IS NOT NULL AND jsonb_array_length(v_protocolo) > 0 THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Protocolo de tareas del chofer defined.', 'checked_value', v_protocolo);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta definir las tareas del chofer.');
    END IF;
END;
$$;
-- VAL_P_327: Fechas de entrega final (Transporte)
CREATE OR REPLACE FUNCTION "public"."f_val_p_327"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_fecha TEXT;
    v_meta JSONB;
BEGIN
    SELECT r.id, r.metadata_extraida
    INTO v_remito_id, v_meta
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    v_fecha := COALESCE(v_meta->>'fecha_entrega', v_meta->>'fecha_hora_entrega_estimada', v_meta->>'fecha_entrega_final');

    IF v_fecha IS NOT NULL AND TRIM(v_fecha) != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Fecha de entrega final: ' || v_fecha, 'checked_value', to_jsonb(v_fecha));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta la fecha de entrega final.');
    END IF;
END;
$$;
-- VAL_P_328: Flete Corto (Transporte)
CREATE OR REPLACE FUNCTION "public"."f_val_p_328"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_flete_corto BOOLEAN;
    v_meta JSONB;
BEGIN
    SELECT r.id, r.metadata_extraida
    INTO v_remito_id, v_meta
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    IF v_meta ? 'es_flete_corto' THEN
        v_flete_corto := (v_meta->>'es_flete_corto')::boolean;
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Flete Corto: ' || CASE WHEN v_flete_corto THEN 'SI' ELSE 'NO' END, 'checked_value', to_jsonb(v_flete_corto));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta definir si es Flete Corto.');
    END IF;
END;
$$;
-- VAL_P_329: Con Reembolse (Transporte)
CREATE OR REPLACE FUNCTION "public"."f_val_p_329"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_reembolse BOOLEAN;
    v_meta JSONB;
BEGIN
    SELECT r.id, r.metadata_extraida
    INTO v_remito_id, v_meta
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    IF v_meta ? 'debe_pasar_por_reembolse' THEN
        v_reembolse := (v_meta->>'debe_pasar_por_reembolse')::boolean;
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Con Reembolse: ' || CASE WHEN v_reembolse THEN 'SI' ELSE 'NO' END, 'checked_value', to_jsonb(v_reembolse));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta definir si requiere Reembolse.');
    END IF;
END;
$$;
-- VAL_P_330: Cantidad de este viaje (Transporte)
CREATE OR REPLACE FUNCTION "public"."f_val_p_330"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_cantidad NUMERIC;
BEGIN
    SELECT r.id, ri.cantidad
    INTO v_remito_id, v_cantidad
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    IF v_cantidad IS NOT NULL AND v_cantidad > 0 THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Cantidad del viaje: ' || v_cantidad || ' TN', 'checked_value', to_jsonb(v_cantidad));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta la cantidad de este viaje.');
    END IF;
END;
$$;
-- VAL_P_331: Autorización de carga (Transporte)
CREATE OR REPLACE FUNCTION "public"."f_val_p_331"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" AS $$
DECLARE
    v_remito_id BIGINT;
    v_aut TEXT;
    v_meta JSONB;
BEGIN
    SELECT r.id, r.metadata_extraida
    INTO v_remito_id, v_meta
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.');
    END IF;

    IF v_meta ? 'autorizacion_carga' THEN
        v_aut := v_meta->>'autorizacion_carga';
        IF v_aut IS NOT NULL AND TRIM(v_aut) != '' AND LOWER(v_aut) != 'false' THEN
            RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Autorización de carga: ' || v_aut, 'checked_value', to_jsonb(v_aut));
        ELSE
            RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta la autorización de carga.');
        END IF;
    ELSE
        -- Si no está el campo en la metadata, por defecto es SUCCESS (autorizado al tener remito)
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Autorización de carga implícita por remito.', 'checked_value', true);
    END IF;
END;
$$;
-- 2. Función RPC get_checklist_instancia

CREATE OR REPLACE FUNCTION "public"."get_checklist_instancia"("p_instancia_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_state_id INT;
    v_current_data JSONB;
    v_tipo_mercado TEXT;
    v_prefix_to_exclude TEXT;
    v_state_1_1_id INT;
    r RECORD;
    v_func_name TEXT;
    v_result JSONB;
    v_status TEXT;
    v_message TEXT;
    v_cumplido BOOLEAN;
    v_checklist JSONB := '[]'::jsonb;
BEGIN
    -- Obtener datos de la instancia
    SELECT
        pi.current_state_id, p.tipo_mercado, pi.current_data
    INTO v_current_state_id, v_tipo_mercado, v_current_data
    FROM public.pedido_instancias pi
    JOIN public.pedidos p ON pi.pedido_id = p.id
    WHERE pi.id = p_instancia_id;

    IF v_current_state_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Instancia no encontrada.');
    END IF;

    -- Obtenemos el ID del estado 1.1
    SELECT id INTO v_state_1_1_id FROM public.state_definitions WHERE fsm_id = 1 AND state_code = '1.1';

    -- Determinar filtro de exclusión (mismo criterio de ejecutar_validaciones_iniciales)
    IF v_current_state_id = v_state_1_1_id THEN
        IF v_tipo_mercado = 'MI' THEN v_prefix_to_exclude := 'VAL_P_ME_%';
        ELSIF v_tipo_mercado = 'ME' THEN v_prefix_to_exclude := 'VAL_P_MI_%';
        ELSE v_prefix_to_exclude := '@@@@';
        END IF;
    ELSE
        v_prefix_to_exclude := '@@@@'; 
    END IF;

    -- Iterar sobre las validaciones requeridas
    FOR r IN (
        SELECT vd.validation_code, vd.name as validation_name, vd.is_blocking
        FROM public.validation_definitions vd
        JOIN public.state_validation_requirements svr ON vd.id = svr.validation_id
        WHERE svr.state_id = v_current_state_id
          AND vd.validation_code NOT LIKE v_prefix_to_exclude
        ORDER BY vd.is_blocking DESC, vd.name ASC
    )
    LOOP
        v_func_name := 'f_' || lower(r.validation_code);
        v_status := 'FAILURE';
        v_message := '';

        BEGIN
            EXECUTE format('SELECT %I(%L::bigint, %L::jsonb)', v_func_name, p_instancia_id, v_current_data)
            INTO v_result;
            v_status := v_result->>'status';
            v_message := COALESCE(v_result->>'message', '');
        EXCEPTION
            WHEN undefined_function THEN
                v_status := 'FAILURE';
                v_message := 'Validación pendiente o función de validación no definida.';
            WHEN others THEN
                v_status := 'FAILURE';
                v_message := 'Error al evaluar validación: ' || SQLERRM;
        END;

        v_cumplido := (v_status = 'SUCCESS');

        v_checklist := v_checklist || jsonb_build_array(jsonb_build_object(
            'codigo', r.validation_code,
            'nombre', r.validation_name,
            'es_bloqueante', r.is_blocking,
            'cumplido', v_cumplido,
            'mensaje', v_message
        ));
    END LOOP;

    RETURN v_checklist;
END;
$$;
-- 3. Grants de ejecución para las funciones

GRANT ALL ON FUNCTION "public"."f_val_p_321"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_321"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_321"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."f_val_p_322"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_322"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_322"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."f_val_p_323"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_323"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_323"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."f_val_p_324"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_324"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_324"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."f_val_p_325"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_325"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_325"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."f_val_p_326"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_326"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_326"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."f_val_p_327"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_327"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_327"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."f_val_p_328"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_328"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_328"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."f_val_p_329"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_329"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_329"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."f_val_p_330"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_330"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_330"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."f_val_p_331"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_331"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_331"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_checklist_instancia"("p_instancia_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_checklist_instancia"("p_instancia_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_checklist_instancia"("p_instancia_id" bigint) TO "service_role";
-- 4. Inserción de la transición automática FSM de 3.2 a 4

INSERT INTO public.fsm_transitions (from_state_id, to_state_id, trigger_type, priority)
VALUES (
    (SELECT id FROM public.state_definitions WHERE state_code = '3.2' AND fsm_id = 1),
    (SELECT id FROM public.state_definitions WHERE state_code = '4' AND fsm_id = 1),
    'ON_ALL_SUCCESS',
    1
) ON CONFLICT DO NOTHING;
