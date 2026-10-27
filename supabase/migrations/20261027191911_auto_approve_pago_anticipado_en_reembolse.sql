-- Migration: Auto-aprobación de Pago Anticipado en Reembolse (5.5 / Remitos Largos)
-- Fecha: 2026-10-27
-- Contexto: Cuando un remito se vincula a una instancia que ya está en Reembolse (5.5) o se emite un Remito Largo (LARGO_FINAL),
--           la condición comercial de pago anticipado ya fue validada y superada en el flete corto / ingreso a planta.
--           Por ende, el remito del flete largo se auto-aprueba (gf_pago_aprobado = true) evitando bloqueos redundantes.

-- ============================================================================
-- 1. Actualizar descontar_stock_intermedio_y_crear_remito_largo
-- ============================================================================

DROP FUNCTION IF EXISTS public.descontar_stock_intermedio_y_crear_remito_largo(text,integer,integer,integer,text,numeric,jsonb,integer,integer,text);
DROP FUNCTION IF EXISTS public.descontar_stock_intermedio_y_crear_remito_largo(text,integer,integer,integer,text,numeric,jsonb,integer,text,integer);
DROP FUNCTION IF EXISTS public.descontar_stock_intermedio_y_crear_remito_largo(text,integer,integer,integer,text,numeric,jsonb,integer,text,integer,text);
DROP FUNCTION IF EXISTS public.descontar_stock_intermedio_y_crear_remito_largo(text,integer,integer,integer,text,numeric,jsonb,integer,text,integer,text,text,text);

