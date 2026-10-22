-- ============================================================================
-- Migración: Normalización flexible de unidades en sp_vincular_pedido_oc
-- Fecha: 2026-10-07 / 2026-10-08
-- Autor: Antigravity
-- Reglas AGENTS.md:
--   - DROP FUNCTION IF EXISTS previa para reemplazo canónico limpio sin ambigüedades.
--   - Idempotencia en DDL.
-- ============================================================================

DROP FUNCTION IF EXISTS public.sp_vincular_pedido_oc(text, text, numeric, text, text);

CREATE OR REPLACE FUNCTION public.sp_vincular_pedido_oc(
    p_pedido_ref_externa text, 
    p_oc_ref_externa text, 
    p_cantidad_a_vincular numeric, 
    p_unidades text, 
    p_remitente_actor text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
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
    v_identificador_compuesto TEXT;
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

    -- 2. LÓGICA DE SUGERENCIAS Y ENTRADA (Si falta OC o Pedido)
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

    -- 3. VALIDACIÓN Y BLOQUEO DE INSTANCIAS MADRES
    SELECT pi.id, pi.pedido_id, pi.saldo_pendiente, pi.current_data 
    INTO v_pedido_madre_instancia_id, v_pedido_id_raiz, v_pedido_saldo_requerido_ton, v_pedido_madre_data
    FROM pedido_instancias pi
    JOIN pedidos p ON pi.pedido_id = p.id
    WHERE p.pedido_ref_externa = p_pedido_ref_externa
      AND pi.status = 'ACTIVA'
      AND pi.current_state_id = v_estado_pedido_esperado
    FOR UPDATE; 

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
        IF p_cantidad_a_vincular IS NULL THEN
            v_cantidad_ton_a_vincular := LEAST(v_pedido_saldo_requerido_ton, v_oc_saldo_disponible_ton);
            
            IF v_cantidad_ton_a_vincular <= 0 THEN
                v_error_message := 'Error: Saldo cero. No se puede vincular. Saldo Pedido: ' || v_pedido_saldo_requerido_ton || ' ton. Saldo OC: ' || v_oc_saldo_disponible_ton || ' ton.';
            END IF;
        ELSE
            v_cantidad_ton_a_vincular := p_cantidad_a_vincular; 
            
            -- Normalización flexible de unidades
            IF p_unidades IS NULL OR p_unidades = '' 
               OR upper(trim(p_unidades)) IN ('TON', 'TONS', 'TONELADA', 'TONELADAS', 'TN', 'TNS', 'T') THEN
                v_cantidad_ton_a_vincular := p_cantidad_a_vincular;
            ELSIF upper(trim(p_unidades)) IN ('KG', 'KGS', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS') THEN
                v_cantidad_ton_a_vincular := p_cantidad_a_vincular / 1000.0;
            ELSE
                v_error_message := 'Error: Unidad ' || p_unidades || ' inválida. Debe ser KG o TON.';
            END IF;
            
            IF v_cantidad_ton_a_vincular <= 0 THEN
                v_error_message := 'Error: La cantidad a vincular debe ser mayor a cero.';
            ELSIF v_cantidad_ton_a_vincular > v_pedido_saldo_requerido_ton THEN
                v_error_message := 'Error Pedido: La cantidad a vincular (' || v_cantidad_ton_a_vincular || ' ton) excede el saldo pendiente del pedido (' || v_pedido_saldo_requerido_ton || ' ton).';
            ELSIF v_cantidad_ton_a_vincular > v_oc_saldo_disponible_ton THEN
                v_error_message := 'Error OC: La cantidad a vincular (' || v_cantidad_ton_a_vincular || ' ton) excede el saldo disponible de la OC (' || v_oc_saldo_disponible_ton || ' ton).';
            END IF;
        END IF;
    END IF;

    IF v_error_message IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', v_error_message);
    END IF;

    -- 6. SPLIT E INSERCIÓN
    UPDATE pedido_instancias
    SET saldo_pendiente = v_pedido_saldo_requerido_ton - v_cantidad_ton_a_vincular
    WHERE id = v_pedido_madre_instancia_id;

    INSERT INTO pedido_instancias (
        pedido_id, parent_instance_id, identificador_compuesto, 
        current_state_id, saldo_pendiente, cantidad_requerida_original, 
        status, current_data
    ) VALUES (
        v_pedido_id_raiz, v_pedido_madre_instancia_id, NULL,
        v_estado_pedido_siguiente, v_cantidad_ton_a_vincular, v_cantidad_ton_a_vincular,
        'ACTIVA', v_pedido_madre_data
    ) RETURNING id INTO v_pedido_hija_instancia_id;

    v_identificador_compuesto := p_pedido_ref_externa || '_OC-' || p_oc_ref_externa || '_' || v_pedido_hija_instancia_id;
    UPDATE pedido_instancias
    SET identificador_compuesto = v_identificador_compuesto
    WHERE id = v_pedido_hija_instancia_id;

    UPDATE oc_instancias
    SET cantidad_disponible = v_oc_saldo_disponible_ton - v_cantidad_ton_a_vincular
    WHERE id = v_oc_madre_instancia_id;

    INSERT INTO oc_instancias (
        oc_id, parent_instance_id, current_state_id, 
        cantidad_total, cantidad_disponible, status, current_data, identificador_compuesto
    ) VALUES (
        v_oc_id_raiz, v_oc_madre_instancia_id, v_estado_oc_siguiente,
        v_cantidad_ton_a_vincular, v_cantidad_ton_a_vincular, 'ACTIVA', v_oc_madre_data, NULL
    ) RETURNING id INTO v_oc_hija_instancia_id;
    
    v_identificador_compuesto := p_oc_ref_externa || '_PED-' || p_pedido_ref_externa || '_' || v_oc_hija_instancia_id;
    UPDATE oc_instancias
    SET identificador_compuesto = v_identificador_compuesto
    WHERE id = v_oc_hija_instancia_id;

    -- 7. VINCULACIÓN Y EVENTOS
    INSERT INTO vinculaciones_pedido_oc (
        pedido_instance_id, oc_instance_id, cantidad_vinculada, estado_vinculacion
    ) VALUES (
        v_pedido_hija_instancia_id, v_oc_hija_instancia_id, v_cantidad_ton_a_vincular, 'PENDIENTE_VALIDACION'
    );

    INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
    VALUES (v_pedido_hija_instancia_id, 'INSTANCE_CREATED', 'Creada instancia Pedido (Calce con OC ' || p_oc_ref_externa || ').', 'SISTEMA', jsonb_build_object('cantidad_ton', v_cantidad_ton_a_vincular));
            
    INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
    VALUES (v_pedido_hija_instancia_id, 'STATE_TRANSITION', 'Transición a Estado 1.5 por vinculación manual.', p_remitente_actor, 
            jsonb_build_object('oc_instance_id', v_oc_hija_instancia_id, 'cantidad_vinculada_ton', v_cantidad_ton_a_vincular));
            
    INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
    VALUES (v_oc_hija_instancia_id, 'STATE_TRANSITION', 'Transición a Estado 3 por vinculación manual.', p_remitente_actor, 
            jsonb_build_object('pedido_instance_id', v_pedido_hija_instancia_id, 'cantidad_vinculada_ton', v_cantidad_ton_a_vincular));

    IF (v_pedido_saldo_requerido_ton - v_cantidad_ton_a_vincular) <= 0 THEN
        UPDATE pedido_instancias SET status = 'COMPLETADA' WHERE id = v_pedido_madre_instancia_id;
    END IF;
    IF (v_oc_saldo_disponible_ton - v_cantidad_ton_a_vincular) <= 0 THEN
        UPDATE oc_instancias SET status = 'COMPLETADA' WHERE id = v_oc_madre_instancia_id;
    END IF;

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
$function$;
