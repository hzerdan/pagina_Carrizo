-- 1. Migrar datos de planilla_url a planilla_completada_url si existen
UPDATE public.inspecciones 
SET planilla_completada_url = planilla_url 
WHERE planilla_completada_url IS NULL AND planilla_url IS NOT NULL;

-- 2. Actualizar la vista de Kanban para usar la nueva columna
DROP VIEW IF EXISTS "public"."v_inspecciones_kanban" CASCADE;
CREATE OR REPLACE VIEW "public"."v_inspecciones_kanban" AS
 SELECT "i"."id",
    "i"."tipo_carga",
    "p"."nombre_completo" AS "inspector_nombre",
    "i"."fecha_hora_carga_pactada" AS "fecha_pactada",
    "i"."export_doc_status",
    "i"."resultado_final",
    "i"."planilla_completada_url", -- Cambio aquí
    "sd"."state_code",
    ( SELECT "json_agg"("json_build_object"('identificador_compuesto', "pi"."identificador_compuesto")) AS "json_agg"
           FROM ("public"."inspeccion_items_pedido" "iip"
             JOIN "public"."pedido_instancias" "pi" ON (("iip"."pedido_instance_id" = "pi"."id")))
          WHERE ("iip"."inspeccion_id" = "i"."id")) AS "pedidos"
   FROM (("public"."inspecciones" "i"
     LEFT JOIN "public"."personal_ac" "p" ON (("i"."inspector_id" = "p"."id")))
     LEFT JOIN "public"."state_definitions" "sd" ON (("i"."current_state_id" = "sd"."id")));

-- 3. Actualizar RPC inspeccion_intentar_transicion para corregir VAL_INS_02
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
      -- Lógica corregida: VAL_INS_02 ahora chequea planilla_completada_url
      AND NOT (
          (v.validation_code = 'VAL_INS_01' AND EXISTS (SELECT 1 FROM public.inspecciones WHERE id = p_inspeccion_id AND inspector_id IS NOT NULL)) OR
          (v.validation_code = 'VAL_INS_02' AND EXISTS (SELECT 1 FROM public.inspecciones WHERE id = p_inspeccion_id AND planilla_completada_url IS NOT NULL))
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

-- 4. Actualizar RPC inspeccion_completar_resultados con mejor manejo de errores de FSM
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
    v_res jsonb;
BEGIN
    -- Validar token
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

    -- Actualizar datos
    UPDATE public.magic_links SET used_at = now() WHERE token = p_token::uuid;
    UPDATE public.inspecciones SET planilla_completada_url = p_archivo_url WHERE id = v_inspeccion_id;

    -- Log evento
    PERFORM public.log_inspeccion_evento(v_inspeccion_id, 'RESULTADOS_SUBIDOS', 'INSPECTOR', jsonb_build_object('url', p_archivo_url));
    
    -- Intentar transición y validar éxito
    v_res := public.inspeccion_intentar_transicion(v_inspeccion_id, '3.D3', 'INSPECTOR');
    
    IF NOT (v_res->>'success')::boolean THEN
        RAISE EXCEPTION 'Los resultados se subieron pero el movimiento a 3.D3 falló: %', (v_res->>'error');
    END IF;

    RETURN true;
END;
$$;

-- 5. Eliminar la columna redundante planilla_url
-- ALTER TABLE public.inspecciones DROP COLUMN IF EXISTS planilla_url;
-- Comentado por seguridad extrema, el usuario puede descomentarlo si lo desea, 
-- pero el código ya no la usará. 