CREATE OR REPLACE FUNCTION public.descontar_stock_intermedio_y_crear_remito_largo(
    p_remito_ref_externa TEXT,
    p_deposito_intermedio_id INT,
    p_deposito_destino_id INT,
    p_chofer_id INT DEFAULT NULL,
    p_camion_patente TEXT DEFAULT NULL,
    p_cantidad_total_tn NUMERIC(12,3) DEFAULT 0,
    p_lotes_deduccion JSONB DEFAULT '[]'::jsonb,
    p_destino_final_cliente_id INT DEFAULT NULL,
    p_instrucciones_texto TEXT DEFAULT NULL,
    p_destino_final_pedido_id INT DEFAULT NULL,
    p_archivo_url TEXT DEFAULT NULL,
    p_patente_chasis TEXT DEFAULT NULL,
    p_patente_acoplado TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_new_remito_id BIGINT;
    v_item JSONB;
    v_lote_id INT;
    v_qty NUMERIC(12,3);
    v_current_disp NUMERIC(12,3);
    v_first_parent_remito_id BIGINT := NULL;
    v_first_ped_instance_id BIGINT := NULL;
    v_first_oc_instance_id BIGINT := NULL;
    
    v_camion_id INT := NULL;
    v_acoplado_id INT := NULL;

    v_parent_compuesto TEXT := '';
    v_parent_state_id INT := NULL;
    v_reml_ref TEXT := 'REML';
    
    v_new_child_instance_id BIGINT := NULL;
    v_new_identificador_compuesto TEXT := NULL;
    v_parent_pedido_id INT := NULL;
BEGIN
    -- 0. Buscar o dar de alta automáticamente la patente de chasis en camiones (tipo = 'CHASIS')
    IF p_patente_chasis IS NOT NULL AND TRIM(p_patente_chasis) <> '' THEN
        SELECT id INTO v_camion_id 
        FROM camiones 
        WHERE REPLACE(UPPER(patente), ' ', '') = REPLACE(UPPER(p_patente_chasis), ' ', '')
        LIMIT 1;

        IF v_camion_id IS NULL THEN
            INSERT INTO camiones (patente, tipo)
            VALUES (UPPER(TRIM(p_patente_chasis)), 'CHASIS')
            RETURNING id INTO v_camion_id;
        END IF;
    END IF;

    -- Buscar o dar de alta automáticamente la patente de acoplado en camiones (tipo = 'ACOPLADO')
    IF p_patente_acoplado IS NOT NULL AND TRIM(p_patente_acoplado) <> '' THEN
        SELECT id INTO v_acoplado_id 
        FROM camiones 
        WHERE REPLACE(UPPER(patente), ' ', '') = REPLACE(UPPER(p_patente_acoplado), ' ', '')
        LIMIT 1;

        IF v_acoplado_id IS NULL THEN
            INSERT INTO camiones (patente, tipo)
            VALUES (UPPER(TRIM(p_patente_acoplado)), 'ACOPLADO')
            RETURNING id INTO v_acoplado_id;
        END IF;
    END IF;

    -- 1. Insertar el Remito Largo con deposito_carga_id, patentes, metadata_extraida y AUTO-APROBACIÓN DE PAGO ANTICIPADO
    INSERT INTO remitos (
        remito_ref_externa,
        cantidad,
        cantidad_total,
        camion_patente,
        camion_id,
        acoplado_id,
        chofer_id,
        deposito_carga_id,
        deposito_intermedio_id,
        deposito_descarga_id,
        deposito_destino_id,
        tipo_flete,
        destino_final_cliente_id,
        instrucciones_texto,
        archivo_url,
        metadata_extraida,
        estado_asignacion,
        gf_pago_aprobado,
        gf_pago_aprobado_at,
        gf_pago_aprobado_por
    ) VALUES (
        p_remito_ref_externa,
        p_cantidad_total_tn,
        p_cantidad_total_tn,
        COALESCE(p_camion_patente, COALESCE(p_patente_chasis, '') || CASE WHEN p_patente_acoplado IS NOT NULL AND p_patente_acoplado <> '' THEN ' / ' || p_patente_acoplado ELSE '' END),
        v_camion_id,
        v_acoplado_id,
        p_chofer_id,
        p_deposito_intermedio_id, -- deposito_carga_id es la Planta de Reembolse / Estación Intermedia
        p_deposito_intermedio_id,
        p_deposito_destino_id,
        p_deposito_destino_id,
        'LARGO_FINAL',
        p_destino_final_cliente_id,
        p_instrucciones_texto,
        p_archivo_url,
        jsonb_build_object(
            'patente_chasis', p_patente_chasis,
            'patente_acoplado', p_patente_acoplado,
            'peso_total_remito', p_cantidad_total_tn
        ),
        'ASIGNADO',
        true,
        NOW(),
        'Sistema (Superado en Reembolse)'
    ) RETURNING id INTO v_new_remito_id;

    -- 2. Procesar deducciones por lote
    IF jsonb_array_length(p_lotes_deduccion) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_lotes_deduccion)
        LOOP
            v_lote_id := (v_item->>'lote_id')::INT;
            v_qty := (v_item->>'toneladas_deducir')::NUMERIC(12,3);

            -- Obtener referencias del lote
            SELECT toneladas_disponibles, remito_origen_id, pedido_instance_id, oc_instance_id
            INTO v_current_disp, v_first_parent_remito_id, v_first_ped_instance_id, v_first_oc_instance_id
            FROM stock_estacion_intermedia
            WHERE id = v_lote_id;

            IF v_current_disp IS NULL THEN
                RAISE EXCEPTION 'Lote % no encontrado en estación intermedia', v_lote_id;
            END IF;

            IF v_qty > v_current_disp THEN
                RAISE EXCEPTION 'Cantidad a deducir (%) supera el stock disponible (%) en lote %', v_qty, v_current_disp, v_lote_id;
            END IF;

            -- Actualizar stock en lote
            UPDATE stock_estacion_intermedia
            SET toneladas_disponibles = toneladas_disponibles - v_qty,
                status = CASE WHEN (toneladas_disponibles - v_qty) <= 0 THEN 'AGOTADO' ELSE 'DISPONIBLE' END,
                updated_at = NOW()
            WHERE id = v_lote_id;

            -- Registrar item de remito
            IF v_first_ped_instance_id IS NOT NULL THEN
                INSERT INTO remito_items (remito_id, origen_type, origen_instance_id, cantidad)
                VALUES (v_new_remito_id, 'PEDIDO', v_first_ped_instance_id, v_qty);
            END IF;
        END LOOP;

        -- Actualizar parent_remito_id en el Remito Largo
        IF v_first_parent_remito_id IS NOT NULL THEN
            UPDATE remitos SET parent_remito_id = v_first_parent_remito_id WHERE id = v_new_remito_id;
        END IF;
    END IF;

    -- 3. Crear Sub-Instancia Hija en pedido_instancias si existe una instancia madre
    IF v_first_ped_instance_id IS NOT NULL THEN
        SELECT pedido_id, identificador_compuesto, current_state_id 
        INTO v_parent_pedido_id, v_parent_compuesto, v_parent_state_id
        FROM pedido_instancias WHERE id = v_first_ped_instance_id;

        v_reml_ref := p_remito_ref_externa;

        -- Insertar Sub-Instancia Hija en estado 14 (5.1: Carga de Mercadería)
        INSERT INTO pedido_instancias (
            pedido_id,
            parent_instance_id,
            identificador_compuesto,
            current_state_id,
            saldo_pendiente,
            cantidad_requerida_original,
            status
        ) VALUES (
            v_parent_pedido_id,
            v_first_ped_instance_id,
            'TEMP_CHILD',
            14, -- State ID 14 = 5.1: Carga de Mercadería
            p_cantidad_total_tn,
            p_cantidad_total_tn,
            'ACTIVA'
        ) RETURNING id INTO v_new_child_instance_id;

        -- Generar identificador_compuesto definitivo con nomenclatura REML
        v_new_identificador_compuesto := COALESCE(v_parent_compuesto, 'INST_' || v_first_ped_instance_id::text) 
            || '_REML' || v_reml_ref || '_' || v_new_child_instance_id::text;

        UPDATE pedido_instancias 
        SET identificador_compuesto = v_new_identificador_compuesto 
        WHERE id = v_new_child_instance_id;

        -- Vincular el remito_item directamente a la Sub-Instancia Hija recién creada
        UPDATE remito_items 
        SET origen_instance_id = v_new_child_instance_id 
        WHERE remito_id = v_new_remito_id;

        -- Actualizar el saldo de la Instancia Madre
        UPDATE pedido_instancias
        SET saldo_pendiente = GREATEST(0, COALESCE(saldo_pendiente, cantidad_requerida_original, 0) - p_cantidad_total_tn),
            updated_at = NOW()
        WHERE id = v_first_ped_instance_id;
    END IF;

    -- 4. Registrar evento en el historial
    INSERT INTO historial_eventos (
        event_type,
        description,
        user_actor,
        details
    ) VALUES (
        'STATE_TRANSITION',
        'Emisión de Remito Largo ' || p_remito_ref_externa || ' por ' || p_cantidad_total_tn::text || ' TN (Pago anticipado superado)',
        'web_app_ui',
        jsonb_build_object(
            'remito_id', v_new_remito_id,
            'remito_ref_externa', p_remito_ref_externa,
            'tipo_flete', 'LARGO_FINAL',
            'deposito_intermedio_id', p_deposito_intermedio_id,
            'deposito_destino_id', p_deposito_destino_id,
            'toneladas_total', p_cantidad_total_tn,
            'child_instance_id', v_new_child_instance_id,
            'identificador_compuesto', v_new_identificador_compuesto,
            'gf_pago_aprobado', true
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'remito_id', v_new_remito_id,
        'remito_ref_externa', p_remito_ref_externa,
        'cantidad_total_tn', p_cantidad_total_tn,
        'child_instance_id', v_new_child_instance_id,
        'identificador_compuesto', v_new_identificador_compuesto,
        'gf_pago_aprobado', true
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Actualizar ejecutar_asignacion_remito
-- ============================================================================

DROP FUNCTION IF EXISTS public.ejecutar_asignacion_remito(bigint, text, bigint, numeric);

CREATE OR REPLACE FUNCTION public.ejecutar_asignacion_remito(
    p_remito_id bigint, 
    p_origen_type text, 
    p_origen_instance_id bigint, 
    p_cantidad_asignada numeric
)
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
    v_origen_state_code TEXT := NULL;
    v_es_origen_reembolse BOOLEAN := false;
BEGIN
    SELECT * INTO v_remito_data FROM public.remitos WHERE id = p_remito_id;
    IF v_remito_data.id IS NULL THEN RETURN jsonb_build_object('status', 'ERROR', 'message', 'Remito no encontrado.'); END IF;
    IF v_remito_data.estado_asignacion = 'ASIGNADO' THEN RETURN jsonb_build_object('status', 'ERROR', 'message', 'El remito ya fue asignado.'); END IF;

    IF p_origen_type = 'PEDIDO' THEN
        SELECT pi.saldo_pendiente, pi.current_data, pi.pedido_id, pi.identificador_compuesto, p.tipo_mercado, sd.state_code
        INTO v_saldo_actual, v_parent_data, v_pedido_id_raiz, v_identificador_padre, v_tipo_mercado, v_origen_state_code
        FROM pedido_instancias pi 
        JOIN pedidos p ON pi.pedido_id = p.id 
        LEFT JOIN state_definitions sd ON pi.current_state_id = sd.id
        WHERE pi.id = p_origen_instance_id;

        -- Si el origen está en 5.5 (Reembolse), la sub-instancia de viaje pasa a 5.1 (Carga de Mercadería)
        IF v_origen_state_code = '5.5' THEN
            v_nuevo_estado_code := '5.1';
            v_es_origen_reembolse := true;
        ELSIF v_tipo_mercado = 'MI' THEN 
            v_nuevo_estado_code := '3.2'; 
        ELSE 
            v_nuevo_estado_code := '3.1.5'; 
        END IF;
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
        
        INSERT INTO historial_eventos (pedido_instance_id, event_type, description, user_actor, details)
        VALUES (
            v_nueva_instancia_id, 
            'STATE_TRANSITION', 
            'Nueva instancia generada por Remito ' || v_remito_data.remito_ref_externa || CASE WHEN v_es_origen_reembolse THEN ' (Flete Largo desde Reembolse 5.5)' ELSE '' END, 
            'SISTEMA', 
            jsonb_build_object('from_state', COALESCE(v_origen_state_code, 'NEW'), 'to_state', v_nuevo_estado_code)
        );
        
    ELSE 
        INSERT INTO oc_instancias (oc_id, parent_instance_id, current_state_id, cantidad_total, cantidad_disponible, status, current_data) 
        VALUES (v_oc_id_raiz, p_origen_instance_id, v_nuevo_estado_id, p_cantidad_asignada, p_cantidad_asignada, 'ACTIVA'::instance_status, v_parent_data) 
        RETURNING id INTO v_nueva_instancia_id;

        UPDATE oc_instancias 
        SET cantidad_disponible = v_saldo_final_madre,
            status = CASE WHEN v_saldo_final_madre <= 0 THEN 'COMPLETADA'::instance_status ELSE 'ACTIVA'::instance_status END
        WHERE id = p_origen_instance_id;
        
        INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
        VALUES (v_nueva_instancia_id, 'STATE_TRANSITION', 'Nueva instancia generada por Remito ' || v_remito_data.remito_ref_externa, 'SISTEMA', jsonb_build_object('from_state', 'NEW', 'to_state', v_nuevo_estado_code));
    END IF;

    v_identificador_nuevo := COALESCE(v_identificador_padre, 'ROOT') || '_REM-' || v_remito_data.remito_ref_externa || '_' || v_nueva_instancia_id;
    IF p_origen_type = 'PEDIDO' THEN UPDATE pedido_instancias SET identificador_compuesto = v_identificador_nuevo WHERE id = v_nueva_instancia_id;
    ELSE UPDATE oc_instancias SET identificador_compuesto = v_identificador_nuevo WHERE id = v_nueva_instancia_id; END IF;

    INSERT INTO remito_items (remito_id, origen_type, origen_instance_id, destino_instance_id, cantidad) 
    VALUES (p_remito_id, p_origen_type, p_origen_instance_id, v_nueva_instancia_id, p_cantidad_asignada);

    -- Si proviene de Reembolse (5.5) o ya era un remito largo, auto-aprobar pago anticipado
    IF v_es_origen_reembolse OR COALESCE(v_remito_data.tipo_flete, '') = 'LARGO_FINAL' THEN
        UPDATE public.remitos 
        SET estado_asignacion = 'ASIGNADO',
            tipo_flete = COALESCE(tipo_flete, 'LARGO_FINAL'),
            gf_pago_aprobado = true,
            gf_pago_aprobado_at = NOW(),
            gf_pago_aprobado_por = 'Sistema (Superado en Reembolse)'
        WHERE id = p_remito_id;
    ELSE
        UPDATE public.remitos SET estado_asignacion = 'ASIGNADO' WHERE id = p_remito_id;
    END IF;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'nueva_instancia_id', v_nueva_instancia_id,
        'nuevo_estado', v_nuevo_estado_code,
        'saldo_restante_madre', v_saldo_final_madre,
        'auto_aprobado_gf', v_es_origen_reembolse
    );
END;
$function$;

GRANT ALL ON FUNCTION public.ejecutar_asignacion_remito(bigint, text, bigint, numeric) TO anon, authenticated, service_role;

-- ============================================================================
-- 3. Actualización retroactiva para remitos largos o vinculados a 5.5 ya existentes
-- ============================================================================

UPDATE public.remitos
SET gf_pago_aprobado = true,
    gf_pago_aprobado_at = COALESCE(created_at, NOW()),
    gf_pago_aprobado_por = 'Sistema (Superado en Reembolse)'
WHERE tipo_flete = 'LARGO_FINAL' AND gf_pago_aprobado IS NULL;

UPDATE public.remitos r
SET gf_pago_aprobado = true,
    gf_pago_aprobado_at = COALESCE(r.created_at, NOW()),
    gf_pago_aprobado_por = 'Sistema (Superado en Reembolse)'
FROM public.remito_items ri
JOIN public.pedido_instancias pi ON ri.origen_instance_id = pi.id
JOIN public.state_definitions sd ON pi.current_state_id = sd.id
WHERE ri.remito_id = r.id
  AND sd.state_code = '5.5'
  AND r.gf_pago_aprobado IS NULL;
