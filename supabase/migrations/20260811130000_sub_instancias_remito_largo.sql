-- Migration: Sub-instancias fijas para Remitos Largos y Nomenclatura REMC/REML
-- Fecha: 2026-08-11

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

    -- 1. Insertar el Remito Largo con deposito_carga_id, patentes y metadata_extraida
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
        estado_asignacion
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
        'ASIGNADO'
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
        'Emisión de Remito Largo ' || p_remito_ref_externa || ' por ' || p_cantidad_total_tn::text || ' TN',
        'web_app_ui',
        jsonb_build_object(
            'remito_id', v_new_remito_id,
            'remito_ref_externa', p_remito_ref_externa,
            'tipo_flete', 'LARGO_FINAL',
            'deposito_intermedio_id', p_deposito_intermedio_id,
            'deposito_destino_id', p_deposito_destino_id,
            'toneladas_total', p_cantidad_total_tn,
            'child_instance_id', v_new_child_instance_id,
            'identificador_compuesto', v_new_identificador_compuesto
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'remito_id', v_new_remito_id,
        'remito_ref_externa', p_remito_ref_externa,
        'cantidad_total_tn', p_cantidad_total_tn,
        'child_instance_id', v_new_child_instance_id,
        'identificador_compuesto', v_new_identificador_compuesto
    );
END;
$$ LANGUAGE plpgsql;
