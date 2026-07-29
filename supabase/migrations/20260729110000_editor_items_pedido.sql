-- Migración: Editor de Ítems y Calidades de Pedidos con Control de Saldos
-- Fecha: 2026-07-29

CREATE OR REPLACE FUNCTION "public"."editar_items_pedido"(
    "p_instancia_id" BIGINT,
    "p_productos_nuevos" JSONB,
    "p_motivo" TEXT,
    "p_usuario_email" TEXT DEFAULT 'SISTEMA'
) RETURNS JSONB
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    AS $$
DECLARE
    v_pedido_id INT;
    v_current_data JSONB;
    v_saldo_pendiente NUMERIC(12, 3);
    v_cantidad_requerida_original NUMERIC(12, 3);
    v_status "public"."instance_status";
    
    v_nuevo_total_ton NUMERIC(12, 3) := 0;
    v_toneladas_calzadas NUMERIC(12, 3) := 0;
    v_toneladas_remitidas NUMERIC(12, 3) := 0;
    v_piso_minimo_ton NUMERIC(12, 3) := 0;
    v_nuevo_saldo_pendiente NUMERIC(12, 3) := 0;
    v_updated_current_data JSONB;
BEGIN
    -- 1. Validar existencia y estado de la instancia de pedido
    SELECT 
        pedido_id, 
        current_data, 
        saldo_pendiente, 
        cantidad_requerida_original,
        status
    INTO 
        v_pedido_id, 
        v_current_data, 
        v_saldo_pendiente, 
        v_cantidad_requerida_original,
        v_status
    FROM pedido_instancias 
    WHERE id = p_instancia_id;

    IF v_pedido_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Instancia de pedido no encontrada.'
        );
    END IF;

    IF v_status != 'ACTIVA'::instance_status THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Solo se pueden editar pedidos con estado de instancia ACTIVA.'
        );
    END IF;

    IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Debe proporcionar un motivo para la modificación del pedido.'
        );
    END IF;

    -- 2. Calcular nuevo tonelaje total a partir del JSON de productos
    SELECT COALESCE(SUM(
        COALESCE((prod->>'cantidad_bolsas')::NUMERIC, (prod->>'cantidad')::NUMERIC, 0) * 
        COALESCE((prod->>'peso_bolsa_kg')::NUMERIC, (prod->>'peso_por_bolsa_kg')::NUMERIC, 50.0)
    ) / 1000.0, 0)
    INTO v_nuevo_total_ton
    FROM jsonb_array_elements(p_productos_nuevos) AS prod;

    IF v_nuevo_total_ton <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'La cantidad total del pedido debe ser mayor a cero.'
        );
    END IF;

    -- 3. Calcular Toneladas Calzadas en vinculaciones activas (usando cantidad_vinculada)
    SELECT COALESCE(SUM(v.cantidad_vinculada), 0)
    INTO v_toneladas_calzadas
    FROM vinculaciones_pedido_oc v
    WHERE v.pedido_instance_id = p_instancia_id
      AND v.estado_vinculacion IN ('APROBADA', 'PENDIENTE_VALIDACION');

    -- 4. Calcular Toneladas Remitidas/Despachadas
    SELECT COALESCE(SUM(ri.cantidad), 0)
    INTO v_toneladas_remitidas
    FROM remito_items ri
    WHERE ri.origen_instance_id = p_instancia_id
      AND ri.origen_type = 'PEDIDO';

    -- 5. Obtener el Piso Mínimo Inviolable
    v_piso_minimo_ton := GREATEST(v_toneladas_calzadas, v_toneladas_remitidas);

    -- 6. Verificar restricción de Piso Mínimo
    IF v_nuevo_total_ton < v_piso_minimo_ton THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', FORMAT(
                'No se puede reducir la cantidad del pedido a %s Ton (%s bolsas) porque existen %s Ton (%s bolsas) ya calzadas con OCs o despachadas.',
                ROUND(v_nuevo_total_ton, 3),
                ROUND((v_nuevo_total_ton * 1000) / 50, 0),
                ROUND(v_piso_minimo_ton, 3),
                ROUND((v_piso_minimo_ton * 1000) / 50, 0)
            )
        );
    END IF;

    -- 7. Recalcular nuevo saldo pendiente
    v_nuevo_saldo_pendiente := v_nuevo_total_ton - v_piso_minimo_ton;

    -- 8. Actualizar cabecera de Pedido
    UPDATE pedidos
    SET cantidad_total_ton = v_nuevo_total_ton
    WHERE id = v_pedido_id;

    -- 9. Upsert de nuevos artículos en catálogo articulos
    INSERT INTO articulos (codigo_articulo, nombre, tipo_mercado, peso_standard_kg)
    SELECT DISTINCT
        prod->>'codigo_producto',
        prod->>'nombre_producto',
        COALESCE(v_current_data->>'tipo_pedido', 'MI'),
        COALESCE((prod->>'peso_bolsa_kg')::NUMERIC, (prod->>'peso_por_bolsa_kg')::NUMERIC, 50.0)
    FROM jsonb_array_elements(p_productos_nuevos) AS prod
    WHERE prod->>'codigo_producto' IS NOT NULL AND TRIM(prod->>'codigo_producto') != ''
    ON CONFLICT (codigo_articulo) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        tipo_mercado = EXCLUDED.tipo_mercado,
        peso_standard_kg = EXCLUDED.peso_standard_kg;

    -- 10. Construir nuevo current_data para la instancia
    v_updated_current_data := v_current_data 
        || jsonb_build_object(
            'productos', p_productos_nuevos,
            'motivo_modificacion', p_motivo,
            'version_pedido', COALESCE((v_current_data->>'version_pedido')::INT, 1) + 1
        );

    -- 11. Actualizar instancia de pedido
    UPDATE pedido_instancias
    SET cantidad_requerida_original = v_nuevo_total_ton,
        saldo_pendiente = v_nuevo_saldo_pendiente,
        current_data = v_updated_current_data,
        updated_at = NOW()
    WHERE id = p_instancia_id;

    -- 12. Registrar en historial_eventos para auditoría completa
    INSERT INTO historial_eventos (
        pedido_instance_id,
        event_type,
        description,
        user_actor,
        details
    ) VALUES (
        p_instancia_id,
        'DATA_UPDATE'::event_type,
        'Modificación de ítems y calidades del pedido. Motivo: ' || p_motivo,
        COALESCE(p_usuario_email, 'SISTEMA'),
        jsonb_build_object(
            'tipo_modificacion', 'EDITAR_ITEMS_Y_CALIDADES',
            'motivo', p_motivo,
            'toneladas_anteriores', v_cantidad_requerida_original,
            'toneladas_nuevas', v_nuevo_total_ton,
            'saldo_anterior', v_saldo_pendiente,
            'saldo_nuevo', v_nuevo_saldo_pendiente,
            'piso_minimo_calzado_ton', v_piso_minimo_ton,
            'productos_anteriores', COALESCE(v_current_data->'productos', '[]'::jsonb),
            'productos_nuevos', p_productos_nuevos
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Pedido actualizado correctamente.',
        'nuevo_total_ton', v_nuevo_total_ton,
        'nuevo_saldo_pendiente', v_nuevo_saldo_pendiente,
        'piso_minimo_ton', v_piso_minimo_ton
    );
END;
$$;

GRANT ALL ON FUNCTION "public"."editar_items_pedido"("p_instancia_id" BIGINT, "p_productos_nuevos" JSONB, "p_motivo" TEXT, "p_usuario_email" TEXT) TO "anon";
GRANT ALL ON FUNCTION "public"."editar_items_pedido"("p_instancia_id" BIGINT, "p_productos_nuevos" JSONB, "p_motivo" TEXT, "p_usuario_email" TEXT) TO "authenticated";
GRANT ALL ON FUNCTION "public"."editar_items_pedido"("p_instancia_id" BIGINT, "p_productos_nuevos" JSONB, "p_motivo" TEXT, "p_usuario_email" TEXT) TO "service_role";
