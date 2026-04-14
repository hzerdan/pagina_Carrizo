

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."event_type" AS ENUM (
    'STATE_TRANSITION',
    'VALIDATION_SUCCESS',
    'VALIDATION_FAILURE',
    'VALIDATION_DENIED',
    'ALARM_TRIGGERED',
    'INPUT_RECEIVED',
    'OUTPUT_SENT',
    'MANUAL_OVERRIDE',
    'INSTANCE_CREATED',
    'NOTE_ADDED',
    'INSTANCE_UPDATED',
    'VOTE_RECEIVED',
    'ROLLBACK_REMITO_RECOVERY',
    'DATA_UPDATE'
);


ALTER TYPE "public"."event_type" OWNER TO "postgres";


CREATE TYPE "public"."instance_status" AS ENUM (
    'ACTIVA',
    'COMPLETADA',
    'ANULADA',
    'RECHAZADA'
);


ALTER TYPE "public"."instance_status" OWNER TO "postgres";


CREATE TYPE "public"."transition_condition_type" AS ENUM (
    'ON_SUCCESS',
    'ON_FAILURE',
    'ON_DENIAL'
);


ALTER TYPE "public"."transition_condition_type" OWNER TO "postgres";


CREATE TYPE "public"."transition_trigger_type" AS ENUM (
    'ON_ALL_SUCCESS',
    'ON_VALIDATION_FAILURE',
    'ON_VALIDATION_DENIAL',
    'ON_INPUT_RECEIVED'
);


ALTER TYPE "public"."transition_trigger_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_datos_inspeccion"("p_id" bigint, "p_fecha" timestamp with time zone, "p_lugar_id" integer, "p_inspector_id" integer, "p_usuario_actor" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."actualizar_datos_inspeccion"("p_id" bigint, "p_fecha" timestamp with time zone, "p_lugar_id" integer, "p_inspector_id" integer, "p_usuario_actor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_instrucciones_remito"("p_referencia_externa" "text", "p_datos_instrucciones" "jsonb", "p_usuario_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_remito_id bigint;
    v_meta_actual JSONB;
    v_historial_nuevo JSONB;
    v_texto_nuevo TEXT;
    v_protocolo_nuevo JSONB;
BEGIN
    -- 1. Buscar Remito
    SELECT id, metadata_extraida INTO v_remito_id, v_meta_actual
    FROM public.remitos 
    WHERE remito_ref_externa = p_referencia_externa 
       OR remito_ref_externa = 'R'||p_referencia_externa 
    LIMIT 1;

    IF v_remito_id IS NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Remito no encontrado: ' || p_referencia_externa);
    END IF;

    -- 2. Extraer datos
    v_texto_nuevo := p_datos_instrucciones->>'instrucciones_texto';
    v_protocolo_nuevo := p_datos_instrucciones->'protocolo_control';

    -- 3. Actualizar Columnas Específicas
    UPDATE public.remitos 
    SET instrucciones_texto = v_texto_nuevo,
        protocolo_control = v_protocolo_nuevo
    WHERE id = v_remito_id;

    -- 4. Registrar en Historial (Metadata)
    v_meta_actual := COALESCE(v_meta_actual, '{}'::jsonb);
    
    -- Agregar entrada de log
    v_historial_nuevo := jsonb_build_object(
        'fecha', NOW(),
        'usuario', p_usuario_email,
        'evento', 'ACTUALIZACION_INSTRUCCIONES',
        'detalle', 'Se actualizó el protocolo de control y texto al chofer.'
    );

    -- Asegurar array historial
    IF NOT (v_meta_actual ? 'historial_cambios') THEN 
        v_meta_actual := v_meta_actual || jsonb_build_object('historial_cambios', '[]'::jsonb); 
    END IF;
    
    v_meta_actual := jsonb_set(v_meta_actual, '{historial_cambios}', (v_meta_actual->'historial_cambios') || v_historial_nuevo);
    
    -- Guardar metadata actualizada
    UPDATE public.remitos SET metadata_extraida = v_meta_actual WHERE id = v_remito_id;

    RETURN jsonb_build_object(
        'status', 'SUCCESS', 
        'message', 'Instrucciones actualizadas correctamente.',
        'remito_id', v_remito_id
    );
END;
$$;


ALTER FUNCTION "public"."actualizar_instrucciones_remito"("p_referencia_externa" "text", "p_datos_instrucciones" "jsonb", "p_usuario_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_y_revalidar"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_data JSONB;
    v_nuevo_data JSONB;
    v_summary JSONB;
    v_transition_result JSONB;
    v_current_state_id INT;
    v_state_code_before TEXT;
    v_state_code_after TEXT;
BEGIN
    -- Obtener estado inicial para comparar
    SELECT pi.current_state_id, sd.state_code, pi.current_data
    INTO v_current_state_id, v_state_code_before, v_current_data
    FROM pedido_instancias pi
    JOIN state_definitions sd ON pi.current_state_id = sd.id
    WHERE pi.id = p_instancia_id;

    -- Actualizar datos
    v_nuevo_data := v_current_data || p_datos_nuevos_json;
    UPDATE pedido_instancias SET current_data = v_nuevo_data WHERE id = p_instancia_id;

    -- Validaciones
    SELECT * FROM ejecutar_validaciones_iniciales(p_instancia_id, v_nuevo_data) INTO v_summary;

    -- Motor de Transición
    SELECT * FROM intentar_transicion_automatica_pedido(p_instancia_id) INTO v_transition_result;

    -- Obtener estado final
    SELECT sd.state_code INTO v_state_code_after
    FROM pedido_instancias pi JOIN state_definitions sd ON pi.current_state_id = sd.id
    WHERE pi.id = p_instancia_id;

    -- LOGGING CRÍTICO
    PERFORM log_fsm_debug(p_instancia_id, 'actualizar_y_revalidar', 
        'Comparacion Estados: ' || v_state_code_before || ' -> ' || v_state_code_after,
        jsonb_build_object('motor_result', v_transition_result, 'validaciones_result', v_summary)
    );

    -- MERGE INTELIGENTE:
    -- Si el estado CAMBIÓ, forzamos transicion_exitosa = true, independientemente de lo que diga el motor
    -- (Esto cubre el caso donde el motor retorna false porque ya está en el estado destino)
    IF v_state_code_before IS DISTINCT FROM v_state_code_after THEN
        v_summary := v_summary || v_transition_result || 
                     jsonb_build_object(
                         'transicion_exitosa', true, 
                         'nuevo_estado_code', v_state_code_after,
                         'mensaje_debug', 'Transición forzada por cambio de estado detectado'
                     );
    ELSE
        -- Si no cambió, respetamos lo que diga el motor
        v_summary := v_summary || v_transition_result;
    END IF;

    RETURN v_summary;
END;
$$;


ALTER FUNCTION "public"."actualizar_y_revalidar"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_y_revalidar_oc"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_data JSONB;
    v_nuevo_data JSONB;
    v_summary JSONB;
    v_transition_summary JSONB;
BEGIN
    -- 1. Obtener los datos actuales de la instancia de OC
    SELECT current_data
    INTO v_current_data
    FROM oc_instancias
    WHERE id = p_instancia_id;

    IF v_current_data IS NULL THEN
        RAISE EXCEPTION 'Instancia de OC ID % no encontrada.', p_instancia_id;
    END IF;

    -- 2. Fusionar los datos antiguos con los nuevos
    v_nuevo_data := v_current_data || p_datos_nuevos_json;

    -- 3. Actualizar la instancia con los datos fusionados
    UPDATE oc_instancias
    SET current_data = v_nuevo_data
    WHERE id = p_instancia_id;

    -- 4. Registrar la actualización en el historial
    INSERT INTO historial_eventos (
        oc_instance_id, -- <<< Columna de OC
        event_type,
        description,
        user_actor,
        details
    ) VALUES (
        p_instancia_id,
        'INSTANCE_UPDATED'::event_type,
        'Instancia de OC actualizada con nuevos datos.',
        'SISTEMA', -- O 'USUARIO'
        p_datos_nuevos_json -- Guarda solo los campos que cambiaron
    );

    -- 5. Re-ejecutar TODAS las validaciones
    -- Llama a la función orquestadora de OC
    SELECT * FROM ejecutar_validaciones_oc(p_instancia_id, v_nuevo_data)
    INTO v_summary;

    -- 6. Intentar la Transición Automática
    -- Llama a la función de transición de OC
    SELECT * FROM intentar_transicion_automatica_oc(p_instancia_id)
    INTO v_transition_summary;

    -- 7. Devolver el resumen final a n8n
    -- Combina el resumen de validación con el resultado de la transición
    RETURN v_summary || v_transition_summary;

END;
$$;


ALTER FUNCTION "public"."actualizar_y_revalidar_oc"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_y_revalidar_v3"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_data JSONB;
    v_nuevo_data JSONB;
    v_transition_result JSONB;
BEGIN
    -- 1. Obtener datos actuales
    SELECT current_data INTO v_current_data
    FROM pedido_instancias WHERE id = p_instancia_id;

    -- 2. Merge de datos (votos nuevos sobre viejos)
    v_nuevo_data := v_current_data || p_datos_nuevos_json;
    
    UPDATE pedido_instancias 
    SET current_data = v_nuevo_data 
    WHERE id = p_instancia_id;

    -- 3. Llamar al motor V3
    SELECT * FROM intentar_transicion_automatica_pedido_v3(p_instancia_id) INTO v_transition_result;

    RETURN v_transition_result;
END;
$$;


ALTER FUNCTION "public"."actualizar_y_revalidar_v3"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avanzar_oc_post_aprobacion"("p_pedido_instance_id" bigint, "p_user_actor" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_oc_instance_id BIGINT;
    v_estado_calzada_id INT; -- Estado 6 de OC
    v_current_state_id INT;
BEGIN
    -- 1. Encontrar la OC vinculada
    SELECT v.oc_instance_id INTO v_oc_instance_id
    FROM vinculaciones_pedido_oc v
    WHERE v.pedido_instance_id = p_pedido_instance_id;

    -- 2. Validar
    IF v_oc_instance_id IS NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Vínculo no encontrado.');
    END IF;

    -- 3. Obtener Estado 6 de OC
    SELECT id INTO v_estado_calzada_id FROM state_definitions WHERE fsm_id = 2 AND state_code = '6';

    -- 4. Transicionar la OC
    SELECT current_state_id INTO v_current_state_id FROM oc_instancias WHERE id = v_oc_instance_id;

    UPDATE oc_instancias 
    SET current_state_id = v_estado_calzada_id
    WHERE id = v_oc_instance_id;

    -- 5. Registrar transición en el historial de OC
    INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
    VALUES (v_oc_instance_id, 'STATE_TRANSITION', 'Transición manual a Estado 6: OC Calzada (Aprobación excepcional del Pedido).', p_user_actor,
            jsonb_build_object('from_state_id', v_current_state_id, 'to_state_id', v_estado_calzada_id));

    RETURN jsonb_build_object('status', 'SUCCESS', 'oc_instance_id', v_oc_instance_id);
END;
$$;


ALTER FUNCTION "public"."avanzar_oc_post_aprobacion"("p_pedido_instance_id" bigint, "p_user_actor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_buffer_remito"("p_numero_remito" "text", "p_archivo_url" "text", "p_cotizacion_url" "text", "p_metadata" "jsonb", "p_email_remitente" "text", "p_cantidad_total" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_id_existente bigint;
    v_estado_existente text;
    
    -- Variables para Chofer y Camión
    v_dni_chofer text;
    v_nombre_chofer text;
    v_telefono_chofer text;
    v_chofer_id int;
    v_camion_patente text;
BEGIN
    -- 1. Verificar duplicados de Remito
    SELECT id, estado_asignacion INTO v_id_existente, v_estado_existente
    FROM public.remitos
    WHERE remito_ref_externa = p_numero_remito
    LIMIT 1;

    IF v_id_existente IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'DUPLICATE',
            'message', 'El remito ya existe.',
            'remito_id', v_id_existente
        );
    END IF;

    -- 2. GESTIÓN DE CHOFER Y CAMIÓN
    v_dni_chofer := p_metadata->>'dni_chofer';
    v_nombre_chofer := p_metadata->>'nombre_chofer';
    v_telefono_chofer := p_metadata->>'telefono_chofer';
    
    -- CORRECCIÓN: Usamos la clave correcta
    v_camion_patente := p_metadata->>'patente_chasis'; 

    -- Solo procesamos si hay DNI
    IF v_dni_chofer IS NOT NULL AND v_dni_chofer != '' THEN
        v_dni_chofer := replace(v_dni_chofer, '.', '');

        SELECT id INTO v_chofer_id FROM public.choferes WHERE dni = v_dni_chofer;

        IF v_chofer_id IS NOT NULL THEN
            UPDATE public.choferes 
            SET telefono = COALESCE(v_telefono_chofer, telefono),
                nombre_completo = COALESCE(v_nombre_chofer, nombre_completo)
            WHERE id = v_chofer_id;
        ELSE
            INSERT INTO public.choferes (nombre_completo, dni, telefono)
            VALUES (COALESCE(v_nombre_chofer, 'Chofer ' || v_dni_chofer), v_dni_chofer, v_telefono_chofer)
            RETURNING id INTO v_chofer_id;
        END IF;
    END IF;

    -- 3. Insertar Remito
    INSERT INTO public.remitos (
        remito_ref_externa, 
        archivo_url, 
        cotizacion_url, 
        metadata_extraida, 
        email_remitente, 
        estado_asignacion,
        
        -- CORRECCIÓN: Usamos cantidad_total y patente
        cantidad_total, 
        camion_patente, 
        chofer_id 
    ) VALUES (
        p_numero_remito, 
        p_archivo_url, 
        p_cotizacion_url, 
        p_metadata, 
        p_email_remitente, 
        'PENDIENTE',
        
        p_cantidad_total, 
        v_camion_patente,
        v_chofer_id
    )
    RETURNING id INTO v_id_existente;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'message', 'Guardado correctamente.',
        'remito_id', v_id_existente,
        'chofer_id', v_chofer_id
    );
END;
$$;


ALTER FUNCTION "public"."check_and_buffer_remito"("p_numero_remito" "text", "p_archivo_url" "text", "p_cotizacion_url" "text", "p_metadata" "jsonb", "p_email_remitente" "text", "p_cantidad_total" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_nueva_inspeccion"("p_pedido_instance_ids" bigint[], "p_inspector_id" integer, "p_tipo_carga" "text", "p_fecha_pactada" timestamp with time zone, "p_lugar_id" integer, "p_usuario_actor" "text") RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_inspeccion_id BIGINT;
    v_state_id_d0 INTEGER;
    v_pid BIGINT;
BEGIN
    SELECT id INTO v_state_id_d0 FROM public.state_definitions WHERE state_code = '3.D0';

    INSERT INTO public.inspecciones (
        inspector_id, tipo_carga, fecha_hora_carga_pactada, 
        lugar_carga_id, current_state_id
    ) VALUES (
        p_inspector_id, p_tipo_carga, p_fecha_pactada, 
        p_lugar_id, v_state_id_d0
    ) RETURNING id INTO v_inspeccion_id;

    FOREACH v_pid IN ARRAY p_pedido_instance_ids LOOP
        INSERT INTO public.inspeccion_items_pedido (inspeccion_id, pedido_instance_id)
        VALUES (v_inspeccion_id, v_pid);

        INSERT INTO public.historial_eventos (
            pedido_instance_id, event_type, description, user_actor, details
        ) VALUES (
            v_pid, 'STATE_TRANSITION', 'Inicio de Inspección Documental (FSM 3)', 
            p_usuario_actor, jsonb_build_object('inspeccion_id', v_inspeccion_id)
        );
    END LOOP;
    RETURN v_inspeccion_id;
END;
$$;


ALTER FUNCTION "public"."crear_nueva_inspeccion"("p_pedido_instance_ids" bigint[], "p_inspector_id" integer, "p_tipo_carga" "text", "p_fecha_pactada" timestamp with time zone, "p_lugar_id" integer, "p_usuario_actor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_nueva_inspeccion_v2"("p_pedido_instance_ids" bigint[], "p_inspector_id" integer, "p_template_id" integer, "p_tipo_carga" "text", "p_fecha_pactada" timestamp with time zone, "p_lugar_id" integer, "p_usuario_actor" "text") RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_inspeccion_id BIGINT;
    v_state_id_d0 INTEGER;
    v_pid BIGINT;
BEGIN
    -- Obtener estado inicial
    SELECT id INTO v_state_id_d0 FROM public.state_definitions WHERE state_code = '3.D0';

    -- Insertar inspección vinculada a la plantilla elegida en el Trello
    INSERT INTO public.inspecciones (
        inspector_id, 
        template_id, -- Relación directa
        tipo_carga, 
        fecha_hora_carga_pactada, 
        lugar_carga_id, 
        current_state_id
    ) VALUES (
        p_inspector_id, 
        p_template_id, 
        p_tipo_carga, 
        p_fecha_pactada, 
        p_lugar_id, 
        v_state_id_d0
    ) RETURNING id INTO v_inspeccion_id;

    -- Vincular pedidos y loguear historial
    FOREACH v_pid IN ARRAY p_pedido_instance_ids LOOP
        INSERT INTO public.inspeccion_items_pedido (inspeccion_id, pedido_instance_id)
        VALUES (v_inspeccion_id, v_pid);

        INSERT INTO public.historial_eventos (
            pedido_instance_id, event_type, description, user_actor, details
        ) VALUES (
            v_pid, 'STATE_TRANSITION', 'Inspección Iniciada con plantilla ID: ' || p_template_id, 
            p_usuario_actor, jsonb_build_object('inspeccion_id', v_inspeccion_id)
        );
    END LOOP;

    RETURN v_inspeccion_id;
END;
$$;


ALTER FUNCTION "public"."crear_nueva_inspeccion_v2"("p_pedido_instance_ids" bigint[], "p_inspector_id" integer, "p_template_id" integer, "p_tipo_carga" "text", "p_fecha_pactada" timestamp with time zone, "p_lugar_id" integer, "p_usuario_actor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."desvincular_pedido_oc"("p_vinculacion_id" bigint, "p_usuario_solicitante" "text", "p_motivo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_vinc RECORD;
    v_pedido_tiene_hijos BOOLEAN;
    v_estado_1_2_id INT;
    v_estado_2_oc_id INT;
BEGIN
    -- 1. Obtener datos de la vinculación
    SELECT * INTO v_vinc FROM public.vinculaciones_pedido_oc WHERE id = p_vinculacion_id;
    
    IF v_vinc.id IS NULL THEN 
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Vinculación no encontrada.'); 
    END IF;

    -- 2. Validar que el pedido no haya avanzado físicamente (Hijos)
    SELECT EXISTS(SELECT 1 FROM pedido_instancias WHERE parent_instance_id = v_vinc.pedido_instance_id) 
    INTO v_pedido_tiene_hijos;

    IF v_pedido_tiene_hijos THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'No se puede desvincular: El pedido ya tiene movimientos físicos (Remitos/Sub-instancias). Anule los remitos primero.');
    END IF;

    -- 3. Obtener IDs de estados destino (Hardcoded por performance o búsqueda dinámica)
    -- Buscamos ID del Estado 1.2 (Pedido Listo Vinculación)
    SELECT id INTO v_estado_1_2_id FROM state_definitions WHERE fsm_id = 1 AND state_code = '1.2' LIMIT 1;
    
    -- 4. Restaurar Saldo en OC
    -- La OC simplemente recupera disponibilidad. Su estado general sigue siendo 2 (Disponible) o si estaba agotada vuelve a 2.
    -- Nota: Si la OC estaba en estado 3 (Asignada Full) y ahora libera saldo, ¿debe volver a 2? 
    -- Asumimos que la OC siempre "vive" en estado 2 o 3. Si recupera saldo, verificamos.
    
    UPDATE oc_instancias
    SET cantidad_disponible = cantidad_disponible + v_vinc.cantidad_vinculada,
        status = 'ACTIVA'::instance_status, -- Revivir si estaba completada
        updated_at = NOW()
    WHERE id = v_vinc.oc_instance_id;

    -- Log en OC
    INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
    VALUES (v_vinc.oc_instance_id, 'UNLINK_RESTORE', 'Saldo restaurado por desvinculación de pedido ' || v_vinc.pedido_instance_id, p_usuario_solicitante, jsonb_build_object('cantidad', v_vinc.cantidad_vinculada));

    -- 5. Resetear Estado del Pedido
    -- El pedido vuelve a Estado 1.2 (Listo para vincular), manteniendo sus datos originales pero perdiendo la referencia a la OC en current_data si existía
    UPDATE pedido_instancias
    SET current_state_id = v_estado_1_2_id,
        updated_at = NOW(),
        -- Opcional: Limpiar datos de vinculación en el JSON si se guardaban ahí
        current_data = current_data - 'oc_vinculada_id' 
    WHERE id = v_vinc.pedido_instance_id;

    -- Log en Pedido
    INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
    VALUES (v_vinc.pedido_instance_id, 'UNLINK_RESET', 'Pedido desvinculado de OC y retornado a Estado 1.2', p_usuario_solicitante, jsonb_build_object('motivo', p_motivo));

    -- 6. Eliminar el registro de vinculación
    DELETE FROM public.vinculaciones_pedido_oc WHERE id = p_vinculacion_id;

    RETURN jsonb_build_object(
        'status', 'SUCCESS', 
        'message', 'Desvinculación exitosa. Pedido retornado a Estado 1.2 y saldo de OC restaurado.',
        'pedido_id', v_vinc.pedido_instance_id,
        'oc_id', v_vinc.oc_instance_id,
        'cantidad_liberada', v_vinc.cantidad_vinculada
    );
END;
$$;


ALTER FUNCTION "public"."desvincular_pedido_oc"("p_vinculacion_id" bigint, "p_usuario_solicitante" "text", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ejecutar_asignacion_remito"("p_remito_id" bigint, "p_origen_type" "text", "p_origen_instance_id" bigint, "p_cantidad_asignada" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_remito_data RECORD;
    v_saldo_actual NUMERIC;
    v_nueva_instancia_id BIGINT;
    v_nuevo_estado_id INT;
    v_nuevo_estado_code TEXT;
    v_identificador_nuevo TEXT;
    v_parent_data JSONB;
    v_pedido_id_raiz INT;
    v_oc_id_raiz INT;
    v_identificador_padre TEXT;
    v_tipo_mercado TEXT;
    v_saldo_final_madre NUMERIC;
BEGIN
    SELECT * INTO v_remito_data FROM public.remitos WHERE id = p_remito_id;
    IF v_remito_data.id IS NULL THEN RETURN jsonb_build_object('status', 'ERROR', 'message', 'Remito no encontrado.'); END IF;
    IF v_remito_data.estado_asignacion = 'ASIGNADO' THEN RETURN jsonb_build_object('status', 'ERROR', 'message', 'El remito ya fue asignado.'); END IF;

    IF p_origen_type = 'PEDIDO' THEN
        SELECT pi.saldo_pendiente, pi.current_data, pi.pedido_id, pi.identificador_compuesto, p.tipo_mercado
        INTO v_saldo_actual, v_parent_data, v_pedido_id_raiz, v_identificador_padre, v_tipo_mercado
        FROM pedido_instancias pi JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = p_origen_instance_id;
        IF v_tipo_mercado = 'MI' THEN v_nuevo_estado_code := '3.2'; ELSE v_nuevo_estado_code := '3.1.5'; END IF;
    ELSIF p_origen_type = 'OC' THEN
        SELECT oi.cantidad_disponible, oi.current_data, oi.oc_id, oi.identificador_compuesto, oc.tipo_operatoria
        INTO v_saldo_actual, v_parent_data, v_oc_id_raiz, v_identificador_padre, v_tipo_mercado
        FROM oc_instancias oi JOIN ordenes_compra oc ON oi.oc_id = oc.id WHERE oi.id = p_origen_instance_id;
        v_nuevo_estado_code := '2.6';
    END IF;

    SELECT id INTO v_nuevo_estado_id FROM state_definitions WHERE (fsm_id=1 OR fsm_id=2) AND state_code=v_nuevo_estado_code LIMIT 1;
    IF v_saldo_actual < p_cantidad_asignada THEN RETURN jsonb_build_object('status', 'ERROR', 'message', 'Saldo insuficiente.'); END IF;

    v_saldo_final_madre := v_saldo_actual - p_cantidad_asignada;
    
    -- Creación de Hija y Update Madre
    IF p_origen_type = 'PEDIDO' THEN
        INSERT INTO pedido_instancias (pedido_id, parent_instance_id, current_state_id, saldo_pendiente, status, current_data, cantidad_requerida_original) 
        VALUES (v_pedido_id_raiz, p_origen_instance_id, v_nuevo_estado_id, p_cantidad_asignada, 'ACTIVA'::instance_status, v_parent_data, p_cantidad_asignada) 
        RETURNING id INTO v_nueva_instancia_id;
        
        UPDATE pedido_instancias 
        SET saldo_pendiente = v_saldo_final_madre,
            status = CASE WHEN v_saldo_final_madre <= 0 THEN 'COMPLETADA'::instance_status ELSE 'ACTIVA'::instance_status END
        WHERE id = p_origen_instance_id;
        
        -- CORRECCIÓN: Registro del Evento Inicial para la Hija
        INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
        VALUES (v_nueva_instancia_id, 'STATE_TRANSITION', 'Nueva instancia generada por Remito ' || v_remito_data.remito_ref_externa, 'SISTEMA', jsonb_build_object('from_state', 'NEW', 'to_state', v_nuevo_estado_code));
        
    ELSE 
        INSERT INTO oc_instancias (oc_id, parent_instance_id, current_state_id, cantidad_total, cantidad_disponible, status, current_data) 
        VALUES (v_oc_id_raiz, p_origen_instance_id, v_nuevo_estado_id, p_cantidad_asignada, p_cantidad_asignada, 'ACTIVA'::instance_status, v_parent_data) 
        RETURNING id INTO v_nueva_instancia_id;

        UPDATE oc_instancias 
        SET cantidad_disponible = v_saldo_final_madre,
            status = CASE WHEN v_saldo_final_madre <= 0 THEN 'COMPLETADA'::instance_status ELSE 'ACTIVA'::instance_status END
        WHERE id = p_origen_instance_id;
        
        -- CORRECCIÓN: Registro del Evento Inicial para la Hija
        INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
        VALUES (v_nueva_instancia_id, 'STATE_TRANSITION', 'Nueva instancia generada por Remito ' || v_remito_data.remito_ref_externa, 'SISTEMA', jsonb_build_object('from_state', 'NEW', 'to_state', v_nuevo_estado_code));
    END IF;

    v_identificador_nuevo := COALESCE(v_identificador_padre, 'ROOT') || '_REM-' || v_remito_data.remito_ref_externa || '_' || v_nueva_instancia_id;
    IF p_origen_type = 'PEDIDO' THEN UPDATE pedido_instancias SET identificador_compuesto = v_identificador_nuevo WHERE id = v_nueva_instancia_id;
    ELSE UPDATE oc_instancias SET identificador_compuesto = v_identificador_nuevo WHERE id = v_nueva_instancia_id; END IF;

    INSERT INTO remito_items (remito_id, origen_type, origen_instance_id, destino_instance_id, cantidad) 
    VALUES (p_remito_id, p_origen_type, p_origen_instance_id, v_nueva_instancia_id, p_cantidad_asignada);

    UPDATE public.remitos SET estado_asignacion = 'ASIGNADO' WHERE id = p_remito_id;
    
    -- Refrescar vistas materializadas (Opcional, pero recomendado si quieres ver el cambio ya)

    RETURN jsonb_build_object(
        'status', 'SUCCESS', 
        'message', 'Asignación completada.',
        'nueva_instancia_id', v_nueva_instancia_id,
        'identificador_nuevo', v_identificador_nuevo,
        'identificador_padre', v_identificador_padre,
        'nuevo_estado_code', v_nuevo_estado_code,
        'cantidad_asignada', p_cantidad_asignada,
        'saldo_restante_origen', v_saldo_final_madre
    );
END;
$$;


ALTER FUNCTION "public"."ejecutar_asignacion_remito"("p_remito_id" bigint, "p_origen_type" "text", "p_origen_instance_id" bigint, "p_cantidad_asignada" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ejecutar_validaciones_iniciales"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_state_id INT;
    v_tipo_mercado TEXT;
    v_prefix_to_exclude TEXT;
    r RECORD;
    v_func_name TEXT;
    v_result JSONB;
    v_status TEXT;
    v_message TEXT; 
    v_checked_value JSONB;
    v_validation_code TEXT;
    v_is_blocking BOOLEAN;
    v_summary JSONB;
    v_last_transition_time TIMESTAMPTZ;
    v_transition_summary JSONB; 
    v_margen_calculado NUMERIC;
    v_state_1_1_id INT; -- NUEVO: ID del estado 1.1 para aislar el filtro
BEGIN
    -- 1. Obtener datos y la hora de la última transición
    SELECT
        pi.current_state_id, p.tipo_mercado,
        (SELECT COALESCE(MAX("timestamp"), '1970-01-01') FROM historial_eventos
         WHERE pedido_instance_id = pi.id AND event_type = 'STATE_TRANSITION')
    INTO v_current_state_id, v_tipo_mercado, v_last_transition_time
    FROM pedido_instancias pi
    JOIN pedidos p ON pi.pedido_id = p.id
    WHERE pi.id = p_instancia_id;

    IF v_current_state_id IS NULL THEN RAISE EXCEPTION 'Instancia de Pedido ID % no encontrada.', p_instancia_id; END IF;

    -- Obtenemos el ID del estado 1.1
    SELECT id INTO v_state_1_1_id FROM state_definitions WHERE fsm_id = 1 AND state_code = '1.1';


    -- 2. Determinar filtro de exclusión
    IF v_current_state_id = v_state_1_1_id THEN
        -- Solo aplicamos el filtro MI/ME si estamos en el estado 1.1
        IF v_tipo_mercado = 'MI' THEN v_prefix_to_exclude := 'VAL_P_ME_%';
        ELSIF v_tipo_mercado = 'ME' THEN v_prefix_to_exclude := 'VAL_P_MI_%';
        ELSE v_prefix_to_exclude := '@@@@';
        END IF;
    ELSE
        -- En todos los demás estados (como 1.6), NO aplicamos exclusión por prefijo.
        v_prefix_to_exclude := '@@@@'; 
    END IF;


    -- 3. Iterar sobre las validaciones
    FOR r IN (
        SELECT vd.validation_code, vd.is_blocking
        FROM validation_definitions vd
        JOIN state_validation_requirements svr ON vd.id = svr.validation_id
        WHERE svr.state_id = v_current_state_id
          AND vd.validation_code NOT LIKE v_prefix_to_exclude -- Este filtro ahora es condicional al estado
    )
    LOOP
        v_validation_code := r.validation_code;
        v_is_blocking := r.is_blocking;
        
        -- El nombre de la función se construye A PARTIR del código de validación del catálogo
        v_func_name := 'f_' || lower(v_validation_code); 

        BEGIN
            EXECUTE format('SELECT %I(%L::bigint, %L::jsonb)', v_func_name, p_instancia_id, p_json_data)
            INTO v_result;
            v_status := v_result->>'status';
            
            v_message := COALESCE(v_result->>'message', 'ERROR: Mensaje de validación no retornado por ' || v_func_name || '.');
            v_checked_value := v_result->'checked_value';
        EXCEPTION
            WHEN undefined_function THEN
                v_status := 'FAILURE'; v_message := 'Error: Función ' || v_func_name || ' no definida.'; v_checked_value := null;
            WHEN others THEN
                v_status := 'FAILURE'; v_message := 'Error en ' || v_func_name || ': ' || SQLERRM; v_checked_value := null;
        END;

        -- 4. Registrar el resultado
        INSERT INTO historial_eventos (
            pedido_instance_id, event_type, description, user_actor, details
        ) VALUES (
            p_instancia_id,
            CASE
                WHEN v_status = 'SUCCESS' THEN 'VALIDATION_SUCCESS'::event_type
                WHEN v_status = 'DENIED'  THEN 'VALIDATION_DENIED'::event_type
                ELSE 'VALIDATION_FAILURE'::event_type
            END,
            v_message,
            'SISTEMA',
            jsonb_build_object('validation_code', v_validation_code, 'is_blocking', v_is_blocking, 'checked_value', v_checked_value, 'status_code', v_status)
        );
    END LOOP;

    -- 5. Construir el resumen de validación (omitiendo el cuerpo por brevedad)
    -- ...
    SELECT jsonb_build_object(
        'hay_denegaciones_bloqueantes',
        EXISTS ( SELECT 1 FROM historial_eventos WHERE pedido_instance_id = p_instancia_id AND event_type = 'VALIDATION_DENIED' AND (details->>'is_blocking')::boolean = true AND "timestamp" > v_last_transition_time ),
        'hay_fallos_bloqueantes',
        EXISTS ( SELECT 1 FROM historial_eventos WHERE pedido_instance_id = p_instancia_id AND event_type = 'VALIDATION_FAILURE' AND (details->>'is_blocking')::boolean = true AND "timestamp" > v_last_transition_time ),
        'denegaciones',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('mensaje', description, 'es_bloqueante', (details->>'is_blocking')::boolean)), '[]'::jsonb) FROM historial_eventos WHERE pedido_instance_id = p_instancia_id AND event_type = 'VALIDATION_DENIED' AND "timestamp" > v_last_transition_time),
        'fallos_pendientes',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('mensaje', description, 'es_bloqueante', (details->>'is_blocking')::boolean)), '[]'::jsonb) FROM historial_eventos WHERE pedido_instance_id = p_instancia_id AND event_type = 'VALIDATION_FAILURE' AND "timestamp" > v_last_transition_time)
    ) INTO v_summary;

    -- 5.5. ANEXAR EL MARGEN DE RENTABILIDAD CALCULADO (si existe)
    SELECT margen_rentabilidad_calculado INTO v_margen_calculado
    FROM vinculaciones_pedido_oc
    WHERE pedido_instance_id = p_instancia_id;
    
    IF v_margen_calculado IS NOT NULL THEN
        v_summary := v_summary || jsonb_build_object('margen_rentabilidad_calculado', v_margen_calculado);
    END IF;

    -- 6. LLAMAR A LA LÓGICA DE TRANSICIÓN DE PEDIDOS
    SELECT * FROM intentar_transicion_automatica_pedido(p_instancia_id)
    INTO v_transition_summary;

    -- 7. Devolver el resumen combinado
    RETURN v_summary || v_transition_summary;

END;
$$;


ALTER FUNCTION "public"."ejecutar_validaciones_iniciales"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ejecutar_validaciones_oc"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_state_id INT;
    v_tipo_operatoria TEXT;
    r RECORD;
    v_func_name TEXT;
    v_result JSONB;
    v_status TEXT;
    v_message TEXT;
    v_checked_value JSONB;
    v_validation_code TEXT;
    v_is_blocking BOOLEAN;
    v_summary JSONB;
    v_last_transition_time TIMESTAMPTZ;
    v_transition_summary JSONB;
BEGIN
    -- 1. Obtener datos de la instancia de OC
    SELECT
        oi.current_state_id,
        oc.tipo_operatoria,
        (SELECT "timestamp" FROM historial_eventos
         WHERE oc_instance_id = oi.id AND event_type = 'STATE_TRANSITION'
         ORDER BY "timestamp" DESC LIMIT 1)
    INTO v_current_state_id, v_tipo_operatoria, v_last_transition_time
    FROM oc_instancias oi
    JOIN ordenes_compra oc ON oi.oc_id = oc.id
    WHERE oi.id = p_instancia_id;

    IF v_current_state_id IS NULL THEN RAISE EXCEPTION 'Instancia de OC ID % no encontrada.', p_instancia_id; END IF;
    IF v_last_transition_time IS NULL THEN v_last_transition_time := '1970-01-01 00:00:00+00'; END IF;

    -- 2. Iterar sobre las validaciones requeridas
    FOR r IN (
        SELECT vd.validation_code, vd.is_blocking
        FROM validation_definitions vd
        JOIN state_validation_requirements svr ON vd.id = svr.validation_id
        WHERE
            svr.state_id = v_current_state_id
            AND (
                vd.validation_code IN ('VAL_OC_101', 'VAL_OC_102') OR
                (v_tipo_operatoria = 'MI' AND vd.validation_code IN ('VAL_OC_103', 'VAL_OC_106')) OR
                (v_tipo_operatoria = 'ME' AND vd.validation_code IN ('VAL_OC_104', 'VAL_OC_105', 'VAL_OC_107', 'VAL_OC_108')) OR
                (vd.validation_code IN ('VAL_OC_109', 'VAL_OC_110')) -- Añadido para rechazo/timeout
            )
    )
    LOOP
        v_validation_code := r.validation_code;
        v_is_blocking := r.is_blocking;
        v_func_name := 'f_' || lower(v_validation_code);

        BEGIN
            -- 3. Llamar dinámicamente a la función individual
            EXECUTE format('SELECT %I(%L::bigint, %L::jsonb)', v_func_name, p_instancia_id, p_json_data)
            INTO v_result;
            v_status := v_result->>'status';
            v_message := v_result->>'message';
            v_checked_value := v_result->'checked_value';
        EXCEPTION
            WHEN undefined_function THEN
                v_status := 'FAILURE'; v_message := 'Error: Función ' || v_func_name || ' no definida.'; v_checked_value := null;
            WHEN others THEN
                v_status := 'FAILURE'; v_message := 'Error en ' || v_func_name || ': ' || SQLERRM; v_checked_value := null;
        END;

        -- 4. Registrar el resultado en el historial
        INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
        VALUES (p_instancia_id,
            CASE
                WHEN v_status = 'SUCCESS' THEN 'VALIDATION_SUCCESS'::event_type
                WHEN v_status = 'DENIED'  THEN 'VALIDATION_DENIED'::event_type
                ELSE 'VALIDATION_FAILURE'::event_type
            END,
            v_message, 'SISTEMA',
            jsonb_build_object('validation_code', v_validation_code, 'is_blocking', v_is_blocking, 'checked_value', v_checked_value, 'status_code', v_status)
        );
    END LOOP;

    -- 5. Construir el resumen (leyendo los datos que acabamos de insertar)
    SELECT jsonb_build_object(
        'hay_denegaciones_bloqueantes',
        EXISTS (
            SELECT 1 FROM historial_eventos
            WHERE oc_instance_id = p_instancia_id AND event_type = 'VALIDATION_DENIED'
              AND (details->>'is_blocking')::boolean = true AND "timestamp" > v_last_transition_time
        ),
        'hay_fallos_bloqueantes',
        EXISTS (
            SELECT 1 FROM historial_eventos
            WHERE oc_instance_id = p_instancia_id AND event_type = 'VALIDATION_FAILURE'
              AND (details->>'is_blocking')::boolean = true AND "timestamp" > v_last_transition_time
        ),
        'denegaciones',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('mensaje', description, 'es_bloqueante', (details->>'is_blocking')::boolean)), '[]'::jsonb)
         FROM historial_eventos
         WHERE oc_instance_id = p_instancia_id AND event_type = 'VALIDATION_DENIED' AND "timestamp" > v_last_transition_time),
        'fallos_pendientes',
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('mensaje', description, 'es_bloqueante', (details->>'is_blocking')::boolean)), '[]'::jsonb)
         FROM historial_eventos
         WHERE oc_instance_id = p_instancia_id AND event_type = 'VALIDATION_FAILURE' AND "timestamp" > v_last_transition_time)
    )
    INTO v_summary;

    -- 6. ¡NUEVO! LLAMAR A LA LÓGICA DE TRANSICIÓN INMEDIATAMENTE
    -- Ahora esta función no solo valida, sino que también intenta transicionar
    SELECT * FROM intentar_transicion_automatica_oc(p_instancia_id)
    INTO v_transition_summary;

    -- 7. Devolver el resumen combinado
    RETURN v_summary || v_transition_summary;

