-- Migration: Support for Ordenes de Compra (OC) in Monitor de Instancias
-- Date: 2026-08-08

-- 1. Create view vw_monitor_oc_instancias_activas
CREATE OR REPLACE VIEW "public"."vw_monitor_oc_instancias_activas" AS
 WITH "tiempos" AS (
         SELECT "historial_eventos"."oc_instance_id",
            (EXTRACT(epoch FROM ("now"() - "max"("historial_eventos"."timestamp"))) / (3600)::numeric) AS "horas_en_estado"
           FROM "public"."historial_eventos"
          WHERE ("historial_eventos"."event_type" = 'STATE_TRANSITION'::"public"."event_type" AND "historial_eventos"."oc_instance_id" IS NOT NULL)
          GROUP BY "historial_eventos"."oc_instance_id"
        )
 SELECT "oi"."id" AS "instancia_id",
    "oi"."identificador_compuesto" AS "referencia_humana",
    "oc"."oc_ref_externa" AS "nro_pedido",
    "oc"."tipo_operatoria" AS "tipo_mercado",
    NULL::text AS "cliente",
    "prov"."razon_social" AS "proveedor",
    ( SELECT "string_agg"(DISTINCT ("r"."remito_ref_externa")::"text", ', '::"text") AS "string_agg"
           FROM ("public"."remitos" "r"
             JOIN "public"."remito_items" "ri" ON (("ri"."remito_id" = "r"."id")))
          WHERE (("ri"."origen_instance_id" = "oi"."id") AND ("ri"."origen_type" = 'OC'::"text"))) AS "nro_remito",
    ((("sd"."state_code")::"text" || ': '::"text") || "sd"."name") AS "estado_actual",
    "round"(COALESCE("t"."horas_en_estado", (0)::numeric), 1) AS "horas_transcurridas",
        CASE
            WHEN ("t"."horas_en_estado" > (24)::numeric) THEN 'ROJO'::"text"
            WHEN ("t"."horas_en_estado" > (12)::numeric) THEN 'AMARILLO'::"text"
            ELSE 'VERDE'::"text"
        END AS "color_alerta",
    "oi"."cantidad_total" AS "toneladas_originales",
    "oi"."cantidad_disponible" AS "toneladas_actuales",
    "round"((("oi"."cantidad_total" * (1000)::numeric) / (50)::numeric), 0) AS "bolsas_50kg_originales",
    ( SELECT "jsonb_agg"("vd"."name") AS "jsonb_agg"
           FROM ("public"."state_validation_requirements" "svr"
             JOIN "public"."validation_definitions" "vd" ON (("svr"."validation_id" = "vd"."id")))
          WHERE (("svr"."state_id" = "oi"."current_state_id") AND (((("oc"."tipo_operatoria")::"text" = 'MI'::"text") AND (("vd"."validation_code")::"text" !~~ '%_ME_%'::"text")) OR ((("oc"."tipo_operatoria")::"text" = 'ME'::"text") AND (("vd"."validation_code")::"text" !~~ '%_MI_%'::"text")) OR ((("vd"."validation_code")::"text" !~~ '%_ME_%'::"text") AND (("vd"."validation_code")::"text" !~~ '%_MI_%'::"text"))) AND (NOT (("vd"."validation_code")::"text" IN ( SELECT ("he"."details" ->> 'validation_code'::"text")
                   FROM "public"."historial_eventos" "he"
                  WHERE (("he"."oc_instance_id" = "oi"."id") AND ("he"."event_type" = 'VALIDATION_SUCCESS'::"public"."event_type") AND ("he"."timestamp" > ( SELECT COALESCE("max"("historial_eventos"."timestamp"), '1900-01-01 00:00:00-04:16:48'::timestamp with time zone) AS "coalesce"
                           FROM "public"."historial_eventos"
                          WHERE (("historial_eventos"."oc_instance_id" = "oi"."id") AND ("historial_eventos"."event_type" = 'STATE_TRANSITION'::"public"."event_type")))))))))) AS "tareas_faltantes",
    "public"."obtener_proximos_estados"("oi"."current_state_id") AS "proximos_estados"
   FROM "public"."oc_instancias" "oi"
     JOIN "public"."ordenes_compra" "oc" ON ("oi"."oc_id" = "oc"."id")
     LEFT JOIN "public"."proveedores" "prov" ON ("oc"."proveedor_id" = "prov"."id")
     JOIN "public"."state_definitions" "sd" ON ("oi"."current_state_id" = "sd"."id")
     LEFT JOIN "tiempos" "t" ON ("t"."oc_instance_id" = "oi"."id")
  WHERE ("oi"."status" = 'ACTIVA'::"public"."instance_status");

