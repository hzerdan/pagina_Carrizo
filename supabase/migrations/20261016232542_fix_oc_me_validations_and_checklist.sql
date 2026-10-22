-- Migration: fix_oc_me_validations_and_checklist
-- 1. Configurar validaciones 107 y 108 de OC ME como no bloqueantes (opcionales)
UPDATE public.validation_definitions
SET is_blocking = false
WHERE validation_code IN ('VAL_OC_107', 'VAL_OC_108');

-- 2. Actualizar get_checklist_instancia para discriminar controles MI y ME en OC
DROP FUNCTION IF EXISTS public.get_checklist_instancia(bigint);

CREATE OR REPLACE FUNCTION public.get_checklist_instancia(p_instancia_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_current_state_id INT;
    v_current_data JSONB;
    v_tipo_mercado TEXT;
    v_is_oc BOOLEAN := false;
    r RECORD;
    v_func_name TEXT;
    v_result JSONB;
    v_status TEXT;
    v_message TEXT;
    v_cumplido BOOLEAN;
    v_checklist JSONB := '[]'::jsonb;
BEGIN
    -- 1. Intentar buscar como Pedido
    SELECT
        pi.current_state_id, p.tipo_mercado, pi.current_data
    INTO v_current_state_id, v_tipo_mercado, v_current_data
    FROM public.pedido_instancias pi
    JOIN public.pedidos p ON pi.pedido_id = p.id
    WHERE pi.id = p_instancia_id;

    -- 2. Si no es Pedido, buscar como OC
    IF v_current_state_id IS NULL THEN
        SELECT
            oi.current_state_id, oc.tipo_operatoria, oi.current_data, true
        INTO v_current_state_id, v_tipo_mercado, v_current_data, v_is_oc
        FROM public.oc_instancias oi
        JOIN public.ordenes_compra oc ON oi.oc_id = oc.id
        WHERE oi.id = p_instancia_id;
    END IF;

    IF v_current_state_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    -- 3. Iterar sobre las validaciones requeridas según tipo de entidad y mercado
    FOR r IN (
        SELECT vd.validation_code, vd.name as validation_name, vd.is_blocking
        FROM public.validation_definitions vd
        JOIN public.state_validation_requirements svr ON vd.id = svr.validation_id
        WHERE svr.state_id = v_current_state_id
          AND (
            -- Lógica para Pedidos
            (NOT v_is_oc AND (
                (v_tipo_mercado = 'MI' AND vd.validation_code NOT LIKE 'VAL_P_ME_%') OR
                (v_tipo_mercado = 'ME' AND vd.validation_code NOT LIKE 'VAL_P_MI_%') OR
                (v_tipo_mercado NOT IN ('MI', 'ME'))
            ))
            OR
            -- Lógica para Órdenes de Compra (alineada con ejecutar_validaciones_oc)
            (v_is_oc AND (
                (v_tipo_mercado = 'MI' AND vd.validation_code NOT IN ('VAL_OC_104', 'VAL_OC_105', 'VAL_OC_107', 'VAL_OC_108')) OR
                (v_tipo_mercado = 'ME' AND vd.validation_code NOT IN ('VAL_OC_103', 'VAL_OC_106')) OR
                (v_tipo_mercado NOT IN ('MI', 'ME'))
            ))
          )
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
$function$;

-- 3. Actualizar get_instance_requirements para mantener consistencia con get_checklist_instancia
DROP FUNCTION IF EXISTS public.get_instance_requirements(bigint, text);

CREATE OR REPLACE FUNCTION public.get_instance_requirements(p_instance_id bigint, p_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_current_state_id INT;
    v_current_data JSONB;
    v_tipo_mercado TEXT;
    v_state_name TEXT;
    v_state_desc TEXT;
    v_state_code TEXT;
    v_requirements JSONB;
BEGIN
    IF p_type = 'PEDIDO' THEN
        SELECT 
            pi.current_state_id, 
            pi.current_data,
            p.tipo_mercado,
            sd.name,
            sd.description,
            sd.state_code
        INTO 
            v_current_state_id, 
            v_current_data,
            v_tipo_mercado,
            v_state_name,
            v_state_desc,
            v_state_code
        FROM public.pedido_instancias pi
        JOIN public.pedidos p ON pi.pedido_id = p.id
        JOIN public.state_definitions sd ON pi.current_state_id = sd.id
        WHERE pi.id = p_instance_id;
        
    ELSIF p_type = 'OC' THEN
        SELECT 
            oi.current_state_id, 
            oi.current_data,
            oc.tipo_operatoria,
            sd.name,
            sd.description,
            sd.state_code
        INTO 
            v_current_state_id, 
            v_current_data,
            v_tipo_mercado,
            v_state_name,
            v_state_desc,
            v_state_code
        FROM public.oc_instancias oi
        JOIN public.ordenes_compra oc ON oi.oc_id = oc.id
        JOIN public.state_definitions sd ON oi.current_state_id = sd.id
        WHERE oi.id = p_instance_id;
    ELSE
        RETURN jsonb_build_object('error', 'Tipo inválido. Use PEDIDO o OC');
    END IF;

    IF v_current_state_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Instancia no encontrada');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'codigo', vd.validation_code,
            'nombre', vd.name,
            'descripcion', vd.description,
            'es_bloqueante', vd.is_blocking,
            'estado_actual', COALESCE((v_current_data->'validations'->>vd.validation_code)::boolean, false)
        ) ORDER BY vd.is_blocking DESC, vd.name ASC
    )
    INTO v_requirements
    FROM public.state_validation_requirements svr
    JOIN public.validation_definitions vd ON svr.validation_id = vd.id
    WHERE svr.state_id = v_current_state_id
      AND (
        (p_type = 'PEDIDO' AND (
            (v_tipo_mercado = 'MI' AND vd.validation_code NOT LIKE 'VAL_P_ME_%') OR
            (v_tipo_mercado = 'ME' AND vd.validation_code NOT LIKE 'VAL_P_MI_%') OR
            (v_tipo_mercado NOT IN ('MI', 'ME'))
        ))
        OR
        (p_type = 'OC' AND (
            (v_tipo_mercado = 'MI' AND vd.validation_code NOT IN ('VAL_OC_104', 'VAL_OC_105', 'VAL_OC_107', 'VAL_OC_108')) OR
            (v_tipo_mercado = 'ME' AND vd.validation_code NOT IN ('VAL_OC_103', 'VAL_OC_106')) OR
            (v_tipo_mercado NOT IN ('MI', 'ME'))
        ))
      );

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
$function$;