END;
$$;


ALTER FUNCTION "public"."ejecutar_validaciones_oc"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_161"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE 
    v_aprobacion_status TEXT;
BEGIN
    v_aprobacion_status := p_json_data->>'decision_rentabilidad';

    -- Si el debugging persiste:
    INSERT INTO debug_log_fsm (instance_id, message) VALUES (p_instancia_id, 'DEBUG: EJECUTANDO F_VAL_161. Status: ' || v_aprobacion_status);

    IF v_aprobacion_status = 'CONTINUAR' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Aprobación por excepción recibida (CONTINUAR).');
    ELSIF v_aprobacion_status = 'RECHAZAR' THEN
        RETURN jsonb_build_object('status', 'DENIED', 'message', 'Rechazo: Vinculación rechazada por Gerencia (Vuelve a 1.2).', 'is_blocking', TRUE);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: En espera de decisión de GF o GG (INPUT_162/163).', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_161"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_162"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO debug_log_fsm (instance_id, message) VALUES (p_instancia_id, 'DEBUG: EJECUTANDO F_VAL_162. Siempre SUCCESS en ruta CONTINUAR.');
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Validación de nueva vinculación no aplica en esta ruta de excepción.');
END; $$;


ALTER FUNCTION "public"."f_val_162"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_oc_101"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    v_val := p_json_data->>'tipo_operatoria';
    IF v_val = 'MI' OR v_val = 'ME' THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Clasificación ME/MI (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Clasificación ME/MI ausente o inválida.', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_oc_101"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_oc_102"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    v_val := p_json_data->'proveedor'->>'codigo';
    IF v_val IS NOT NULL AND v_val != '' THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Datos del proveedor (Código presente).', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Datos del proveedor (Código ausente).', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_oc_102"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_oc_103"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val BOOLEAN;
BEGIN
    v_val := (p_json_data->'validaciones'->'mi'->>'resultado_global')::BOOLEAN;
    IF v_val IS TRUE THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Control de precios MI validado en pre-proceso.');
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Control de precios MI fallido o no ejecutado.');
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_oc_103"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_oc_104"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val BOOLEAN;
BEGIN
    v_val := (p_json_data->'validaciones'->'me'->>'resultado_global')::BOOLEAN;
    IF v_val IS TRUE THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Control de precios ME validado en pre-proceso.');
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Control de precios ME fallido o no ejecutado.');
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_oc_104"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_oc_105"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF  p_json_data->>'numero_presupuesto' IS NOT NULL AND p_json_data->>'numero_presupuesto' != '' AND
        p_json_data->>'tipo_cambio' IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Información completa ME (Campos clave presentes).');
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Información completa ME (Faltan N° Presupuesto, Tipo de Cambio, etc.).');
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_oc_105"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_oc_106"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF  p_json_data->>'numero_cotizacion' IS NOT NULL AND p_json_data->>'numero_cotizacion' != '' AND
        p_json_data->>'precio_kg_informado' IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Información completa MI (Campos clave presentes).');
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Información completa MI (Faltan N° Cotización, Precios, etc.).');
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_oc_106"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_oc_107"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF (p_json_data->>'cotizacion_proveedor_recibida')::BOOLEAN IS TRUE THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Cotización del Proveedor recibida.');
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Pendiente de recibir email con Cotización del Proveedor (Excel).');
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_oc_107"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_oc_108"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_status_aprobacion TEXT := p_json_data->>'aceptacion_proveedor';
BEGIN
    IF v_status_aprobacion = 'true' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Aceptación del proveedor recibida.');
    ELSIF v_status_aprobacion = 'false' OR v_status_aprobacion = 'denegado' THEN
        RETURN jsonb_build_object('status', 'DENIED', 'message', 'Rechazo: Aceptación del proveedor denegada.');
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Aceptación del proveedor pendiente.');
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_oc_108"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_oc_109"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE 
    v_result JSONB;
    v_status_rechazo TEXT := p_json_data->>'rechazo_gl';
BEGIN
    IF v_status_rechazo = 'true' THEN
        -- Solo si GL envía el INPUT_105 ("RECHAZAR"), esta función devuelve DENIED
        v_result := jsonb_build_object('status', 'DENIED', 'message', 'Rechazo: La OC fue rechazada manualmente por GL.');
    ELSE
        -- Por defecto, la OC no está rechazada, por lo tanto, esta validación es exitosa
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Aprobación Manual GL (No rechazada).');
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_oc_109"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_oc_110"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE 
    v_result JSONB;
    v_status_timeout BOOLEAN := (p_json_data->>'timeout_72h')::BOOLEAN;
BEGIN
    IF v_status_timeout IS TRUE THEN
        -- Solo si el cronjob de n8n actualiza el JSON con "timeout_72h: true"
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: La OC ha expirado (72h sin completar validaciones).');
    ELSE
        -- Por defecto, la OC está dentro del tiempo límite
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: La OC está dentro del tiempo límite.');
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_oc_110"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_117"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := upper(p_json_data->>'tipo_operacion');
    IF v_val IS NOT NULL AND v_val != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Tipo de Operatoria (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Tipo de Operatoria (Consignación/Subconsignación/Externa) ausente.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_117"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_151"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_oc_instancia_id BIGINT;
BEGIN
    -- Busca el registro de vinculación pendiente para esta instancia de Pedido
    SELECT v.oc_instance_id INTO v_oc_instancia_id
    FROM vinculaciones_pedido_oc v
    WHERE v.pedido_instance_id = p_instancia_id 
      AND v.estado_vinculacion = 'PENDIENTE_VALIDACION';

    IF v_oc_instancia_id IS NULL THEN
        -- Esto sería un fallo grave del sistema si el SP funcionó bien.
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: No existe un registro de vinculación activo en tabla intermedia.', 'is_blocking', TRUE);
    ELSE
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: OC vinculada encontrada: ID ' || v_oc_instancia_id, 'checked_value', v_oc_instancia_id);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_151"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_152"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE 
    v_cantidad_pedida NUMERIC;
    v_oc_cantidad_reservada NUMERIC;
BEGIN
    -- Obtener la cantidad que esta instancia de Pedido requiere (cantidad que fue calzada)
    SELECT pi.cantidad_requerida_original INTO v_cantidad_pedida 
    FROM pedido_instancias pi WHERE pi.id = p_instancia_id;

    -- Obtener la cantidad reservada en la OC Hija vinculada (cantidad_total de la OC Hija)
    SELECT oi.cantidad_total INTO v_oc_cantidad_reservada
    FROM oc_instancias oi
    JOIN vinculaciones_pedido_oc v ON v.oc_instance_id = oi.id
    WHERE v.pedido_instance_id = p_instancia_id;

    -- Compara que la cantidad que se calzó en el Pedido sea la misma que se asignó a la OC
    IF v_cantidad_pedida = v_oc_cantidad_reservada THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Cantidad reservada en OC coincide con la cantidad requerida (' || v_cantidad_pedida || ' TON).');
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo CRÍTICO: Integridad de cantidad rota. Pedido: ' || v_cantidad_pedida || ' TON. OC Reservada: ' || v_oc_cantidad_reservada || ' TON.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_152"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_153"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE 
    v_precio_compra_neto NUMERIC;
    v_precio_venta_neto NUMERIC;
    v_margen_requerido NUMERIC := 4.0; 
    v_margen_calculado NUMERIC;
    v_cumple_rentabilidad BOOLEAN;
    
    v_oc_id_raiz INT;
    v_pedido_data JSONB;

BEGIN
    -- 1. Obtener Precio Venta NETO/KG (Pedido raíz) y la OC raíz vinculada
    SELECT 
        o.id, p.precio_neto_kg, pi.current_data
    INTO 
        v_oc_id_raiz, v_precio_venta_neto, v_pedido_data
    FROM pedido_instancias pi
    JOIN vinculaciones_pedido_oc v ON v.pedido_instance_id = pi.id
    JOIN oc_instancias oi ON oi.id = v.oc_instance_id
    JOIN ordenes_compra o ON o.id = oi.oc_id
    JOIN pedidos p ON pi.pedido_id = p.id
    WHERE pi.id = p_instancia_id; -- <<< CORRECCIÓN CRÍTICA: AÑADIR FILTRO POR INSTANCIA

    -- 2. Obtener Precio de Compra NETO/KG desde la tabla OC raíz
    SELECT oc.precio_neto_kg INTO v_precio_compra_neto
    FROM ordenes_compra oc WHERE oc.id = v_oc_id_raiz;

    -- 3. Obtener Margen Requerido (si fue modificado en Pedido JSON)
    IF (v_pedido_data->>'margen_rentabilidad_requerido')::NUMERIC IS NOT NULL THEN
        v_margen_requerido := (v_pedido_data->>'margen_rentabilidad_requerido')::NUMERIC;
    END IF;

    -- 4. Chequeo de datos críticos antes del cálculo
    IF v_precio_compra_neto IS NULL OR v_precio_venta_neto IS NULL OR v_precio_compra_neto <= 0 THEN
         -- Si los precios en la tabla raíz son NULL, fallamos aquí.
         RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: No se encontraron precios NETOS persistidos para la Rentabilidad.', 'is_blocking', TRUE);
    END IF;
    
    -- [ Pasos 5 y 6: Cálculo y Retorno de Resultado — ASUMIMOS CORRECTOS ]

    v_margen_calculado := ((v_precio_venta_neto - v_precio_compra_neto) / v_precio_compra_neto) * 100;
    v_cumple_rentabilidad := v_margen_calculado >= v_margen_requerido;

    IF v_cumple_rentabilidad THEN
        UPDATE vinculaciones_pedido_oc
        SET margen_rentabilidad_calculado = ROUND(v_margen_calculado::NUMERIC, 4),
            estado_vinculacion = 'APROBADA'
        WHERE pedido_instance_id = p_instancia_id;
        
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Rentabilidad OK (' || ROUND(v_margen_calculado::NUMERIC, 2) || '%).', 
                                  'checked_value', jsonb_build_object('margen_calculado', ROUND(v_margen_calculado::NUMERIC, 2)));
    ELSE
        UPDATE vinculaciones_pedido_oc
        SET margen_rentabilidad_calculado = ROUND(v_margen_calculado::NUMERIC, 4),
            estado_vinculacion = 'RECHAZADA' 
        WHERE pedido_instance_id = p_instancia_id;
        
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Rentabilidad BAJA (' || ROUND(v_margen_calculado::NUMERIC, 2) || '% < ' || v_margen_requerido || '%).', 
                                  'checked_value', jsonb_build_object('margen_calculado', ROUND(v_margen_calculado::NUMERIC, 2)), 'is_blocking', TRUE);
    END IF;

END;
$$;


ALTER FUNCTION "public"."f_val_p_153"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_154"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE 
    v_pedido_mercado TEXT;
    v_oc_mercado TEXT;
    v_oc_instance_id BIGINT;
BEGIN
    -- 1. Obtener tipo de mercado del Pedido Raíz
    SELECT p.tipo_mercado INTO v_pedido_mercado
    FROM pedido_instancias pi JOIN pedidos p ON pi.pedido_id = p.id
    WHERE pi.id = p_instancia_id;

    -- 2. Obtener tipo de mercado de la OC Vinculada
    SELECT oc.tipo_operatoria INTO v_oc_mercado
    FROM vinculaciones_pedido_oc v
    JOIN oc_instancias oi ON v.oc_instance_id = oi.id
    JOIN ordenes_compra oc ON oi.oc_id = oc.id
    WHERE v.pedido_instance_id = p_instancia_id;

    IF v_pedido_mercado IS NULL OR v_oc_mercado IS NULL THEN
         RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Tipo de mercado no definido para Pedido/OC raíz.', 'is_blocking', TRUE);
    END IF;

    IF v_pedido_mercado = v_oc_mercado THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Mercados Consistentes (' || v_pedido_mercado || ').');
    ELSE
        -- Falla y transiciona a 1.6
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Inconsistencia de Mercados (Pedido: ' || v_pedido_mercado || ', OC: ' || v_oc_mercado || '). Requiere aprobación.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_154"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_311"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Verifica si GF aprobó O si GG aprobó (GG anula requerimiento individual)
    IF (p_datos->>'aprobacion_gf')::boolean IS TRUE OR (p_datos->>'aprobacion_gg')::boolean IS TRUE THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Aprobación GF recibida.');
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta aprobación de GF.');
    END IF;
END;
$$;


ALTER FUNCTION "public"."f_val_p_311"("p_instancia_id" bigint, "p_datos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_312"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF (p_datos->>'aprobacion_gl')::boolean IS TRUE OR (p_datos->>'aprobacion_gg')::boolean IS TRUE THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Aprobación GL recibida.');
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta aprobación de GL.');
    END IF;
END;
$$;


ALTER FUNCTION "public"."f_val_p_312"("p_instancia_id" bigint, "p_datos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_313"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF (p_datos->>'aprobacion_gc')::boolean IS TRUE OR (p_datos->>'aprobacion_gg')::boolean IS TRUE THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Aprobación GC recibida.');
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta aprobación de GC.');
    END IF;
END;
$$;


ALTER FUNCTION "public"."f_val_p_313"("p_instancia_id" bigint, "p_datos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_314"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Por ahora es passthrough, a menos que haya lógica de swap
    IF (p_datos->>'propuesta_swap')::boolean IS TRUE THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Propuesta de Swap activa.');
    ELSE
        -- Si no hay swap, no pasa nada, se considera "Validado" o "No Aplica"
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'No hay Swap pendiente.');
    END IF;
END;
$$;


ALTER FUNCTION "public"."f_val_p_314"("p_instancia_id" bigint, "p_datos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_315"("p_instancia_id" bigint, "p_datos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_rechazo_gg BOOLEAN;
    v_rechazo_gl BOOLEAN;
    v_rechazo_gc BOOLEAN;
    v_rechazo_gf BOOLEAN;
    v_aprobacion_gg BOOLEAN;
BEGIN
    -- Extraer flags (default false)
    v_rechazo_gg := COALESCE((p_datos->>'rechazo_gg')::boolean, false);
    v_rechazo_gl := COALESCE((p_datos->>'rechazo_gl')::boolean, false);
    v_rechazo_gc := COALESCE((p_datos->>'rechazo_gc')::boolean, false);
    v_rechazo_gf := COALESCE((p_datos->>'rechazo_gf')::boolean, false);
    v_aprobacion_gg := COALESCE((p_datos->>'aprobacion_gg')::boolean, false);

    -- 1. Si GG aprobó explícitamente, ignoramos rechazos inferiores
    IF v_aprobacion_gg THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Aprobado por GG (Override).');
    END IF;

    -- 2. Criterio de Salida Definitiva (DENIED -> Vuelve a 1.2)
    -- Si GG rechaza O Si todos rechazan
    IF v_rechazo_gg OR (v_rechazo_gl AND v_rechazo_gc AND v_rechazo_gf) THEN
        RETURN jsonb_build_object('status', 'DENIED', 'message', 'Rechazo definitivo (GG o Unánime). Volviendo a 1.2.');
    END IF;

    -- 3. Criterio de Escalamiento (FAILURE -> Se queda en 3.1 bloqueado)
    -- Si hay al menos un rechazo, pero no es definitivo
    IF v_rechazo_gl OR v_rechazo_gc OR v_rechazo_gf THEN
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Rechazo parcial registrado. Esperando decisión de GG.');
    END IF;

    -- 4. Todo limpio
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Sin rechazos activos.');
END;
$$;


ALTER FUNCTION "public"."f_val_p_315"("p_instancia_id" bigint, "p_datos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_101"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := p_json_data->>'cliente_codigo_tango';
    IF v_val IS NOT NULL AND v_val != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Datos del Cliente (Código Tango presente).', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Código de Cliente Tango ausente.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_101"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_102"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF jsonb_array_length(p_json_data->'productos') > 0 THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Array de productos no vacío.', 'checked_value', jsonb_array_length(p_json_data->'productos'));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: No se encontraron productos solicitados.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_102"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_103"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_cant NUMERIC;
BEGIN
    SELECT pi.cantidad_requerida_original INTO v_cant FROM pedido_instancias pi WHERE pi.id = p_instancia_id;
    IF v_cant IS NOT NULL AND v_cant > 0 THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Cantidad requerida en instancia: ' || v_cant || ' ton.', 'checked_value', v_cant);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Cantidad total requerida es nula o cero.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_103"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_104"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := p_json_data->>'numero_presupuesto';
    IF v_val IS NOT NULL AND v_val != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Número de Presupuesto presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: N° Cotización/Presupuesto ausente.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_104"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_105"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val NUMERIC;
BEGIN
    v_val := (p_json_data->>'precio_total_informado_usd')::NUMERIC;
    IF v_val IS NOT NULL AND v_val > 0 THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Precio total en USD presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Precio de Venta USD no presente o cero.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_105"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_106"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := p_json_data->>'incoterm';
    IF v_val IS NOT NULL AND v_val != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: INCOTERM (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: INCOTERM ausente.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_106"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_107"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val NUMERIC;
BEGIN
    v_val := (p_json_data->>'tipo_cambio')::NUMERIC;
    IF v_val IS NOT NULL AND v_val > 0 THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Tipo de cambio presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Tipo de Cambio ausente o cero.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_107"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_108"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := p_json_data->>'tipo_cotizacion';
    IF v_val IS NOT NULL AND v_val != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Tipo de Cotización presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Tipo de Cotización ausente.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_108"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_109"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_cant NUMERIC;
BEGIN
    SELECT p.cantidad_total_ton INTO v_cant FROM pedido_instancias pi JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = p_instancia_id;
    IF v_cant IS NOT NULL AND v_cant > 0 THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Toneladas a Embarcar validadas en tabla raíz.', 'checked_value', v_cant);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Toneladas a Embarcar ausentes en raíz.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_109"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_110"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := p_json_data->>'calidad_azucar';
    IF v_val IS NOT NULL AND v_val != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Calidad del Azúcar (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Calidad del Azúcar ausente.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_110"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_111"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := p_json_data->>'forma_pago';
    IF v_val IS NOT NULL AND v_val != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Forma de Pago (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Forma de Pago ausente.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_111"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_112"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := p_json_data->>'fecha_pago';
    IF v_val IS NOT NULL AND v_val != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Fecha de Pago presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Advertencia: Fecha de Pago ausente (No Bloqueante).');
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_112"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_113"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := p_json_data->>'fecha_entrega';
    IF v_val IS NOT NULL AND v_val != '' THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Fecha de Entrega presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Advertencia: Fecha de Entrega ausente (No Bloqueante).');
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_113"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_114"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := upper(COALESCE(p_json_data->>'paletizado', ''));
    IF v_val IN ('SI', 'NO') THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Si Paletiza (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Si Paletiza ausente o inválido.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_114"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_115"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val TEXT;
BEGIN
    v_val := upper(COALESCE(p_json_data->>'fraccionado', ''));
    IF v_val IN ('SI', 'NO') THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Si Fracciona (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Si Fracciona ausente o inválido.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_115"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_me_116"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_val BOOLEAN;
BEGIN
    -- Busca el resultado de la validación matemática hecha por n8n en el JSON
    v_val := (p_json_data->'validaciones'->'me'->>'resultado_global')::BOOLEAN;
    
    IF v_val IS TRUE THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Control Matemático de Precios ME validado en pre-proceso.');
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Control Matemático de Precios ME fallido o no ejecutado.', 'is_blocking', TRUE);
    END IF;
END; $$;


ALTER FUNCTION "public"."f_val_p_me_116"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_101"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    v_val := p_json_data->>'cliente_codigo_tango';
    IF v_val IS NOT NULL AND v_val != '' THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Datos del Cliente (Código Tango presente).', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Datos del Cliente (Código Tango ausente o vacío).', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_101"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_102"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val INT;
BEGIN
    v_val := jsonb_array_length(p_json_data->'productos');
    IF v_val > 0 THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Producto Solicitado (Array productos no vacío).', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Producto Solicitado (Array productos vacío).', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_102"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_103"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    v_val := p_json_data->'productos'->0->>'cantidad';
    IF v_val IS NOT NULL THEN -- Asume que la extracción ya validó que sea numérico
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Cantidad (Primer producto tiene cantidad).', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Cantidad (Primer producto no tiene cantidad).', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_103"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_104"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    v_val := p_json_data->>'precio_bolsa_informado';
    IF v_val IS NOT NULL THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Precio Final por Bolsa 50 KG presente.', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Precio Final por Bolsa 50 KG ausente.', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_104"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_105"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    v_val := p_json_data->>'precio_kg_informado';
    IF v_val IS NOT NULL THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Precio Final por KG presente.', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Precio Final por KG ausente.', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_105"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_106"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_ok BOOLEAN;
BEGIN
    v_ok := (jsonb_array_length(p_json_data->'productos') > 0 AND
             p_json_data->'productos'->0->>'cantidad' IS NOT NULL AND
             p_json_data->'productos'->0->>'peso_por_bolsa_kg' IS NOT NULL);
    IF v_ok THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Toneladas a Cargar (Datos disponibles para cálculo).');
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Toneladas a Cargar (Faltan cantidad o peso por bolsa en producto).');
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_106"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_107"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    -- Usa el campo corregido que toma el nombre del primer producto
    v_val := p_json_data->>'calidad_azucar';
    IF v_val IS NOT NULL AND v_val != '' THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Calidad del Azúcar (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Calidad del Azúcar (Campo vacío o ausente).', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_107"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_108"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    v_val := p_json_data->>'forma_pago';
    IF v_val IS NOT NULL AND v_val != '' THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Forma de Pago (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Forma de Pago ausente o vacía.', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_108"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_109"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    v_val := p_json_data->>'fecha_pago';
    IF v_val IS NOT NULL AND v_val != '' THEN
        -- Podríamos añadir validación de formato de fecha aquí si fuera necesario
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Fecha de Pago (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Fecha de Pago ausente o vacía.', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_109"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_110"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    v_val := p_json_data->>'paletizado';
    IF v_val IS NOT NULL AND v_val != '' THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Si Paletiza (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Si Paletiza ausente o vacío.', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_110"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_111"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val TEXT;
BEGIN
    v_val := p_json_data->>'fraccionado';
    IF v_val IS NOT NULL AND v_val != '' THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Si Fracciona (' || v_val || ') presente.', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Si Fracciona ausente o vacío.', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_111"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_112"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_result JSONB; v_val BOOLEAN;
BEGIN
    -- Verifica si el nodo 'Verifica procesabilidad' puso el resultado
    v_val := (p_json_data->'validaciones'->'mi'->>'validacion_bolsa_exitosa')::BOOLEAN;
    IF v_val IS TRUE THEN
        v_result := jsonb_build_object('status', 'SUCCESS', 'message', 'Éxito: Control Matemático Precio (Validado en pre-proceso).', 'checked_value', v_val);
    ELSE
        v_result := jsonb_build_object('status', 'FAILURE', 'message', 'Fallo: Control Matemático Precio (Falló en pre-proceso o no se ejecutó).', 'checked_value', v_val);
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_112"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_val_p_mi_113"("p_instancia_id" bigint, "p_json_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_result JSONB;
    v_val TEXT;
BEGIN
    v_val := p_json_data->>'fecha_entrega';

    -- Comprueba si la fecha de entrega está presente
    IF v_val IS NOT NULL AND v_val != '' THEN
        v_result := jsonb_build_object(
            'status', 'SUCCESS',
            'message', 'Éxito: Fecha de Entrega (' || v_val || ') presente.',
            'checked_value', v_val
        );
    ELSE
        -- Falla si está vacía o nula
        v_result := jsonb_build_object(
            'status', 'FAILURE',
            'message', 'Fallo: Fecha de Entrega ausente o vacía.',
            'checked_value', v_val
        );
    END IF;
    RETURN v_result;
END; $$;


ALTER FUNCTION "public"."f_val_p_mi_113"("p_instancia_id" bigint, "p_json_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalizar_provision_personal_ac"("p_personal_ac_id" integer, "p_auth_user_id" "uuid", "p_password_temporal" "text", "p_role_nombre" "text" DEFAULT 'Operador'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role_id integer;
  v_updated integer;
begin
  -- Validar rol
  select id into v_role_id
  from public.roles
  where nombre = p_role_nombre
  limit 1;

  if v_role_id is null then
    raise exception 'No existe el rol % en public.roles', p_role_nombre;
  end if;

  -- Validar personal_ac y que no tenga auth_user_id
  update public.personal_ac
  set auth_user_id = p_auth_user_id,
      password_temporal = p_password_temporal
  where id = p_personal_ac_id
    and auth_user_id is null;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'personal_ac id=% no existe o ya tiene auth_user_id', p_personal_ac_id;
  end if;

  -- Asignar rol (idempotente)
  insert into public.personal_ac_roles (personal_ac_id, role_id)
  values (p_personal_ac_id, v_role_id)
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'personal_ac_id', p_personal_ac_id,
    'auth_user_id', p_auth_user_id,
    'role_id', v_role_id
  );
end;
$$;


ALTER FUNCTION "public"."finalizar_provision_personal_ac"("p_personal_ac_id" integer, "p_auth_user_id" "uuid", "p_password_temporal" "text", "p_role_nombre" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_trg_inspecciones_sync_magic_link"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."fn_trg_inspecciones_sync_magic_link"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_magic_link"("p_instancia_id" bigint, "p_tipo_entidad" "text", "p_usuario_email" "text", "p_validez" interval DEFAULT '48:00:00'::interval) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_token UUID;
BEGIN
    INSERT INTO public.magic_links (instancia_id, tipo_entidad, usuario_email, expires_at)
    VALUES (p_instancia_id, p_tipo_entidad, p_usuario_email, NOW() + p_validez)
    RETURNING token INTO v_token;
    
    RETURN v_token;
END;
$$;


ALTER FUNCTION "public"."generate_magic_link"("p_instancia_id" bigint, "p_tipo_entidad" "text", "p_usuario_email" "text", "p_validez" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_asunto_instancia"("p_instancia_id" bigint) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_pedido_ref TEXT;
    v_oc_ref TEXT;
    v_remito_ref TEXT;
    v_asunto TEXT;
BEGIN
    -- 1. Buscar Referencia del Pedido (Siempre existe)
    SELECT p.pedido_ref_externa 
    INTO v_pedido_ref
    FROM public.pedido_instancias pi
    JOIN public.pedidos p ON pi.pedido_id = p.id
    WHERE pi.id = p_instancia_id;

    -- 2. Buscar Referencia de OC (Puede estar directa o en un padre)
    -- Buscamos en la tabla de vinculaciones si esta instancia (o alguna de su cadena) tiene OC
    -- Nota: Usamos una subquery recursiva simple o lógica directa si tu modelo vincula en 'vinculaciones_pedido_oc'
    SELECT oc.oc_ref_externa
    INTO v_oc_ref
    FROM public.vinculaciones_pedido_oc v
    JOIN public.oc_instancias oi ON v.oc_instance_id = oi.id
    JOIN public.ordenes_compra oc ON oi.oc_id = oc.id
    WHERE v.pedido_instance_id = p_instancia_id
    LIMIT 1;

    -- Si no encontramos OC directa, buscamos en el padre (Recursividad simple de 1 nivel por ahora, o usamos el identificador compuesto si es fiable)
    IF v_oc_ref IS NULL THEN
        SELECT oc.oc_ref_externa
        INTO v_oc_ref
        FROM public.pedido_instancias hija
        JOIN public.pedido_instancias madre ON hija.parent_instance_id = madre.id
        JOIN public.vinculaciones_pedido_oc v ON v.pedido_instance_id = madre.id
        JOIN public.oc_instancias oi ON v.oc_instance_id = oi.id
        JOIN public.ordenes_compra oc ON oi.oc_id = oc.id
        WHERE hija.id = p_instancia_id;
    END IF;

    -- 3. Buscar Referencia de Remito (Si esta instancia nació de un remito)
    -- Buscamos en remito_items donde destino_instance_id sea esta instancia
    SELECT r.remito_ref_externa
    INTO v_remito_ref
    FROM public.remito_items ri
    JOIN public.remitos r ON ri.remito_id = r.id
    WHERE ri.destino_instance_id = p_instancia_id;

    -- 4. Construir el Asunto
    v_asunto := 'PEDIDO: ' || COALESCE(v_pedido_ref, '???');

    IF v_oc_ref IS NOT NULL THEN
        v_asunto := v_asunto || ' | OC: ' || v_oc_ref;
    END IF;

    IF v_remito_ref IS NOT NULL THEN
        v_asunto := v_asunto || ' | REMITO: ' || v_remito_ref;
    END IF;

    -- Agregamos el ID de Instancia al final (La llave maestra)
    v_asunto := v_asunto || ' | INSTANCIA: ' || p_instancia_id;

    RETURN v_asunto;
END;
$$;


ALTER FUNCTION "public"."get_asunto_instancia"("p_instancia_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_asunto_instancia"("p_instancia_id" bigint, "p_tipo" "text" DEFAULT 'PEDIDO'::"text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_ref_principal TEXT;
    v_ref_secundaria TEXT; 
    v_remito_ref TEXT;
    v_asunto TEXT;
BEGIN
    -- CASO 1: PEDIDO
    IF p_tipo = 'PEDIDO' THEN
        -- ... (Lógica de Pedido igual que antes) ...
        SELECT p.pedido_ref_externa INTO v_ref_principal
        FROM public.pedido_instancias pi JOIN public.pedidos p ON pi.pedido_id = p.id WHERE pi.id = p_instancia_id;

        SELECT oc.oc_ref_externa INTO v_ref_secundaria
        FROM public.vinculaciones_pedido_oc v JOIN public.oc_instancias oi ON v.oc_instance_id = oi.id JOIN public.ordenes_compra oc ON oi.oc_id = oc.id
        WHERE v.pedido_instance_id = p_instancia_id LIMIT 1;
        
        IF v_ref_secundaria IS NULL THEN
             SELECT oc.oc_ref_externa INTO v_ref_secundaria
             FROM public.pedido_instancias hija JOIN public.pedido_instancias madre ON hija.parent_instance_id = madre.id JOIN public.vinculaciones_pedido_oc v ON v.pedido_instance_id = madre.id JOIN public.oc_instancias oi ON v.oc_instance_id = oi.id JOIN public.ordenes_compra oc ON oi.oc_id = oc.id
             WHERE hija.id = p_instancia_id;
        END IF;

        SELECT r.remito_ref_externa INTO v_remito_ref
        FROM public.remito_items ri JOIN public.remitos r ON ri.remito_id = r.id
        WHERE ri.destino_instance_id = p_instancia_id AND ri.origen_type = 'PEDIDO';

        v_asunto := 'PEDIDO: ' || COALESCE(v_ref_principal, '???');
        IF v_ref_secundaria IS NOT NULL THEN v_asunto := v_asunto || ' | OC: ' || v_ref_secundaria; END IF;

    -- CASO 2: ORDEN DE COMPRA (OC)
    ELSIF p_tipo = 'OC' THEN
        -- 2.1 Buscar Referencia de la OC (Principal)
        SELECT oc.oc_ref_externa INTO v_ref_principal
        FROM public.oc_instancias oi JOIN public.ordenes_compra oc ON oi.oc_id = oc.id
        WHERE oi.id = p_instancia_id;

        -- 2.2 NUEVO: Buscar Referencia del Pedido vinculado (Secundaria)
        -- Buscamos en vinculaciones donde esta OC sea la protagonista
        SELECT p.pedido_ref_externa INTO v_ref_secundaria
        FROM public.vinculaciones_pedido_oc v
        JOIN public.pedido_instancias pi ON v.pedido_instance_id = pi.id
        JOIN public.pedidos p ON pi.pedido_id = p.id
        WHERE v.oc_instance_id = p_instancia_id
        LIMIT 1;

        -- 2.3 Buscar Remito
        SELECT r.remito_ref_externa INTO v_remito_ref
        FROM public.remito_items ri JOIN public.remitos r ON ri.remito_id = r.id
        WHERE ri.destino_instance_id = p_instancia_id AND ri.origen_type = 'OC';

        -- Construcción Asunto OC (Ahora incluye Pedido si existe)
        v_asunto := 'OC: ' || COALESCE(v_ref_principal, '???');
        IF v_ref_secundaria IS NOT NULL THEN v_asunto := v_asunto || ' | PEDIDO: ' || v_ref_secundaria; END IF;

    END IF;

    -- COMÚN
    IF v_remito_ref IS NOT NULL THEN v_asunto := v_asunto || ' | REMITO: ' || v_remito_ref; END IF;
    v_asunto := v_asunto || ' | INSTANCIA: ' || p_instancia_id;

    RETURN v_asunto;
END;
$$;


ALTER FUNCTION "public"."get_asunto_instancia"("p_instancia_id" bigint, "p_tipo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_candidatos_para_remito"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_pedidos jsonb;
    v_ocs jsonb;
BEGIN
    -- 1. Buscar Pedidos en Estado 3.1.1 (Esperando Remitos)
    -- Recuperamos ID compuesto, Cliente y Saldo pendiente
    SELECT jsonb_agg(
        jsonb_build_object(
            'tipo', 'PEDIDO',
            'identificador', pi.identificador_compuesto,
            'saldo_ton', pi.saldo_pendiente,
            'cliente', (SELECT cliente_nombre FROM pedidos WHERE id = pi.pedido_id)
        )
    ) INTO v_pedidos
    FROM pedido_instancias pi
    JOIN state_definitions sd ON pi.current_state_id = sd.id
    WHERE sd.state_code = '3.1.1' 
      AND pi.status = 'ACTIVA';

    -- 2. Buscar OCs en Estado 2 (Disponible)
    -- Recuperamos ID, Proveedor y Cantidad
    SELECT jsonb_agg(
        jsonb_build_object(
            'tipo', 'OC',
            'identificador', COALESCE(oi.identificador_compuesto, oc.oc_ref_externa),
            'saldo_ton', oi.cantidad_disponible,
            'proveedor', (SELECT razon_social FROM proveedores WHERE codigo = oc.proveedor_codigo)
        )
    ) INTO v_ocs
    FROM oc_instancias oi
    JOIN state_definitions sd ON oi.current_state_id = sd.id
    JOIN ordenes_compra oc ON oi.oc_id = oc.id
    WHERE sd.state_code = '2' 
      AND oi.status = 'ACTIVA';

    -- 3. Retorno combinado
    RETURN jsonb_build_object(
        'pedidos_candidatos', COALESCE(v_pedidos, '[]'::jsonb),
        'ocs_candidatas', COALESCE(v_ocs, '[]'::jsonb)
    );
END;
$$;


ALTER FUNCTION "public"."get_candidatos_para_remito"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_candidatos_para_remito"("p_cantidad_remito" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_grupos_validos jsonb := '[]'::jsonb;
    v_grupos_insuficientes jsonb := '[]'::jsonb;
BEGIN
    WITH base_data AS (
        -- 1. Pedidos en 3.1.1 (Esperando Remito)
        SELECT 
            'PEDIDO' as tipo,
            pi.id as id,
            pi.identificador_compuesto as ref,
            pi.saldo_pendiente as saldo,
            -- Origen: Lugar de carga de la OC vinculada (JSON OC)
            COALESCE(oi.current_data->>'lugar_carga', 'Origen No Especificado') as origen_nombre,
            -- Entidad: Nombre del Cliente (JSON Pedido)
            COALESCE(pi.current_data->>'cliente_nombre', 'Cliente Desconocido') as entidad_nombre
        FROM pedido_instancias pi
        JOIN vinculaciones_pedido_oc v ON v.pedido_instance_id = pi.id
        JOIN oc_instancias oi ON oi.id = v.oc_instance_id
        JOIN state_definitions sd ON pi.current_state_id = sd.id
        WHERE sd.state_code = '3.1.1' 
          AND pi.status = 'ACTIVA'
        
        UNION ALL
        
        -- 2. OCs en 2 (Disponibles)
        SELECT 
            'OC' as tipo,
            oi.id as id,
            COALESCE(oi.identificador_compuesto, (SELECT oc_ref_externa FROM ordenes_compra WHERE id = oi.oc_id)) as ref,
            oi.cantidad_disponible as saldo,
            -- Origen: Lugar de carga (JSON OC)
            COALESCE(oi.current_data->>'lugar_carga', 'Origen No Especificado') as origen_nombre,
            -- Entidad: Razón Social Proveedor (JSON OC)
            COALESCE(oi.current_data->'proveedor'->>'razon_social', 'Proveedor Desconocido') as entidad_nombre
        FROM oc_instancias oi
        JOIN state_definitions sd ON oi.current_state_id = sd.id
        WHERE sd.state_code = '2' 
          AND oi.status = 'ACTIVA'
    ),
    grouped_data AS (
        SELECT 
            origen_nombre,
            SUM(saldo) as saldo_total,
            jsonb_agg(jsonb_build_object(
                'tipo', tipo,
                'id', id,
                'ref', ref,
                'saldo', saldo,
                'entidad', entidad_nombre
            )) as items
        FROM base_data
        GROUP BY origen_nombre
    )
    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object('origen', origen_nombre, 'total', saldo_total, 'opciones', items)
        ) FILTER (WHERE saldo_total >= p_cantidad_remito), '[]'::jsonb),
        COALESCE(jsonb_agg(
            jsonb_build_object('origen', origen_nombre, 'total', saldo_total, 'opciones', items)
        ) FILTER (WHERE saldo_total < p_cantidad_remito), '[]'::jsonb)
    INTO v_grupos_validos, v_grupos_insuficientes
    FROM grouped_data;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'cantidad_requerida', p_cantidad_remito,
        'grupos_validos', v_grupos_validos,
        'grupos_insuficientes', v_grupos_insuficientes
    );
END;
$$;


ALTER FUNCTION "public"."get_candidatos_para_remito"("p_cantidad_remito" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_data_for_magic_link"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_link RECORD;
    v_data JSONB;
BEGIN
    -- 1. Validar el token
    SELECT * INTO v_link FROM public.magic_links WHERE token = p_token AND expires_at > NOW();
    
    IF v_link IS NULL THEN
        RETURN jsonb_build_object('error', 'Token inválido o expirado');
    END IF;

    -- 2. Recopilar datos (Asumimos tipo_entidad = 'REMITO' para este caso)
    -- Aquí unimos Remito, Pedido y OC en un solo objeto para el formulario
    SELECT jsonb_build_object(
        'remito', (SELECT to_jsonb(r.*) FROM public.remitos r WHERE r.id = v_link.instancia_id),
        'pedido', (
            SELECT to_jsonb(p.*) 
            FROM public.remito_items ri 
            JOIN public.pedido_instancias pi ON ri.origen_instance_id = pi.id
            JOIN public.pedidos p ON pi.pedido_id = p.id
            WHERE ri.remito_id = v_link.instancia_id LIMIT 1
        ),
        'maestros', jsonb_build_object(
            'choferes', (SELECT jsonb_agg(to_jsonb(c.*)) FROM public.choferes c),
            'camiones', (SELECT jsonb_agg(to_jsonb(cm.*)) FROM public.camiones cm),
            'balanzas', (SELECT jsonb_agg(to_jsonb(b.*)) FROM public.lugares_pesaje b),
            'personal', (SELECT jsonb_agg(to_jsonb(pa.*)) FROM public.personal_ac pa)
        )
    ) INTO v_data;

    RETURN v_data;
END;
$$;


ALTER FUNCTION "public"."get_data_for_magic_link"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_full_context_by_remito"("p_remito_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'remito', (SELECT to_jsonb(r.*) FROM public.remitos r WHERE r.id = p_remito_id),
        'pedidos', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'pedido_ref', p.pedido_ref_externa,
                    'cliente', c.razon_social,
                    'cantidad', ri.cantidad
                )
            ), '[]'::jsonb)
            FROM public.remito_items ri
            JOIN public.pedido_instancias pi ON ri.origen_instance_id = pi.id
            JOIN public.pedidos p ON pi.pedido_id = p.id
            JOIN public.clientes c ON p.cliente_id = c.id
            WHERE ri.remito_id = p_remito_id
        ),
        'catalogos', jsonb_build_object(
            'choferes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre_completo, 'dni', dni)), '[]'::jsonb) FROM public.choferes),
            'camiones', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'patente', patente, 'tipo', tipo)), '[]'::jsonb) FROM public.camiones),
            'balanzas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre)), '[]'::jsonb) FROM public.lugares_pesaje),
            
            -- Los nuevos Catálogos de Roles Nativos:
            'inspectores', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre_completo)), '[]'::jsonb) 
                FROM public.personal_ac p
                JOIN public.personal_ac_roles pr ON p.id = pr.personal_ac_id
                JOIN public.roles r ON pr.role_id = r.id
                WHERE r.codigo = 'INSP'
            ),
            'supervisores', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre_completo)), '[]'::jsonb) 
                FROM public.personal_ac p
                JOIN public.personal_ac_roles pr ON p.id = pr.personal_ac_id
                JOIN public.roles r ON pr.role_id = r.id
                WHERE r.codigo IN ('SUP', 'OP')
            ),
            
            'tareas_control', (SELECT COALESCE(jsonb_agg(to_jsonb(tc.*) ORDER BY tc.orden_sugerido ASC), '[]'::jsonb) FROM public.catalogo_tareas_control tc)
        )
    ) INTO v_result;
    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_full_context_by_remito"("p_remito_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_full_context_by_token"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_link RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_link FROM public.magic_links WHERE token = p_token AND expires_at > NOW();
    IF v_link IS NULL THEN RETURN jsonb_build_object('error', 'Token inválido o expirado'); END IF;

    SELECT jsonb_build_object(
        'contexto', jsonb_build_object(
            'token', p_token,
            'tipo_entidad', v_link.tipo_entidad,
            'instancia_id', v_link.instancia_id,
            'remitente_operador', v_link.usuario_email
        ),
        'remito', (SELECT to_jsonb(r.*) FROM public.remitos r WHERE r.id = (
            SELECT remito_id FROM public.remito_items WHERE destino_instance_id = v_link.instancia_id LIMIT 1
        )),
        'pedido', (SELECT to_jsonb(p.*) FROM public.pedidos p WHERE p.id = (
            SELECT pedido_id FROM public.pedido_instancias WHERE id = v_link.instancia_id
        )),
        'catalogos', jsonb_build_object(
            'choferes', (SELECT jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre_completo, 'dni', dni)) FROM public.choferes),
            'camiones', (SELECT jsonb_agg(jsonb_build_object('id', id, 'patente', patente, 'tipo', tipo)) FROM public.camiones),
            'balanzas', (SELECT jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre)) FROM public.lugares_pesaje),
            'personal', (SELECT jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre_completo)) FROM public.personal_ac),
            -- CORRECCIÓN AQUÍ: Ordenamos dentro del jsonb_agg de forma segura
            'tareas_control', (SELECT jsonb_agg(to_jsonb(tc.*) ORDER BY tc.orden_sugerido ASC) FROM public.catalogo_tareas_control tc)
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_full_context_by_token"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inspeccion_by_token"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."get_inspeccion_by_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_instance_lineage"("p_identificador_humano" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_root_id bigint;
    v_tipo_entidad text; -- 'PEDIDO' o 'OC'
    v_lineage_nodes jsonb;
    v_lineage_edges jsonb;
    v_timeline_events jsonb;
BEGIN
    -- 1. Resolver ID y Tipo de Entidad
    -- Primero buscamos en Pedidos
    SELECT id, 'PEDIDO' INTO v_root_id, v_tipo_entidad
    FROM pedido_instancias
    WHERE identificador_compuesto = p_identificador_humano;

    -- Si no es pedido, buscamos en OC
    IF v_root_id IS NULL THEN
        SELECT id, 'OC' INTO v_root_id, v_tipo_entidad
        FROM oc_instancias
        WHERE identificador_compuesto = p_identificador_humano
           OR (identificador_compuesto IS NULL AND oc_id IN (SELECT id FROM ordenes_compra WHERE oc_ref_externa = p_identificador_humano));
    END IF;

    IF v_root_id IS NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Instancia no encontrada: ' || p_identificador_humano);
    END IF;

    -- 2. Lógica Diferenciada por Tipo
    
    IF v_tipo_entidad = 'PEDIDO' THEN
        -- === LÓGICA PARA PEDIDOS ===
        WITH RECURSIVE 
        ancestors AS (
            SELECT id, parent_instance_id, identificador_compuesto, current_state_id, saldo_pendiente as saldo, created_at, 0 as nivel, 'CONSULTADA' as relacion
            FROM pedido_instancias WHERE id = v_root_id
            UNION ALL
            SELECT p.id, p.parent_instance_id, p.identificador_compuesto, p.current_state_id, p.saldo_pendiente, p.created_at, a.nivel - 1, 'ANCESTRO'
            FROM pedido_instancias p JOIN ancestors a ON p.id = a.parent_instance_id
        ),
        descendants AS (
            SELECT id, parent_instance_id, identificador_compuesto, current_state_id, saldo_pendiente as saldo, created_at, 0 as nivel, 'CONSULTADA' as relacion
            FROM pedido_instancias WHERE id = v_root_id
            UNION ALL
            SELECT p.id, p.parent_instance_id, p.identificador_compuesto, p.current_state_id, p.saldo_pendiente, p.created_at, d.nivel + 1, 'DESCENDIENTE'
            FROM pedido_instancias p JOIN descendants d ON p.parent_instance_id = d.id
        ),
        full_tree AS (SELECT * FROM ancestors UNION SELECT * FROM descendants)
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', ft.id, 'label', COALESCE(ft.identificador_compuesto, 'Pedido Original'),
                'type', ft.relacion, 'nivel', ft.nivel, 'estado_actual', sd.state_code,
                'saldo_ton', ft.saldo, 'fecha_creacion', ft.created_at, 'entidad', 'PEDIDO'
            ) ORDER BY ft.nivel
        ) INTO v_lineage_nodes
        FROM full_tree ft JOIN state_definitions sd ON ft.current_state_id = sd.id;

        -- Aristas Pedidos (CORREGIDO: AS n)
        WITH nodes_ids AS (
            SELECT (n->>'id')::bigint as id 
            FROM jsonb_array_elements(v_lineage_nodes) AS n
        )
        SELECT jsonb_agg(jsonb_build_object('source', parent_instance_id, 'target', id, 'label', 'derivado')) INTO v_lineage_edges
        FROM pedido_instancias WHERE id IN (SELECT id FROM nodes_ids) AND parent_instance_id IN (SELECT id FROM nodes_ids);

        -- Eventos Pedidos (CORREGIDO: AS n)
        WITH nodes_ids AS (
            SELECT (n->>'id')::bigint as id 
            FROM jsonb_array_elements(v_lineage_nodes) AS n
        )
        SELECT jsonb_agg(jsonb_build_object(
            'fecha', he.timestamp, 'instancia_afectada', pi.identificador_compuesto,
            'tipo_evento', he.event_type, 'descripcion', he.description, 'actor', he.user_actor, 'detalles', he.details
        ) ORDER BY he.timestamp ASC) INTO v_timeline_events
        FROM historial_eventos he JOIN pedido_instancias pi ON he.pedido_instance_id = pi.id
        WHERE he.pedido_instance_id IN (SELECT id FROM nodes_ids);

    ELSE
        -- === LÓGICA PARA OCs ===
        WITH RECURSIVE 
        ancestors AS (
            SELECT id, parent_instance_id, identificador_compuesto, current_state_id, cantidad_disponible as saldo, created_at, 0 as nivel, 'CONSULTADA' as relacion
            FROM oc_instancias WHERE id = v_root_id
            UNION ALL
            SELECT o.id, o.parent_instance_id, o.identificador_compuesto, o.current_state_id, o.cantidad_disponible, o.created_at, a.nivel - 1, 'ANCESTRO'
            FROM oc_instancias o JOIN ancestors a ON o.id = a.parent_instance_id
        ),
        descendants AS (
            SELECT id, parent_instance_id, identificador_compuesto, current_state_id, cantidad_disponible as saldo, created_at, 0 as nivel, 'CONSULTADA' as relacion
            FROM oc_instancias WHERE id = v_root_id
            UNION ALL
            SELECT o.id, o.parent_instance_id, o.identificador_compuesto, o.current_state_id, o.cantidad_disponible, o.created_at, d.nivel + 1, 'DESCENDIENTE'
            FROM oc_instancias o JOIN descendants d ON o.parent_instance_id = d.id
        ),
        full_tree AS (SELECT * FROM ancestors UNION SELECT * FROM descendants)
        
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', ft.id, 
                'label', COALESCE(ft.identificador_compuesto, (SELECT oc_ref_externa FROM ordenes_compra WHERE id = (SELECT oc_id FROM oc_instancias WHERE id=ft.id))),
                'type', ft.relacion, 'nivel', ft.nivel, 'estado_actual', sd.state_code,
                'saldo_ton', ft.saldo, 'fecha_creacion', ft.created_at, 'entidad', 'OC'
            ) ORDER BY ft.nivel
        ) INTO v_lineage_nodes
        FROM full_tree ft JOIN state_definitions sd ON ft.current_state_id = sd.id;

        -- Aristas OC (CORREGIDO: AS n)
        WITH nodes_ids AS (
            SELECT (n->>'id')::bigint as id 
            FROM jsonb_array_elements(v_lineage_nodes) AS n
        )
        SELECT jsonb_agg(jsonb_build_object('source', parent_instance_id, 'target', id, 'label', 'derivado')) INTO v_lineage_edges
        FROM oc_instancias WHERE id IN (SELECT id FROM nodes_ids) AND parent_instance_id IN (SELECT id FROM nodes_ids);

        -- Eventos OC (CORREGIDO: AS n)
        WITH nodes_ids AS (
            SELECT (n->>'id')::bigint as id 
            FROM jsonb_array_elements(v_lineage_nodes) AS n
        )
        SELECT jsonb_agg(jsonb_build_object(
            'fecha', he.timestamp, 
            'instancia_afectada', COALESCE(oi.identificador_compuesto, (SELECT oc_ref_externa FROM ordenes_compra WHERE id=oi.oc_id)),
            'tipo_evento', he.event_type, 'descripcion', he.description, 'actor', he.user_actor, 'detalles', he.details
        ) ORDER BY he.timestamp ASC) INTO v_timeline_events
        FROM historial_eventos he JOIN oc_instancias oi ON he.oc_instance_id = oi.id
        WHERE he.oc_instance_id IN (SELECT id FROM nodes_ids);
    END IF;

    -- 5. Retorno Final
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'instancia_consultada', p_identificador_humano,
        'tipo_entidad', v_tipo_entidad,
        'graph_data', jsonb_build_object(
            'nodes', COALESCE(v_lineage_nodes, '[]'::jsonb),
            'edges', COALESCE(v_lineage_edges, '[]'::jsonb)
        ),
        'timeline_data', COALESCE(v_timeline_events, '[]'::jsonb)
    );