ALTER TABLE "public"."vw_monitor_oc_instancias_activas" OWNER TO "postgres";

GRANT ALL ON TABLE "public"."vw_monitor_oc_instancias_activas" TO "anon";
GRANT ALL ON TABLE "public"."vw_monitor_oc_instancias_activas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_monitor_oc_instancias_activas" TO "service_role";

-- 2. Create RPC function transicionar_instancia_oc_manual
CREATE OR REPLACE FUNCTION "public"."transicionar_instancia_oc_manual"(
    "p_instancia_id" bigint, 
    "p_nuevo_estado_code" "text", 
    "p_usuario_nombre" "text", 
    "p_motivo" "text"
) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_estado_id INT;
    v_estado_anterior_id INT;
BEGIN
    -- 1. Buscar el ID del nuevo estado para FSM 2 (OC)
    SELECT id INTO v_estado_id FROM state_definitions WHERE state_code = p_nuevo_estado_code AND fsm_id = 2;
    
    IF v_estado_id IS NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Estado destino no encontrado en FSM OC: ' || p_nuevo_estado_code);
    END IF;

    -- 2. Guardar el estado anterior para el log
    SELECT current_state_id INTO v_estado_anterior_id FROM oc_instancias WHERE id = p_instancia_id;

    -- 3. Cambiar el estado de la instancia de OC
    UPDATE oc_instancias 
    SET current_state_id = v_estado_id, 
        updated_at = NOW() 
    WHERE id = p_instancia_id;

    -- 4. Anotar en historial_eventos
    INSERT INTO historial_eventos (
        oc_instance_id, 
        event_type, 
        description, 
        user_actor, 
        details
    ) VALUES (
        p_instancia_id,
        'STATE_TRANSITION',
        'Movimiento manual OC vía Tablero: ' || p_motivo,
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

ALTER FUNCTION "public"."transicionar_instancia_oc_manual"("p_instancia_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_nombre" "text", "p_motivo" "text") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."transicionar_instancia_oc_manual"("p_instancia_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_nombre" "text", "p_motivo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."transicionar_instancia_oc_manual"("p_instancia_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_nombre" "text", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transicionar_instancia_oc_manual"("p_instancia_id" bigint, "p_nuevo_estado_code" "text", "p_usuario_nombre" "text", "p_motivo" "text") TO "service_role";

-- 3. Update get_checklist_instancia to support both Pedido and OC instances
CREATE OR REPLACE FUNCTION "public"."get_checklist_instancia"("p_instancia_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_state_id INT;
    v_current_data JSONB;
    v_tipo_mercado TEXT;
    v_prefix_to_exclude TEXT;
    r RECORD;
    v_func_name TEXT;
    v_result JSONB;
    v_status TEXT;
    v_message TEXT;
    v_cumplido BOOLEAN;
    v_checklist JSONB := '[]'::jsonb;
BEGIN
    SELECT
        pi.current_state_id, p.tipo_mercado, pi.current_data
    INTO v_current_state_id, v_tipo_mercado, v_current_data
    FROM public.pedido_instancias pi
    JOIN public.pedidos p ON pi.pedido_id = p.id
    WHERE pi.id = p_instancia_id;

    IF v_current_state_id IS NULL THEN
        SELECT
            oi.current_state_id, oc.tipo_operatoria, oi.current_data
        INTO v_current_state_id, v_tipo_mercado, v_current_data
        FROM public.oc_instancias oi
        JOIN public.ordenes_compra oc ON oi.oc_id = oc.id
        WHERE oi.id = p_instancia_id;
    END IF;

    IF v_current_state_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    IF v_tipo_mercado = 'MI' THEN v_prefix_to_exclude := 'VAL_P_ME_%';
    ELSIF v_tipo_mercado = 'ME' THEN v_prefix_to_exclude := 'VAL_P_MI_%';
    ELSE v_prefix_to_exclude := '@@@@';
    END IF;

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