END;
$$;


ALTER FUNCTION "public"."get_instance_lineage"("p_identificador_humano" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_instance_requirements"("p_instance_id" bigint, "p_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_state_id INT;
    v_current_data JSONB;
    v_state_name TEXT;
    v_state_desc TEXT;
    v_state_code TEXT;
    v_requirements JSONB;
BEGIN
    -- 1. Obtener datos de la instancia según el tipo
    IF p_type = 'PEDIDO' THEN
        SELECT 
            pi.current_state_id, 
            pi.current_data,
            sd.name,
            sd.description,
            sd.state_code
        INTO 
            v_current_state_id, 
            v_current_data,
            v_state_name,
            v_state_desc,
            v_state_code
        FROM public.pedido_instancias pi
        JOIN public.state_definitions sd ON pi.current_state_id = sd.id
        WHERE pi.id = p_instance_id;
        
    ELSIF p_type = 'OC' THEN
        SELECT 
            oi.current_state_id, 
            oi.current_data,
            sd.name,
            sd.description,
            sd.state_code
        INTO 
            v_current_state_id, 
            v_current_data,
            v_state_name,
            v_state_desc,
            v_state_code
        FROM public.oc_instancias oi
        JOIN public.state_definitions sd ON oi.current_state_id = sd.id
        WHERE oi.id = p_instance_id;
    ELSE
        RETURN jsonb_build_object('error', 'Tipo inválido. Use PEDIDO o OC');
    END IF;

    -- Validar si se encontró la instancia
    IF v_current_state_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Instancia no encontrada');
    END IF;

    -- 2. Obtener las validaciones requeridas para este estado
    -- y verificar si existen en el JSON (Best Effort check)
    SELECT jsonb_agg(
        jsonb_build_object(
            'codigo', vd.validation_code,
            'nombre', vd.name,
            'descripcion', vd.description,
            'es_bloqueante', vd.is_blocking,
            -- Intenta verificar si la validación existe y es true en el JSON
            -- Asume estructura: current_data -> validations -> CODIGO = true
            'estado_actual', COALESCE((v_current_data->'validations'->>vd.validation_code)::boolean, false)
        ) ORDER BY vd.is_blocking DESC, vd.name ASC
    )
    INTO v_requirements
    FROM public.state_validation_requirements svr
    JOIN public.validation_definitions vd ON svr.validation_id = vd.id
    WHERE svr.state_id = v_current_state_id;

    -- 3. Construir respuesta final
    RETURN jsonb_build_object(
        'estado_actual', jsonb_build_object(
            'codigo', v_state_code,
            'nombre', v_state_name,
            'descripcion_operativa', v_state_desc
        ),
        'validaciones_requeridas', COALESCE(v_requirements, '[]'::jsonb),
        'timestamp', NOW()
    );
END;
$$;


ALTER FUNCTION "public"."get_instance_requirements"("p_instance_id" bigint, "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pedido_instance_for_manual_action"("p_identificador_compuesto" "text") RETURNS TABLE("instance_id" bigint, "state_code" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Busca cualquier instancia ACTIVA que coincida con el ID, sin importar el estado.
    RETURN QUERY
    SELECT 
        pi.id, 
        sd.state_code::TEXT
    FROM pedido_instancias pi
    JOIN state_definitions sd ON pi.current_state_id = sd.id
    WHERE pi.identificador_compuesto = p_identificador_compuesto
      AND pi.status = 'ACTIVA'; 
END;
$$;


ALTER FUNCTION "public"."get_pedido_instance_for_manual_action"("p_identificador_compuesto" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_remitos_activos"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
WITH items_del_remito AS (
    SELECT 
        r.id as remito_internal_id,
        r.remito_ref_externa as nro_remito,
        ch.nombre_completo as chofer_nombre,
        ch.dni as chofer_dni,
        ch.telefono as chofer_telefono,
        jsonb_build_object(
            'id_instancia', pi.id,
            'identificador_instancia', pi.identificador_compuesto,
            'pedido_ref', p.pedido_ref_externa,
            'cliente', c.razon_social,
            'oc_ref', oc.oc_ref_externa,
            'proveedor', prov.razon_social,
            'cantidad_ton_item', ri.cantidad
        ) as info_item
    FROM remitos r
    LEFT JOIN choferes ch ON r.chofer_id = ch.id
    JOIN remito_items ri ON ri.remito_id = r.id
    JOIN pedido_instancias pi ON ri.origen_instance_id = pi.id AND ri.origen_type = 'PEDIDO'
    JOIN pedidos p ON pi.pedido_id = p.id
    JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN vinculaciones_pedido_oc v ON v.pedido_instance_id = pi.id
    LEFT JOIN oc_instancias oi ON v.oc_instance_id = oi.id
    LEFT JOIN ordenes_compra oc ON oi.oc_id = oc.id
    LEFT JOIN proveedores prov ON oc.proveedor_id = prov.id
    WHERE r.estado_asignacion = 'ASIGNADO'
),
remitos_agrupados AS (
    SELECT 
        remito_internal_id as id,
        nro_remito,
        chofer_nombre,
        chofer_dni,
        chofer_telefono,
        jsonb_agg(info_item) as instancias_vinculadas
    FROM items_del_remito
    GROUP BY remito_internal_id, nro_remito, chofer_nombre, chofer_dni, chofer_telefono
)
SELECT COALESCE(jsonb_agg(to_jsonb(ra.*)), '[]'::jsonb) FROM remitos_agrupados ra;
$$;


ALTER FUNCTION "public"."get_remitos_activos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_vinculacion_details"("p_pedido_hija_id" bigint) RETURNS TABLE("pedido_ref" "text", "oc_ref" "text", "margen_calculado" numeric, "margen_requerido" numeric, "cantidad_vinculada" numeric, "pedido_madre_saldo_restante" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.pedido_ref_externa::TEXT, 
        oc.oc_ref_externa::TEXT,
        COALESCE(v.margen_rentabilidad_calculado, 0.0),
        COALESCE((pi_hija.current_data->>'margen_rentabilidad_requerido')::NUMERIC, 4.0) AS margen_requerido,
        
        -- CORRECCIÓN DEFINITIVA: Usamos el nombre correcto de la columna en la tabla 'v'
        COALESCE(v.cantidad_vinculada, 0.0) AS cantidad_vinculada,
        
        -- Saldo de la madre
        COALESCE(pi_madre.saldo_pendiente, 0.0) AS pedido_madre_saldo_restante
        
    FROM pedido_instancias pi_hija
    JOIN vinculaciones_pedido_oc v ON v.pedido_instance_id = pi_hija.id
    JOIN oc_instancias oi ON oi.id = v.oc_instance_id
    JOIN ordenes_compra oc ON oc.id = oi.oc_id
    JOIN pedidos p ON p.id = pi_hija.pedido_id
    LEFT JOIN pedido_instancias pi_madre ON pi_madre.id = pi_hija.parent_instance_id
    WHERE pi_hija.id = p_pedido_hija_id;
END;
$$;


ALTER FUNCTION "public"."get_vinculacion_details"("p_pedido_hija_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insertar_oc_si_nueva"("oc_json" "jsonb") RETURNS TABLE("oc_ref_externa_out" "text", "instancia_id_out" bigint, "identificador_compuesto_out" "text", "estado_actual_out" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_oc_id INT;
    v_instancia_id BIGINT;
    v_oc_ref TEXT := oc_json->>'numero_oc';
    v_estado_actual TEXT;
    v_cantidad_total_ton NUMERIC(12, 3);
    v_precio_neto_kg NUMERIC(10, 4);
    v_peso_bolsa_kg NUMERIC := 50.0; 
    v_precio_bolsa_bruto NUMERIC(10, 4);
    v_estado_inicial_id INT;
BEGIN
    -- 1. Chequear si la OC ya existe
    SELECT id INTO v_oc_id FROM ordenes_compra WHERE oc_ref_externa = v_oc_ref LIMIT 1;

    -- 2. Si no existe, crearla
    IF v_oc_id IS NULL THEN
        
        -- *** CÁLCULOS PREVIOS DE VARIABLES ***
        WITH producto_data AS (
            SELECT 
                COALESCE(
                    (oc_json->>'toneladas_cargar')::NUMERIC,
                    (oc_json->>'toneladas_embarcar')::NUMERIC,
                    0
                ) AS cantidad_total_toneladas,
                (oc_json->>'precio_bolsa_informado')::NUMERIC AS precio_bolsa_bruto
        )
        -- ASIGNAR VALORES CALCULADOS
        SELECT cantidad_total_toneladas, precio_bolsa_bruto INTO v_cantidad_total_ton, v_precio_bolsa_bruto FROM producto_data;

        -- CALCULAR PRECIO COMPRA NETO/KG: (Precio Bolsa BRUTO / 1.21) / Peso Bolsa (50 KG)
        v_precio_neto_kg := (v_precio_bolsa_bruto / 1.21) / v_peso_bolsa_kg;
        
        -- Obtener ID de estado inicial
        SELECT id INTO v_estado_inicial_id FROM state_definitions WHERE fsm_id = 2 AND state_code = '1';

        -- 3. Consolidar la inserción en una ÚNICA secuencia de CTEs
        WITH input_json AS ( 
            SELECT oc_json AS data
        ),
        upsert_proveedor AS (
            INSERT INTO proveedores (codigo_proveedor, razon_social)
            SELECT data->'proveedor'->>'codigo', data->'proveedor'->>'razon_social' FROM input_json
            ON CONFLICT (codigo_proveedor) DO UPDATE SET razon_social = EXCLUDED.razon_social
            RETURNING id
        ),
        inserted_oc AS (
            INSERT INTO ordenes_compra (
                proveedor_id,
                oc_ref_externa,
                tipo_operatoria,
                fecha_emision,
                cantidad_total_ton,
                precio_neto_kg
            )
            SELECT
                up.id,
                ij.data->>'numero_oc',
                ij.data->>'tipo_operatoria',
                TO_DATE(ij.data->>'fecha_emision', 'DD/MM/YYYY'),
                v_cantidad_total_ton,
                v_precio_neto_kg
            FROM input_json ij, upsert_proveedor up
            RETURNING id, oc_ref_externa
        ),
        inserted_instancia AS (
            INSERT INTO oc_instancias (
                oc_id,
                parent_instance_id,
                current_state_id,
                identificador_compuesto,
                cantidad_total,
                cantidad_disponible,
                status,
                current_data
            )
            SELECT
                io.id,
                NULL,
                v_estado_inicial_id, 
                io.oc_ref_externa, 
                v_cantidad_total_ton, 
                v_cantidad_total_ton, 
                'ACTIVA'::instance_status,
                ij.data 
            FROM inserted_oc io, input_json ij
            RETURNING id, oc_id
        ),
        log_creacion AS (
            INSERT INTO historial_eventos (
                oc_instance_id, event_type, description, user_actor, details
            )
            SELECT
                ii.id, 'INSTANCE_CREATED'::event_type, 'Creada instancia inicial para OC ' || io.oc_ref_externa, 'SISTEMA', ij.data
            FROM inserted_instancia ii, inserted_oc io, input_json ij
        ),
        log_transicion AS (
            INSERT INTO historial_eventos (
                oc_instance_id, event_type, description, user_actor, details
            )
            SELECT
                ii.id, 'STATE_TRANSITION'::event_type, 'Transición a Estado 1: OC en Validación.', 'SISTEMA', jsonb_build_object('to_state_id', v_estado_inicial_id, 'to_state_code', '1')
            FROM inserted_instancia ii
        ),
        -- *** INSERCIÓN DEL DOCUMENTO OC ORIGINAL ***
        insert_documento AS ( 
            INSERT INTO documentos (oc_instance_id, storage_path, document_type) -- Usamos oc_instance_id
            SELECT 
                ii.id, ij.data->>'ruta_archivo', 'DOCUMENTO_ORIGEN_OC' -- Tipo de documento para OC
            FROM inserted_instancia ii, input_json ij
            WHERE ij.data->>'ruta_archivo' IS NOT NULL AND ij.data->>'ruta_archivo' != ''
        )
        -- 4. Devolver resultado
        SELECT ii.id, '1' INTO v_instancia_id, v_estado_actual
        FROM inserted_instancia ii;

        -- 8. Devolver el resultado a n8n
        RETURN QUERY SELECT v_oc_ref, v_instancia_id, v_oc_ref, v_estado_actual;

    ELSE
        -- 9. Si la OC ya existe, devolver un conjunto vacío
         RETURN QUERY SELECT NULL::TEXT, NULL::BIGINT, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$;


ALTER FUNCTION "public"."insertar_oc_si_nueva"("oc_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insertar_pedido_si_nuevo"("pedido_json" "jsonb") RETURNS TABLE("pedido_ref_externa_out" "text", "instancia_id_out" bigint, "identificador_compuesto_out" "text", "estado_actual_out" "text")
    LANGUAGE "plpgsql"
    AS $$DECLARE
    v_pedido_id INT;
    v_instancia_id BIGINT;
    v_pedido_ref TEXT := pedido_json->>'numero_pedido';
    v_estado_actual TEXT;
    v_cantidad_total_ton NUMERIC(12, 3);
    v_precio_neto_kg NUMERIC(10, 4);
    
    -- Variables temporales para evitar doble cálculo
    v_estado_inicial_id INT; 
BEGIN
    -- 1. Chequear si existe
    SELECT id INTO v_pedido_id FROM pedidos WHERE pedido_ref_externa = v_pedido_ref LIMIT 1;

    -- 2. Si no existe, insertar
    IF v_pedido_id IS NULL THEN
        
        -- *** CÁLCULOS PREVIOS DE VARIABLES (Fuera del alcance de los CTEs principales) ***
        -- 2a. Calcular cantidad total de toneladas
        SELECT 
            SUM((prod->>'cantidad')::NUMERIC * (prod->>'peso_por_bolsa_kg')::NUMERIC) / 1000.0
        INTO v_cantidad_total_ton
        FROM jsonb_array_elements(pedido_json->'productos') AS prod;
        
        -- 2b. Calcular Precio Venta NETO/KG: (Precio KG Informado neto) 
        v_precio_neto_kg := (pedido_json->>'precio_kg_informado')::NUMERIC ;
        
        -- 2c. Obtener ID de estado inicial
        SELECT id INTO v_estado_inicial_id FROM state_definitions WHERE state_code = '1.1' AND fsm_id = 1;

        -- 3. Consolidar la inserción en una ÚNICA secuencia de CTEs
        WITH input_json AS ( -- <<--- CTE BASE AHORA ES PARTE DE LA SECUENCIA
            SELECT pedido_json AS data
        ),
        upsert_cliente AS (
            INSERT INTO clientes (codigo_tango, razon_social)
            SELECT data->>'cliente_codigo_tango', data->>'cliente_nombre' FROM input_json
            ON CONFLICT (codigo_tango) DO UPDATE SET razon_social = EXCLUDED.razon_social
            RETURNING id
        ),
        upsert_articulos AS (
             INSERT INTO articulos (codigo_articulo, nombre, tipo_mercado, peso_standard_kg)
             SELECT prod->>'codigo_producto', prod->>'nombre_producto', ij.data->>'tipo_pedido', (prod->>'peso_por_bolsa_kg')::NUMERIC(10, 2)
             FROM input_json ij, jsonb_array_elements(COALESCE(ij.data->'productos', '[]'::jsonb)) AS prod
             ON CONFLICT (codigo_articulo) DO UPDATE SET nombre = EXCLUDED.nombre, tipo_mercado = EXCLUDED.tipo_mercado, peso_standard_kg = EXCLUDED.peso_standard_kg
        ),
        upsert_servicios AS (
            INSERT INTO servicios (codigo_servicio, nombre)
            SELECT serv->>'codigo_servicio', serv->>'nombre_servicio'
            FROM input_json, jsonb_array_elements(COALESCE(data->'servicios', '[]'::jsonb)) AS serv
            ON CONFLICT (codigo_servicio) DO UPDATE SET nombre = EXCLUDED.nombre
        ),
        inserted_pedido AS (
            INSERT INTO pedidos (
                cliente_id, 
                pedido_ref_externa, 
                tipo_mercado, 
                fecha_pedido, 
                cantidad_total_ton, 
                precio_neto_kg
            )
            SELECT 
                uc.id, 
                ij.data->>'numero_pedido', 
                ij.data->>'tipo_pedido', 
                TO_DATE(ij.data->>'fecha_pedido', 'DD/MM/YYYY'),
                v_cantidad_total_ton, -- USAR VARIABLE CALCULADA
                v_precio_neto_kg      -- USAR VARIABLE CALCULADA
            FROM input_json ij, upsert_cliente uc
            RETURNING id, pedido_ref_externa
        ),
        inserted_instancia AS (
            INSERT INTO pedido_instancias (
                pedido_id,
                identificador_compuesto,
                current_state_id,
                saldo_pendiente,
                cantidad_requerida_original,
                status,
                current_data
            )
            SELECT
                ip.id,
                ip.pedido_ref_externa,
                v_estado_inicial_id, -- USAR VARIABLE DE ESTADO
                v_cantidad_total_ton, 
                v_cantidad_total_ton, 
                'ACTIVA'::instance_status,
                ij.data
            FROM inserted_pedido ip, input_json ij
            RETURNING id, identificador_compuesto
        ),
        log_creacion AS (
            INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
            SELECT ii.id, 'INSTANCE_CREATED'::event_type, 'Creada instancia inicial para Pedido ' || ip.pedido_ref_externa || ' (' || v_cantidad_total_ton || ' ton).', 'SISTEMA', ij.data
            FROM inserted_instancia ii, inserted_pedido ip, input_json ij
        ),
        log_transicion AS (
            INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
            SELECT ii.id, 'STATE_TRANSITION'::event_type, 'Transición a Estado 1.1: Pedido Pendiente de Validación de requisitos.', 'SISTEMA', jsonb_build_object('to_state_id', v_estado_inicial_id, 'to_state_code', '1.1')
            FROM inserted_instancia ii
        ),
        insert_documento AS (
            INSERT INTO documentos (pedido_instance_id, storage_path, document_type)
            SELECT ii.id, ij.data->>'ruta_archivo', 'DOCUMENTO_ORIGEN_PEDIDO'
            FROM inserted_instancia ii, input_json ij
            WHERE ij.data->>'ruta_archivo' IS NOT NULL AND ij.data->>'ruta_archivo' != ''
        )
        -- 4. Devolver resultado
        SELECT ii.id, '1.1' INTO v_instancia_id, v_estado_actual
        FROM inserted_instancia ii;

        RETURN QUERY SELECT v_pedido_ref, v_instancia_id, v_pedido_ref, v_estado_actual;
    ELSE
         RETURN QUERY SELECT NULL::TEXT, NULL::BIGINT, NULL::TEXT, NULL::TEXT;
    END IF;
END;$$;


ALTER FUNCTION "public"."insertar_pedido_si_nuevo"("pedido_json" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inspeccion_completar_resultados"("p_token" "text", "p_archivo_url" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_magic_link RECORD;
    v_inspeccion_id bigint;
BEGIN
    SELECT * INTO v_magic_link FROM public.magic_links WHERE token = p_token;
    IF NOT FOUND THEN RAISE EXCEPTION 'Token inválido.'; END IF;
    IF v_magic_link.expires_at < now() THEN RAISE EXCEPTION 'Expirado.'; END IF;
    IF v_magic_link.used_at IS NOT NULL THEN RAISE EXCEPTION 'Ya usado.'; END IF;

    v_inspeccion_id := v_magic_link.instancia_id;

    UPDATE public.magic_links SET used_at = now() WHERE token = p_token;
    UPDATE public.inspecciones SET planilla_completada_url = p_archivo_url WHERE id = v_inspeccion_id;

    -- Registrar evento y cambiar estado a 3.D3
    PERFORM public.log_inspeccion_evento(v_inspeccion_id, 'RESULTADOS_SUBIDOS', 'INSPECTOR', jsonb_build_object('url', p_archivo_url));
    PERFORM public.inspeccion_intentar_transicion(v_inspeccion_id, '3.D3', 'INSPECTOR');

    RETURN true;
END;
$$;


ALTER FUNCTION "public"."inspeccion_completar_resultados"("p_token" "text", "p_archivo_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inspeccion_forzar_transicion"("p_inspeccion_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_actor" "text", "p_motivo_excepcion" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_nuevo_state_id INTEGER;
    v_old_state_id INTEGER;
BEGIN
    SELECT current_state_id INTO v_old_state_id FROM public.inspecciones WHERE id = p_inspeccion_id;
    SELECT id INTO v_nuevo_state_id FROM public.state_definitions WHERE state_code = p_nuevo_estado_code;
    
    IF v_nuevo_state_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado destino no válido');
    END IF;

    -- Auditoría inmutable en cada pedido vinculado
    INSERT INTO public.historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
    SELECT 
        pedido_instance_id, 'STATE_TRANSITION_OVERRIDE',
        'Transición MANUAL a ' || p_nuevo_estado_code || '. Motivo: ' || p_motivo_excepcion,
        p_usuario_actor,
        jsonb_build_object('inspeccion_id', p_inspeccion_id, 'forced', true, 'reason', p_motivo_excepcion)
    FROM public.inspeccion_items_pedido WHERE inspeccion_id = p_inspeccion_id;

    -- Actualización de la tarjeta
    UPDATE public.inspecciones 
    SET current_state_id = v_nuevo_state_id,
        current_data = current_data || jsonb_build_object(
            'last_override_user', p_usuario_actor,
            'last_override_reason', p_motivo_excepcion,
            'last_override_timestamp', NOW()
        )
    WHERE id = p_inspeccion_id;

    RETURN jsonb_build_object('success', true, 'new_state', p_nuevo_estado_code);
END;
$$;


ALTER FUNCTION "public"."inspeccion_forzar_transicion"("p_inspeccion_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_actor" "text", "p_motivo_excepcion" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inspeccion_intentar_transicion"("p_inspeccion_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_actor" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_curr_state_id INTEGER;
    v_next_state_id INTEGER;
    v_missing_val TEXT;
BEGIN
    SELECT current_state_id INTO v_curr_state_id FROM public.inspecciones WHERE id = p_inspeccion_id;
    SELECT id INTO v_next_state_id FROM public.state_definitions WHERE state_code = p_nuevo_estado_code;

    -- Verificar requisitos bloqueantes en el estado actual antes de salir
    SELECT v.name INTO v_missing_val
    FROM public.state_validation_requirements r
    JOIN public.validation_definitions v ON r.validation_id = v.id
    WHERE r.state_id = v_curr_state_id 
      AND v.is_blocking = true
      -- Lógica: Si es VAL_INS_01 chequea inspector_id, si es VAL_INS_02 chequea planilla_url
      AND NOT (
          (v.validation_code = 'VAL_INS_01' AND EXISTS (SELECT 1 FROM public.inspecciones WHERE id = p_inspeccion_id AND inspector_id IS NOT NULL)) OR
          (v.validation_code = 'VAL_INS_02' AND EXISTS (SELECT 1 FROM public.inspecciones WHERE id = p_inspeccion_id AND planilla_url IS NOT NULL))
      )
    LIMIT 1;

    IF v_missing_val IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Falta validación bloqueante: ' || v_missing_val);
    END IF;

    -- Si pasa validaciones, actualizar
    UPDATE public.inspecciones SET current_state_id = v_next_state_id WHERE id = p_inspeccion_id;

    -- Registrar evento
    INSERT INTO public.historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
    SELECT pedido_instance_id, 'STATE_TRANSITION', 'Transición a ' || p_nuevo_estado_code, p_usuario_actor, jsonb_build_object('inspeccion_id', p_inspeccion_id)
    FROM public.inspeccion_items_pedido WHERE inspeccion_id = p_inspeccion_id;

    RETURN jsonb_build_object('success', true, 'new_state', p_nuevo_estado_code);
END;
$$;


ALTER FUNCTION "public"."inspeccion_intentar_transicion"("p_inspeccion_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_actor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."intentar_transicion_automatica_oc"("p_instancia_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_state_id INT;
    v_estado_actual_code TEXT;
    v_next_state_id INT;
    v_next_state_code TEXT;
    v_last_transition_time TIMESTAMPTZ;
    v_fallos_bloqueantes JSONB;
    v_denegaciones_bloqueantes JSONB;
    v_fallo RECORD;
    v_transicion_encontrada BOOLEAN := false;
    v_condition_type transition_trigger_type; -- Tipo de condición
BEGIN
    -- 1. Obtener estado actual y datos de validación
    SELECT
        oi.current_state_id, sd.state_code,
        (SELECT COALESCE(MAX("timestamp"), '1970-01-01') FROM historial_eventos
         WHERE oc_instance_id = oi.id AND event_type = 'STATE_TRANSITION')
    INTO v_current_state_id, v_estado_actual_code, v_last_transition_time
    FROM oc_instancias oi JOIN state_definitions sd ON oi.current_state_id = sd.id
    WHERE oi.id = p_instancia_id;

    IF v_current_state_id IS NULL THEN RAISE EXCEPTION 'Instancia de OC ID % no encontrada.', p_instancia_id; END IF;

    -- 2. Obtener listas de fallos y denegaciones RECIENTES
    SELECT
        COALESCE(jsonb_agg(details->>'validation_code') FILTER (WHERE event_type = 'VALIDATION_DENIED'), '[]'::jsonb),
        COALESCE(jsonb_agg(details->>'validation_code') FILTER (WHERE event_type = 'VALIDATION_FAILURE'), '[]'::jsonb)
    INTO v_denegaciones_bloqueantes, v_fallos_bloqueantes
    FROM historial_eventos
    WHERE oc_instance_id = p_instancia_id
      AND (details->>'is_blocking')::boolean = true
      AND "timestamp" > v_last_transition_time
      AND event_type IN ('VALIDATION_FAILURE', 'VALIDATION_DENIED');

    -- 3. Determinar la condición (Éxito, Fallo o Denegado)
    IF jsonb_array_length(v_denegaciones_bloqueantes) > 0 THEN
        v_condition_type := 'ON_VALIDATION_DENIAL';
    ELSIF jsonb_array_length(v_fallos_bloqueantes) > 0 THEN
        v_condition_type := 'ON_VALIDATION_FAILURE';
    ELSE
        v_condition_type := 'ON_ALL_SUCCESS';
    END IF;

    -- 4. Lógica de Transición GENÉRICA (consulta la tabla)
    v_next_state_id := NULL;

    -- Prioridad 1: Buscar transiciones por DENEGACIÓN o FALLO (tienen validación específica)
    IF v_condition_type = 'ON_VALIDATION_DENIAL' OR v_condition_type = 'ON_VALIDATION_FAILURE' THEN
        FOR v_fallo IN SELECT * FROM jsonb_array_elements_text(v_denegaciones_bloqueantes || v_fallos_bloqueantes)
        LOOP
            SELECT t.to_state_id, sd.state_code
            INTO v_next_state_id, v_next_state_code
            FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
            WHERE t.from_state_id = v_current_state_id
              AND t.trigger_type = v_condition_type
              AND t.trigger_validation_code = v_fallo.value
            ORDER BY t.priority LIMIT 1;
            
            IF v_next_state_id IS NOT NULL THEN v_transicion_encontrada := true; EXIT; END IF;
        END LOOP;
    END IF;

    -- Prioridad 3: Buscar transición por ÉXITO TOTAL (si no se encontró otra)
    IF NOT v_transicion_encontrada AND v_condition_type = 'ON_ALL_SUCCESS' THEN
        SELECT t.to_state_id, sd.state_code
        INTO v_next_state_id, v_next_state_code
        FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
        WHERE t.from_state_id = v_current_state_id
          AND t.trigger_type = 'ON_ALL_SUCCESS' -- CORREGIDO
        ORDER BY t.priority LIMIT 1;
    END IF;
    
    -- Si aún no se encontró transición, pero hubo fallos/denegaciones (sin regla específica), buscar regla 'ON_FAILURE' genérica
    IF v_next_state_id IS NULL AND (v_condition_type = 'ON_VALIDATION_FAILURE' OR v_condition_type = 'ON_VALIDATION_DENIAL') THEN
        SELECT t.to_state_id, sd.state_code
        INTO v_next_state_id, v_next_state_code
        FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
        WHERE t.from_state_id = v_current_state_id
          AND t.trigger_type = v_condition_type -- ON_VALIDATION_FAILURE o ON_VALIDATION_DENIAL
          AND t.trigger_validation_code IS NULL -- Regla genérica de fallo/denegación
        ORDER BY t.priority LIMIT 1;
    END IF;


    -- 5. Ejecutar la Transición
    IF v_next_state_id IS NOT NULL AND v_next_state_id != v_current_state_id THEN
        UPDATE oc_instancias SET current_state_id = v_next_state_id WHERE id = p_instancia_id;
        INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
        VALUES (p_instancia_id, 'STATE_TRANSITION', 'Transición automática a Estado ' || v_next_state_code, 'SISTEMA',
                jsonb_build_object('from_state_id', v_current_state_id, 'to_state_id', v_next_state_id));
        RETURN jsonb_build_object('transicion_exitosa', true, 'nuevo_estado_code', v_next_state_code);
    ELSE
        RETURN jsonb_build_object('transicion_exitosa', false, 'estado_actual_code', v_estado_actual_code);
    END IF;

END;
$$;


ALTER FUNCTION "public"."intentar_transicion_automatica_oc"("p_instancia_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."intentar_transicion_automatica_pedido"("p_instancia_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    -- ... (mismas variables) ...
    v_current_state_id INT;
    v_estado_actual_code TEXT;
    v_next_state_id INT;
    v_next_state_code TEXT;
    v_last_transition_time TIMESTAMPTZ;
    v_denegaciones JSONB;
    v_fallos_bloqueantes_activos JSONB; -- Renombrado para claridad
    v_todos_fallos_activos JSONB;      -- Para buscar transiciones específicas
    v_transicion_encontrada BOOLEAN := false;
    v_input_validation_code TEXT;
    v_debug_info JSONB := '{}'::jsonb;
BEGIN
    -- 1. Info Inicial (Igual)
    SELECT
        pi.current_state_id, sd.state_code,
        COALESCE((SELECT MAX("timestamp") FROM historial_eventos
         WHERE pedido_instance_id = pi.id AND event_type = 'STATE_TRANSITION'), '1970-01-01'::timestamptz)
    INTO v_current_state_id, v_estado_actual_code, v_last_transition_time
    FROM pedido_instancias pi JOIN state_definitions sd ON pi.current_state_id = sd.id
    WHERE pi.id = p_instancia_id;

    v_debug_info := v_debug_info || jsonb_build_object('start_state', v_estado_actual_code);

    -- 2. Obtener Eventos Recientes (CORREGIDO)
    WITH ultimos_eventos AS (
        SELECT DISTINCT ON (details->>'validation_code') 
            event_type, 
            details->>'validation_code' as code,
            COALESCE((details->>'is_blocking')::boolean, true) as is_blocking -- Default true por seguridad
        FROM historial_eventos
        WHERE pedido_instance_id = p_instancia_id 
          AND "timestamp" > v_last_transition_time
          AND details->>'validation_code' IS NOT NULL
        ORDER BY details->>'validation_code', "timestamp" DESC
    )
    SELECT 
        COALESCE(jsonb_agg(code) FILTER (WHERE event_type = 'VALIDATION_DENIED'), '[]'::jsonb),
        -- Solo fallos que son BLOQUEANTES
        COALESCE(jsonb_agg(code) FILTER (WHERE event_type = 'VALIDATION_FAILURE' AND is_blocking = true), '[]'::jsonb),
        -- Todos los fallos (para buscar transiciones específicas de error)
        COALESCE(jsonb_agg(code) FILTER (WHERE event_type = 'VALIDATION_FAILURE'), '[]'::jsonb)
    INTO v_denegaciones, v_fallos_bloqueantes_activos, v_todos_fallos_activos
    FROM ultimos_eventos;

    v_next_state_id := NULL;

    -- 3. PRIORIDADES

    -- P1: DENEGACIONES
    IF jsonb_array_length(v_denegaciones) > 0 THEN
        FOR v_input_validation_code IN SELECT jsonb_array_elements_text(v_denegaciones) LOOP
            SELECT t.to_state_id, sd.state_code INTO v_next_state_id, v_next_state_code
            FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
            WHERE t.from_state_id = v_current_state_id AND t.trigger_type = 'ON_VALIDATION_DENIAL' AND t.trigger_validation_code = v_input_validation_code ORDER BY t.priority LIMIT 1;
            IF v_next_state_id IS NOT NULL THEN v_transicion_encontrada := true; v_debug_info := v_debug_info || jsonb_build_object('trigger', 'DENIAL', 'code', v_input_validation_code); EXIT; END IF;
        END LOOP;
    END IF;

    -- P2: INPUTS (Igual)
    IF NOT v_transicion_encontrada THEN
        SELECT (he.details->>'validation_code')::TEXT INTO v_input_validation_code
        FROM historial_eventos he
        WHERE he.pedido_instance_id = p_instancia_id AND he.event_type IN ('VALIDATION_SUCCESS', 'INPUT_RECEIVED') AND he."timestamp" > v_last_transition_time ORDER BY he."timestamp" DESC LIMIT 1;
        
        IF v_input_validation_code IS NOT NULL THEN
            SELECT t.to_state_id, sd.state_code INTO v_next_state_id, v_next_state_code
            FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
            WHERE t.from_state_id = v_current_state_id AND t.trigger_type = 'ON_INPUT_RECEIVED' AND t.trigger_validation_code = v_input_validation_code ORDER BY t.priority LIMIT 1;
            IF v_next_state_id IS NOT NULL THEN v_transicion_encontrada := true; v_debug_info := v_debug_info || jsonb_build_object('trigger', 'INPUT', 'code', v_input_validation_code); END IF;
        END IF;
    END IF;

    -- P3: FALLOS ESPECÍFICOS (Usamos TODOS los fallos, por si hay una regla de transición para un fallo no bloqueante)
    IF NOT v_transicion_encontrada AND jsonb_array_length(v_todos_fallos_activos) > 0 THEN
        FOR v_input_validation_code IN SELECT jsonb_array_elements_text(v_todos_fallos_activos) LOOP
            SELECT t.to_state_id, sd.state_code INTO v_next_state_id, v_next_state_code
            FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
            WHERE t.from_state_id = v_current_state_id AND t.trigger_type = 'ON_VALIDATION_FAILURE' AND t.trigger_validation_code = v_input_validation_code ORDER BY t.priority LIMIT 1;
            IF v_next_state_id IS NOT NULL THEN v_transicion_encontrada := true; v_debug_info := v_debug_info || jsonb_build_object('trigger', 'FAILURE', 'code', v_input_validation_code); EXIT; END IF;
        END LOOP;
    END IF;

    -- P4: ÉXITO TOTAL (CORREGIDO: Solo si no hay Denegaciones ni Fallos BLOQUEANTES)
    IF NOT v_transicion_encontrada 
       AND jsonb_array_length(v_denegaciones) = 0 
       AND jsonb_array_length(v_fallos_bloqueantes_activos) = 0 THEN -- <--- CAMBIO CLAVE
        
        SELECT t.to_state_id, sd.state_code INTO v_next_state_id, v_next_state_code
        FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
        WHERE t.from_state_id = v_current_state_id AND t.trigger_type = 'ON_ALL_SUCCESS' ORDER BY t.priority LIMIT 1;
        
        IF v_next_state_id IS NOT NULL THEN 
            v_transicion_encontrada := true;
            v_debug_info := v_debug_info || jsonb_build_object('trigger', 'ALL_SUCCESS');
        END IF;
    END IF;

    PERFORM log_fsm_debug(p_instancia_id, 'intentar_transicion', 'Resultado: ' || CASE WHEN v_transicion_encontrada THEN 'Transición a ' || v_next_state_code ELSE 'Sin cambios' END, v_debug_info);

    -- 4. EJECUCIÓN (Igual)
    IF v_transicion_encontrada AND v_next_state_id IS NOT NULL AND v_next_state_id != v_current_state_id THEN
        IF (v_estado_actual_code = '1.5' OR v_estado_actual_code = '1.6') AND v_next_state_code = '3.1' THEN
            PERFORM public.transicionar_oc_a_calzada(p_instancia_id, 'SISTEMA_PEDIDO_FSM');
        END IF;
        UPDATE pedido_instancias SET current_state_id = v_next_state_id WHERE id = p_instancia_id;
        INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
        VALUES (p_instancia_id, 'STATE_TRANSITION', 'Transición automática a Estado ' || v_next_state_code, 'SISTEMA', jsonb_build_object('from_state', v_current_state_id, 'to_state', v_next_state_id, 'trigger_info', v_debug_info));
        RETURN jsonb_build_object('transicion_exitosa', true, 'nuevo_estado_code', v_next_state_code);
    ELSE
        RETURN jsonb_build_object('transicion_exitosa', false, 'estado_actual_code', v_estado_actual_code);
    END IF;

END;
$$;


ALTER FUNCTION "public"."intentar_transicion_automatica_pedido"("p_instancia_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."intentar_transicion_automatica_pedido_v3"("p_instancia_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_state_id INT;
    v_estado_actual_code TEXT;
    v_next_state_id INT;
    v_next_state_code TEXT;
    v_last_transition_time TIMESTAMPTZ;
    v_current_data JSONB;
    v_transicion_encontrada BOOLEAN := false;
    v_debug_info JSONB := '{}'::jsonb;
    
    -- Variables para votación
    v_aprobaciones JSONB;
    v_rechazos JSONB;
    v_gg_aprobo BOOLEAN;
    v_gg_rechazo BOOLEAN;
    v_todos_aprobaron BOOLEAN;
    v_todos_rechazaron BOOLEAN;
BEGIN
    -- 1. Info Inicial
    SELECT pi.current_state_id, sd.state_code, pi.current_data,
           COALESCE((SELECT MAX("timestamp") FROM historial_eventos WHERE pedido_instance_id = pi.id AND event_type = 'STATE_TRANSITION'), '1970-01-01'::timestamptz)
    INTO v_current_state_id, v_estado_actual_code, v_current_data, v_last_transition_time
    FROM pedido_instancias pi JOIN state_definitions sd ON pi.current_state_id = sd.id
    WHERE pi.id = p_instancia_id;

    v_debug_info := v_debug_info || jsonb_build_object('start_state', v_estado_actual_code);

    -- 2. LÓGICA DE VOTACIÓN (Estado 3.1)
    IF v_estado_actual_code = '3.1' THEN
        v_aprobaciones := COALESCE(v_current_data->'aprobaciones', '{}'::jsonb);
        v_rechazos := COALESCE(v_current_data->'rechazos', '{}'::jsonb);
        
        -- Evaluar GG (Voto Maestro)
        v_gg_aprobo := COALESCE((v_aprobaciones->>'GG')::boolean, false);
        v_gg_rechazo := COALESCE((v_rechazos->>'GG')::boolean, false);
        
        -- Evaluar Consenso (GL, GC, GF)
        v_todos_aprobaron := 
            COALESCE((v_aprobaciones->>'GL')::boolean, false) AND
            COALESCE((v_aprobaciones->>'GC')::boolean, false) AND
            COALESCE((v_aprobaciones->>'GF')::boolean, false);
            
        v_todos_rechazaron := 
            COALESCE((v_rechazos->>'GL')::boolean, false) AND
            COALESCE((v_rechazos->>'GC')::boolean, false) AND
            COALESCE((v_rechazos->>'GF')::boolean, false);

        -- Decisión
        IF v_gg_aprobo OR v_todos_aprobaron THEN
            -- BUSCAR ESTADO SIGUIENTE (3.1.1 - Esperando Remito)
            -- Simulamos trigger ON_ALL_SUCCESS
            SELECT t.to_state_id, sd.state_code INTO v_next_state_id, v_next_state_code
            FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
            WHERE t.from_state_id = v_current_state_id AND t.trigger_type = 'ON_ALL_SUCCESS' LIMIT 1;
            
            IF v_next_state_id IS NOT NULL THEN
                v_transicion_encontrada := true;
                v_debug_info := v_debug_info || jsonb_build_object('trigger', 'CONSENSUS_APPROVED');
            END IF;
            
        ELSIF v_gg_rechazo OR v_todos_rechazaron THEN
            -- BUSCAR ESTADO RECHAZO (Probablemente volver a 1.2 o cancelar)
            -- Simulamos trigger ON_VALIDATION_DENIAL
            SELECT t.to_state_id, sd.state_code INTO v_next_state_id, v_next_state_code
            FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
            WHERE t.from_state_id = v_current_state_id AND t.trigger_type = 'ON_VALIDATION_DENIAL' LIMIT 1;
             
             IF v_next_state_id IS NOT NULL THEN
                v_transicion_encontrada := true;
                v_debug_info := v_debug_info || jsonb_build_object('trigger', 'CONSENSUS_REJECTED');
            END IF;
        END IF;
    
    -- LÓGICA DE VOTACIÓN (Estado 1.6 - Excepción)
    ELSIF v_estado_actual_code = '1.6' THEN
         v_aprobaciones := COALESCE(v_current_data->'aprobaciones', '{}'::jsonb);
         v_rechazos := COALESCE(v_current_data->'rechazos', '{}'::jsonb);
         
         -- En 1.6 aprueba GF o GG (uno solo basta)
         IF COALESCE((v_aprobaciones->>'GG')::boolean, false) OR COALESCE((v_aprobaciones->>'GF')::boolean, false) THEN
            -- Buscar transición éxito (a 3.1)
            SELECT t.to_state_id, sd.state_code INTO v_next_state_id, v_next_state_code
            FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
            WHERE t.from_state_id = v_current_state_id AND t.trigger_type = 'ON_ALL_SUCCESS' LIMIT 1;
            
            IF v_next_state_id IS NOT NULL THEN v_transicion_encontrada := true; END IF;
            
         ELSIF COALESCE((v_rechazos->>'GG')::boolean, false) OR COALESCE((v_rechazos->>'GF')::boolean, false) THEN
             -- Buscar transición rechazo
             SELECT t.to_state_id, sd.state_code INTO v_next_state_id, v_next_state_code
            FROM fsm_transitions t JOIN state_definitions sd ON t.to_state_id = sd.id
            WHERE t.from_state_id = v_current_state_id AND t.trigger_type = 'ON_VALIDATION_DENIAL' LIMIT 1;
            
            IF v_next_state_id IS NOT NULL THEN v_transicion_encontrada := true; END IF;
         END IF;
    END IF;

    -- 3. EJECUCIÓN
    IF v_transicion_encontrada AND v_next_state_id IS NOT NULL AND v_next_state_id != v_current_state_id THEN
        
        -- A) Ejecución de Side-Effects (Ej: actualizar OC a estado 6)
        -- Si salimos de 1.6 hacia 3.1, significa que se aprobó rentabilidad -> OC queda COMPROMETIDA/CALZADA
        IF v_estado_actual_code = '1.6' AND v_next_state_code = '3.1' THEN
            PERFORM public.transicionar_oc_a_calzada(p_instancia_id, 'SISTEMA_PEDIDO_FSM');
        END IF;

        -- B) Actualizar Estado (Misma Instancia)
        UPDATE pedido_instancias 
        SET current_state_id = v_next_state_id,
            updated_at = NOW()
        WHERE id = p_instancia_id;
        
        -- C) Registrar en Historial
        INSERT INTO historial_eventos (
            pedido_instance_id, event_type, description, user_actor, details
        ) VALUES (
            p_instancia_id, 
            'STATE_TRANSITION', 
            'Transición automática a Estado ' || v_next_state_code, 
            'SISTEMA_V3', 
            jsonb_build_object(
                'from_state', v_estado_actual_code, 
                'to_state', v_next_state_code, 
                'trigger_info', v_debug_info
            )
        );
        
        RETURN jsonb_build_object(
            'transicion_exitosa', true, 
            'nuevo_estado_code', v_next_state_code
        );
    ELSE
        RETURN jsonb_build_object('transicion_exitosa', false, 'estado_actual_code', v_estado_actual_code);
    END IF;

END;
$$;


ALTER FUNCTION "public"."intentar_transicion_automatica_pedido_v3"("p_instancia_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_debug_enabled"("p_key" "text" DEFAULT 'FSM_DEBUG'::"text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce((select enabled from public.debug_flags where key = p_key), false);
$$;


ALTER FUNCTION "public"."is_debug_enabled"("p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_debug_fsm"("p_instance_id" bigint, "p_message" "text", "p_source_type" "text" DEFAULT NULL::"text", "p_source_name" "text" DEFAULT NULL::"text", "p_event" "text" DEFAULT NULL::"text", "p_ref_type" "text" DEFAULT NULL::"text", "p_ref_value" "text" DEFAULT NULL::"text", "p_payload" "jsonb" DEFAULT NULL::"jsonb", "p_level" "text" DEFAULT 'INFO'::"text", "p_force" boolean DEFAULT NULL::boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_enabled boolean;
begin
  v_enabled := coalesce(p_force, public.is_debug_enabled('FSM_DEBUG'));
  if not v_enabled then
    return;
  end if;

  insert into public.debug_log_fsm(
    instance_id,
    message,
    source_type,
    source_name,
    event,
    ref_type,
    ref_value,
    payload,
    level
  )
  values (
    p_instance_id,
    p_message,
    p_source_type,
    p_source_name,
    p_event,
    p_ref_type,
    p_ref_value,
    p_payload,
    p_level
  );
end;
$$;


ALTER FUNCTION "public"."log_debug_fsm"("p_instance_id" bigint, "p_message" "text", "p_source_type" "text", "p_source_name" "text", "p_event" "text", "p_ref_type" "text", "p_ref_value" "text", "p_payload" "jsonb", "p_level" "text", "p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_fsm_debug"("p_instancia_id" bigint, "p_process" "text", "p_message" "text", "p_details" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    BEGIN
        INSERT INTO debug_log_fsm (pedido_instance_id, process_name, message, details, created_at)
        VALUES (p_instancia_id, p_process, p_message, p_details, NOW());
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Silenciar error si la tabla no existe
    END;
END;
$$;


ALTER FUNCTION "public"."log_fsm_debug"("p_instancia_id" bigint, "p_process" "text", "p_message" "text", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_inspeccion_evento"("p_inspeccion_id" bigint, "p_accion" "text", "p_usuario_actor" "text", "p_detalles" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."log_inspeccion_evento"("p_inspeccion_id" bigint, "p_accion" "text", "p_usuario_actor" "text", "p_detalles" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_proximos_estados"("p_estado_id" integer) RETURNS "text"[]
    LANGUAGE "sql"
    AS $$
  SELECT array_agg(sd.state_code || ': ' || sd.name)
  FROM fsm_transitions t
  JOIN state_definitions sd ON t.to_state_id = sd.id
  WHERE t.from_state_id = p_estado_id;
$$;


ALTER FUNCTION "public"."obtener_proximos_estados"("p_estado_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."procesar_actualizacion_manual"("p_referencia_externa" "text", "p_datos_nuevos" "jsonb", "p_usuario_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$DECLARE
    -- ... (Variables anteriores iguales) ...
    v_instancia_id bigint;
    v_tipo_entidad text; 
    v_result_summary jsonb;
    v_nuevo_estado text;
    v_estado_anterior text;
    
    v_remito_actual RECORD;
    v_historial_nuevo JSONB;
    v_valor_anterior TEXT;
    v_campo TEXT;
    v_valor_nuevo TEXT;
    v_meta_actual JSONB;
    
    v_dni_chofer text;
    v_nombre_chofer text;
    v_telefono_chofer text;
    v_chofer_id int;
    
    v_nombre_operador text;
    v_operador_id int;
    
    v_instrucciones_raw text;
    v_instrucciones_fmt text;

    v_cambios_reporte JSONB := '[]'::jsonb;

    -- NUEVO: contador y array de historial nuevo de esta corrida
    v_changes_count int := 0;
    v_historial_nuevo_items jsonb := '[]'::jsonb;

BEGIN
    -------------------------------------------------------------------------
    -- Buscar entidad por referencia externa (PEDIDO > OC > REMITO)
    -------------------------------------------------------------------------
    SELECT pi.id, 'PEDIDO' 
    INTO v_instancia_id, v_tipo_entidad 
    FROM pedido_instancias pi 
    JOIN pedidos p ON pi.pedido_id = p.id 
    WHERE p.pedido_ref_externa = p_referencia_externa 
      AND pi.status = 'ACTIVA' 
    ORDER BY pi.created_at DESC 
    LIMIT 1;
    
    IF v_instancia_id IS NULL THEN
        SELECT oi.id, 'OC' 
        INTO v_instancia_id, v_tipo_entidad 
        FROM oc_instancias oi 
        JOIN ordenes_compra oc ON oi.oc_id = oc.id 
        WHERE oc.oc_ref_externa = p_referencia_externa 
          AND oi.status = 'ACTIVA' 
        ORDER BY oi.created_at DESC 
        LIMIT 1;
    END IF;
    
    IF v_instancia_id IS NULL THEN
        SELECT id, 'REMITO' 
        INTO v_instancia_id, v_tipo_entidad 
        FROM public.remitos 
        WHERE remito_ref_externa = p_referencia_externa 
           OR remito_ref_externa = 'R' || p_referencia_externa 
        LIMIT 1;
    END IF;

    PERFORM public.log_debug_fsm(
      v_instancia_id,
      format('Detectada entidad=%s ref=%s instancia_id=%s', v_tipo_entidad, p_referencia_externa, coalesce(v_instancia_id::text,'NULL')),
      'SQL',
      'actualizar_entidad_por_ref',
      'DETECT_ENTITY',
      'ref',
      p_referencia_externa,
      jsonb_build_object('tipo_entidad', v_tipo_entidad, 'instancia_id', v_instancia_id, 'ref', p_referencia_externa),
      'INFO'
    );
    
    IF v_instancia_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'ERROR', 
            'message', 'No se encontró entidad para ref: ' || p_referencia_externa
        );
    END IF;

    -------------------------------------------------------------------------
    -- 2. EJECUCIÓN
    -------------------------------------------------------------------------
    
    IF v_tipo_entidad = 'REMITO' THEN
        PERFORM public.log_debug_fsm(
          v_instancia_id,
          'INICIO rama REMITO',
          'SQL','actualizar_entidad_por_ref','START_REMITO',
          'ref', p_referencia_externa,
          jsonb_build_object('datos_nuevos', p_datos_nuevos, 'usuario', p_usuario_email),
          'INFO'
        );

        SELECT * INTO v_remito_actual FROM public.remitos WHERE id = v_instancia_id;
        v_meta_actual := COALESCE(v_remito_actual.metadata_extraida, '{}'::jsonb);

        PERFORM public.log_debug_fsm(
          v_instancia_id,
          'Remito leído; metadata_extraida cargada',
          'SQL','actualizar_entidad_por_ref','LOAD_REMITO',
          'remito_id', v_instancia_id::text,
          jsonb_build_object(
            'remito_ref_externa', v_remito_actual.remito_ref_externa,
            'metadata_keys', (SELECT jsonb_agg(key) FROM jsonb_object_keys(v_meta_actual) AS key)
          ),
          'DEBUG'
        );

        -- asegurar historial_cambios array
        IF NOT (v_meta_actual ? 'historial_cambios') THEN
          v_meta_actual := v_meta_actual || jsonb_build_object('historial_cambios', '[]'::jsonb);

          PERFORM public.log_debug_fsm(
            v_instancia_id,
            'metadata_extraida no tenía historial_cambios; se inicializa como []',
            'SQL','actualizar_entidad_por_ref','INIT_HISTORIAL',
            'remito_id', v_instancia_id::text,
            jsonb_build_object('metadata_extraida', v_meta_actual),
            'DEBUG'
          );
        END IF;

        -- loop por campos nuevos
        FOR v_campo, v_valor_nuevo IN
          SELECT key, value::text FROM jsonb_each_text(p_datos_nuevos)
        LOOP
            v_valor_anterior := NULL;

            PERFORM public.log_debug_fsm(
              v_instancia_id,
              format('Procesando campo=%s valor_nuevo=%s', v_campo, left(coalesce(v_valor_nuevo,''),120)),
              'SQL','actualizar_entidad_por_ref','FIELD_IN',
              'campo', v_campo,
              jsonb_build_object('campo', v_campo, 'valor_nuevo', v_valor_nuevo),
              'DEBUG'
            );

            -- LÓGICA CHOFER
            IF v_campo IN ('dni_chofer', 'nombre_chofer', 'telefono_chofer') THEN
                 IF v_campo = 'dni_chofer' THEN
                     SELECT id INTO v_chofer_id FROM public.choferes WHERE dni = v_valor_nuevo;
                     IF v_chofer_id IS NULL THEN
                       INSERT INTO public.choferes (nombre_completo, dni)
                       VALUES ('Chofer ' || v_valor_nuevo, v_valor_nuevo)
                       RETURNING id INTO v_chofer_id;

                       PERFORM public.log_debug_fsm(
                         v_instancia_id,
                         format('Chofer creado dni=%s chofer_id=%s', v_valor_nuevo, v_chofer_id),
                         'SQL','actualizar_entidad_por_ref','CHOFER_CREATE',
                         'dni', v_valor_nuevo,
                         jsonb_build_object('chofer_id', v_chofer_id, 'dni', v_valor_nuevo),
                         'INFO'
                       );
                     END IF;

                     UPDATE public.remitos SET chofer_id = v_chofer_id WHERE id = v_instancia_id;

                     PERFORM public.log_debug_fsm(
                       v_instancia_id,
                       format('Remito actualizado: chofer_id=%s', v_chofer_id),
                       'SQL','actualizar_entidad_por_ref','REMITO_SET_CHOFER',
                       'remito_id', v_instancia_id::text,
                       jsonb_build_object('chofer_id', v_chofer_id),
                       'INFO'
                     );
                 END IF;

                 v_valor_anterior := v_meta_actual->>v_campo;

            -- LÓGICA OPERADOR
            ELSIF v_campo IN ('nombre_operador', 'operador') THEN
                SELECT id INTO v_operador_id
                FROM public.personal_ac
                WHERE nombre_completo ILIKE v_valor_nuevo
                LIMIT 1;

                IF v_operador_id IS NOT NULL THEN
                  UPDATE public.remitos SET operador_id = v_operador_id WHERE id = v_instancia_id;

                  PERFORM public.log_debug_fsm(
                    v_instancia_id,
                    format('Remito actualizado: operador_id=%s', v_operador_id),
                    'SQL','actualizar_entidad_por_ref','REMITO_SET_OPERADOR',
                    'remito_id', v_instancia_id::text,
                    jsonb_build_object('operador_id', v_operador_id, 'valor_busqueda', v_valor_nuevo),
                    'INFO'
                  );
                ELSE
                  PERFORM public.log_debug_fsm(
                    v_instancia_id,
                    format('Operador no encontrado para "%s" (no se actualiza operador_id)', v_valor_nuevo),
                    'SQL','actualizar_entidad_por_ref','OPERADOR_NOT_FOUND',
                    'campo', v_campo,
                    jsonb_build_object('valor', v_valor_nuevo),
                    'WARN'
                  );
                END IF;

                v_valor_anterior := v_meta_actual->>v_campo;

            -- LÓGICA INSTRUCCIONES
            ELSIF v_campo IN ('instrucciones', 'instrucciones_texto') THEN
                v_instrucciones_raw := v_valor_nuevo;
                v_instrucciones_fmt := regexp_replace(v_instrucciones_raw, '(\s\d+\.-)', E'\n\\1', 'g');

                UPDATE public.remitos
                SET instrucciones_texto = v_instrucciones_fmt
                WHERE id = v_instancia_id;

                v_valor_anterior := v_remito_actual.instrucciones_texto;

                PERFORM public.log_debug_fsm(
                  v_instancia_id,
                  'Remito actualizado: instrucciones_texto (formateado)',
                  'SQL','actualizar_entidad_por_ref','REMITO_SET_INSTRUCCIONES',
                  'remito_id', v_instancia_id::text,
                  jsonb_build_object(
                    'raw_preview', left(coalesce(v_instrucciones_raw,''),120),
                    'fmt_preview', left(coalesce(v_instrucciones_fmt,''),120)
                  ),
                  'INFO'
                );

            ELSE
                 v_valor_anterior := v_meta_actual->>v_campo;
            END IF;

            -- HISTORIAL
            IF v_valor_anterior IS DISTINCT FROM v_valor_nuevo THEN
                v_changes_count := v_changes_count + 1;

                v_historial_nuevo := jsonb_build_object(
                  'fecha', NOW(),
                  'usuario', p_usuario_email,
                  'campo', v_campo,
                  'valor_anterior', v_valor_anterior,
                  'valor_nuevo', v_valor_nuevo
                );

                -- agregar al historial persistente
                v_meta_actual := jsonb_set(
                  v_meta_actual,
                  '{historial_cambios}',
                  (v_meta_actual->'historial_cambios') || v_historial_nuevo
                );

                -- guardar también lista de cambios de esta corrida
                v_historial_nuevo_items := v_historial_nuevo_items || v_historial_nuevo;

                PERFORM public.log_debug_fsm(
                  v_instancia_id,
                  format('CAMBIO detectado campo=%s', v_campo),
                  'SQL','actualizar_entidad_por_ref','CHANGE',
                  'campo', v_campo,
                  jsonb_build_object('anterior', v_valor_anterior, 'nuevo', v_valor_nuevo),
                  'DEBUG'
                );

                IF v_campo IN ('instrucciones', 'instrucciones_texto') THEN
                     v_cambios_reporte := v_cambios_reporte || jsonb_build_object(
                       'campo', 'instrucciones',
                       'anterior', '(texto previo)',
                       'nuevo', '(texto actualizado)'
                     );
                ELSE
                     v_cambios_reporte := v_cambios_reporte || jsonb_build_object(
                       'campo', v_campo,
                       'anterior', COALESCE(v_valor_anterior, '(vacío)'),
                       'nuevo', v_valor_nuevo
                     );
                END IF;
            ELSE
                PERFORM public.log_debug_fsm(
                  v_instancia_id,
                  format('Sin cambio campo=%s (anterior == nuevo)', v_campo),
                  'SQL','actualizar_entidad_por_ref','NO_CHANGE',
                  'campo', v_campo,
                  jsonb_build_object('valor', v_valor_nuevo),
                  'DEBUG'
                );
            END IF;
        END LOOP;

        -- merge final de metadata
        v_meta_actual := v_meta_actual || p_datos_nuevos;
        UPDATE public.remitos SET metadata_extraida = v_meta_actual WHERE id = v_instancia_id;

        PERFORM public.log_debug_fsm(
          v_instancia_id,
          format('FIN REMITO: cambios_detectados=%s', v_changes_count),
          'SQL','actualizar_entidad_por_ref','END_REMITO',
          'remito_id', v_instancia_id::text,
          jsonb_build_object(
            'cambios_detectados', v_changes_count,
            'cambios_reporte', v_cambios_reporte,
            'historial_nuevos_count', jsonb_array_length(v_historial_nuevo_items),
            'historial_total_count', jsonb_array_length(coalesce(v_meta_actual->'historial_cambios','[]'::jsonb))
          ),
          'INFO'
        );

        RETURN jsonb_build_object(
          'status', 'SUCCESS_UPDATE',
          'message', CASE WHEN v_changes_count=0
                          THEN 'Remito actualizado (sin cambios efectivos).'
                          ELSE 'Remito actualizado con historial.'
                     END,
          'cambios', v_cambios_reporte,
          -- DEVOLVER: historial NUEVO de esta corrida (array) para que nunca sea null
          'historial_nuevo', v_historial_nuevo_items,
          -- DEVOLVER: historial total persistido (array)
          'historial_total', v_meta_actual->'historial_cambios',
          'instancia_id', v_instancia_id
        );

    ELSIF v_tipo_entidad = 'PEDIDO' THEN
        -- ... (Resto igual) ...
        SELECT sd.state_code INTO v_estado_anterior
        FROM pedido_instancias pi
        JOIN state_definitions sd ON pi.current_state_id = sd.id
        WHERE pi.id = v_instancia_id;

        SELECT * FROM actualizar_y_revalidar(v_instancia_id, p_datos_nuevos)
        INTO v_result_summary;

        v_nuevo_estado := v_result_summary->>'nuevo_estado_code';

        IF (v_result_summary->>'transicion_exitosa')::boolean IS TRUE THEN
            RETURN jsonb_build_object('status', 'SUCCESS_TRANSITION', 'message', 'Pedido actualizado. Avanzó a Estado ' || v_nuevo_estado, 'datos_aplicados', p_datos_nuevos);
        ELSE
            RETURN jsonb_build_object('status', 'SUCCESS_UPDATE', 'message', 'Pedido actualizado. Permanece en Estado ' || v_estado_anterior, 'datos_aplicados', p_datos_nuevos);
        END IF;

    ELSE -- OC
        -- ... (Resto igual) ...
        SELECT sd.state_code INTO v_estado_anterior
        FROM oc_instancias oi
        JOIN state_definitions sd ON oi.current_state_id = sd.id
        WHERE oi.id = v_instancia_id;

        UPDATE oc_instancias
        SET current_data = current_data || p_datos_nuevos
        WHERE id = v_instancia_id;

        INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
        VALUES (v_instancia_id, 'DATA_UPDATE', 'Actualización manual', p_usuario_email, p_datos_nuevos);

        SELECT * FROM ejecutar_validaciones_oc(v_instancia_id, p_datos_nuevos)
        INTO v_result_summary;

        RETURN jsonb_build_object('status', 'SUCCESS_UPDATE', 'message', 'OC actualizada. Permanece en Estado ' || v_estado_anterior, 'datos_aplicados', p_datos_nuevos);
    END IF;
END;$$;


ALTER FUNCTION "public"."procesar_actualizacion_manual"("p_referencia_externa" "text", "p_datos_nuevos" "jsonb", "p_usuario_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_1_6_decision"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_updated_data JSONB;
    v_result_summary JSONB;
    v_nuevo_estado TEXT;
    v_actor_role TEXT;
BEGIN
    -- [ Lógica para determinar v_actor_role — ASUMIMOS CORRECTA ]
    IF p_remitente LIKE '%arquimedescarrizo@arquimedescarrizo.com.ar%' OR p_remitente LIKE '%hzerdan@gmail.com%' THEN
        v_actor_role := 'GG';
    ELSIF p_remitente LIKE '%jorgelinacarrizo@arquimedescarrizo.com.ar%' THEN
        v_actor_role := 'GF';
    ELSIF p_remitente LIKE '%jcarrizo@arquimedescarrizo.com.ar%' THEN
        v_actor_role := 'GL';
    ELSE
        v_actor_role := 'UNKNOWN';
    END IF;

    -- 2. Construir el JSON de actualización
    v_updated_data := jsonb_build_object(
        'decision_rentabilidad', upper(p_decision),
        'aprobado_por_rol', v_actor_role,
        'aprobado_por_email', p_remitente
    );

    -- 3. Actualizar y revalidar (Dispara la transición)
    SELECT * FROM actualizar_y_revalidar(p_instancia_id, v_updated_data) INTO v_result_summary;
    
    -- 4. Obtener el estado real después de la ejecución
    SELECT sd.state_code INTO v_nuevo_estado
    FROM pedido_instancias pi JOIN state_definitions sd ON pi.current_state_id = sd.id
    WHERE pi.id = p_instancia_id;


    -- 5. SINCRONIZACIÓN OC Y DEVOLUCIÓN DE ÉXITO
    IF v_nuevo_estado = '3.1' THEN
        
        -- Sincronizar OC a Estado 6 (Calzada)
        PERFORM public.transicionar_oc_a_calzada(p_instancia_id, p_remitente);
        
        -- Adicionalmente, actualizar el estado de la vinculación usando el valor seguro 'APROBADA'
        UPDATE vinculaciones_pedido_oc
        SET estado_vinculacion = 'APROBADA', -- <<< VALOR SEGURO
            aprobacion_excepcional = TRUE    -- <<< BANDERA DE AUDITORÍA
        WHERE pedido_instance_id = p_instancia_id;

        -- Devolver ÉXITO REAL
        RETURN jsonb_build_object(
            'status', 'SUCCESS',
            'pedido_transicion_code', v_nuevo_estado,
            'message', 'Aprobación por excepción completada. Pedido a E3.1 y OC sincronizada a E6.'
        ) || v_result_summary;

    ELSE
        -- Si el Pedido no transicionó (ej. se quedó en 1.6 por falla, o fue a 1.2 por rechazo, etc.)
         RETURN jsonb_build_object(
            'status', 'FAILURE',
            'message', 'Decisión procesada, pero el pedido no transicionó a 3.1. Estado actual: ' || v_nuevo_estado
        ) || v_result_summary;
    END IF;
    
END;
$$;


ALTER FUNCTION "public"."process_1_6_decision"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_approval_decision"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_state_code TEXT;
    v_actor_role TEXT;
    v_update_data JSONB := '{}'::jsonb;
    v_result_summary JSONB;
    v_nuevo_estado TEXT;
    v_current_data JSONB;
    v_roles_pendientes TEXT[] := ARRAY[]::TEXT[];
    v_es_rechazo BOOLEAN := false;
BEGIN
    -- 1. Identificar Estado y Datos
    SELECT sd.state_code, pi.current_data 
    INTO v_current_state_code, v_current_data
    FROM pedido_instancias pi JOIN state_definitions sd ON pi.current_state_id = sd.id
    WHERE pi.id = p_instancia_id;

    -- 2. Identificar ROL
    IF p_remitente ILIKE '%arquimedescarrizo@arquimedescarrizo.com.ar%' OR p_remitente ILIKE '%hzerdan@gmail.com%' THEN v_actor_role := 'GG';
    ELSIF p_remitente ILIKE '%jorgelinacarrizo@arquimedescarrizo.com.ar%' THEN v_actor_role := 'GF';
    ELSIF p_remitente ILIKE '%jcarrizo@arquimedescarrizo.com.ar%' THEN v_actor_role := 'GL';
    ELSIF p_remitente ILIKE '%facundocarrizo@arquimedescarrizo.com.ar%' THEN v_actor_role := 'GC';
    ELSE v_actor_role := 'UNKNOWN'; END IF;

    -- Normalizar decisión
    IF upper(p_decision) = 'RECHAZAR' THEN v_es_rechazo := true; END IF;

    -- 3. Lógica según Estado
    IF v_current_state_code = '1.6' THEN
        -- (Lógica 1.6 igual que antes...)
        v_update_data := jsonb_build_object(
            'decision_rentabilidad', CASE WHEN v_es_rechazo THEN 'RECHAZAR' ELSE 'CONTINUAR' END,
            'aprobado_por_rol', v_actor_role,
            'aprobado_por_email', p_remitente
        );

    ELSIF v_current_state_code = '3.1' THEN
        IF NOT v_es_rechazo THEN
            -- APROBACIÓN
            IF v_actor_role = 'GG' THEN 
                -- GG aprueba y LIMPIA rechazos previos (Override)
                v_update_data := jsonb_build_object(
                    'aprobacion_gg', true, 'aprobacion_gl', true, 'aprobacion_gc', true, 'aprobacion_gf', true,
                    'rechazo_gg', false, 'rechazo_gl', false, 'rechazo_gc', false, 'rechazo_gf', false
                );
            ELSE
                -- Gerente aprueba (y limpia su propio rechazo si existía)
                v_update_data := jsonb_build_object(
                    'aprobacion_' || lower(v_actor_role), true,
                    'rechazo_' || lower(v_actor_role), false
                );
            END IF;
        ELSE
            -- RECHAZO
            -- Se guarda el flag específico ej: "rechazo_gl": true
            v_update_data := jsonb_build_object(
                'rechazo_' || lower(v_actor_role), true,
                'aprobacion_' || lower(v_actor_role), false
            );
        END IF;
    END IF;

    -- 4. Ejecutar Actualización
    SELECT * FROM actualizar_y_revalidar(p_instancia_id, v_update_data) INTO v_result_summary;

    -- 5. Recargar y Responder
    SELECT sd.state_code INTO v_nuevo_estado FROM pedido_instancias pi JOIN state_definitions sd ON pi.current_state_id = sd.id WHERE pi.id = p_instancia_id;

    IF v_nuevo_estado != v_current_state_code THEN
        RETURN jsonb_build_object('status', 'TRANSITION', 'nuevo_estado', v_nuevo_estado, 'message', 'El pedido ha avanzado al Estado ' || v_nuevo_estado) || v_result_summary;
    ELSE
        -- Mensaje inteligente sobre rechazos/aprobaciones
        IF v_es_rechazo THEN
             RETURN jsonb_build_object('status', 'REJECTION_REGISTERED', 'message', 'Rechazo registrado. Esperando definición de GG o consenso.', 'rol', v_actor_role) || v_result_summary;
        ELSE
             RETURN jsonb_build_object('status', 'PARTIAL_APPROVAL', 'message', 'Aprobación registrada.') || v_result_summary;
        END IF;
    END IF;
END;
$$;


ALTER FUNCTION "public"."process_approval_decision"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_approval_decision_v3"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$DECLARE
    v_current_state_code TEXT;
    v_current_data JSONB;
    v_actor_role TEXT;
    v_es_rechazo BOOLEAN := false;
    v_aprobaciones JSONB;
    v_rechazos JSONB;
    v_update_payload JSONB;
    v_result JSONB;
BEGIN
    -- 1. Obtener Estado
    SELECT sd.state_code, pi.current_data INTO v_current_state_code, v_current_data
    FROM pedido_instancias pi JOIN state_definitions sd ON pi.current_state_id = sd.id
    WHERE pi.id = p_instancia_id;

    IF v_current_state_code IS NULL THEN RETURN jsonb_build_object('status', 'ERROR', 'message', 'Instancia no encontrada'); END IF;

    -- 2. Identificar ROL (Validación Estricta)
    IF p_remitente ILIKE '%arquimedescarrizo@arquimedescarrizo.com.ar%' OR p_remitente ILIKE '%hzerdan@gmail.com%' THEN v_actor_role := 'GG';
    ELSIF p_remitente ILIKE '%jorgelinacarrizo@arquimedescarrizo.com.ar%' THEN v_actor_role := 'GF';
    ELSIF p_remitente ILIKE '%jcarrizo@arquimedescarrizo.com.ar%' OR p_remitente ILIKE '%hzerdan@outlook.es%' THEN v_actor_role := 'GL';
    ELSIF p_remitente ILIKE '%facundocarrizo@arquimedescarrizo.com.ar%' THEN v_actor_role := 'GC';
    ELSE 
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Email no autorizado para aprobar: ' || p_remitente); 
    END IF;

    -- 3. Normalizar decisión
    IF upper(p_decision) = 'RECHAZAR' THEN v_es_rechazo := true; END IF;

    -- Inicializar estructuras de votos si no existen
    v_aprobaciones := COALESCE(v_current_data->'aprobaciones', '{}'::jsonb);
    v_rechazos := COALESCE(v_current_data->'rechazos', '{}'::jsonb);

    -- 4. Lógica por Estado
    IF v_current_state_code = '1.6' THEN
        IF v_actor_role NOT IN ('GF', 'GG') THEN
             RETURN jsonb_build_object('status', 'ERROR', 'message', 'Rol ' || v_actor_role || ' no tiene permiso en estado 1.6');
        END IF;
        
        IF v_es_rechazo THEN
            v_rechazos := jsonb_set(v_rechazos, ARRAY[v_actor_role], 'true'::jsonb);
            v_aprobaciones := jsonb_set(v_aprobaciones, ARRAY[v_actor_role], 'false'::jsonb);
        ELSE
            v_aprobaciones := jsonb_set(v_aprobaciones, ARRAY[v_actor_role], 'true'::jsonb);
            v_rechazos := jsonb_set(v_rechazos, ARRAY[v_actor_role], 'false'::jsonb);
        END IF;

    ELSIF v_current_state_code = '3.1' THEN
        IF v_es_rechazo THEN
            v_rechazos := jsonb_set(v_rechazos, ARRAY[v_actor_role], 'true'::jsonb);
            v_aprobaciones := jsonb_set(v_aprobaciones, ARRAY[v_actor_role], 'false'::jsonb); 
        ELSE
            v_aprobaciones := jsonb_set(v_aprobaciones, ARRAY[v_actor_role], 'true'::jsonb);
            v_rechazos := jsonb_set(v_rechazos, ARRAY[v_actor_role], 'false'::jsonb); 
        END IF;
    ELSE
         RETURN jsonb_build_object('status', 'ERROR', 'message', 'El estado ' || v_current_state_code || ' no admite aprobaciones manuales.');
    END IF;

    -- 5. Registrar Evento de Voto en Historial (Auditoría)
    INSERT INTO historial_eventos (
        pedido_instance_id, event_type, description, user_actor, details
    ) VALUES (
        p_instancia_id, 
        'VOTE_RECEIVED', 
        'Voto recibido de ' || v_actor_role || ': ' || p_decision, 
        p_remitente, 
        jsonb_build_object('role', v_actor_role, 'decision', p_decision, 'state', v_current_state_code)
    );

    -- 6. Preparar Payload y Llamar Orquestador
    v_update_payload := jsonb_build_object('aprobaciones', v_aprobaciones, 'rechazos', v_rechazos);
    
    SELECT * FROM actualizar_y_revalidar_v3(p_instancia_id, v_update_payload) INTO v_result;

    -- 7. Respuesta
    IF (v_result->>'transicion_exitosa')::boolean THEN
        RETURN jsonb_build_object('status', 'TRANSITION', 'message', 'Voto registrado y transición ejecutada.', 'nuevo_estado', v_result->>'nuevo_estado_code');
    ELSE
        RETURN jsonb_build_object('status', 'VOTE_REGISTERED', 'message', 'Voto registrado. Esperando resto de aprobaciones.', 'estado_actual', v_current_state_code);
    END IF;
END;$$;


ALTER FUNCTION "public"."process_approval_decision_v3"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rollback_asignacion_remito"("p_remito_item_id" bigint, "p_usuario_solicitante" "text", "p_motivo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_item RECORD;
    v_origen_table TEXT;
    v_destino_table TEXT;
    v_estado_actual_hija INT;
    v_estado_inicial_hija INT; -- El estado en el que nació
    v_tiene_hijos BOOLEAN;
    v_items_restantes INT;
BEGIN
    -- 1. Obtener datos de la asignación
    SELECT * INTO v_item FROM public.remito_items WHERE id = p_remito_item_id;
    
    IF v_item.id IS NULL THEN 
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Item de remito no encontrado.'); 
    END IF;

    -- 2. Determinar tablas según origen
    IF v_item.origen_type = 'PEDIDO' THEN
        v_origen_table := 'pedido_instancias';
        v_destino_table := 'pedido_instancias';
        
        -- Validar si la hija tiene hijos (ha sido procesada/splitteada)
        SELECT EXISTS(SELECT 1 FROM pedido_instancias WHERE parent_instance_id = v_item.destino_instance_id) INTO v_tiene_hijos;
        
        -- Obtener estado actual de la hija para ver si se movió
        SELECT current_state_id INTO v_estado_actual_hija FROM pedido_instancias WHERE id = v_item.destino_instance_id;
        
    ELSIF v_item.origen_type = 'OC' THEN
        v_origen_table := 'oc_instancias';
        v_destino_table := 'oc_instancias';
        
        SELECT EXISTS(SELECT 1 FROM oc_instancias WHERE parent_instance_id = v_item.destino_instance_id) INTO v_tiene_hijos;
        SELECT current_state_id INTO v_estado_actual_hija FROM oc_instancias WHERE id = v_item.destino_instance_id;
    END IF;

    -- 3. Validaciones de Seguridad (Bloqueantes)
    IF v_tiene_hijos THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'No se puede anular: La instancia generada ya ha sido procesada (tiene sub-instancias). Debes revertir las acciones posteriores primero.');
    END IF;

    -- Validar si avanzó de estado (Opcional: se puede relajar si el negocio permite anular aunque haya avanzado un paso, pero por seguridad default bloqueamos)
    -- Recuperamos el evento de creación para saber en qué estado nació
    -- (Simplificación: Asumimos que si está activa y sin hijos, se puede borrar. Si quisieramos ser estrictos, compararíamos v_estado_actual_hija con el target de ejecutar_asignacion_remito).

    -- 4. Ejecutar Restauración de Saldos (Madre)
    IF v_item.origen_type = 'PEDIDO' THEN
        UPDATE pedido_instancias 
        SET saldo_pendiente = saldo_pendiente + v_item.cantidad,
            status = 'ACTIVA'::instance_status, -- Si estaba COMPLETADA, revive
            updated_at = NOW()
        WHERE id = v_item.origen_instance_id;
        
        -- Log en Madre
        INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
        VALUES (v_item.origen_instance_id, 'ROLLBACK_REMITO_RECOVERY', 'Saldo restaurado por anulación de remito item ' || v_item.id, p_usuario_solicitante, jsonb_build_object('cantidad_restaurada', v_item.cantidad));

    ELSE -- OC
        UPDATE oc_instancias 
        SET cantidad_disponible = cantidad_disponible + v_item.cantidad,
            status = 'ACTIVA'::instance_status,
            updated_at = NOW()
        WHERE id = v_item.origen_instance_id;

        -- Log en Madre
        INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
        VALUES (v_item.origen_instance_id, 'ROLLBACK_REMITO_RECOVERY', 'Saldo restaurado por anulación de remito item ' || v_item.id, p_usuario_solicitante, jsonb_build_object('cantidad_restaurada', v_item.cantidad));
    END IF;

    -- 5. Eliminar Instancia Hija y Link
    -- Primero borramos el link en remito_items para romper la FK (o si es CASCADE, borrar la instancia directo)
    -- Asumimos borrado manual por seguridad
    DELETE FROM public.remito_items WHERE id = p_remito_item_id;

    IF v_item.origen_type = 'PEDIDO' THEN
        -- Log final antes de borrar (Opcional: guardar en una tabla de auditoría de borrados)
        DELETE FROM pedido_instancias WHERE id = v_item.destino_instance_id;
    ELSE
        DELETE FROM oc_instancias WHERE id = v_item.destino_instance_id;
    END IF;

    -- 6. Actualizar Cabecera de Remito
    -- Verificamos si quedan otros items en este remito
    SELECT count(*) INTO v_items_restantes FROM public.remito_items WHERE remito_id = v_item.remito_id;
    
    IF v_items_restantes = 0 THEN
        UPDATE public.remitos 
        SET estado_asignacion = 'PENDIENTE',
            updated_at = NOW()
        WHERE id = v_item.remito_id;
    END IF;

    RETURN jsonb_build_object(
        'status', 'SUCCESS', 
        'message', 'Asignación de remito anulada y saldos restaurados.',
        'origen_id', v_item.origen_instance_id,
        'cantidad_restaurada', v_item.cantidad,
        'remito_estado_actual', CASE WHEN v_items_restantes = 0 THEN 'PENDIENTE' ELSE 'ASIGNADO_PARCIAL' END
    );
END;
$$;


ALTER FUNCTION "public"."rollback_asignacion_remito"("p_remito_item_id" bigint, "p_usuario_solicitante" "text", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_remito_update_admin"("p_remito_id" bigint, "p_updates" "jsonb", "p_admin_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_pedido_instancia_id BIGINT;
    v_campo TEXT;
    v_valor_nuevo TEXT;
BEGIN
    SELECT origen_instance_id INTO v_pedido_instancia_id FROM public.remito_items WHERE remito_id = p_remito_id LIMIT 1;

    FOR v_campo, v_valor_nuevo IN SELECT * FROM jsonb_each_text(p_updates)
    LOOP
        INSERT INTO public.historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
        VALUES (v_pedido_instancia_id, 'DATA_UPDATE', format('Campo [%s] actualizado desde Dashboard Admin', v_campo), p_admin_email, jsonb_build_object('campo', v_campo, 'valor', v_valor_nuevo));
    END LOOP;

    UPDATE public.remitos
    SET 
        chofer_id = COALESCE(NULLIF((p_updates->>'chofer_id')::INT, 0), chofer_id),
        camion_id = COALESCE(NULLIF((p_updates->>'camion_id')::INT, 0), camion_id),
        acoplado_id = COALESCE(NULLIF((p_updates->>'acoplado_id')::INT, 0), acoplado_id),
        supervisor_id = COALESCE(NULLIF((p_updates->>'supervisor_id')::INT, 0), supervisor_id),
        inspector_id = COALESCE(NULLIF((p_updates->>'inspector_id')::INT, 0), inspector_id),
        instrucciones_texto = COALESCE(p_updates->>'instrucciones_texto', instrucciones_texto),
        protocolo_control = COALESCE((p_updates->'protocolo_control'), protocolo_control),
        
        tara_pesaje_momento = COALESCE(p_updates->>'tara_pesaje_momento', tara_pesaje_momento),
        tara_pesaje_lugar_id = COALESCE(NULLIF((p_updates->>'tara_pesaje_lugar_id')::INT, 0), tara_pesaje_lugar_id),
        bruto_pesaje_momento = COALESCE(p_updates->>'bruto_pesaje_momento', bruto_pesaje_momento),
        bruto_pesaje_lugar_id = COALESCE(NULLIF((p_updates->>'bruto_pesaje_lugar_id')::INT, 0), bruto_pesaje_lugar_id),
        
        metadata_extraida = COALESCE(metadata_extraida, '{}'::jsonb) || p_updates,
        updated_at = NOW()
    WHERE id = p_remito_id;

    RETURN jsonb_build_object('status', 'SUCCESS');
END;
$$;


ALTER FUNCTION "public"."save_remito_update_admin"("p_remito_id" bigint, "p_updates" "jsonb", "p_admin_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_remito_update_v3"("p_token" "uuid", "p_updates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_link RECORD;
    v_remito_id BIGINT;
    v_pedido_instancia_id BIGINT;
    v_rows_affected INT;
BEGIN
    -- 1. Validar el token
    SELECT * INTO v_link FROM public.magic_links WHERE token = p_token AND expires_at > NOW();
    
    IF v_link IS NULL THEN
        INSERT INTO public.debug_log_fsm (message, event)
        VALUES ('Token inválido o expirado: ' || COALESCE(p_token::text, 'NULL'), 'ERROR_TOKEN');
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Token inválido o expirado');
    END IF;

    -- 2. Lógica de Identificación Cruzada
    -- Si el token es de un PEDIDO, debemos buscar el REMITO asociado en remito_items
    IF v_link.tipo_entidad = 'PEDIDO' THEN
        v_pedido_instancia_id := v_link.instancia_id;
        
        SELECT remito_id INTO v_remito_id 
        FROM public.remito_items 
        WHERE destino_instance_id = v_pedido_instancia_id 
           OR origen_instance_id = v_pedido_instancia_id
        LIMIT 1;
        
        IF v_remito_id IS NULL THEN
            INSERT INTO public.debug_log_fsm (instance_id, message, event)
            VALUES (v_pedido_instancia_id, 'No se encontró remito vinculado a esta instancia de pedido', 'ERROR_LINK');
            RETURN jsonb_build_object('status', 'ERROR', 'message', 'No hay un remito vinculado a este pedido aún.');
        END IF;
    ELSE
        -- Si el token es directamente de un REMITO
        v_remito_id := v_link.instancia_id;
        -- Intentamos buscar el pedido solo para el log
        SELECT origen_instance_id INTO v_pedido_instancia_id FROM public.remito_items WHERE remito_id = v_remito_id LIMIT 1;
    END IF;

    -- LOG DE PROCESAMIENTO
    INSERT INTO public.debug_log_fsm (instance_id, message, source_type, source_name, event, ref_type, ref_value)
    VALUES (v_pedido_instancia_id, 'Ejecutando Update Físico', 'SQL', 'save_remito_update_v3', 'UPDATE', 'remito_id', v_remito_id::text);

    -- 3. Ejecutar el UPDATE en la tabla remitos
    UPDATE public.remitos
    SET 
        chofer_id = COALESCE(NULLIF((p_updates->>'chofer_id')::INT, 0), chofer_id),
        camion_id = COALESCE(NULLIF((p_updates->>'camion_id')::INT, 0), camion_id),
        acoplado_id = COALESCE(NULLIF((p_updates->>'acoplado_id')::INT, 0), acoplado_id),
        supervisor_id = COALESCE(NULLIF((p_updates->>'supervisor_id')::INT, 0), supervisor_id),
        inspector_id = COALESCE(NULLIF((p_updates->>'inspector_id')::INT, 0), inspector_id),
        instrucciones_texto = COALESCE(p_updates->>'instrucciones_texto', instrucciones_texto),
        protocolo_control = COALESCE((p_updates->'protocolo_control'), protocolo_control),
        metadata_extraida = COALESCE(metadata_extraida, '{}'::jsonb) || p_updates,
        updated_at = NOW()
    WHERE id = v_remito_id;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- 4. Registrar en historial de eventos del pedido (para trazabilidad del cliente)
    IF v_pedido_instancia_id IS NOT NULL THEN
        INSERT INTO public.historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
        VALUES (v_pedido_instancia_id, 'DATA_UPDATE', 'Datos del remito actualizados desde la página web', v_link.usuario_email, p_updates);
    END IF;

    -- 5. Marcar token como usado
    UPDATE public.magic_links SET used_at = NOW() WHERE token = p_token;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'message', 'Remito actualizado correctamente',
        'remito_id', v_remito_id,
        'filas_afectadas', v_rows_affected,
        'pedido_instancia_id', v_pedido_instancia_id
    );
END;
$$;


ALTER FUNCTION "public"."save_remito_update_v3"("p_token" "uuid", "p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seconds_to_ddhhmmss"("total_seconds" numeric) RETURNS "text"
    LANGUAGE "sql"
    AS $$
SELECT 
    CASE WHEN total_seconds IS NULL THEN NULL ELSE
        -- Calcula Días, Horas, Minutos, Segundos
        -- Días
        LPAD(FLOOR(total_seconds / 86400)::TEXT, 2, '0') || ':' ||
        -- Horas
        LPAD(FLOOR(MOD(total_seconds, 86400) / 3600)::TEXT, 2, '0') || ':' ||
        -- Minutos
        LPAD(FLOOR(MOD(total_seconds, 3600) / 60)::TEXT, 2, '0') || ':' ||
        -- Segundos
        LPAD(FLOOR(MOD(total_seconds, 60))::TEXT, 2, '0')
    END;
$$;


ALTER FUNCTION "public"."seconds_to_ddhhmmss"("total_seconds" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sp_vincular_pedido_oc"("p_pedido_ref_externa" "text", "p_oc_ref_externa" "text", "p_cantidad_a_vincular" numeric, "p_unidades" "text", "p_remitente_actor" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    -- Instancias "Madre"
    v_pedido_madre_instancia_id BIGINT;
    v_oc_madre_instancia_id BIGINT;
    v_pedido_saldo_requerido_ton NUMERIC;
    v_oc_saldo_disponible_ton NUMERIC;
    v_pedido_id_raiz INT;
    v_oc_id_raiz INT;
    v_pedido_madre_data JSONB;
    v_oc_madre_data JSONB;
    
    -- Instancias "Hija"
    v_pedido_hija_instancia_id BIGINT;
    v_oc_hija_instancia_id BIGINT;
    
    -- Estados (IDs)
    v_estado_pedido_esperado INT;  -- 1.2
    v_estado_oc_esperada INT;      -- 2
    v_estado_pedido_siguiente INT; -- 1.5
    v_estado_oc_siguiente INT;     -- 3
    
    -- Control y Cálculo
    v_cantidad_ton_a_vincular NUMERIC;
    v_identificador_compuesto TEXT; -- Usado para la construcción temporal
    v_error_message TEXT;
    v_available_pedidos JSONB;
    v_available_ocs JSONB;
    v_mensaje_sugerencia TEXT;

BEGIN
    -- 1. Obtener los IDs de los estados que usaremos
    SELECT id INTO v_estado_pedido_esperado FROM state_definitions WHERE fsm_id = 1 AND state_code = '1.2';
    SELECT id INTO v_estado_oc_esperada     FROM state_definitions WHERE fsm_id = 2 AND state_code = '2';
    SELECT id INTO v_estado_pedido_siguiente FROM state_definitions WHERE fsm_id = 1 AND state_code = '1.5';
    SELECT id INTO v_estado_oc_siguiente     FROM state_definitions WHERE fsm_id = 2 AND state_code = '3';

    -- =================================================================================
    -- 2. LÓGICA DE SUGERENCIAS Y ENTRADA (Si falta OC o Pedido)
    -- =================================================================================
    
    IF p_pedido_ref_externa IS NULL OR p_pedido_ref_externa = '' THEN
        v_mensaje_sugerencia := 'La referencia del Pedido no fue explicitada. Informamos todos los Pedidos listos para ser vinculados.';
        
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'pedido_ref', p.pedido_ref_externa,
            'saldo_pendiente_ton', pi.saldo_pendiente,
            'identificador_instancia', pi.identificador_compuesto
        )), '[]')
        INTO v_available_pedidos
        FROM pedido_instancias pi
        JOIN pedidos p ON pi.pedido_id = p.id
        WHERE pi.status = 'ACTIVA' AND pi.current_state_id = v_estado_pedido_esperado;

        RETURN jsonb_build_object(
            'status', 'SUGGESTION',
            'message', v_mensaje_sugerencia,
            'pedidos_disponibles', v_available_pedidos,
            'action_required', 'Especificar Pedido y OC.'
        );
    END IF;

    IF p_oc_ref_externa IS NULL OR p_oc_ref_externa = '' THEN
        v_mensaje_sugerencia := 'La referencia de la OC no fue explicitada. Informamos todas las OCs disponibles para ser vinculadas.';
        
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'oc_ref', oc.oc_ref_externa,
            'saldo_disponible_ton', oi.cantidad_disponible
        )), '[]')
        INTO v_available_ocs
        FROM oc_instancias oi
        JOIN ordenes_compra oc ON oi.oc_id = oc.id
        WHERE oi.status = 'ACTIVA' AND oi.current_state_id = v_estado_oc_esperada;

        RETURN jsonb_build_object(
            'status', 'SUGGESTION',
            'message', v_mensaje_sugerencia,
            'ocs_disponibles', v_available_ocs,
            'action_required', 'Especificar Pedido y OC.'
        );
    END IF;

    -- =================================================================================
    -- 3. VALIDACIÓN Y BLOQUEO DE INSTANCIAS MADRES
    -- =================================================================================
    
    -- 3a. Bloquear Pedido Madre (Estado 1.2 ACTIVO)
    SELECT pi.id, pi.pedido_id, pi.saldo_pendiente, pi.current_data 
    INTO v_pedido_madre_instancia_id, v_pedido_id_raiz, v_pedido_saldo_requerido_ton, v_pedido_madre_data
    FROM pedido_instancias pi
    JOIN pedidos p ON pi.pedido_id = p.id
    WHERE p.pedido_ref_externa = p_pedido_ref_externa
      AND pi.status = 'ACTIVA'
      AND pi.current_state_id = v_estado_pedido_esperado
    FOR UPDATE; 
    
    -- 3b. Bloquear OC Madre (Estado 2 ACTIVO)
    SELECT oi.id, oi.oc_id, oi.cantidad_disponible, oi.current_data
    INTO v_oc_madre_instancia_id, v_oc_id_raiz, v_oc_saldo_disponible_ton, v_oc_madre_data
    FROM oc_instancias oi
    JOIN ordenes_compra oc ON oi.oc_id = oc.id
    WHERE oc.oc_ref_externa = p_oc_ref_externa
      AND oi.status = 'ACTIVA'
      AND oi.current_state_id = v_estado_oc_esperada
    FOR UPDATE; 

    -- 4. VALIDACIÓN DE EXISTENCIA Y CÁLCULO DE CANTIDAD (EN TON)
    v_error_message := NULL;
    
    IF v_pedido_madre_instancia_id IS NULL THEN
        v_error_message := 'Error: El Pedido ' || p_pedido_ref_externa || ' no está ACTIVO en Estado 1.2.';
    ELSIF v_oc_madre_instancia_id IS NULL THEN
        v_error_message := 'Error: La OC ' || p_oc_ref_externa || ' no está ACTIVA en Estado 2.';
    
    ELSE
        -- Conversión/Normalización de la Cantidad de Entrada
        IF p_cantidad_a_vincular IS NULL THEN
            -- CASO 3: Cantidad es NULL. Calculamos el máximo posible.
            v_cantidad_ton_a_vincular := LEAST(v_pedido_saldo_requerido_ton, v_oc_saldo_disponible_ton);
            
            IF v_cantidad_ton_a_vincular <= 0 THEN
                v_error_message := 'Error: Saldo cero. No se puede vincular. Saldo Pedido: ' || v_pedido_saldo_requerido_ton || ' ton. Saldo OC: ' || v_oc_saldo_disponible_ton || ' ton.';
            END IF;
        
        ELSE
            -- CASO 4: Cantidad es explícita.
            v_cantidad_ton_a_vincular := p_cantidad_a_vincular; 
            
            IF p_unidades IS NULL OR p_unidades = '' OR upper(p_unidades) = 'TON' THEN
                v_cantidad_ton_a_vincular := p_cantidad_a_vincular;
            ELSIF upper(p_unidades) = 'KG' THEN
                v_cantidad_ton_a_vincular := p_cantidad_a_vincular / 1000.0;
            ELSE
                 v_error_message := 'Error: Unidad ' || p_unidades || ' inválida. Debe ser KG o TON.';
            END IF;
            
            -- Validaciones de límites
            IF v_cantidad_ton_a_vincular <= 0 THEN
                 v_error_message := 'Error: La cantidad a vincular debe ser mayor a cero.';
            ELSIF v_cantidad_ton_a_vincular > v_pedido_saldo_requerido_ton THEN
                v_error_message := 'Error Pedido: La cantidad a vincular (' || v_cantidad_ton_a_vincular || ' ton) excede el saldo pendiente del pedido (' || v_pedido_saldo_requerido_ton || ' ton).';
            ELSIF v_cantidad_ton_a_vincular > v_oc_saldo_disponible_ton THEN
                v_error_message := 'Error OC: La cantidad a vincular (' || v_cantidad_ton_a_vincular || ' ton) excede el saldo disponible de la OC (' || v_oc_saldo_disponible_ton || ' ton).';
            END IF;
        END IF;
    END IF;

    -- 5. MANEJO DE ERRORES INTERNOS
    IF v_error_message IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', v_error_message);
    END IF;

    -- =================================================================================
    -- 6. LÓGICA DE SPLIT E INSERCIÓN (GARANTIZANDO UNICIDAD CON PK)
    -- =================================================================================

    -- 6a. Actualizar Pedido Madre (Restar saldo)
    UPDATE pedido_instancias
    SET saldo_pendiente = v_pedido_saldo_requerido_ton - v_cantidad_ton_a_vincular
    WHERE id = v_pedido_madre_instancia_id;

    -- 6b. Crear Pedido Hija (PRIMERA INSERCIÓN - ID Compuesto temporal NULL)
    INSERT INTO pedido_instancias (
        pedido_id, parent_instance_id, identificador_compuesto, 
        current_state_id, saldo_pendiente, cantidad_requerida_original, 
        status, current_data
    ) VALUES (
        v_pedido_id_raiz, v_pedido_madre_instancia_id, NULL, -- Insertamos NULL temporalmente
        v_estado_pedido_siguiente, v_cantidad_ton_a_vincular, v_cantidad_ton_a_vincular,
        'ACTIVA', v_pedido_madre_data
    ) RETURNING id INTO v_pedido_hija_instancia_id;

    -- 6c. Generar y actualizar ID Compuesto de Pedido Hija
    v_identificador_compuesto := p_pedido_ref_externa || '_OC-' || p_oc_ref_externa || '_' || v_pedido_hija_instancia_id;
    UPDATE pedido_instancias
    SET identificador_compuesto = v_identificador_compuesto
    WHERE id = v_pedido_hija_instancia_id;


    -- 6d. Actualizar OC Madre (Restar saldo)
    UPDATE oc_instancias
    SET cantidad_disponible = v_oc_saldo_disponible_ton - v_cantidad_ton_a_vincular
    WHERE id = v_oc_madre_instancia_id;

    -- 6e. Crear OC Hija (PRIMERA INSERCIÓN - ID Compuesto temporal NULL)
    INSERT INTO oc_instancias (
        oc_id, parent_instance_id, current_state_id, 
        cantidad_total, cantidad_disponible, status, current_data, identificador_compuesto
    ) VALUES (
        v_oc_id_raiz, v_oc_madre_instancia_id, v_estado_oc_siguiente,
        v_cantidad_ton_a_vincular, v_cantidad_ton_a_vincular, 'ACTIVA', v_oc_madre_data, NULL -- Insertamos NULL temporalmente
    ) RETURNING id INTO v_oc_hija_instancia_id;
    
    -- 6f. Generar y actualizar ID Compuesto de OC Hija
    v_identificador_compuesto := p_oc_ref_externa || '_PED-' || p_pedido_ref_externa || '_' || v_oc_hija_instancia_id;
    UPDATE oc_instancias
    SET identificador_compuesto = v_identificador_compuesto
    WHERE id = v_oc_hija_instancia_id;


    -- 7. REGISTRAR LA VINCULACIÓN Y EVENTOS
    INSERT INTO vinculaciones_pedido_oc (
        pedido_instance_id, oc_instance_id, cantidad_vinculada, estado_vinculacion
    ) VALUES (
        v_pedido_hija_instancia_id, v_oc_hija_instancia_id, v_cantidad_ton_a_vincular, 'PENDIENTE_VALIDACION'
    );

    -- EVENTO CREADO para Pedido Hija 
    INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
    VALUES (v_pedido_hija_instancia_id, 'INSTANCE_CREATED', 'Creada instancia Pedido (Calce con OC ' || p_oc_ref_externa || ').', 'SISTEMA', jsonb_build_object('cantidad_ton', v_cantidad_ton_a_vincular));
            
    -- Transición Pedido
    INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
    VALUES (v_pedido_hija_instancia_id, 'STATE_TRANSITION', 'Transición a Estado 1.5 por vinculación manual.', p_remitente_actor, 
            jsonb_build_object('oc_instance_id', v_oc_hija_instancia_id, 'cantidad_vinculada_ton', v_cantidad_ton_a_vincular));
            
    -- Transición OC
    INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
    VALUES (v_oc_hija_instancia_id, 'STATE_TRANSITION', 'Transición a Estado 3 por vinculación manual.', p_remitente_actor, 
            jsonb_build_object('pedido_instance_id', v_pedido_hija_instancia_id, 'cantidad_vinculada_ton', v_cantidad_ton_a_vincular));

    -- 9. MANEJO DE SALDO CERO
    IF (v_pedido_saldo_requerido_ton - v_cantidad_ton_a_vincular) <= 0 THEN
        UPDATE pedido_instancias SET status = 'COMPLETADA' WHERE id = v_pedido_madre_instancia_id;
    END IF;
    IF (v_oc_saldo_disponible_ton - v_cantidad_ton_a_vincular) <= 0 THEN
        UPDATE oc_instancias SET status = 'COMPLETADA' WHERE id = v_oc_madre_instancia_id;
    END IF;

    -- 10. DEVOLVER ÉXITO
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'message', 'Vinculación creada exitosamente por ' || v_cantidad_ton_a_vincular || ' ton. Iniciando validación de rentabilidad.',
        'pedido_instancia_creada', v_pedido_hija_instancia_id,
        'oc_instancia_creada', v_oc_hija_instancia_id,
        'oc_madre_saldo_restante_ton', (v_oc_saldo_disponible_ton - v_cantidad_ton_a_vincular),
        'pedido_madre_saldo_restante_ton', (v_pedido_saldo_requerido_ton - v_cantidad_ton_a_vincular)
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'status', 'ERROR',
            'message', 'Error SQL inesperado: ' || SQLERRM
        );
END;
$$;


ALTER FUNCTION "public"."sp_vincular_pedido_oc"("p_pedido_ref_externa" "text", "p_oc_ref_externa" "text", "p_cantidad_a_vincular" numeric, "p_unidades" "text", "p_remitente_actor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transicionar_instancia_manual"("p_instancia_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_nombre" "text", "p_motivo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_estado_id INT;
    v_estado_anterior_id INT;
BEGIN
    -- 1. Buscar el ID del nuevo estado
    SELECT id INTO v_estado_id FROM state_definitions WHERE state_code = p_nuevo_estado_code AND fsm_id = 1;
    
    -- 2. Guardar el estado anterior para el log
    SELECT current_state_id INTO v_estado_anterior_id FROM pedido_instancias WHERE id = p_instancia_id;

    -- 3. Cambiar el estado de la instancia
    UPDATE pedido_instancias 
    SET current_state_id = v_estado_id, 
        updated_at = NOW() 
    WHERE id = p_instancia_id;

    -- 4. Anotar en el Diario Mágico (historial_eventos)
    INSERT INTO historial_eventos (
        pedido_instance_id, 
        event_type, 
        description, 
        user_actor, 
        details
    ) VALUES (
        p_instancia_id,
        'STATE_TRANSITION', -- Mantenemos el tipo para que las métricas de tiempo sigan funcionando
        'Movimiento manual vía Tablero: ' || p_motivo,
        'web-' || p_usuario_nombre,
        jsonb_build_object(
            'from_state_id', v_estado_anterior_id,
            'to_state_id', v_estado_id,
            'metodo', 'MANUAL_UI'
        )
    );

    RETURN jsonb_build_object('status', 'SUCCESS', 'nuevo_estado', p_nuevo_estado_code);
END;
$$;


ALTER FUNCTION "public"."transicionar_instancia_manual"("p_instancia_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_nombre" "text", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transicionar_instancia_oc"("p_instancia_id" bigint, "p_nuevo_state_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_state_id INT;
    v_next_state_id INT;
BEGIN
    SELECT current_state_id INTO v_current_state_id FROM oc_instancias WHERE id = p_instancia_id;
    SELECT id INTO v_next_state_id FROM state_definitions WHERE fsm_id = 2 AND state_code = p_nuevo_state_code;

    IF v_next_state_id IS NULL THEN
        RETURN jsonb_build_object('transicion_exitosa', false, 'error', 'Estado destino no encontrado: ' || p_nuevo_state_code);
    END IF;

    UPDATE oc_instancias SET current_state_id = v_next_state_id WHERE id = p_instancia_id;
    
    INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
    VALUES (p_instancia_id, 'STATE_TRANSITION', 'Transición a Estado ' || p_nuevo_state_code, 'SISTEMA',
            jsonb_build_object('from_state_id', v_current_state_id, 'to_state_id', v_next_state_id));
            
    RETURN jsonb_build_object('transicion_exitosa', true, 'nuevo_estado_code', p_nuevo_state_code);
END;
$$;


ALTER FUNCTION "public"."transicionar_instancia_oc"("p_instancia_id" bigint, "p_nuevo_state_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transicionar_oc_a_calzada"("p_pedido_instance_id" bigint, "p_user_actor" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_oc_instance_id BIGINT;
    v_estado_calzada_id INT; -- Estado 6 de OC
    v_current_state_id INT;
BEGIN
    -- 1. Encontrar la OC vinculada
    SELECT v.oc_instance_id INTO v_oc_instance_id
    FROM vinculaciones_pedido_oc v
    WHERE v.pedido_instance_id = p_pedido_instance_id;

    IF v_oc_instance_id IS NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Vínculo OC no encontrado para el Pedido.');
    END IF;

    -- 2. Obtener IDs de Estado
    SELECT id INTO v_estado_calzada_id FROM state_definitions WHERE fsm_id = 2 AND state_code = '6';

    -- 3. Transicionar la OC
    SELECT current_state_id INTO v_current_state_id FROM oc_instancias WHERE id = v_oc_instance_id;

    UPDATE oc_instancias 
    SET current_state_id = v_estado_calzada_id
    WHERE id = v_oc_instance_id;

    -- 4. Registrar transición en el historial de OC
    INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
    VALUES (v_oc_instance_id, 'STATE_TRANSITION', 'Transición automática a Estado 6: OC Calzada (Validación Rentabilidad Aprobada).', p_user_actor,
            jsonb_build_object('from_state_id', v_current_state_id, 'to_state_id', v_estado_calzada_id));

    RETURN jsonb_build_object('status', 'SUCCESS', 'oc_instance_id', v_oc_instance_id, 'nuevo_estado_oc', '6');
END;
$$;


ALTER FUNCTION "public"."transicionar_oc_a_calzada"("p_pedido_instance_id" bigint, "p_user_actor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_remito_context"("p_remito_id" bigint, "p_contexto" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE public.remitos
    SET contexto_asignacion = p_contexto,
        updated_at = NOW()
    WHERE id = p_remito_id
      AND estado_asignacion = 'PENDIENTE'; -- Solo si sigue pendiente
END;
$$;


ALTER FUNCTION "public"."update_remito_context"("p_remito_id" bigint, "p_contexto" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_magic_link"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_link RECORD;
BEGIN
    SELECT * INTO v_link 
    FROM public.magic_links 
    WHERE token = p_token;
    
    IF v_link IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Token no encontrado');
    END IF;
    
    IF v_link.expires_at < NOW() THEN
        RETURN jsonb_build_object('valid', false, 'error', 'El enlace ha expirado');
    END IF;

    -- (Opcional) Si quieres que sea de un solo uso:
    -- IF v_link.used_at IS NOT NULL THEN RETURN ... 'Ya fue usado'; END IF;
    
    RETURN jsonb_build_object(
        'valid', true,
        'instancia_id', v_link.instancia_id,
        'tipo_entidad', v_link.tipo_entidad,
        'usuario', v_link.usuario_email
    );
END;
$$;


ALTER FUNCTION "public"."validate_magic_link"("p_token" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."alertas_escalamiento" (
    "id" bigint NOT NULL,
    "trigger_message_id" bigint NOT NULL,
    "personal_id" integer NOT NULL,
    "rol_notificado" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."alertas_escalamiento" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."alertas_escalamiento_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."alertas_escalamiento_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."alertas_escalamiento_id_seq" OWNED BY "public"."alertas_escalamiento"."id";



CREATE TABLE IF NOT EXISTS "public"."articulos" (
    "id" integer NOT NULL,
    "codigo_articulo" character varying(50) NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo_mercado" character varying(2) NOT NULL,
    "peso_standard_kg" numeric(10,2) DEFAULT 50.00,
    "estado" character varying(20) DEFAULT 'ACTIVO'::character varying,
    CONSTRAINT "articulos_tipo_mercado_check" CHECK ((("tipo_mercado")::"text" = ANY ((ARRAY['MI'::character varying, 'ME'::character varying])::"text"[])))
);


ALTER TABLE "public"."articulos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."articulos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."articulos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."articulos_id_seq" OWNED BY "public"."articulos"."id";



CREATE TABLE IF NOT EXISTS "public"."camiones" (
    "id" integer NOT NULL,
    "patente" "text" NOT NULL,
    "marca" "text",
    "modelo" "text",
    "tipo" "text",
    "observaciones" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "camiones_tipo_check" CHECK (("tipo" = ANY (ARRAY['CHASIS'::"text", 'ACOPLADO'::"text", 'SEMI'::"text", 'CAMIONETA'::"text", 'OTRO'::"text"])))
);


ALTER TABLE "public"."camiones" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."camiones_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."camiones_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."camiones_id_seq" OWNED BY "public"."camiones"."id";



CREATE TABLE IF NOT EXISTS "public"."catalogo_tareas_control" (
    "id" integer NOT NULL,
    "tarea_template" "text" NOT NULL,
    "tipo_tarea" "text",
    "requiere_foto" boolean DEFAULT false,
    "requiere_aviso" boolean DEFAULT false,
    "orden_sugerido" integer,
    CONSTRAINT "catalogo_tareas_control_tipo_tarea_check" CHECK (("tipo_tarea" = ANY (ARRAY['PESAJE_TARA'::"text", 'PESAJE_BRUTO'::"text", 'CONTROL_GENERAL'::"text"])))
);


ALTER TABLE "public"."catalogo_tareas_control" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."catalogo_tareas_control_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."catalogo_tareas_control_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."catalogo_tareas_control_id_seq" OWNED BY "public"."catalogo_tareas_control"."id";



CREATE TABLE IF NOT EXISTS "public"."choferes" (
    "id" integer NOT NULL,
    "transportista_id" integer,
    "nombre_completo" "text" NOT NULL,
    "dni" character varying(20),
    "telefono" character varying(50),
    "email" character varying(255),
    "estado" character varying(20) DEFAULT 'ACTIVO'::character varying
);


ALTER TABLE "public"."choferes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."choferes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."choferes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."choferes_id_seq" OWNED BY "public"."choferes"."id";



CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" integer NOT NULL,
    "codigo_tango" character varying(50),
    "razon_social" "text" NOT NULL,
    "cuit" character varying(13),
    "calle" "text",
    "numero" character varying(20),
    "localidad" "text",
    "provincia" "text",
    "codigo_postal" character varying(10),
    "pais" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "email_general" character varying(255),
    "telefono_general" character varying(50),
    "contacto_principal_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "estado" character varying(20) DEFAULT 'ACTIVO'::character varying
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."clientes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."clientes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."clientes_id_seq" OWNED BY "public"."clientes"."id";



CREATE TABLE IF NOT EXISTS "public"."contactos" (
    "id" integer NOT NULL,
    "cliente_id" integer,
    "proveedor_id" integer,
    "transportista_id" integer,
    "nombre" "text" NOT NULL,
    "email" character varying(255),
    "telefono" character varying(50),
    "role_id" integer,
    "dni_cuil" character varying(13),
    "estado" character varying(20) DEFAULT 'ACTIVO'::character varying,
    CONSTRAINT "chk_contacto_owner" CHECK ((((
CASE
    WHEN ("cliente_id" IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN ("proveedor_id" IS NOT NULL) THEN 1
    ELSE 0
END) +
CASE
    WHEN ("transportista_id" IS NOT NULL) THEN 1
    ELSE 0
END) = 1))
);


ALTER TABLE "public"."contactos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contactos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."contactos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contactos_id_seq" OWNED BY "public"."contactos"."id";



CREATE TABLE IF NOT EXISTS "public"."conversation_messages" (
    "id" bigint NOT NULL,
    "conversation_id" bigint NOT NULL,
    "direction" "text" NOT NULL,
    "sender_role" "text" DEFAULT 'sistema'::"text" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "body_text" "text",
    "provider" "text" DEFAULT 'twilio'::"text" NOT NULL,
    "provider_message_id" "text",
    "from_address" "text",
    "to_address" "text",
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sender_id" integer,
    "media_urls" "text"[] DEFAULT '{}'::"text"[],
    CONSTRAINT "conversation_messages_direction_check" CHECK (("direction" = ANY (ARRAY['in'::"text", 'out'::"text"]))),
    CONSTRAINT "conversation_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'video'::"text", 'audio'::"text", 'mixed_media'::"text", 'unknown'::"text"]))),
    CONSTRAINT "conversation_messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['chofer'::"text", 'operador'::"text", 'interno'::"text", 'sistema'::"text", 'desconocido'::"text"])))
);


ALTER TABLE "public"."conversation_messages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."conversation_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."conversation_messages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."conversation_messages_id_seq" OWNED BY "public"."conversation_messages"."id";



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" bigint NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "conversation_key" "text" NOT NULL,
    "participant_role" "text" DEFAULT 'desconocido'::"text" NOT NULL,
    "participant_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "estado_atencion" "text" DEFAULT 'bot_activo'::"text" NOT NULL,
    "remito_actual_id" bigint,
    CONSTRAINT "conversations_estado_atencion_check" CHECK (("estado_atencion" = ANY (ARRAY['bot_activo'::"text", 'intervencion_humana'::"text", 'cerrado'::"text"]))),
    CONSTRAINT "conversations_participant_role_check" CHECK (("participant_role" = ANY (ARRAY['chofer'::"text", 'operador'::"text", 'interno'::"text", 'desconocido'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."conversations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."conversations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."conversations_id_seq" OWNED BY "public"."conversations"."id";



CREATE TABLE IF NOT EXISTS "public"."debug_flags" (
    "key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."debug_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debug_log_fsm" (
    "log_id" bigint NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "instance_id" bigint,
    "message" "text",
    "source_type" "text",
    "source_name" "text",
    "event" "text",
    "ref_type" "text",
    "ref_value" "text",
    "payload" "jsonb",
    "level" "text" DEFAULT 'INFO'::"text",
    "function_name" "text",
    "step" "text",
    "details" "jsonb"
);


ALTER TABLE "public"."debug_log_fsm" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."debug_log_fsm_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."debug_log_fsm_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."debug_log_fsm_log_id_seq" OWNED BY "public"."debug_log_fsm"."log_id";



CREATE TABLE IF NOT EXISTS "public"."depositos" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "calle" "text",
    "numero" character varying(20),
    "localidad" "text",
    "provincia" "text",
    "codigo_postal" character varying(10),
    "pais" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "tipo" character varying(50) NOT NULL,
    CONSTRAINT "depositos_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['PROPIO'::character varying, 'PROVEEDOR'::character varying, 'CLIENTE'::character varying, 'ADUANA'::character varying])::"text"[])))
);


ALTER TABLE "public"."depositos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."depositos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."depositos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."depositos_id_seq" OWNED BY "public"."depositos"."id";



CREATE TABLE IF NOT EXISTS "public"."documentos" (
    "id" bigint NOT NULL,
    "pedido_instance_id" bigint,
    "oc_instance_id" bigint,
    "remito_id" bigint,
    "storage_path" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."documentos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."documentos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."documentos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."documentos_id_seq" OWNED BY "public"."documentos"."id";



CREATE TABLE IF NOT EXISTS "public"."fsm_definitions" (
    "id" smallint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."fsm_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fsm_transitions" (
    "id" integer NOT NULL,
    "from_state_id" integer NOT NULL,
    "to_state_id" integer NOT NULL,
    "trigger_type" "public"."transition_trigger_type" NOT NULL,
    "trigger_validation_code" character varying(20),
    "priority" smallint DEFAULT 10
);


ALTER TABLE "public"."fsm_transitions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fsm_transitions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."fsm_transitions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fsm_transitions_id_seq" OWNED BY "public"."fsm_transitions"."id";



CREATE TABLE IF NOT EXISTS "public"."historial_eventos" (
    "id" bigint NOT NULL,
    "pedido_instance_id" bigint,
    "oc_instance_id" bigint,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_type" "public"."event_type" NOT NULL,
    "description" "text" NOT NULL,
    "details" "jsonb",
    "user_actor" "text",
    "inspeccion_id" bigint
);


ALTER TABLE "public"."historial_eventos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."historial_eventos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."historial_eventos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."historial_eventos_id_seq" OWNED BY "public"."historial_eventos"."id";



CREATE TABLE IF NOT EXISTS "public"."inspeccion_items_pedido" (
    "id" bigint NOT NULL,
    "inspeccion_id" bigint,
    "pedido_instance_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inspeccion_items_pedido" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."inspeccion_items_pedido_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."inspeccion_items_pedido_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inspeccion_items_pedido_id_seq" OWNED BY "public"."inspeccion_items_pedido"."id";



CREATE TABLE IF NOT EXISTS "public"."inspeccion_templates" (
    "id" integer NOT NULL,
    "codigo" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "archivo_url" "text" NOT NULL,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inspeccion_templates" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."inspeccion_templates_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."inspeccion_templates_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inspeccion_templates_id_seq" OWNED BY "public"."inspeccion_templates"."id";



CREATE TABLE IF NOT EXISTS "public"."inspecciones" (
    "id" bigint NOT NULL,
    "inspector_id" integer,
    "remito_id" bigint,
    "tipo_carga" "text",
    "fecha_hora_carga_pactada" timestamp with time zone NOT NULL,
    "lugar_carga_id" integer,
    "current_state_id" integer,
    "current_data" "jsonb" DEFAULT '{}'::"jsonb",
    "planilla_url" "text",
    "resultado_final" "text",
    "export_doc_status" "text" DEFAULT 'PENDIENTE'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "template_id" integer,
    "planilla_personalizada_url" "text",
    "planilla_completada_url" "text",
    CONSTRAINT "inspecciones_export_doc_status_check" CHECK (("export_doc_status" = ANY (ARRAY['PENDIENTE'::"text", 'PLANILLA_ENVIADA'::"text", 'OK'::"text", 'OBS'::"text", 'NOK'::"text"]))),
    CONSTRAINT "inspecciones_resultado_final_check" CHECK (("resultado_final" = ANY (ARRAY['OK'::"text", 'OBSERVADO'::"text", 'NO_CONFORME'::"text"]))),
    CONSTRAINT "inspecciones_tipo_carga_check" CHECK (("tipo_carga" = ANY (ARRAY['BOLSAS'::"text", 'CRUDO'::"text", 'CONTENEDOR'::"text"])))
);


ALTER TABLE "public"."inspecciones" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."inspecciones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."inspecciones_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inspecciones_id_seq" OWNED BY "public"."inspecciones"."id";



CREATE TABLE IF NOT EXISTS "public"."lugares_pesaje" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "direccion" "text",
    "google_maps_link" "text",
    "estado" "text" DEFAULT 'ACTIVO'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lugares_pesaje_estado_check" CHECK (("estado" = ANY (ARRAY['ACTIVO'::"text", 'INACTIVO'::"text"])))
);


ALTER TABLE "public"."lugares_pesaje" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."lugares_pesaje_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."lugares_pesaje_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lugares_pesaje_id_seq" OWNED BY "public"."lugares_pesaje"."id";



CREATE TABLE IF NOT EXISTS "public"."magic_links" (
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instancia_id" bigint NOT NULL,
    "tipo_entidad" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "usuario_email" "text",
    CONSTRAINT "magic_links_tipo_entidad_check" CHECK (("tipo_entidad" = ANY (ARRAY['PEDIDO'::"text", 'OC'::"text", 'REMITO'::"text", 'INSPECCION'::"text", 'USUARIO'::"text", 'CLIENTE'::"text", 'PROVEEDOR'::"text", 'OTRO'::"text"])))
);


ALTER TABLE "public"."magic_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_media" (
    "id" bigint NOT NULL,
    "message_id" bigint NOT NULL,
    "media_index" integer DEFAULT 0 NOT NULL,
    "content_type" "text",
    "twilio_media_url" "text",
    "storage_bucket" "text" DEFAULT 'evidencias'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "storage_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_media" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."message_media_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."message_media_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."message_media_id_seq" OWNED BY "public"."message_media"."id";



CREATE TABLE IF NOT EXISTS "public"."oc_instancias" (
    "id" bigint NOT NULL,
    "oc_id" integer NOT NULL,
    "parent_instance_id" bigint,
    "current_state_id" integer NOT NULL,
    "cantidad_total" numeric(12,3) NOT NULL,
    "cantidad_disponible" numeric(12,3) NOT NULL,
    "status" "public"."instance_status" DEFAULT 'ACTIVA'::"public"."instance_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "current_data" "jsonb",
    "identificador_compuesto" "text"
);


ALTER TABLE "public"."oc_instancias" OWNER TO "postgres";


COMMENT ON COLUMN "public"."oc_instancias"."current_data" IS 'Almacena el JSON completo y actualizado de los datos de la instancia de OC. Se usa para re-validaciones.';



COMMENT ON COLUMN "public"."oc_instancias"."identificador_compuesto" IS 'El identificador de negocio legible (ej: "P123_OC456"). No es único, ya que una vinculación madre puede generar varias hijas con el mismo ID base si se hacen múltiples remitos.';



CREATE TABLE IF NOT EXISTS "public"."ordenes_compra" (
    "id" integer NOT NULL,
    "proveedor_id" integer,
    "oc_ref_externa" character varying(50),
    "tipo_operatoria" character varying(2) NOT NULL,
    "fecha_emision" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cantidad_total_ton" numeric(12,3),
    "precio_neto_kg" numeric(10,4),
    CONSTRAINT "ordenes_compra_tipo_operatoria_check" CHECK ((("tipo_operatoria")::"text" = ANY ((ARRAY['MI'::character varying, 'ME'::character varying])::"text"[])))
);


ALTER TABLE "public"."ordenes_compra" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ordenes_compra"."cantidad_total_ton" IS 'Cantidad total de la OC en TONELADAS (Calculado en la inserción inicial).';



COMMENT ON COLUMN "public"."ordenes_compra"."precio_neto_kg" IS 'Precio de Compra NETO por KG (Calculado en la inserción inicial).';



CREATE TABLE IF NOT EXISTS "public"."pedido_instancias" (
    "id" bigint NOT NULL,
    "pedido_id" integer NOT NULL,
    "parent_instance_id" bigint,
    "identificador_compuesto" "text",
    "current_state_id" integer NOT NULL,
    "saldo_pendiente" numeric(12,3) NOT NULL,
    "status" "public"."instance_status" DEFAULT 'ACTIVA'::"public"."instance_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "current_data" "jsonb",
    "cantidad_requerida_original" numeric(12,3)
);


ALTER TABLE "public"."pedido_instancias" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pedido_instancias"."current_data" IS 'Almacena el JSON completo y actualizado de los datos de la instancia. Se usa para re-validaciones.';



CREATE TABLE IF NOT EXISTS "public"."pedidos" (
    "id" integer NOT NULL,
    "cliente_id" integer,
    "pedido_ref_externa" character varying(50),
    "tipo_mercado" character varying(2) NOT NULL,
    "fecha_pedido" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cantidad_total_ton" numeric(12,3),
    "precio_neto_kg" numeric(10,4),
    "cotizacion_archivo_url" "text",
    "historial_cotizaciones" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "pedidos_tipo_mercado_check" CHECK ((("tipo_mercado")::"text" = ANY ((ARRAY['MI'::character varying, 'ME'::character varying])::"text"[])))
);


ALTER TABLE "public"."pedidos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pedidos"."cantidad_total_ton" IS 'Cantidad total requerida del pedido en TONELADAS.';



COMMENT ON COLUMN "public"."pedidos"."precio_neto_kg" IS 'Precio de Venta NETO por KG (Calculado en la inserción inicial).';



CREATE TABLE IF NOT EXISTS "public"."proveedores" (
    "id" integer NOT NULL,
    "codigo_proveedor" character varying(50),
    "razon_social" "text" NOT NULL,
    "cuit" character varying(13),
    "calle" "text",
    "numero" character varying(20),
    "localidad" "text",
    "provincia" "text",
    "codigo_postal" character varying(10),
    "pais" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "email_general" character varying(255),
    "telefono_general" character varying(50),
    "contacto_principal_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "estado" character varying(20) DEFAULT 'ACTIVO'::character varying
);


ALTER TABLE "public"."proveedores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_definitions" (
    "id" integer NOT NULL,
    "fsm_id" smallint NOT NULL,
    "state_code" character varying(20) NOT NULL,
    "name" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."state_definitions" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."mv_analisis_logistico" AS
 WITH "datos_unificados" AS (
         SELECT 'FSM Pedidos'::"text" AS "fsm_name",
            "sd"."name" AS "state_name",
            "c"."razon_social" AS "actor_nombre",
            "pi"."saldo_pendiente" AS "cantidad_ton",
            "pi"."updated_at",
            "pi"."identificador_compuesto",
            "p"."pedido_ref_externa" AS "ref_externa",
            "p"."tipo_mercado",
                CASE
                    WHEN (("now"() - "pi"."updated_at") < '08:00:00'::interval) THEN 'verde'::"text"
                    WHEN ((("now"() - "pi"."updated_at") >= '08:00:00'::interval) AND (("now"() - "pi"."updated_at") <= '24:00:00'::interval)) THEN 'amarillo'::"text"
                    ELSE 'rojo'::"text"
                END AS "color_asignado"
           FROM ((("public"."pedido_instancias" "pi"
             JOIN "public"."pedidos" "p" ON (("pi"."pedido_id" = "p"."id")))
             JOIN "public"."clientes" "c" ON (("p"."cliente_id" = "c"."id")))
             JOIN "public"."state_definitions" "sd" ON (("pi"."current_state_id" = "sd"."id")))
          WHERE ("pi"."status" = 'ACTIVA'::"public"."instance_status")
        UNION ALL
         SELECT 'FSM OC'::"text" AS "fsm_name",
            "sd"."name" AS "state_name",
            "pr"."razon_social" AS "actor_nombre",
            "oi"."cantidad_disponible" AS "cantidad_ton",
            "oi"."updated_at",
            "oi"."identificador_compuesto",
            "oc"."oc_ref_externa" AS "ref_externa",
            "oc"."tipo_operatoria" AS "tipo_mercado",
                CASE
                    WHEN (("now"() - "oi"."updated_at") < '08:00:00'::interval) THEN 'verde'::"text"
                    WHEN ((("now"() - "oi"."updated_at") >= '08:00:00'::interval) AND (("now"() - "oi"."updated_at") <= '24:00:00'::interval)) THEN 'amarillo'::"text"
                    ELSE 'rojo'::"text"
                END AS "color_asignado"
           FROM ((("public"."oc_instancias" "oi"
             JOIN "public"."ordenes_compra" "oc" ON (("oi"."oc_id" = "oc"."id")))
             JOIN "public"."proveedores" "pr" ON (("oc"."proveedor_id" = "pr"."id")))
             JOIN "public"."state_definitions" "sd" ON (("oi"."current_state_id" = "sd"."id")))
          WHERE ("oi"."status" = 'ACTIVA'::"public"."instance_status")
        )
 SELECT "datos_unificados"."fsm_name",
    "datos_unificados"."state_name",
    "datos_unificados"."actor_nombre",
    COALESCE("sum"(
        CASE
            WHEN ("datos_unificados"."color_asignado" = 'verde'::"text") THEN "datos_unificados"."cantidad_ton"
            ELSE (0)::numeric
        END), (0)::numeric) AS "ton_verde",
    COALESCE("sum"(
        CASE
            WHEN ("datos_unificados"."color_asignado" = 'amarillo'::"text") THEN "datos_unificados"."cantidad_ton"
            ELSE (0)::numeric
        END), (0)::numeric) AS "ton_amarillo",
    COALESCE("sum"(
        CASE
            WHEN ("datos_unificados"."color_asignado" = 'rojo'::"text") THEN "datos_unificados"."cantidad_ton"
            ELSE (0)::numeric
        END), (0)::numeric) AS "ton_rojo",
    "count"(
        CASE
            WHEN ("datos_unificados"."color_asignado" = 'verde'::"text") THEN 1
            ELSE NULL::integer
        END) AS "qty_verde",
    "count"(
        CASE
            WHEN ("datos_unificados"."color_asignado" = 'amarillo'::"text") THEN 1
            ELSE NULL::integer
        END) AS "qty_amarillo",
    "count"(
        CASE
            WHEN ("datos_unificados"."color_asignado" = 'rojo'::"text") THEN 1
            ELSE NULL::integer
        END) AS "qty_rojo",
    "jsonb_agg"("jsonb_build_object"('identificador_compuesto', "datos_unificados"."identificador_compuesto", 'ref_externa', "datos_unificados"."ref_externa", 'cantidad_ton', "datos_unificados"."cantidad_ton", 'updated_at', "datos_unificados"."updated_at", 'actor_nombre', "datos_unificados"."actor_nombre", 'tipo_mercado', "datos_unificados"."tipo_mercado", 'color_asignado', "datos_unificados"."color_asignado") ORDER BY "datos_unificados"."updated_at") AS "lista_instancias",
    "now"() AS "generated_at"
   FROM "datos_unificados"
  GROUP BY "datos_unificados"."fsm_name", "datos_unificados"."state_name", "datos_unificados"."actor_nombre"
  WITH NO DATA;


ALTER TABLE "public"."mv_analisis_logistico" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."mv_detalle_instancias_activas" AS
 WITH "last_transitions" AS (
         SELECT DISTINCT ON (COALESCE(("pi"."id")::"text", ("oi"."id")::"text")) "pi"."id" AS "pedido_instance_id",
            "oi"."id" AS "oc_instance_id",
            "he"."timestamp" AS "state_entry_time"
           FROM (("public"."historial_eventos" "he"
             LEFT JOIN "public"."pedido_instancias" "pi" ON (("he"."pedido_instance_id" = "pi"."id")))
             LEFT JOIN "public"."oc_instancias" "oi" ON (("he"."oc_instance_id" = "oi"."id")))
          WHERE (("he"."event_type" = 'STATE_TRANSITION'::"public"."event_type") AND (("pi"."status" = 'ACTIVA'::"public"."instance_status") OR ("oi"."status" = 'ACTIVA'::"public"."instance_status")))
          ORDER BY COALESCE(("pi"."id")::"text", ("oi"."id")::"text"), "he"."timestamp" DESC
        )
 SELECT "pi"."id" AS "instance_id",
    "p"."pedido_ref_externa" AS "ref_externa",
    'PEDIDO'::"text" AS "fsm_entity",
    "sd"."state_code",
    "sd"."name" AS "state_name",
    "p"."tipo_mercado",
    "c"."razon_social" AS "entidad_nombre",
    "pi"."saldo_pendiente" AS "cantidad_ton",
    "pi"."created_at",
    "pi"."updated_at",
    "pi"."identificador_compuesto",
    EXTRACT(epoch FROM ("now"() - "lt"."state_entry_time")) AS "time_in_state_seconds",
    "public"."seconds_to_ddhhmmss"(EXTRACT(epoch FROM ("now"() - "lt"."state_entry_time"))) AS "time_in_state_formatted"
   FROM (((("public"."pedido_instancias" "pi"
     JOIN "public"."pedidos" "p" ON (("pi"."pedido_id" = "p"."id")))
     LEFT JOIN "public"."clientes" "c" ON (("p"."cliente_id" = "c"."id")))
     JOIN "public"."state_definitions" "sd" ON (("pi"."current_state_id" = "sd"."id")))
     JOIN "last_transitions" "lt" ON (("lt"."pedido_instance_id" = "pi"."id")))
  WHERE ("pi"."status" = 'ACTIVA'::"public"."instance_status")
UNION ALL
 SELECT "oi"."id" AS "instance_id",
    "oc"."oc_ref_externa" AS "ref_externa",
    'OC'::"text" AS "fsm_entity",
    "sd"."state_code",
    "sd"."name" AS "state_name",
    "oc"."tipo_operatoria" AS "tipo_mercado",
    "prov"."razon_social" AS "entidad_nombre",
    "oi"."cantidad_disponible" AS "cantidad_ton",
    "oi"."created_at",
    "oi"."updated_at",
    "oi"."identificador_compuesto",
    EXTRACT(epoch FROM ("now"() - "lt"."state_entry_time")) AS "time_in_state_seconds",
    "public"."seconds_to_ddhhmmss"(EXTRACT(epoch FROM ("now"() - "lt"."state_entry_time"))) AS "time_in_state_formatted"
   FROM (((("public"."oc_instancias" "oi"
     JOIN "public"."ordenes_compra" "oc" ON (("oi"."oc_id" = "oc"."id")))
     LEFT JOIN "public"."proveedores" "prov" ON (("oc"."proveedor_id" = "prov"."id")))
     JOIN "public"."state_definitions" "sd" ON (("oi"."current_state_id" = "sd"."id")))
     JOIN "last_transitions" "lt" ON (("lt"."oc_instance_id" = "oi"."id")))
  WHERE ("oi"."status" = 'ACTIVA'::"public"."instance_status")
  WITH NO DATA;


ALTER TABLE "public"."mv_detalle_instancias_activas" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."mv_instancias_analitica" AS
 SELECT "sd"."fsm_id",
    "fd"."name" AS "fsm_name",
    "pi"."current_state_id",
    "sd"."state_code",
    "sd"."name" AS "state_name",
    "pi"."status",
    "count"("pi"."id") AS "total_instancias"
   FROM (("public"."pedido_instancias" "pi"
     JOIN "public"."state_definitions" "sd" ON (("pi"."current_state_id" = "sd"."id")))
     JOIN "public"."fsm_definitions" "fd" ON (("sd"."fsm_id" = "fd"."id")))
  GROUP BY "sd"."fsm_id", "fd"."name", "pi"."current_state_id", "sd"."state_code", "sd"."name", "pi"."status"
UNION ALL
 SELECT "sd"."fsm_id",
    "fd"."name" AS "fsm_name",
    "oi"."current_state_id",
    "sd"."state_code",
    "sd"."name" AS "state_name",
    "oi"."status",
    "count"("oi"."id") AS "total_instancias"
   FROM (("public"."oc_instancias" "oi"
     JOIN "public"."state_definitions" "sd" ON (("oi"."current_state_id" = "sd"."id")))
     JOIN "public"."fsm_definitions" "fd" ON (("sd"."fsm_id" = "fd"."id")))
  GROUP BY "sd"."fsm_id", "fd"."name", "oi"."current_state_id", "sd"."state_code", "sd"."name", "oi"."status"
  WITH NO DATA;


ALTER TABLE "public"."mv_instancias_analitica" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."mv_instancias_por_estado" AS
 SELECT "sd"."fsm_id",
    "fd"."name" AS "fsm_name",
    "pi"."current_state_id",
    "sd"."state_code",
    "sd"."name" AS "state_name",
    "count"("pi"."id") AS "total_instancias",
    "jsonb_agg"("jsonb_build_object"('id', "pi"."id", 'ref', "pi"."identificador_compuesto")) AS "lista_instancias"
   FROM (("public"."pedido_instancias" "pi"
     JOIN "public"."state_definitions" "sd" ON (("pi"."current_state_id" = "sd"."id")))
     JOIN "public"."fsm_definitions" "fd" ON (("sd"."fsm_id" = "fd"."id")))
  WHERE ("pi"."status" = 'ACTIVA'::"public"."instance_status")
  GROUP BY "sd"."fsm_id", "fd"."name", "pi"."current_state_id", "sd"."state_code", "sd"."name"
UNION ALL
 SELECT "sd"."fsm_id",
    "fd"."name" AS "fsm_name",
    "oi"."current_state_id",
    "sd"."state_code",
    "sd"."name" AS "state_name",
    "count"("oi"."id") AS "total_instancias",
    "jsonb_agg"("jsonb_build_object"('id', "oi"."id", 'ref', "oi"."identificador_compuesto")) AS "lista_instancias"
   FROM (("public"."oc_instancias" "oi"
     JOIN "public"."state_definitions" "sd" ON (("oi"."current_state_id" = "sd"."id")))
     JOIN "public"."fsm_definitions" "fd" ON (("sd"."fsm_id" = "fd"."id")))
  WHERE ("oi"."status" = 'ACTIVA'::"public"."instance_status")
  GROUP BY "sd"."fsm_id", "fd"."name", "oi"."current_state_id", "sd"."state_code", "sd"."name"
  WITH NO DATA;


ALTER TABLE "public"."mv_instancias_por_estado" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mv_refresh_events" (
    "id" bigint NOT NULL,
    "mv_name" "text" NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mv_refresh_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."mv_refresh_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."mv_refresh_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."mv_refresh_events_id_seq" OWNED BY "public"."mv_refresh_events"."id";



CREATE MATERIALIZED VIEW "public"."mv_tiempo_promedio_estado" AS
 WITH "state_times" AS (
         SELECT (("historial_eventos"."details" ->> 'from_state_id'::"text"))::integer AS "from_state_id",
            ("lead"("historial_eventos"."timestamp") OVER (PARTITION BY COALESCE(("historial_eventos"."pedido_instance_id")::"text", ("historial_eventos"."oc_instance_id")::"text") ORDER BY "historial_eventos"."timestamp") - "historial_eventos"."timestamp") AS "duration"
           FROM "public"."historial_eventos"
          WHERE ("historial_eventos"."event_type" = 'STATE_TRANSITION'::"public"."event_type")
        ), "average_duration" AS (
         SELECT "st"."from_state_id",
            "avg"("st"."duration") AS "avg_interval",
            EXTRACT(epoch FROM "avg"("st"."duration")) AS "avg_duration_seconds"
           FROM "state_times" "st"
          WHERE ("st"."duration" IS NOT NULL)
          GROUP BY "st"."from_state_id"
        )
 SELECT "sd"."name" AS "state_name",
    "sd"."state_code",
    "fd"."name" AS "fsm_name",
    "ad"."avg_duration_seconds",
    "public"."seconds_to_ddhhmmss"("ad"."avg_duration_seconds") AS "avg_duration_formatted"
   FROM (("average_duration" "ad"
     JOIN "public"."state_definitions" "sd" ON (("ad"."from_state_id" = "sd"."id")))
     JOIN "public"."fsm_definitions" "fd" ON (("sd"."fsm_id" = "fd"."id")))
  GROUP BY "sd"."name", "sd"."state_code", "fd"."name", "ad"."avg_duration_seconds"
  WITH NO DATA;


ALTER TABLE "public"."mv_tiempo_promedio_estado" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."mv_tiempo_promedio_por_resultado" AS
 WITH "state_times" AS (
         SELECT (("he"."details" ->> 'from_state_id'::"text"))::integer AS "from_state_id",
            ("lead"("he"."timestamp") OVER (PARTITION BY COALESCE(("he"."pedido_instance_id")::"text", ("he"."oc_instance_id")::"text") ORDER BY "he"."timestamp") - "he"."timestamp") AS "duration",
            COALESCE("pi"."status", "oi"."status") AS "status_final"
           FROM (("public"."historial_eventos" "he"
             LEFT JOIN "public"."pedido_instancias" "pi" ON (("he"."pedido_instance_id" = "pi"."id")))
             LEFT JOIN "public"."oc_instancias" "oi" ON (("he"."oc_instance_id" = "oi"."id")))
          WHERE ("he"."event_type" = 'STATE_TRANSITION'::"public"."event_type")
        )
 SELECT "sd"."name" AS "state_name",
    "sd"."state_code",
    "fd"."name" AS "fsm_name",
    "st"."status_final",
    "avg"("st"."duration") AS "avg_duration"
   FROM (("state_times" "st"
     JOIN "public"."state_definitions" "sd" ON (("st"."from_state_id" = "sd"."id")))
     JOIN "public"."fsm_definitions" "fd" ON (("sd"."fsm_id" = "fd"."id")))
  WHERE (("st"."duration" IS NOT NULL) AND ("st"."status_final" IS NOT NULL))
  GROUP BY "sd"."name", "sd"."state_code", "fd"."name", "st"."status_final"
  WITH NO DATA;


ALTER TABLE "public"."mv_tiempo_promedio_por_resultado" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."oc_instancias_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."oc_instancias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."oc_instancias_id_seq" OWNED BY "public"."oc_instancias"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."ordenes_compra_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."ordenes_compra_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ordenes_compra_id_seq" OWNED BY "public"."ordenes_compra"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."pedido_instancias_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."pedido_instancias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pedido_instancias_id_seq" OWNED BY "public"."pedido_instancias"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."pedidos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."pedidos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pedidos_id_seq" OWNED BY "public"."pedidos"."id";



CREATE TABLE IF NOT EXISTS "public"."personal_ac" (
    "id" integer NOT NULL,
    "nombre_completo" "text" NOT NULL,
    "email" character varying(255) NOT NULL,
    "dni" character varying(20),
    "celular" character varying(50),
    "tipo_contratacion" "text" DEFAULT 'INTERNO'::"text",
    "auth_user_id" "uuid",
    "password_temporal" "text",
    "estado" character varying(20) DEFAULT 'ACTIVO'::character varying,
    CONSTRAINT "personal_ac_tipo_contratacion_check" CHECK (("tipo_contratacion" = ANY (ARRAY['INTERNO'::"text", 'EXTERNO'::"text"])))
);


ALTER TABLE "public"."personal_ac" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."personal_ac_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."personal_ac_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."personal_ac_id_seq" OWNED BY "public"."personal_ac"."id";



CREATE TABLE IF NOT EXISTS "public"."personal_ac_roles" (
    "personal_ac_id" integer NOT NULL,
    "role_id" integer NOT NULL
);


ALTER TABLE "public"."personal_ac_roles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."proveedores_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."proveedores_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."proveedores_id_seq" OWNED BY "public"."proveedores"."id";



CREATE TABLE IF NOT EXISTS "public"."remito_items" (
    "id" bigint NOT NULL,
    "remito_id" bigint NOT NULL,
    "origen_type" "text",
    "origen_instance_id" bigint NOT NULL,
    "destino_instance_id" bigint,
    "cantidad" numeric(12,3) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "remito_items_origen_type_check" CHECK (("origen_type" = ANY (ARRAY['PEDIDO'::"text", 'OC'::"text"])))
);


ALTER TABLE "public"."remito_items" OWNER TO "postgres";


ALTER TABLE "public"."remito_items" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."remito_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."remitos" (
    "id" bigint NOT NULL,
    "chofer_id" integer,
    "remito_ref_externa" character varying(50) NOT NULL,
    "parent_remito_id" bigint,
    "cantidad" numeric(12,3),
    "camion_patente" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "estado_asignacion" "text" DEFAULT 'PENDIENTE'::"text",
    "archivo_url" "text",
    "cotizacion_url" "text",
    "metadata_extraida" "jsonb" DEFAULT '{}'::"jsonb",
    "email_remitente" "text",
    "cantidad_total" numeric(12,3),
    "contexto_asignacion" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "operador_id" integer,
    "instrucciones_texto" "text",
    "protocolo_control" "jsonb" DEFAULT '[]'::"jsonb",
    "camion_id" integer,
    "acoplado_id" integer,
    "supervisor_id" integer,
    "inspector_id" integer,
    "tara_pesaje_momento" character varying(100),
    "tara_pesaje_lugar_id" integer,
    "bruto_pesaje_momento" character varying(100),
    "bruto_pesaje_lugar_id" integer,
    CONSTRAINT "remitos_estado_asignacion_check" CHECK (("estado_asignacion" = ANY (ARRAY['PENDIENTE'::"text", 'ASIGNADO'::"text", 'DESCARTADO'::"text"])))
);


ALTER TABLE "public"."remitos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."remitos"."instrucciones_texto" IS 'Texto original de instrucciones para enviar al chofer';



COMMENT ON COLUMN "public"."remitos"."protocolo_control" IS 'Estructura JSON de tareas para validación automática';



CREATE SEQUENCE IF NOT EXISTS "public"."remitos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."remitos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."remitos_id_seq" OWNED BY "public"."remitos"."id";



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "codigo" character varying(10)
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."roles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."roles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."roles_id_seq" OWNED BY "public"."roles"."id";



CREATE TABLE IF NOT EXISTS "public"."servicios" (
    "id" integer NOT NULL,
    "codigo_servicio" character varying(50) NOT NULL,
    "nombre" "text" NOT NULL
);


ALTER TABLE "public"."servicios" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."servicios_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."servicios_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."servicios_id_seq" OWNED BY "public"."servicios"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."state_definitions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."state_definitions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."state_definitions_id_seq" OWNED BY "public"."state_definitions"."id";



CREATE TABLE IF NOT EXISTS "public"."state_validation_requirements" (
    "state_id" integer NOT NULL,
    "validation_id" integer NOT NULL
);


ALTER TABLE "public"."state_validation_requirements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."status" (
    "?column?" "text"
);


ALTER TABLE "public"."status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transportistas" (
    "id" integer NOT NULL,
    "nombre_empresa" "text" NOT NULL,
    "cuit" character varying(13),
    "contacto_principal_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "estado" character varying(20) DEFAULT 'ACTIVO'::character varying
);


ALTER TABLE "public"."transportistas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."transportistas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."transportistas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."transportistas_id_seq" OWNED BY "public"."transportistas"."id";



CREATE OR REPLACE VIEW "public"."v_conversation_messages_basic" AS
 SELECT "m"."id",
    "m"."conversation_id",
    "m"."direction",
    "m"."sender_role",
    "m"."message_type",
    "m"."body_text",
    "m"."created_at"
   FROM "public"."conversation_messages" "m";


ALTER TABLE "public"."v_conversation_messages_basic" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_inspecciones_kanban" AS
 SELECT "i"."id",
    "i"."tipo_carga",
    "p"."nombre_completo" AS "inspector_nombre",
    "i"."fecha_hora_carga_pactada" AS "fecha_pactada",
    "i"."export_doc_status",
    "i"."resultado_final",
    "i"."planilla_url",
    "sd"."state_code",
    ( SELECT "json_agg"("json_build_object"('identificador_compuesto', "pi"."identificador_compuesto")) AS "json_agg"
           FROM ("public"."inspeccion_items_pedido" "iip"
             JOIN "public"."pedido_instancias" "pi" ON (("iip"."pedido_instance_id" = "pi"."id")))
          WHERE ("iip"."inspeccion_id" = "i"."id")) AS "pedidos"
   FROM (("public"."inspecciones" "i"
     LEFT JOIN "public"."personal_ac" "p" ON (("i"."inspector_id" = "p"."id")))
     LEFT JOIN "public"."state_definitions" "sd" ON (("i"."current_state_id" = "sd"."id")));


ALTER TABLE "public"."v_inspecciones_kanban" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_pedidos_elegibles_inspeccion" AS
SELECT
    NULL::bigint AS "id",
    NULL::"text" AS "identificador",
    NULL::"text" AS "cliente",
    NULL::"text" AS "articulo",
    NULL::numeric(12,3) AS "saldo_pendiente",
    NULL::character varying(2) AS "tipo_mercado";


ALTER TABLE "public"."v_pedidos_elegibles_inspeccion" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."validation_definitions" (
    "id" integer NOT NULL,
    "validation_code" character varying(20) NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_blocking" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."validation_definitions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."validation_definitions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."validation_definitions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."validation_definitions_id_seq" OWNED BY "public"."validation_definitions"."id";



CREATE TABLE IF NOT EXISTS "public"."vinculaciones_pedido_oc" (
    "id" bigint NOT NULL,
    "pedido_instance_id" bigint NOT NULL,
    "oc_instance_id" bigint NOT NULL,
    "cantidad_vinculada" numeric(12,3) NOT NULL,
    "estado_vinculacion" character varying(30) DEFAULT 'PENDIENTE_VALIDACION'::character varying NOT NULL,
    "margen_rentabilidad_calculado" numeric(8,4),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "aprobacion_excepcional" boolean DEFAULT false NOT NULL,
    CONSTRAINT "vinculaciones_pedido_oc_estado_vinculacion_check" CHECK ((("estado_vinculacion")::"text" = ANY ((ARRAY['PENDIENTE_VALIDACION'::character varying, 'APROBADA'::character varying, 'RECHAZADA'::character varying])::"text"[])))
);


ALTER TABLE "public"."vinculaciones_pedido_oc" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."vinculaciones_pedido_oc_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."vinculaciones_pedido_oc_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."vinculaciones_pedido_oc_id_seq" OWNED BY "public"."vinculaciones_pedido_oc"."id";



CREATE OR REPLACE VIEW "public"."vw_diagnostico_vagones" AS
 SELECT "pi"."identificador_compuesto" AS "referencia_humana",
    "pi"."id" AS "instancia_id",
    "p"."pedido_ref_externa" AS "nro_pedido",
    "c"."razon_social" AS "cliente",
    "pi"."saldo_pendiente" AS "toneladas_vagon",
    ("pi"."saldo_pendiente" * (1000)::numeric) AS "kilos_vagon",
    "round"((("pi"."saldo_pendiente" * (1000)::numeric) / (50)::numeric), 0) AS "bolsas_50kg_vagon",
    "oc"."oc_ref_externa" AS "nro_oc",
    "prov"."razon_social" AS "proveedor",
    ( SELECT "string_agg"(DISTINCT ("r"."remito_ref_externa")::"text", ', '::"text") AS "string_agg"
           FROM ("public"."remitos" "r"
             JOIN "public"."remito_items" "ri" ON (("ri"."remito_id" = "r"."id")))
          WHERE (("ri"."origen_instance_id" = "pi"."id") AND ("ri"."origen_type" = 'PEDIDO'::"text"))) AS "nro_remito",
    "sd"."state_code" AS "cod_estado",
    "sd"."name" AS "nombre_estado",
    ( SELECT "jsonb_agg"("vd"."name") AS "jsonb_agg"
           FROM ("public"."state_validation_requirements" "svr"
             JOIN "public"."validation_definitions" "vd" ON (("svr"."validation_id" = "vd"."id")))
          WHERE (("svr"."state_id" = "pi"."current_state_id") AND (NOT (("vd"."validation_code")::"text" IN ( SELECT ("he"."details" ->> 'validation_code'::"text")
                   FROM "public"."historial_eventos" "he"
                  WHERE (("he"."pedido_instance_id" = "pi"."id") AND ("he"."event_type" = 'VALIDATION_SUCCESS'::"public"."event_type") AND ("he"."timestamp" > ( SELECT COALESCE("max"("historial_eventos"."timestamp"), '1900-01-01 00:00:00-04:16:48'::timestamp with time zone) AS "coalesce"
                           FROM "public"."historial_eventos"
                          WHERE (("historial_eventos"."pedido_instance_id" = "pi"."id") AND ("historial_eventos"."event_type" = 'STATE_TRANSITION'::"public"."event_type")))))))))) AS "tareas_faltantes",
    "public"."obtener_proximos_estados"("pi"."current_state_id") AS "caminos_posibles"
   FROM ((((((("public"."pedido_instancias" "pi"
     JOIN "public"."pedidos" "p" ON (("pi"."pedido_id" = "p"."id")))
     LEFT JOIN "public"."clientes" "c" ON (("p"."cliente_id" = "c"."id")))
     JOIN "public"."state_definitions" "sd" ON (("pi"."current_state_id" = "sd"."id")))
     LEFT JOIN "public"."vinculaciones_pedido_oc" "v" ON (("v"."pedido_instance_id" = "pi"."id")))
     LEFT JOIN "public"."oc_instancias" "oi" ON (("v"."oc_instance_id" = "oi"."id")))
     LEFT JOIN "public"."ordenes_compra" "oc" ON (("oi"."oc_id" = "oc"."id")))
     LEFT JOIN "public"."proveedores" "prov" ON (("oc"."proveedor_id" = "prov"."id")))
  WHERE ("pi"."status" = 'ACTIVA'::"public"."instance_status");


ALTER TABLE "public"."vw_diagnostico_vagones" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_monitor_instancias_activas" AS
 WITH "tiempos" AS (
         SELECT "historial_eventos"."pedido_instance_id",
            (EXTRACT(epoch FROM ("now"() - "max"("historial_eventos"."timestamp"))) / (3600)::numeric) AS "horas_en_estado"
           FROM "public"."historial_eventos"
          WHERE ("historial_eventos"."event_type" = 'STATE_TRANSITION'::"public"."event_type")
          GROUP BY "historial_eventos"."pedido_instance_id"
        )
 SELECT "pi"."id" AS "instancia_id",
    "pi"."identificador_compuesto" AS "referencia_humana",
    "p"."pedido_ref_externa" AS "nro_pedido",
    "p"."tipo_mercado",
    "c"."razon_social" AS "cliente",
    "prov"."razon_social" AS "proveedor",
    ( SELECT "string_agg"(DISTINCT ("r"."remito_ref_externa")::"text", ', '::"text") AS "string_agg"
           FROM ("public"."remitos" "r"
             JOIN "public"."remito_items" "ri" ON (("ri"."remito_id" = "r"."id")))
          WHERE (("ri"."origen_instance_id" = "pi"."id") AND ("ri"."origen_type" = 'PEDIDO'::"text"))) AS "nro_remito",
    ((("sd"."state_code")::"text" || ': '::"text") || "sd"."name") AS "estado_actual",
    "round"(COALESCE("t"."horas_en_estado", (0)::numeric), 1) AS "horas_transcurridas",
        CASE
            WHEN ("t"."horas_en_estado" > (24)::numeric) THEN 'ROJO'::"text"
            WHEN ("t"."horas_en_estado" > (12)::numeric) THEN 'AMARILLO'::"text"
            ELSE 'VERDE'::"text"
        END AS "color_alerta",
    "pi"."cantidad_requerida_original" AS "toneladas_originales",
    "pi"."saldo_pendiente" AS "toneladas_actuales",
    "round"((("pi"."cantidad_requerida_original" * (1000)::numeric) / (50)::numeric), 0) AS "bolsas_50kg_originales",
    ( SELECT "jsonb_agg"("vd"."name") AS "jsonb_agg"
           FROM ("public"."state_validation_requirements" "svr"
             JOIN "public"."validation_definitions" "vd" ON (("svr"."validation_id" = "vd"."id")))
          WHERE (("svr"."state_id" = "pi"."current_state_id") AND (((("p"."tipo_mercado")::"text" = 'MI'::"text") AND (("vd"."validation_code")::"text" !~~ '%_ME_%'::"text")) OR ((("p"."tipo_mercado")::"text" = 'ME'::"text") AND (("vd"."validation_code")::"text" !~~ '%_MI_%'::"text")) OR ((("vd"."validation_code")::"text" !~~ '%_ME_%'::"text") AND (("vd"."validation_code")::"text" !~~ '%_MI_%'::"text"))) AND (NOT (("vd"."validation_code")::"text" IN ( SELECT ("he"."details" ->> 'validation_code'::"text")
                   FROM "public"."historial_eventos" "he"
                  WHERE (("he"."pedido_instance_id" = "pi"."id") AND ("he"."event_type" = 'VALIDATION_SUCCESS'::"public"."event_type") AND ("he"."timestamp" > ( SELECT COALESCE("max"("historial_eventos"."timestamp"), '1900-01-01 00:00:00-04:16:48'::timestamp with time zone) AS "coalesce"
                           FROM "public"."historial_eventos"
                          WHERE (("historial_eventos"."pedido_instance_id" = "pi"."id") AND ("historial_eventos"."event_type" = 'STATE_TRANSITION'::"public"."event_type")))))))))) AS "tareas_faltantes",
    "public"."obtener_proximos_estados"("pi"."current_state_id") AS "proximos_estados"
   FROM (((((((("public"."pedido_instancias" "pi"
     JOIN "public"."pedidos" "p" ON (("pi"."pedido_id" = "p"."id")))
     JOIN "public"."clientes" "c" ON (("p"."cliente_id" = "c"."id")))
     JOIN "public"."state_definitions" "sd" ON (("pi"."current_state_id" = "sd"."id")))
     LEFT JOIN "public"."vinculaciones_pedido_oc" "vinc" ON (("vinc"."pedido_instance_id" = "pi"."id")))
     LEFT JOIN "public"."oc_instancias" "oi" ON (("vinc"."oc_instance_id" = "oi"."id")))
     LEFT JOIN "public"."ordenes_compra" "oc" ON (("oi"."oc_id" = "oc"."id")))
     LEFT JOIN "public"."proveedores" "prov" ON (("oc"."proveedor_id" = "prov"."id")))
     LEFT JOIN "tiempos" "t" ON (("t"."pedido_instance_id" = "pi"."id")))
  WHERE ("pi"."status" = 'ACTIVA'::"public"."instance_status");


ALTER TABLE "public"."vw_monitor_instancias_activas" OWNER TO "postgres";


ALTER TABLE ONLY "public"."alertas_escalamiento" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."alertas_escalamiento_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."articulos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."articulos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."camiones" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."camiones_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."catalogo_tareas_control" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."catalogo_tareas_control_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."choferes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."choferes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."clientes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."clientes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contactos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contactos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."conversation_messages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."conversation_messages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."conversations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."conversations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."debug_log_fsm" ALTER COLUMN "log_id" SET DEFAULT "nextval"('"public"."debug_log_fsm_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."depositos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."depositos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."documentos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."documentos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fsm_transitions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fsm_transitions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."historial_eventos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."historial_eventos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."inspeccion_items_pedido" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inspeccion_items_pedido_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."inspeccion_templates" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inspeccion_templates_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."inspecciones" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inspecciones_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lugares_pesaje" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lugares_pesaje_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."message_media" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."message_media_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."mv_refresh_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."mv_refresh_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."oc_instancias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."oc_instancias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ordenes_compra" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ordenes_compra_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pedido_instancias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pedido_instancias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pedidos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pedidos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."personal_ac" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."personal_ac_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."proveedores" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."proveedores_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."remitos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."remitos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."roles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."roles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."servicios" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."servicios_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."state_definitions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."state_definitions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."transportistas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."transportistas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."validation_definitions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."validation_definitions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vinculaciones_pedido_oc" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."vinculaciones_pedido_oc_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."alertas_escalamiento"
    ADD CONSTRAINT "alertas_escalamiento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."articulos"
    ADD CONSTRAINT "articulos_codigo_articulo_key" UNIQUE ("codigo_articulo");



ALTER TABLE ONLY "public"."articulos"
    ADD CONSTRAINT "articulos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."camiones"
    ADD CONSTRAINT "camiones_patente_key" UNIQUE ("patente");



ALTER TABLE ONLY "public"."camiones"
    ADD CONSTRAINT "camiones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalogo_tareas_control"
    ADD CONSTRAINT "catalogo_tareas_control_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."choferes"
    ADD CONSTRAINT "choferes_dni_key" UNIQUE ("dni");



ALTER TABLE ONLY "public"."choferes"
    ADD CONSTRAINT "choferes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_codigo_tango_key" UNIQUE ("codigo_tango");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_cuit_key" UNIQUE ("cuit");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contactos"
    ADD CONSTRAINT "contactos_dni_cuil_key" UNIQUE ("dni_cuil");



ALTER TABLE ONLY "public"."contactos"
    ADD CONSTRAINT "contactos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_uq" UNIQUE ("channel", "conversation_key");



ALTER TABLE ONLY "public"."debug_flags"
    ADD CONSTRAINT "debug_flags_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."debug_log_fsm"
    ADD CONSTRAINT "debug_log_fsm_pkey" PRIMARY KEY ("log_id");



ALTER TABLE ONLY "public"."depositos"
    ADD CONSTRAINT "depositos_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."depositos"
    ADD CONSTRAINT "depositos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."fsm_definitions"
    ADD CONSTRAINT "fsm_definitions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."fsm_definitions"
    ADD CONSTRAINT "fsm_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fsm_transitions"
    ADD CONSTRAINT "fsm_transitions_from_state_id_trigger_type_trigger_validati_key" UNIQUE ("from_state_id", "trigger_type", "trigger_validation_code");



ALTER TABLE ONLY "public"."fsm_transitions"
    ADD CONSTRAINT "fsm_transitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historial_eventos"
    ADD CONSTRAINT "historial_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspeccion_items_pedido"
    ADD CONSTRAINT "inspeccion_items_pedido_inspeccion_id_pedido_instance_id_key" UNIQUE ("inspeccion_id", "pedido_instance_id");



ALTER TABLE ONLY "public"."inspeccion_items_pedido"
    ADD CONSTRAINT "inspeccion_items_pedido_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspeccion_templates"
    ADD CONSTRAINT "inspeccion_templates_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."inspeccion_templates"
    ADD CONSTRAINT "inspeccion_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspecciones"
    ADD CONSTRAINT "inspecciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lugares_pesaje"
    ADD CONSTRAINT "lugares_pesaje_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."lugares_pesaje"
    ADD CONSTRAINT "lugares_pesaje_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."magic_links"
    ADD CONSTRAINT "magic_links_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."message_media"
    ADD CONSTRAINT "message_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_media"
    ADD CONSTRAINT "message_media_uq" UNIQUE ("message_id", "media_index");



ALTER TABLE ONLY "public"."mv_refresh_events"
    ADD CONSTRAINT "mv_refresh_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oc_instancias"
    ADD CONSTRAINT "oc_instancias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordenes_compra"
    ADD CONSTRAINT "ordenes_compra_oc_ref_externa_key" UNIQUE ("oc_ref_externa");



ALTER TABLE ONLY "public"."ordenes_compra"
    ADD CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedido_instancias"
    ADD CONSTRAINT "pedido_instancias_identificador_compuesto_key" UNIQUE ("identificador_compuesto");



ALTER TABLE ONLY "public"."pedido_instancias"
    ADD CONSTRAINT "pedido_instancias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_pedido_ref_externa_key" UNIQUE ("pedido_ref_externa");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_ac"
    ADD CONSTRAINT "personal_ac_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."personal_ac"
    ADD CONSTRAINT "personal_ac_dni_key" UNIQUE ("dni");



ALTER TABLE ONLY "public"."personal_ac"
    ADD CONSTRAINT "personal_ac_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."personal_ac"
    ADD CONSTRAINT "personal_ac_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_ac_roles"
    ADD CONSTRAINT "personal_ac_roles_pkey" PRIMARY KEY ("personal_ac_id", "role_id");



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_codigo_proveedor_key" UNIQUE ("codigo_proveedor");



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_cuit_key" UNIQUE ("cuit");



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."remito_items"
    ADD CONSTRAINT "remito_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_remito_ref_externa_key" UNIQUE ("remito_ref_externa");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."servicios"
    ADD CONSTRAINT "servicios_codigo_servicio_key" UNIQUE ("codigo_servicio");



ALTER TABLE ONLY "public"."servicios"
    ADD CONSTRAINT "servicios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_definitions"
    ADD CONSTRAINT "state_definitions_fsm_id_state_code_key" UNIQUE ("fsm_id", "state_code");



ALTER TABLE ONLY "public"."state_definitions"
    ADD CONSTRAINT "state_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."state_validation_requirements"
    ADD CONSTRAINT "state_validation_requirements_pkey" PRIMARY KEY ("state_id", "validation_id");



ALTER TABLE ONLY "public"."transportistas"
    ADD CONSTRAINT "transportistas_cuit_key" UNIQUE ("cuit");



ALTER TABLE ONLY "public"."transportistas"
    ADD CONSTRAINT "transportistas_nombre_empresa_key" UNIQUE ("nombre_empresa");



ALTER TABLE ONLY "public"."transportistas"
    ADD CONSTRAINT "transportistas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."validation_definitions"
    ADD CONSTRAINT "validation_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."validation_definitions"
    ADD CONSTRAINT "validation_definitions_validation_code_key" UNIQUE ("validation_code");



ALTER TABLE ONLY "public"."vinculaciones_pedido_oc"
    ADD CONSTRAINT "vinculaciones_pedido_oc_pedido_instance_id_oc_instance_id_key" UNIQUE ("pedido_instance_id", "oc_instance_id");



ALTER TABLE ONLY "public"."vinculaciones_pedido_oc"
    ADD CONSTRAINT "vinculaciones_pedido_oc_pkey" PRIMARY KEY ("id");



CREATE INDEX "conversation_messages_idx_conv_created" ON "public"."conversation_messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "conversation_messages_idx_provider_sid" ON "public"."conversation_messages" USING "btree" ("provider", "provider_message_id");



CREATE INDEX "conversations_idx_key" ON "public"."conversations" USING "btree" ("conversation_key");



CREATE INDEX "conversations_idx_last_activity" ON "public"."conversations" USING "btree" ("last_activity_at" DESC);



CREATE INDEX "idx_alertas_msg" ON "public"."alertas_escalamiento" USING "btree" ("trigger_message_id");



CREATE INDEX "idx_alertas_personal" ON "public"."alertas_escalamiento" USING "btree" ("personal_id");



CREATE INDEX "idx_conv_messages_sender_id" ON "public"."conversation_messages" USING "btree" ("sender_id");



CREATE INDEX "idx_conv_msg_media" ON "public"."conversation_messages" USING "gin" ("media_urls");



CREATE INDEX "idx_conversations_estado" ON "public"."conversations" USING "btree" ("estado_atencion");



CREATE INDEX "idx_historial_eventos_oc" ON "public"."historial_eventos" USING "btree" ("oc_instance_id");



CREATE INDEX "idx_historial_eventos_pedido" ON "public"."historial_eventos" USING "btree" ("pedido_instance_id");



CREATE INDEX "idx_magic_links_instancia" ON "public"."magic_links" USING "btree" ("instancia_id");



CREATE INDEX "idx_magic_links_token" ON "public"."magic_links" USING "btree" ("token");



CREATE UNIQUE INDEX "idx_mv_analisis_logistico_unique" ON "public"."mv_analisis_logistico" USING "btree" ("fsm_name", "state_name", "actor_nombre");



CREATE UNIQUE INDEX "idx_mv_detalle_instancias_unique" ON "public"."mv_detalle_instancias_activas" USING "btree" ("instance_id", "fsm_entity");



CREATE UNIQUE INDEX "idx_mv_instancias_estado_unique" ON "public"."mv_instancias_por_estado" USING "btree" ("fsm_id", "current_state_id");



CREATE INDEX "idx_oc_instancias_activas" ON "public"."oc_instancias" USING "btree" ("status") WHERE ("status" = 'ACTIVA'::"public"."instance_status");



CREATE INDEX "idx_oc_instancias_estado" ON "public"."oc_instancias" USING "btree" ("current_state_id");



CREATE INDEX "idx_pedido_instancias_activas" ON "public"."pedido_instancias" USING "btree" ("status") WHERE ("status" = 'ACTIVA'::"public"."instance_status");



CREATE INDEX "idx_pedido_instancias_estado" ON "public"."pedido_instancias" USING "btree" ("current_state_id");



CREATE INDEX "idx_remito_items_origen" ON "public"."remito_items" USING "btree" ("origen_instance_id");



CREATE INDEX "idx_remito_items_remito" ON "public"."remito_items" USING "btree" ("remito_id");



CREATE INDEX "idx_remitos_camion" ON "public"."remitos" USING "btree" ("camion_id");



CREATE INDEX "idx_remitos_supervisor" ON "public"."remitos" USING "btree" ("supervisor_id");



CREATE INDEX "idx_vinculaciones_oc" ON "public"."vinculaciones_pedido_oc" USING "btree" ("oc_instance_id");



CREATE INDEX "idx_vinculaciones_pedido" ON "public"."vinculaciones_pedido_oc" USING "btree" ("pedido_instance_id");



CREATE INDEX "message_media_idx_message" ON "public"."message_media" USING "btree" ("message_id");



CREATE INDEX "message_media_idx_storage_path" ON "public"."message_media" USING "btree" ("storage_path");



CREATE OR REPLACE VIEW "public"."v_pedidos_elegibles_inspeccion" AS
 SELECT "pi"."id",
    "pi"."identificador_compuesto" AS "identificador",
    "c"."razon_social" AS "cliente",
    'Carga de Azúcar'::"text" AS "articulo",
    "pi"."saldo_pendiente",
    "p"."tipo_mercado"
   FROM ((("public"."pedido_instancias" "pi"
     JOIN "public"."pedidos" "p" ON (("pi"."pedido_id" = "p"."id")))
     JOIN "public"."clientes" "c" ON (("p"."cliente_id" = "c"."id")))
     JOIN "public"."state_definitions" "sd" ON (("pi"."current_state_id" = "sd"."id")))
  WHERE (("pi"."status" = 'ACTIVA'::"public"."instance_status") AND (NOT ("pi"."current_state_id" IN ( SELECT "state_definitions"."id"
           FROM "public"."state_definitions"
          WHERE (("state_definitions"."state_code")::"text" = ANY ((ARRAY['7'::character varying, '8'::character varying])::"text"[]))))))
  GROUP BY "pi"."id", "pi"."identificador_compuesto", "c"."razon_social", "p"."tipo_mercado";



CREATE OR REPLACE TRIGGER "tr_inspecciones_updated_at" BEFORE UPDATE ON "public"."inspecciones" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_inspeccion_update_magic_link" AFTER UPDATE OF "fecha_hora_carga_pactada" ON "public"."inspecciones" FOR EACH ROW EXECUTE FUNCTION "public"."fn_trg_inspecciones_sync_magic_link"();



ALTER TABLE ONLY "public"."alertas_escalamiento"
    ADD CONSTRAINT "alertas_escalamiento_msg_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alertas_escalamiento"
    ADD CONSTRAINT "alertas_escalamiento_personal_fk" FOREIGN KEY ("personal_id") REFERENCES "public"."personal_ac"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."choferes"
    ADD CONSTRAINT "choferes_transportista_id_fkey" FOREIGN KEY ("transportista_id") REFERENCES "public"."transportistas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contactos"
    ADD CONSTRAINT "contactos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contactos"
    ADD CONSTRAINT "contactos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contactos"
    ADD CONSTRAINT "contactos_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."contactos"
    ADD CONSTRAINT "contactos_transportista_id_fkey" FOREIGN KEY ("transportista_id") REFERENCES "public"."transportistas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."personal_ac"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_remito_actual_id_fkey" FOREIGN KEY ("remito_actual_id") REFERENCES "public"."remitos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_oc_instance_id_fkey" FOREIGN KEY ("oc_instance_id") REFERENCES "public"."oc_instancias"("id");



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_pedido_instance_id_fkey" FOREIGN KEY ("pedido_instance_id") REFERENCES "public"."pedido_instancias"("id");



ALTER TABLE ONLY "public"."documentos"
    ADD CONSTRAINT "documentos_remito_id_fkey" FOREIGN KEY ("remito_id") REFERENCES "public"."remitos"("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "fk_contacto_principal" FOREIGN KEY ("contacto_principal_id") REFERENCES "public"."contactos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "fk_contacto_principal" FOREIGN KEY ("contacto_principal_id") REFERENCES "public"."contactos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transportistas"
    ADD CONSTRAINT "fk_contacto_principal" FOREIGN KEY ("contacto_principal_id") REFERENCES "public"."contactos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fsm_transitions"
    ADD CONSTRAINT "fsm_transitions_from_state_id_fkey" FOREIGN KEY ("from_state_id") REFERENCES "public"."state_definitions"("id");



ALTER TABLE ONLY "public"."fsm_transitions"
    ADD CONSTRAINT "fsm_transitions_to_state_id_fkey" FOREIGN KEY ("to_state_id") REFERENCES "public"."state_definitions"("id");



ALTER TABLE ONLY "public"."fsm_transitions"
    ADD CONSTRAINT "fsm_transitions_trigger_validation_code_fkey" FOREIGN KEY ("trigger_validation_code") REFERENCES "public"."validation_definitions"("validation_code");



ALTER TABLE ONLY "public"."historial_eventos"
    ADD CONSTRAINT "historial_eventos_inspeccion_id_fkey" FOREIGN KEY ("inspeccion_id") REFERENCES "public"."inspecciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_eventos"
    ADD CONSTRAINT "historial_eventos_oc_instance_id_fkey" FOREIGN KEY ("oc_instance_id") REFERENCES "public"."oc_instancias"("id");



ALTER TABLE ONLY "public"."historial_eventos"
    ADD CONSTRAINT "historial_eventos_pedido_instance_id_fkey" FOREIGN KEY ("pedido_instance_id") REFERENCES "public"."pedido_instancias"("id");



ALTER TABLE ONLY "public"."inspeccion_items_pedido"
    ADD CONSTRAINT "inspeccion_items_pedido_inspeccion_id_fkey" FOREIGN KEY ("inspeccion_id") REFERENCES "public"."inspecciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspeccion_items_pedido"
    ADD CONSTRAINT "inspeccion_items_pedido_pedido_instance_id_fkey" FOREIGN KEY ("pedido_instance_id") REFERENCES "public"."pedido_instancias"("id");



ALTER TABLE ONLY "public"."inspecciones"
    ADD CONSTRAINT "inspecciones_current_state_id_fkey" FOREIGN KEY ("current_state_id") REFERENCES "public"."state_definitions"("id");



ALTER TABLE ONLY "public"."inspecciones"
    ADD CONSTRAINT "inspecciones_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "public"."personal_ac"("id");



ALTER TABLE ONLY "public"."inspecciones"
    ADD CONSTRAINT "inspecciones_lugar_carga_id_fkey" FOREIGN KEY ("lugar_carga_id") REFERENCES "public"."depositos"("id");



ALTER TABLE ONLY "public"."inspecciones"
    ADD CONSTRAINT "inspecciones_remito_id_fkey" FOREIGN KEY ("remito_id") REFERENCES "public"."remitos"("id");



ALTER TABLE ONLY "public"."inspecciones"
    ADD CONSTRAINT "inspecciones_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."inspeccion_templates"("id");



ALTER TABLE ONLY "public"."message_media"
    ADD CONSTRAINT "message_media_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oc_instancias"
    ADD CONSTRAINT "oc_instancias_current_state_id_fkey" FOREIGN KEY ("current_state_id") REFERENCES "public"."state_definitions"("id");



ALTER TABLE ONLY "public"."oc_instancias"
    ADD CONSTRAINT "oc_instancias_oc_id_fkey" FOREIGN KEY ("oc_id") REFERENCES "public"."ordenes_compra"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oc_instancias"
    ADD CONSTRAINT "oc_instancias_parent_instance_id_fkey" FOREIGN KEY ("parent_instance_id") REFERENCES "public"."oc_instancias"("id");



ALTER TABLE ONLY "public"."ordenes_compra"
    ADD CONSTRAINT "ordenes_compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id");



ALTER TABLE ONLY "public"."pedido_instancias"
    ADD CONSTRAINT "pedido_instancias_current_state_id_fkey" FOREIGN KEY ("current_state_id") REFERENCES "public"."state_definitions"("id");



ALTER TABLE ONLY "public"."pedido_instancias"
    ADD CONSTRAINT "pedido_instancias_parent_instance_id_fkey" FOREIGN KEY ("parent_instance_id") REFERENCES "public"."pedido_instancias"("id");



ALTER TABLE ONLY "public"."pedido_instancias"
    ADD CONSTRAINT "pedido_instancias_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id");



ALTER TABLE ONLY "public"."personal_ac"
    ADD CONSTRAINT "personal_ac_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personal_ac_roles"
    ADD CONSTRAINT "personal_ac_roles_personal_ac_id_fkey" FOREIGN KEY ("personal_ac_id") REFERENCES "public"."personal_ac"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_ac_roles"
    ADD CONSTRAINT "personal_ac_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."remito_items"
    ADD CONSTRAINT "remito_items_remito_id_fkey" FOREIGN KEY ("remito_id") REFERENCES "public"."remitos"("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_acoplado_id_fkey" FOREIGN KEY ("acoplado_id") REFERENCES "public"."camiones"("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_bruto_pesaje_lugar_id_fkey" FOREIGN KEY ("bruto_pesaje_lugar_id") REFERENCES "public"."lugares_pesaje"("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_camion_id_fkey" FOREIGN KEY ("camion_id") REFERENCES "public"."camiones"("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "public"."choferes"("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "public"."personal_ac"("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "public"."personal_ac"("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_parent_remito_id_fkey" FOREIGN KEY ("parent_remito_id") REFERENCES "public"."remitos"("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "public"."personal_ac"("id");



ALTER TABLE ONLY "public"."remitos"
    ADD CONSTRAINT "remitos_tara_pesaje_lugar_id_fkey" FOREIGN KEY ("tara_pesaje_lugar_id") REFERENCES "public"."lugares_pesaje"("id");



ALTER TABLE ONLY "public"."state_definitions"
    ADD CONSTRAINT "state_definitions_fsm_id_fkey" FOREIGN KEY ("fsm_id") REFERENCES "public"."fsm_definitions"("id");



ALTER TABLE ONLY "public"."state_validation_requirements"
    ADD CONSTRAINT "state_validation_requirements_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "public"."state_definitions"("id");



ALTER TABLE ONLY "public"."state_validation_requirements"
    ADD CONSTRAINT "state_validation_requirements_validation_id_fkey" FOREIGN KEY ("validation_id") REFERENCES "public"."validation_definitions"("id");



ALTER TABLE ONLY "public"."vinculaciones_pedido_oc"
    ADD CONSTRAINT "vinculaciones_pedido_oc_oc_instance_id_fkey" FOREIGN KEY ("oc_instance_id") REFERENCES "public"."oc_instancias"("id");



ALTER TABLE ONLY "public"."vinculaciones_pedido_oc"
    ADD CONSTRAINT "vinculaciones_pedido_oc_pedido_instance_id_fkey" FOREIGN KEY ("pedido_instance_id") REFERENCES "public"."pedido_instancias"("id");



CREATE POLICY "Autenticados pueden actualizar conversaciones (ej: toggle bot/h" ON "public"."conversations" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Autenticados pueden crear conversaciones" ON "public"."conversations" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Autenticados pueden enviar mensajes" ON "public"."conversation_messages" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Autenticados pueden leer personal_ac" ON "public"."personal_ac" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Autenticados pueden leer tabla personal_ac" ON "public"."personal_ac" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Autenticados pueden ver conversaciones" ON "public"."conversations" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Autenticados pueden ver mensajes" ON "public"."conversation_messages" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Lectura de inspecciones" ON "public"."inspecciones" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Lectura de inspecciones para personal" ON "public"."inspecciones" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Lectura de items de inspeccion" ON "public"."inspeccion_items_pedido" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Lectura de items para personal" ON "public"."inspeccion_items_pedido" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Lectura publica de estados" ON "public"."state_definitions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Operador puede actualizar su propio registro" ON "public"."personal_ac" FOR UPDATE USING (("auth_user_id" = "auth"."uid"())) WITH CHECK (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "Permitir actualización de inspecciones" ON "public"."inspecciones" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir borrado de inspecciones" ON "public"."inspecciones" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Permitir borrado de items de inspeccion" ON "public"."inspeccion_items_pedido" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Permitir gestión de depositos a usuarios autenticados" ON "public"."depositos" TO "authenticated" USING (true);



CREATE POLICY "Permitir inserción de inspecciones" ON "public"."inspecciones" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Permitir inserción de items de inspeccion" ON "public"."inspeccion_items_pedido" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Permitir lectura de depositos a usuarios autenticados" ON "public"."depositos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir lectura de personal_ac a usuarios autenticados" ON "public"."personal_ac" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir lectura de personal_ac_roles a usuarios autenticados" ON "public"."personal_ac_roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir lectura de roles a usuarios autenticados" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir update a conversaciones" ON "public"."conversations" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."conversation_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."depositos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspeccion_items_pedido" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspecciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal_ac" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal_ac_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_definitions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversation_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
































































































































































































GRANT ALL ON FUNCTION "public"."actualizar_datos_inspeccion"("p_id" bigint, "p_fecha" timestamp with time zone, "p_lugar_id" integer, "p_inspector_id" integer, "p_usuario_actor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_datos_inspeccion"("p_id" bigint, "p_fecha" timestamp with time zone, "p_lugar_id" integer, "p_inspector_id" integer, "p_usuario_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_datos_inspeccion"("p_id" bigint, "p_fecha" timestamp with time zone, "p_lugar_id" integer, "p_inspector_id" integer, "p_usuario_actor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_instrucciones_remito"("p_referencia_externa" "text", "p_datos_instrucciones" "jsonb", "p_usuario_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_instrucciones_remito"("p_referencia_externa" "text", "p_datos_instrucciones" "jsonb", "p_usuario_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_instrucciones_remito"("p_referencia_externa" "text", "p_datos_instrucciones" "jsonb", "p_usuario_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_y_revalidar"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_y_revalidar"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_y_revalidar"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_y_revalidar_oc"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_y_revalidar_oc"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_y_revalidar_oc"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_y_revalidar_v3"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_y_revalidar_v3"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_y_revalidar_v3"("p_instancia_id" bigint, "p_datos_nuevos_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."avanzar_oc_post_aprobacion"("p_pedido_instance_id" bigint, "p_user_actor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."avanzar_oc_post_aprobacion"("p_pedido_instance_id" bigint, "p_user_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avanzar_oc_post_aprobacion"("p_pedido_instance_id" bigint, "p_user_actor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_buffer_remito"("p_numero_remito" "text", "p_archivo_url" "text", "p_cotizacion_url" "text", "p_metadata" "jsonb", "p_email_remitente" "text", "p_cantidad_total" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_buffer_remito"("p_numero_remito" "text", "p_archivo_url" "text", "p_cotizacion_url" "text", "p_metadata" "jsonb", "p_email_remitente" "text", "p_cantidad_total" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_buffer_remito"("p_numero_remito" "text", "p_archivo_url" "text", "p_cotizacion_url" "text", "p_metadata" "jsonb", "p_email_remitente" "text", "p_cantidad_total" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_nueva_inspeccion"("p_pedido_instance_ids" bigint[], "p_inspector_id" integer, "p_tipo_carga" "text", "p_fecha_pactada" timestamp with time zone, "p_lugar_id" integer, "p_usuario_actor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_nueva_inspeccion"("p_pedido_instance_ids" bigint[], "p_inspector_id" integer, "p_tipo_carga" "text", "p_fecha_pactada" timestamp with time zone, "p_lugar_id" integer, "p_usuario_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_nueva_inspeccion"("p_pedido_instance_ids" bigint[], "p_inspector_id" integer, "p_tipo_carga" "text", "p_fecha_pactada" timestamp with time zone, "p_lugar_id" integer, "p_usuario_actor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_nueva_inspeccion_v2"("p_pedido_instance_ids" bigint[], "p_inspector_id" integer, "p_template_id" integer, "p_tipo_carga" "text", "p_fecha_pactada" timestamp with time zone, "p_lugar_id" integer, "p_usuario_actor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_nueva_inspeccion_v2"("p_pedido_instance_ids" bigint[], "p_inspector_id" integer, "p_template_id" integer, "p_tipo_carga" "text", "p_fecha_pactada" timestamp with time zone, "p_lugar_id" integer, "p_usuario_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_nueva_inspeccion_v2"("p_pedido_instance_ids" bigint[], "p_inspector_id" integer, "p_template_id" integer, "p_tipo_carga" "text", "p_fecha_pactada" timestamp with time zone, "p_lugar_id" integer, "p_usuario_actor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."desvincular_pedido_oc"("p_vinculacion_id" bigint, "p_usuario_solicitante" "text", "p_motivo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."desvincular_pedido_oc"("p_vinculacion_id" bigint, "p_usuario_solicitante" "text", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."desvincular_pedido_oc"("p_vinculacion_id" bigint, "p_usuario_solicitante" "text", "p_motivo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ejecutar_asignacion_remito"("p_remito_id" bigint, "p_origen_type" "text", "p_origen_instance_id" bigint, "p_cantidad_asignada" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."ejecutar_asignacion_remito"("p_remito_id" bigint, "p_origen_type" "text", "p_origen_instance_id" bigint, "p_cantidad_asignada" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ejecutar_asignacion_remito"("p_remito_id" bigint, "p_origen_type" "text", "p_origen_instance_id" bigint, "p_cantidad_asignada" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."ejecutar_validaciones_iniciales"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."ejecutar_validaciones_iniciales"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ejecutar_validaciones_iniciales"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."ejecutar_validaciones_oc"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."ejecutar_validaciones_oc"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ejecutar_validaciones_oc"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_161"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_161"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_161"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_162"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_162"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_162"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_oc_101"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_oc_101"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_oc_101"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_oc_102"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_oc_102"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_oc_102"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_oc_103"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_oc_103"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_oc_103"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_oc_104"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_oc_104"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_oc_104"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_oc_105"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_oc_105"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_oc_105"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_oc_106"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_oc_106"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_oc_106"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_oc_107"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_oc_107"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_oc_107"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_oc_108"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_oc_108"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_oc_108"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_oc_109"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_oc_109"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_oc_109"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_oc_110"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_oc_110"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_oc_110"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_117"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_117"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_117"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_151"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_151"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_151"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_152"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_152"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_152"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_153"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_153"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_153"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_154"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_154"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_154"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_311"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_311"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_311"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_312"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_312"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_312"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_313"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_313"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_313"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_314"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_314"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_314"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_315"("p_instancia_id" bigint, "p_datos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_315"("p_instancia_id" bigint, "p_datos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_315"("p_instancia_id" bigint, "p_datos" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_101"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_101"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_101"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_102"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_102"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_102"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_103"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_103"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_103"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_104"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_104"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_104"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_105"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_105"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_105"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_106"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_106"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_106"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_107"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_107"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_107"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_108"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_108"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_108"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_109"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_109"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_109"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_110"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_110"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_110"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_111"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_111"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_111"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_112"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_112"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_112"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_113"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_113"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_113"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_114"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_114"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_114"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_115"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_115"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_115"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_me_116"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_me_116"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_me_116"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_101"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_101"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_101"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_102"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_102"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_102"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_103"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_103"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_103"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_104"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_104"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_104"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_105"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_105"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_105"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_106"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_106"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_106"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_107"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_107"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_107"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_108"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_108"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_108"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_109"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_109"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_109"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_110"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_110"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_110"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_111"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_111"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_111"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_112"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_112"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_112"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_val_p_mi_113"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_113"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_val_p_mi_113"("p_instancia_id" bigint, "p_json_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."finalizar_provision_personal_ac"("p_personal_ac_id" integer, "p_auth_user_id" "uuid", "p_password_temporal" "text", "p_role_nombre" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."finalizar_provision_personal_ac"("p_personal_ac_id" integer, "p_auth_user_id" "uuid", "p_password_temporal" "text", "p_role_nombre" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalizar_provision_personal_ac"("p_personal_ac_id" integer, "p_auth_user_id" "uuid", "p_password_temporal" "text", "p_role_nombre" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_trg_inspecciones_sync_magic_link"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_trg_inspecciones_sync_magic_link"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_trg_inspecciones_sync_magic_link"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_magic_link"("p_instancia_id" bigint, "p_tipo_entidad" "text", "p_usuario_email" "text", "p_validez" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_magic_link"("p_instancia_id" bigint, "p_tipo_entidad" "text", "p_usuario_email" "text", "p_validez" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_magic_link"("p_instancia_id" bigint, "p_tipo_entidad" "text", "p_usuario_email" "text", "p_validez" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_asunto_instancia"("p_instancia_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_asunto_instancia"("p_instancia_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_asunto_instancia"("p_instancia_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_asunto_instancia"("p_instancia_id" bigint, "p_tipo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_asunto_instancia"("p_instancia_id" bigint, "p_tipo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_asunto_instancia"("p_instancia_id" bigint, "p_tipo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_candidatos_para_remito"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_candidatos_para_remito"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_candidatos_para_remito"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_candidatos_para_remito"("p_cantidad_remito" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_candidatos_para_remito"("p_cantidad_remito" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_candidatos_para_remito"("p_cantidad_remito" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_data_for_magic_link"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_data_for_magic_link"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_data_for_magic_link"("p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_full_context_by_remito"("p_remito_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_full_context_by_remito"("p_remito_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_full_context_by_remito"("p_remito_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_full_context_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_full_context_by_token"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_full_context_by_token"("p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inspeccion_by_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_inspeccion_by_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inspeccion_by_token"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_instance_lineage"("p_identificador_humano" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_instance_lineage"("p_identificador_humano" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_instance_lineage"("p_identificador_humano" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_instance_requirements"("p_instance_id" bigint, "p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_instance_requirements"("p_instance_id" bigint, "p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_instance_requirements"("p_instance_id" bigint, "p_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pedido_instance_for_manual_action"("p_identificador_compuesto" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pedido_instance_for_manual_action"("p_identificador_compuesto" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pedido_instance_for_manual_action"("p_identificador_compuesto" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_remitos_activos"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_remitos_activos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_remitos_activos"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_vinculacion_details"("p_pedido_hija_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_vinculacion_details"("p_pedido_hija_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_vinculacion_details"("p_pedido_hija_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."insertar_oc_si_nueva"("oc_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."insertar_oc_si_nueva"("oc_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insertar_oc_si_nueva"("oc_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."insertar_pedido_si_nuevo"("pedido_json" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."insertar_pedido_si_nuevo"("pedido_json" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insertar_pedido_si_nuevo"("pedido_json" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."inspeccion_completar_resultados"("p_token" "text", "p_archivo_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."inspeccion_completar_resultados"("p_token" "text", "p_archivo_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inspeccion_completar_resultados"("p_token" "text", "p_archivo_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."inspeccion_forzar_transicion"("p_inspeccion_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_actor" "text", "p_motivo_excepcion" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."inspeccion_forzar_transicion"("p_inspeccion_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_actor" "text", "p_motivo_excepcion" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inspeccion_forzar_transicion"("p_inspeccion_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_actor" "text", "p_motivo_excepcion" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."inspeccion_intentar_transicion"("p_inspeccion_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_actor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."inspeccion_intentar_transicion"("p_inspeccion_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inspeccion_intentar_transicion"("p_inspeccion_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_actor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."intentar_transicion_automatica_oc"("p_instancia_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."intentar_transicion_automatica_oc"("p_instancia_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."intentar_transicion_automatica_oc"("p_instancia_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."intentar_transicion_automatica_pedido"("p_instancia_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."intentar_transicion_automatica_pedido"("p_instancia_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."intentar_transicion_automatica_pedido"("p_instancia_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."intentar_transicion_automatica_pedido_v3"("p_instancia_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."intentar_transicion_automatica_pedido_v3"("p_instancia_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."intentar_transicion_automatica_pedido_v3"("p_instancia_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_debug_enabled"("p_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_debug_enabled"("p_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_debug_enabled"("p_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_debug_fsm"("p_instance_id" bigint, "p_message" "text", "p_source_type" "text", "p_source_name" "text", "p_event" "text", "p_ref_type" "text", "p_ref_value" "text", "p_payload" "jsonb", "p_level" "text", "p_force" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."log_debug_fsm"("p_instance_id" bigint, "p_message" "text", "p_source_type" "text", "p_source_name" "text", "p_event" "text", "p_ref_type" "text", "p_ref_value" "text", "p_payload" "jsonb", "p_level" "text", "p_force" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_debug_fsm"("p_instance_id" bigint, "p_message" "text", "p_source_type" "text", "p_source_name" "text", "p_event" "text", "p_ref_type" "text", "p_ref_value" "text", "p_payload" "jsonb", "p_level" "text", "p_force" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_fsm_debug"("p_instancia_id" bigint, "p_process" "text", "p_message" "text", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_fsm_debug"("p_instancia_id" bigint, "p_process" "text", "p_message" "text", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_fsm_debug"("p_instancia_id" bigint, "p_process" "text", "p_message" "text", "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_inspeccion_evento"("p_inspeccion_id" bigint, "p_accion" "text", "p_usuario_actor" "text", "p_detalles" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_inspeccion_evento"("p_inspeccion_id" bigint, "p_accion" "text", "p_usuario_actor" "text", "p_detalles" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_inspeccion_evento"("p_inspeccion_id" bigint, "p_accion" "text", "p_usuario_actor" "text", "p_detalles" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_proximos_estados"("p_estado_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_proximos_estados"("p_estado_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_proximos_estados"("p_estado_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."procesar_actualizacion_manual"("p_referencia_externa" "text", "p_datos_nuevos" "jsonb", "p_usuario_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."procesar_actualizacion_manual"("p_referencia_externa" "text", "p_datos_nuevos" "jsonb", "p_usuario_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."procesar_actualizacion_manual"("p_referencia_externa" "text", "p_datos_nuevos" "jsonb", "p_usuario_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_1_6_decision"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_1_6_decision"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_1_6_decision"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_approval_decision"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_approval_decision"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_approval_decision"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_approval_decision_v3"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_approval_decision_v3"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_approval_decision_v3"("p_instancia_id" bigint, "p_remitente" "text", "p_decision" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rollback_asignacion_remito"("p_remito_item_id" bigint, "p_usuario_solicitante" "text", "p_motivo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rollback_asignacion_remito"("p_remito_item_id" bigint, "p_usuario_solicitante" "text", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rollback_asignacion_remito"("p_remito_item_id" bigint, "p_usuario_solicitante" "text", "p_motivo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_remito_update_admin"("p_remito_id" bigint, "p_updates" "jsonb", "p_admin_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_remito_update_admin"("p_remito_id" bigint, "p_updates" "jsonb", "p_admin_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_remito_update_admin"("p_remito_id" bigint, "p_updates" "jsonb", "p_admin_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_remito_update_v3"("p_token" "uuid", "p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_remito_update_v3"("p_token" "uuid", "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_remito_update_v3"("p_token" "uuid", "p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."seconds_to_ddhhmmss"("total_seconds" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."seconds_to_ddhhmmss"("total_seconds" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."seconds_to_ddhhmmss"("total_seconds" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sp_vincular_pedido_oc"("p_pedido_ref_externa" "text", "p_oc_ref_externa" "text", "p_cantidad_a_vincular" numeric, "p_unidades" "text", "p_remitente_actor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sp_vincular_pedido_oc"("p_pedido_ref_externa" "text", "p_oc_ref_externa" "text", "p_cantidad_a_vincular" numeric, "p_unidades" "text", "p_remitente_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sp_vincular_pedido_oc"("p_pedido_ref_externa" "text", "p_oc_ref_externa" "text", "p_cantidad_a_vincular" numeric, "p_unidades" "text", "p_remitente_actor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."transicionar_instancia_manual"("p_instancia_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_nombre" "text", "p_motivo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transicionar_instancia_manual"("p_instancia_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_nombre" "text", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transicionar_instancia_manual"("p_instancia_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_nombre" "text", "p_motivo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."transicionar_instancia_oc"("p_instancia_id" bigint, "p_nuevo_state_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transicionar_instancia_oc"("p_instancia_id" bigint, "p_nuevo_state_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transicionar_instancia_oc"("p_instancia_id" bigint, "p_nuevo_state_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."transicionar_oc_a_calzada"("p_pedido_instance_id" bigint, "p_user_actor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transicionar_oc_a_calzada"("p_pedido_instance_id" bigint, "p_user_actor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transicionar_oc_a_calzada"("p_pedido_instance_id" bigint, "p_user_actor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_remito_context"("p_remito_id" bigint, "p_contexto" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_remito_context"("p_remito_id" bigint, "p_contexto" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_remito_context"("p_remito_id" bigint, "p_contexto" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_magic_link"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_magic_link"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_magic_link"("p_token" "uuid") TO "service_role";
























GRANT ALL ON TABLE "public"."alertas_escalamiento" TO "anon";
GRANT ALL ON TABLE "public"."alertas_escalamiento" TO "authenticated";
GRANT ALL ON TABLE "public"."alertas_escalamiento" TO "service_role";



GRANT ALL ON SEQUENCE "public"."alertas_escalamiento_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."alertas_escalamiento_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."alertas_escalamiento_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."articulos" TO "anon";
GRANT ALL ON TABLE "public"."articulos" TO "authenticated";
GRANT ALL ON TABLE "public"."articulos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."articulos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."articulos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."articulos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."camiones" TO "anon";
GRANT ALL ON TABLE "public"."camiones" TO "authenticated";
GRANT ALL ON TABLE "public"."camiones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."camiones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."camiones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."camiones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."catalogo_tareas_control" TO "anon";
GRANT ALL ON TABLE "public"."catalogo_tareas_control" TO "authenticated";
GRANT ALL ON TABLE "public"."catalogo_tareas_control" TO "service_role";



GRANT ALL ON SEQUENCE "public"."catalogo_tareas_control_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."catalogo_tareas_control_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."catalogo_tareas_control_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."choferes" TO "anon";
GRANT ALL ON TABLE "public"."choferes" TO "authenticated";
GRANT ALL ON TABLE "public"."choferes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."choferes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."choferes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."choferes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clientes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contactos" TO "anon";
GRANT ALL ON TABLE "public"."contactos" TO "authenticated";
GRANT ALL ON TABLE "public"."contactos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contactos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contactos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contactos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_messages" TO "anon";
GRANT ALL ON TABLE "public"."conversation_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversation_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversation_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversation_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."debug_flags" TO "anon";
GRANT ALL ON TABLE "public"."debug_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."debug_flags" TO "service_role";



GRANT ALL ON TABLE "public"."debug_log_fsm" TO "anon";
GRANT ALL ON TABLE "public"."debug_log_fsm" TO "authenticated";
GRANT ALL ON TABLE "public"."debug_log_fsm" TO "service_role";



GRANT ALL ON SEQUENCE "public"."debug_log_fsm_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."debug_log_fsm_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."debug_log_fsm_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."depositos" TO "anon";
GRANT ALL ON TABLE "public"."depositos" TO "authenticated";
GRANT ALL ON TABLE "public"."depositos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."depositos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."depositos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."depositos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."documentos" TO "anon";
GRANT ALL ON TABLE "public"."documentos" TO "authenticated";
GRANT ALL ON TABLE "public"."documentos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."documentos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."documentos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."documentos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fsm_definitions" TO "anon";
GRANT ALL ON TABLE "public"."fsm_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."fsm_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."fsm_transitions" TO "anon";
GRANT ALL ON TABLE "public"."fsm_transitions" TO "authenticated";
GRANT ALL ON TABLE "public"."fsm_transitions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fsm_transitions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fsm_transitions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fsm_transitions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."historial_eventos" TO "anon";
GRANT ALL ON TABLE "public"."historial_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."historial_eventos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."historial_eventos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."historial_eventos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."historial_eventos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inspeccion_items_pedido" TO "anon";
GRANT ALL ON TABLE "public"."inspeccion_items_pedido" TO "authenticated";
GRANT ALL ON TABLE "public"."inspeccion_items_pedido" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inspeccion_items_pedido_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inspeccion_items_pedido_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inspeccion_items_pedido_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inspeccion_templates" TO "anon";
GRANT ALL ON TABLE "public"."inspeccion_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."inspeccion_templates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inspeccion_templates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inspeccion_templates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inspeccion_templates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inspecciones" TO "anon";
GRANT ALL ON TABLE "public"."inspecciones" TO "authenticated";
GRANT ALL ON TABLE "public"."inspecciones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inspecciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inspecciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inspecciones_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lugares_pesaje" TO "anon";
GRANT ALL ON TABLE "public"."lugares_pesaje" TO "authenticated";
GRANT ALL ON TABLE "public"."lugares_pesaje" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lugares_pesaje_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lugares_pesaje_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lugares_pesaje_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."magic_links" TO "anon";
GRANT ALL ON TABLE "public"."magic_links" TO "authenticated";
GRANT ALL ON TABLE "public"."magic_links" TO "service_role";



GRANT ALL ON TABLE "public"."message_media" TO "anon";
GRANT ALL ON TABLE "public"."message_media" TO "authenticated";
GRANT ALL ON TABLE "public"."message_media" TO "service_role";



GRANT ALL ON SEQUENCE "public"."message_media_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."message_media_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."message_media_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."oc_instancias" TO "anon";
GRANT ALL ON TABLE "public"."oc_instancias" TO "authenticated";
GRANT ALL ON TABLE "public"."oc_instancias" TO "service_role";



GRANT ALL ON TABLE "public"."ordenes_compra" TO "anon";
GRANT ALL ON TABLE "public"."ordenes_compra" TO "authenticated";
GRANT ALL ON TABLE "public"."ordenes_compra" TO "service_role";



GRANT ALL ON TABLE "public"."pedido_instancias" TO "anon";
GRANT ALL ON TABLE "public"."pedido_instancias" TO "authenticated";
GRANT ALL ON TABLE "public"."pedido_instancias" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos" TO "anon";
GRANT ALL ON TABLE "public"."pedidos" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos" TO "service_role";



GRANT ALL ON TABLE "public"."proveedores" TO "anon";
GRANT ALL ON TABLE "public"."proveedores" TO "authenticated";
GRANT ALL ON TABLE "public"."proveedores" TO "service_role";



GRANT ALL ON TABLE "public"."state_definitions" TO "anon";
GRANT ALL ON TABLE "public"."state_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."state_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."mv_analisis_logistico" TO "anon";
GRANT ALL ON TABLE "public"."mv_analisis_logistico" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_analisis_logistico" TO "service_role";



GRANT ALL ON TABLE "public"."mv_detalle_instancias_activas" TO "anon";
GRANT ALL ON TABLE "public"."mv_detalle_instancias_activas" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_detalle_instancias_activas" TO "service_role";



GRANT ALL ON TABLE "public"."mv_instancias_analitica" TO "anon";
GRANT ALL ON TABLE "public"."mv_instancias_analitica" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_instancias_analitica" TO "service_role";



GRANT ALL ON TABLE "public"."mv_instancias_por_estado" TO "anon";
GRANT ALL ON TABLE "public"."mv_instancias_por_estado" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_instancias_por_estado" TO "service_role";



GRANT ALL ON TABLE "public"."mv_refresh_events" TO "anon";
GRANT ALL ON TABLE "public"."mv_refresh_events" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_refresh_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."mv_refresh_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."mv_refresh_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mv_refresh_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."mv_tiempo_promedio_estado" TO "anon";
GRANT ALL ON TABLE "public"."mv_tiempo_promedio_estado" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_tiempo_promedio_estado" TO "service_role";



GRANT ALL ON TABLE "public"."mv_tiempo_promedio_por_resultado" TO "anon";
GRANT ALL ON TABLE "public"."mv_tiempo_promedio_por_resultado" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_tiempo_promedio_por_resultado" TO "service_role";



GRANT ALL ON SEQUENCE "public"."oc_instancias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."oc_instancias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."oc_instancias_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ordenes_compra_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ordenes_compra_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ordenes_compra_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedido_instancias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedido_instancias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedido_instancias_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pedidos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pedidos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pedidos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."personal_ac" TO "anon";
GRANT ALL ON TABLE "public"."personal_ac" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_ac" TO "service_role";



GRANT ALL ON SEQUENCE "public"."personal_ac_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."personal_ac_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."personal_ac_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."personal_ac_roles" TO "anon";
GRANT ALL ON TABLE "public"."personal_ac_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_ac_roles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."proveedores_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."remito_items" TO "anon";
GRANT ALL ON TABLE "public"."remito_items" TO "authenticated";
GRANT ALL ON TABLE "public"."remito_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."remito_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."remito_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."remito_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."remitos" TO "anon";
GRANT ALL ON TABLE "public"."remitos" TO "authenticated";
GRANT ALL ON TABLE "public"."remitos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."remitos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."remitos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."remitos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."servicios" TO "anon";
GRANT ALL ON TABLE "public"."servicios" TO "authenticated";
GRANT ALL ON TABLE "public"."servicios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."servicios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."servicios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."servicios_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."state_definitions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."state_definitions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."state_definitions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."state_validation_requirements" TO "anon";
GRANT ALL ON TABLE "public"."state_validation_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."state_validation_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."status" TO "anon";
GRANT ALL ON TABLE "public"."status" TO "authenticated";
GRANT ALL ON TABLE "public"."status" TO "service_role";



GRANT ALL ON TABLE "public"."transportistas" TO "anon";
GRANT ALL ON TABLE "public"."transportistas" TO "authenticated";
GRANT ALL ON TABLE "public"."transportistas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."transportistas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."transportistas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."transportistas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."v_conversation_messages_basic" TO "anon";
GRANT ALL ON TABLE "public"."v_conversation_messages_basic" TO "authenticated";
GRANT ALL ON TABLE "public"."v_conversation_messages_basic" TO "service_role";



GRANT ALL ON TABLE "public"."v_inspecciones_kanban" TO "anon";
GRANT ALL ON TABLE "public"."v_inspecciones_kanban" TO "authenticated";
GRANT ALL ON TABLE "public"."v_inspecciones_kanban" TO "service_role";



GRANT ALL ON TABLE "public"."v_pedidos_elegibles_inspeccion" TO "anon";
GRANT ALL ON TABLE "public"."v_pedidos_elegibles_inspeccion" TO "authenticated";
GRANT ALL ON TABLE "public"."v_pedidos_elegibles_inspeccion" TO "service_role";



GRANT ALL ON TABLE "public"."validation_definitions" TO "anon";
GRANT ALL ON TABLE "public"."validation_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."validation_definitions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."validation_definitions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."validation_definitions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."validation_definitions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vinculaciones_pedido_oc" TO "anon";
GRANT ALL ON TABLE "public"."vinculaciones_pedido_oc" TO "authenticated";
GRANT ALL ON TABLE "public"."vinculaciones_pedido_oc" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vinculaciones_pedido_oc_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vinculaciones_pedido_oc_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vinculaciones_pedido_oc_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vw_diagnostico_vagones" TO "anon";
GRANT ALL ON TABLE "public"."vw_diagnostico_vagones" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_diagnostico_vagones" TO "service_role";



GRANT ALL ON TABLE "public"."vw_monitor_instancias_activas" TO "anon";
GRANT ALL ON TABLE "public"."vw_monitor_instancias_activas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_monitor_instancias_activas" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























drop extension if exists "pg_net";

alter table "public"."articulos" drop constraint "articulos_tipo_mercado_check";

alter table "public"."depositos" drop constraint "depositos_tipo_check";

alter table "public"."ordenes_compra" drop constraint "ordenes_compra_tipo_operatoria_check";

alter table "public"."pedidos" drop constraint "pedidos_tipo_mercado_check";

alter table "public"."vinculaciones_pedido_oc" drop constraint "vinculaciones_pedido_oc_estado_vinculacion_check";

alter table "public"."articulos" add constraint "articulos_tipo_mercado_check" CHECK (((tipo_mercado)::text = ANY ((ARRAY['MI'::character varying, 'ME'::character varying])::text[]))) not valid;

alter table "public"."articulos" validate constraint "articulos_tipo_mercado_check";

alter table "public"."depositos" add constraint "depositos_tipo_check" CHECK (((tipo)::text = ANY ((ARRAY['PROPIO'::character varying, 'PROVEEDOR'::character varying, 'CLIENTE'::character varying, 'ADUANA'::character varying])::text[]))) not valid;

alter table "public"."depositos" validate constraint "depositos_tipo_check";

alter table "public"."ordenes_compra" add constraint "ordenes_compra_tipo_operatoria_check" CHECK (((tipo_operatoria)::text = ANY ((ARRAY['MI'::character varying, 'ME'::character varying])::text[]))) not valid;

alter table "public"."ordenes_compra" validate constraint "ordenes_compra_tipo_operatoria_check";

alter table "public"."pedidos" add constraint "pedidos_tipo_mercado_check" CHECK (((tipo_mercado)::text = ANY ((ARRAY['MI'::character varying, 'ME'::character varying])::text[]))) not valid;

alter table "public"."pedidos" validate constraint "pedidos_tipo_mercado_check";

alter table "public"."vinculaciones_pedido_oc" add constraint "vinculaciones_pedido_oc_estado_vinculacion_check" CHECK (((estado_vinculacion)::text = ANY ((ARRAY['PENDIENTE_VALIDACION'::character varying, 'APROBADA'::character varying, 'RECHAZADA'::character varying])::text[]))) not valid;

alter table "public"."vinculaciones_pedido_oc" validate constraint "vinculaciones_pedido_oc_estado_vinculacion_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.ejecutar_asignacion_remito(p_remito_id bigint, p_origen_type text, p_origen_instance_id bigint, p_cantidad_asignada numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_remito_data RECORD;
    v_saldo_actual NUMERIC;
    v_nueva_instancia_id BIGINT;
    v_nuevo_estado_id INT;
    v_nuevo_estado_code TEXT;
    v_identificador_nuevo TEXT;
    v_parent_data JSONB;
    v_pedido_id_raiz INT;
    v_oc_id_raiz INT;
    v_identificador_padre TEXT;
    v_tipo_mercado TEXT;
    v_saldo_final_madre NUMERIC;
BEGIN
    SELECT * INTO v_remito_data FROM public.remitos WHERE id = p_remito_id;
    IF v_remito_data.id IS NULL THEN RETURN jsonb_build_object('status', 'ERROR', 'message', 'Remito no encontrado.'); END IF;
    IF v_remito_data.estado_asignacion = 'ASIGNADO' THEN RETURN jsonb_build_object('status', 'ERROR', 'message', 'El remito ya fue asignado.'); END IF;

    IF p_origen_type = 'PEDIDO' THEN
        SELECT pi.saldo_pendiente, pi.current_data, pi.pedido_id, pi.identificador_compuesto, p.tipo_mercado
        INTO v_saldo_actual, v_parent_data, v_pedido_id_raiz, v_identificador_padre, v_tipo_mercado
        FROM pedido_instancias pi JOIN pedidos p ON pi.pedido_id = p.id WHERE pi.id = p_origen_instance_id;
        IF v_tipo_mercado = 'MI' THEN v_nuevo_estado_code := '3.2'; ELSE v_nuevo_estado_code := '3.1.5'; END IF;
    ELSIF p_origen_type = 'OC' THEN
        SELECT oi.cantidad_disponible, oi.current_data, oi.oc_id, oi.identificador_compuesto, oc.tipo_operatoria
        INTO v_saldo_actual, v_parent_data, v_oc_id_raiz, v_identificador_padre, v_tipo_mercado
        FROM oc_instancias oi JOIN ordenes_compra oc ON oi.oc_id = oc.id WHERE oi.id = p_origen_instance_id;
        v_nuevo_estado_code := '2.6';
    END IF;

    SELECT id INTO v_nuevo_estado_id FROM state_definitions WHERE (fsm_id=1 OR fsm_id=2) AND state_code=v_nuevo_estado_code LIMIT 1;
    IF v_saldo_actual < p_cantidad_asignada THEN RETURN jsonb_build_object('status', 'ERROR', 'message', 'Saldo insuficiente.'); END IF;

    v_saldo_final_madre := v_saldo_actual - p_cantidad_asignada;
    
    -- Creación de Hija y Update Madre
    IF p_origen_type = 'PEDIDO' THEN
        INSERT INTO pedido_instancias (pedido_id, parent_instance_id, current_state_id, saldo_pendiente, status, current_data, cantidad_requerida_original) 
        VALUES (v_pedido_id_raiz, p_origen_instance_id, v_nuevo_estado_id, p_cantidad_asignada, 'ACTIVA'::instance_status, v_parent_data, p_cantidad_asignada) 
        RETURNING id INTO v_nueva_instancia_id;
        
        UPDATE pedido_instancias 
        SET saldo_pendiente = v_saldo_final_madre,
            status = CASE WHEN v_saldo_final_madre <= 0 THEN 'COMPLETADA'::instance_status ELSE 'ACTIVA'::instance_status END
        WHERE id = p_origen_instance_id;
        
        -- CORRECCIÓN: Registro del Evento Inicial para la Hija
        INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
        VALUES (v_nueva_instancia_id, 'STATE_TRANSITION', 'Nueva instancia generada por Remito ' || v_remito_data.remito_ref_externa, 'SISTEMA', jsonb_build_object('from_state', 'NEW', 'to_state', v_nuevo_estado_code));
        
    ELSE 
        INSERT INTO oc_instancias (oc_id, parent_instance_id, current_state_id, cantidad_total, cantidad_disponible, status, current_data) 
        VALUES (v_oc_id_raiz, p_origen_instance_id, v_nuevo_estado_id, p_cantidad_asignada, p_cantidad_asignada, 'ACTIVA'::instance_status, v_parent_data) 
        RETURNING id INTO v_nueva_instancia_id;

        UPDATE oc_instancias 
        SET cantidad_disponible = v_saldo_final_madre,
            status = CASE WHEN v_saldo_final_madre <= 0 THEN 'COMPLETADA'::instance_status ELSE 'ACTIVA'::instance_status END
        WHERE id = p_origen_instance_id;
        
        -- CORRECCIÓN: Registro del Evento Inicial para la Hija
        INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
        VALUES (v_nueva_instancia_id, 'STATE_TRANSITION', 'Nueva instancia generada por Remito ' || v_remito_data.remito_ref_externa, 'SISTEMA', jsonb_build_object('from_state', 'NEW', 'to_state', v_nuevo_estado_code));
    END IF;

    v_identificador_nuevo := COALESCE(v_identificador_padre, 'ROOT') || '_REM-' || v_remito_data.remito_ref_externa || '_' || v_nueva_instancia_id;
    IF p_origen_type = 'PEDIDO' THEN UPDATE pedido_instancias SET identificador_compuesto = v_identificador_nuevo WHERE id = v_nueva_instancia_id;
    ELSE UPDATE oc_instancias SET identificador_compuesto = v_identificador_nuevo WHERE id = v_nueva_instancia_id; END IF;

    INSERT INTO remito_items (remito_id, origen_type, origen_instance_id, destino_instance_id, cantidad) 
    VALUES (p_remito_id, p_origen_type, p_origen_instance_id, v_nueva_instancia_id, p_cantidad_asignada);

    UPDATE public.remitos SET estado_asignacion = 'ASIGNADO' WHERE id = p_remito_id;
    
    -- Refrescar vistas materializadas (Opcional, pero recomendado si quieres ver el cambio ya)
--    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_instancias_por_estado;
--    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_detalle_instancias_activas;

    RETURN jsonb_build_object(
        'status', 'SUCCESS', 
        'message', 'Asignación completada.',
        'nueva_instancia_id', v_nueva_instancia_id,
        'identificador_nuevo', v_identificador_nuevo,
        'identificador_padre', v_identificador_padre,
        'nuevo_estado_code', v_nuevo_estado_code,
        'cantidad_asignada', p_cantidad_asignada,
        'saldo_restante_origen', v_saldo_final_madre
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_remitos_activos()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
WITH items_del_remito AS (
    SELECT 
        r.id as remito_internal_id,
        r.remito_ref_externa as nro_remito,
        ch.nombre_completo as chofer_nombre,
        ch.dni as chofer_dni,
        ch.telefono as chofer_telefono,
        jsonb_build_object(
            'id_instancia', pi.id,
            'identificador_instancia', pi.identificador_compuesto,
            'pedido_ref', p.pedido_ref_externa,
            'cliente', c.razon_social,
            'oc_ref', oc.oc_ref_externa,
            'proveedor', prov.razon_social,
            'cantidad_ton_item', ri.cantidad
        ) as info_item
    FROM remitos r
    LEFT JOIN choferes ch ON r.chofer_id = ch.id
    JOIN remito_items ri ON ri.remito_id = r.id
    JOIN pedido_instancias pi ON ri.origen_instance_id = pi.id AND ri.origen_type = 'PEDIDO'
    JOIN pedidos p ON pi.pedido_id = p.id
    JOIN clientes c ON p.cliente_id = c.id
    LEFT JOIN vinculaciones_pedido_oc v ON v.pedido_instance_id = pi.id
    LEFT JOIN oc_instancias oi ON v.oc_instance_id = oi.id
    LEFT JOIN ordenes_compra oc ON oi.oc_id = oc.id
    LEFT JOIN proveedores prov ON oc.proveedor_id = prov.id
    WHERE r.estado_asignacion = 'ASIGNADO'
),
remitos_agrupados AS (
    SELECT 
        remito_internal_id as id,
        nro_remito,
        chofer_nombre,
        chofer_dni,
        chofer_telefono,
        jsonb_agg(info_item) as instancias_vinculadas
    FROM items_del_remito
    GROUP BY remito_internal_id, nro_remito, chofer_nombre, chofer_dni, chofer_telefono
)
-- Devolvemos el array JSON directo (sin jsonb_pretty para que el frontend lo lea fácil)
SELECT COALESCE(jsonb_agg(to_jsonb(ra.*)), '[]'::jsonb) FROM remitos_agrupados ra;
$function$
;

create or replace view "public"."v_pedidos_elegibles_inspeccion" as  SELECT pi.id,
    pi.identificador_compuesto AS identificador,
    c.razon_social AS cliente,
    'Carga de Azúcar'::text AS articulo,
    pi.saldo_pendiente,
    p.tipo_mercado
   FROM (((public.pedido_instancias pi
     JOIN public.pedidos p ON ((pi.pedido_id = p.id)))
     JOIN public.clientes c ON ((p.cliente_id = c.id)))
     JOIN public.state_definitions sd ON ((pi.current_state_id = sd.id)))
  WHERE ((pi.status = 'ACTIVA'::public.instance_status) AND (NOT (pi.current_state_id IN ( SELECT state_definitions.id
           FROM public.state_definitions
          WHERE ((state_definitions.state_code)::text = ANY ((ARRAY['7'::character varying, '8'::character varying])::text[]))))))
  GROUP BY pi.id, pi.identificador_compuesto, c.razon_social, p.tipo_mercado;


create or replace view "public"."vw_diagnostico_vagones" as  SELECT pi.identificador_compuesto AS referencia_humana,
    pi.id AS instancia_id,
    p.pedido_ref_externa AS nro_pedido,
    c.razon_social AS cliente,
    pi.saldo_pendiente AS toneladas_vagon,
    (pi.saldo_pendiente * (1000)::numeric) AS kilos_vagon,
    round(((pi.saldo_pendiente * (1000)::numeric) / (50)::numeric), 0) AS bolsas_50kg_vagon,
    oc.oc_ref_externa AS nro_oc,
    prov.razon_social AS proveedor,
    ( SELECT string_agg(DISTINCT (r.remito_ref_externa)::text, ', '::text) AS string_agg
           FROM (public.remitos r
             JOIN public.remito_items ri ON ((ri.remito_id = r.id)))
          WHERE ((ri.origen_instance_id = pi.id) AND (ri.origen_type = 'PEDIDO'::text))) AS nro_remito,
    sd.state_code AS cod_estado,
    sd.name AS nombre_estado,
    ( SELECT jsonb_agg(vd.name) AS jsonb_agg
           FROM (public.state_validation_requirements svr
             JOIN public.validation_definitions vd ON ((svr.validation_id = vd.id)))
          WHERE ((svr.state_id = pi.current_state_id) AND (NOT ((vd.validation_code)::text IN ( SELECT (he.details ->> 'validation_code'::text)
                   FROM public.historial_eventos he
                  WHERE ((he.pedido_instance_id = pi.id) AND (he.event_type = 'VALIDATION_SUCCESS'::public.event_type) AND (he."timestamp" > ( SELECT COALESCE(max(historial_eventos."timestamp"), '1900-01-01 00:00:00-04:16:48'::timestamp with time zone) AS "coalesce"
                           FROM public.historial_eventos
                          WHERE ((historial_eventos.pedido_instance_id = pi.id) AND (historial_eventos.event_type = 'STATE_TRANSITION'::public.event_type)))))))))) AS tareas_faltantes,
    public.obtener_proximos_estados(pi.current_state_id) AS caminos_posibles
   FROM (((((((public.pedido_instancias pi
     JOIN public.pedidos p ON ((pi.pedido_id = p.id)))
     LEFT JOIN public.clientes c ON ((p.cliente_id = c.id)))
     JOIN public.state_definitions sd ON ((pi.current_state_id = sd.id)))
     LEFT JOIN public.vinculaciones_pedido_oc v ON ((v.pedido_instance_id = pi.id)))
     LEFT JOIN public.oc_instancias oi ON ((v.oc_instance_id = oi.id)))
     LEFT JOIN public.ordenes_compra oc ON ((oi.oc_id = oc.id)))
     LEFT JOIN public.proveedores prov ON ((oc.proveedor_id = prov.id)))
  WHERE (pi.status = 'ACTIVA'::public.instance_status);


create or replace view "public"."vw_monitor_instancias_activas" as  WITH tiempos AS (
         SELECT historial_eventos.pedido_instance_id,
            (EXTRACT(epoch FROM (now() - max(historial_eventos."timestamp"))) / (3600)::numeric) AS horas_en_estado
           FROM public.historial_eventos
          WHERE (historial_eventos.event_type = 'STATE_TRANSITION'::public.event_type)
          GROUP BY historial_eventos.pedido_instance_id
        )
 SELECT pi.id AS instancia_id,
    pi.identificador_compuesto AS referencia_humana,
    p.pedido_ref_externa AS nro_pedido,
    p.tipo_mercado,
    c.razon_social AS cliente,
    prov.razon_social AS proveedor,
    ( SELECT string_agg(DISTINCT (r.remito_ref_externa)::text, ', '::text) AS string_agg
           FROM (public.remitos r
             JOIN public.remito_items ri ON ((ri.remito_id = r.id)))
          WHERE ((ri.origen_instance_id = pi.id) AND (ri.origen_type = 'PEDIDO'::text))) AS nro_remito,
    (((sd.state_code)::text || ': '::text) || sd.name) AS estado_actual,
    round(COALESCE(t.horas_en_estado, (0)::numeric), 1) AS horas_transcurridas,
        CASE
            WHEN (t.horas_en_estado > (24)::numeric) THEN 'ROJO'::text
            WHEN (t.horas_en_estado > (12)::numeric) THEN 'AMARILLO'::text
            ELSE 'VERDE'::text
        END AS color_alerta,
    pi.cantidad_requerida_original AS toneladas_originales,
    pi.saldo_pendiente AS toneladas_actuales,
    round(((pi.cantidad_requerida_original * (1000)::numeric) / (50)::numeric), 0) AS bolsas_50kg_originales,
    ( SELECT jsonb_agg(vd.name) AS jsonb_agg
           FROM (public.state_validation_requirements svr
             JOIN public.validation_definitions vd ON ((svr.validation_id = vd.id)))
          WHERE ((svr.state_id = pi.current_state_id) AND ((((p.tipo_mercado)::text = 'MI'::text) AND ((vd.validation_code)::text !~~ '%_ME_%'::text)) OR (((p.tipo_mercado)::text = 'ME'::text) AND ((vd.validation_code)::text !~~ '%_MI_%'::text)) OR (((vd.validation_code)::text !~~ '%_ME_%'::text) AND ((vd.validation_code)::text !~~ '%_MI_%'::text))) AND (NOT ((vd.validation_code)::text IN ( SELECT (he.details ->> 'validation_code'::text)
                   FROM public.historial_eventos he
                  WHERE ((he.pedido_instance_id = pi.id) AND (he.event_type = 'VALIDATION_SUCCESS'::public.event_type) AND (he."timestamp" > ( SELECT COALESCE(max(historial_eventos."timestamp"), '1900-01-01 00:00:00-04:16:48'::timestamp with time zone) AS "coalesce"
                           FROM public.historial_eventos
                          WHERE ((historial_eventos.pedido_instance_id = pi.id) AND (historial_eventos.event_type = 'STATE_TRANSITION'::public.event_type)))))))))) AS tareas_faltantes,
    public.obtener_proximos_estados(pi.current_state_id) AS proximos_estados
   FROM ((((((((public.pedido_instancias pi
     JOIN public.pedidos p ON ((pi.pedido_id = p.id)))
     JOIN public.clientes c ON ((p.cliente_id = c.id)))
     JOIN public.state_definitions sd ON ((pi.current_state_id = sd.id)))
     LEFT JOIN public.vinculaciones_pedido_oc vinc ON ((vinc.pedido_instance_id = pi.id)))
     LEFT JOIN public.oc_instancias oi ON ((vinc.oc_instance_id = oi.id)))
     LEFT JOIN public.ordenes_compra oc ON ((oi.oc_id = oc.id)))
     LEFT JOIN public.proveedores prov ON ((oc.proveedor_id = prov.id)))
     LEFT JOIN tiempos t ON ((t.pedido_instance_id = pi.id)))
  WHERE (pi.status = 'ACTIVA'::public.instance_status);



  create policy "Acceso público de lectura para plantillas"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'templates'::text));



  create policy "Lectura pública para adjuntos de inspección"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'inspecciones_adjuntos'::text));



  create policy "Personal autenticado puede borrar adjuntos"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'inspecciones_adjuntos'::text));



  create policy "Personal autenticado puede editar adjuntos"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'inspecciones_adjuntos'::text));



  create policy "Personal autenticado puede subir adjuntos"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'inspecciones_adjuntos'::text));



  create policy "Usuarios autenticados pueden borrar plantillas"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'templates'::text));



  create policy "Usuarios autenticados pueden editar plantillas"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'templates'::text));



  create policy "Usuarios autenticados pueden subir plantillas"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'templates'::text));



  create policy "anon_insert_archivos_entrada 1gyrfj_0"
  on "storage"."objects"
  as permissive
  for insert
  to anon
with check ((bucket_id = 'Archivos_entrada'::text));



  create policy "anon_insert_evidencias 1cxz3yl_0"
  on "storage"."objects"
  as permissive
  for insert
  to anon
with check ((bucket_id = 'evidencias'::text));



  create policy "anon_select_Archivos_entrada 1gyrfj_0"
  on "storage"."objects"
  as permissive
  for select
  to anon
using ((bucket_id = 'Archivos_entrada'::text));



  create policy "anon_select_evidencias 1cxz3yl_0"
  on "storage"."objects"
  as permissive
  for select
  to anon
using ((bucket_id = 'evidencias'::text));



  create policy "anon_update_Archivos_entrada 1gyrfj_0"
  on "storage"."objects"
  as permissive
  for update
  to anon
using ((bucket_id = 'Archivos_entrada'::text));



  create policy "anon_update_evidencias 1cxz3yl_0"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'evidencias'::text));



