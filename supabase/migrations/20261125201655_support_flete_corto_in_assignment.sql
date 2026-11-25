-- Migración: Soporte de asignación de Fletes Cortos a Remitos Largos
-- 1. Ampliación de constraint origen_type en remito_items
ALTER TABLE public.remito_items DROP CONSTRAINT IF EXISTS remito_items_origen_type_check;
ALTER TABLE public.remito_items ADD CONSTRAINT remito_items_origen_type_check 
  CHECK (origen_type = ANY (ARRAY['PEDIDO'::text, 'OC'::text, 'FLETE_CORTO'::text]));

-- 2. Actualizar ejecutar_asignacion_remito para soportar p_origen_type = 'FLETE_CORTO'
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
    v_total_ya_asignado NUMERIC := 0;
    v_nuevo_estado_remito TEXT;
    v_short_remito RECORD;
BEGIN
    SELECT * INTO v_remito_data FROM public.remitos WHERE id = p_remito_id;
    IF v_remito_data.id IS NULL THEN 
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Remito no encontrado.'); 
    END IF;

    -- Validar si el remito ya fue completado en su totalidad
    SELECT COALESCE(SUM(cantidad), 0) INTO v_total_ya_asignado 
    FROM public.remito_items 
    WHERE remito_id = p_remito_id;

    IF v_total_ya_asignado >= v_remito_data.cantidad_total THEN 
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'El remito ya fue asignado en su totalidad.'); 
    END IF;

    IF p_origen_type = 'PEDIDO' THEN
        SELECT pi.saldo_pendiente, pi.current_data, pi.pedido_id, pi.identificador_compuesto, p.tipo_mercado, sd.state_code
        INTO v_saldo_actual, v_parent_data, v_pedido_id_raiz, v_identificador_padre, v_tipo_mercado, v_origen_state_code
        FROM pedido_instancias pi 
        JOIN pedidos p ON pi.pedido_id = p.id 
        LEFT JOIN state_definitions sd ON pi.current_state_id = sd.id
        WHERE pi.id = p_origen_instance_id;

        IF v_origen_state_code = '5.5' THEN
            v_nuevo_estado_code := '5.1';
            v_es_origen_reembolse := true;
        ELSIF v_tipo_mercado = 'MI' THEN 
            v_nuevo_estado_code := '3.2'; 
        ELSE 
            v_nuevo_estado_code := '3.1.5'; 
        END IF;

        SELECT id INTO v_nuevo_estado_id FROM state_definitions WHERE (fsm_id=1 OR fsm_id=2) AND state_code=v_nuevo_estado_code LIMIT 1;

    ELSIF p_origen_type = 'OC' THEN
        SELECT oi.cantidad_disponible, oi.current_data, oi.oc_id, oi.identificador_compuesto, oc.tipo_operatoria
        INTO v_saldo_actual, v_parent_data, v_oc_id_raiz, v_identificador_padre, v_tipo_mercado
        FROM oc_instancias oi JOIN ordenes_compra oc ON oi.oc_id = oc.id WHERE oi.id = p_origen_instance_id;
        v_nuevo_estado_code := '2.6';

        SELECT id INTO v_nuevo_estado_id FROM state_definitions WHERE (fsm_id=1 OR fsm_id=2) AND state_code=v_nuevo_estado_code LIMIT 1;

    ELSIF p_origen_type = 'FLETE_CORTO' THEN
        SELECT r.id, r.cantidad_total, r.remito_ref_externa, r.parent_remito_id, r.es_flete_corto, r.deposito_carga_id, r.deposito_descarga_id
        INTO v_short_remito
        FROM public.remitos r
        WHERE r.id = p_origen_instance_id;

        IF v_short_remito.id IS NULL THEN
            RETURN jsonb_build_object('status', 'ERROR', 'message', 'Flete Corto no encontrado.');
        END IF;

        IF v_short_remito.parent_remito_id IS NOT NULL AND v_short_remito.parent_remito_id <> p_remito_id THEN
            RETURN jsonb_build_object('status', 'ERROR', 'message', 'El Flete Corto ya fue vinculado al remito #' || v_short_remito.parent_remito_id);
        END IF;

        v_saldo_actual := v_short_remito.cantidad_total;
        v_identificador_padre := 'FC_' || v_short_remito.remito_ref_externa;
        v_nuevo_estado_code := 'CONSOLIDADO';
    ELSE
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Tipo de origen no soportado: ' || p_origen_type);
    END IF;

    IF v_saldo_actual < p_cantidad_asignada THEN 
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Saldo insuficiente en ' || p_origen_type || '.'); 
    END IF;

    v_saldo_final_madre := v_saldo_actual - p_cantidad_asignada;
    
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

        v_identificador_nuevo := COALESCE(v_identificador_padre, 'ROOT') || '_REM-' || v_remito_data.remito_ref_externa || '_' || v_nueva_instancia_id;
        UPDATE pedido_instancias SET identificador_compuesto = v_identificador_nuevo WHERE id = v_nueva_instancia_id;

    ELSIF p_origen_type = 'OC' THEN 
        INSERT INTO oc_instancias (oc_id, parent_instance_id, current_state_id, cantidad_total, cantidad_disponible, status, current_data) 
        VALUES (v_oc_id_raiz, p_origen_instance_id, v_nuevo_estado_id, p_cantidad_asignada, p_cantidad_asignada, 'ACTIVA'::instance_status, v_parent_data) 
        RETURNING id INTO v_nueva_instancia_id;

        UPDATE oc_instancias 
        SET cantidad_disponible = v_saldo_final_madre,
            status = CASE WHEN v_saldo_final_madre <= 0 THEN 'COMPLETADA'::instance_status ELSE 'ACTIVA'::instance_status END
        WHERE id = p_origen_instance_id;
        
        INSERT INTO historial_eventos (oc_instance_id, event_type, description, user_actor, details)
        VALUES (v_nueva_instancia_id, 'STATE_TRANSITION', 'Nueva instancia generada por Remito ' || v_remito_data.remito_ref_externa, 'SISTEMA', jsonb_build_object('from_state', 'NEW', 'to_state', v_nuevo_estado_code));

        v_identificador_nuevo := COALESCE(v_identificador_padre, 'ROOT') || '_REM-' || v_remito_data.remito_ref_externa || '_' || v_nueva_instancia_id;
        UPDATE oc_instancias SET identificador_compuesto = v_identificador_nuevo WHERE id = v_nueva_instancia_id; 

    ELSIF p_origen_type = 'FLETE_CORTO' THEN
        -- Asentar el parent_remito_id en el Flete Corto para vincular padre-hijo
        UPDATE public.remitos
        SET parent_remito_id = p_remito_id,
            updated_at = NOW()
        WHERE id = p_origen_instance_id;

        v_nueva_instancia_id := p_origen_instance_id;
        v_identificador_nuevo := 'FC_' || v_short_remito.remito_ref_externa || '_CONSOLIDADO_EN_' || v_remito_data.remito_ref_externa;

        INSERT INTO public.historial_eventos (
            event_type,
            description,
            user_actor,
            details
        ) VALUES (
            'STATE_TRANSITION',
            'Flete Corto #' || v_short_remito.remito_ref_externa || ' consolidado en Remito Troncal #' || v_remito_data.remito_ref_externa || ' por ' || p_cantidad_asignada || ' TN',
            'SISTEMA',
            jsonb_build_object(
                'flete_corto_id', p_origen_instance_id,
                'remito_troncal_id', p_remito_id,
                'cantidad', p_cantidad_asignada
            )
        );
    END IF;

    INSERT INTO remito_items (remito_id, origen_type, origen_instance_id, destino_instance_id, cantidad) 
    VALUES (p_remito_id, p_origen_type, p_origen_instance_id, v_nueva_instancia_id, p_cantidad_asignada);

    -- Si completó el total pasa a 'ASIGNADO', de lo contrario permanece en 'PENDIENTE'
    IF (v_total_ya_asignado + p_cantidad_asignada) >= (v_remito_data.cantidad_total - 0.01) THEN
        v_nuevo_estado_remito := 'ASIGNADO';
    ELSE
        v_nuevo_estado_remito := 'PENDIENTE';
    END IF;

    IF v_es_origen_reembolse OR COALESCE(v_remito_data.tipo_flete, '') = 'LARGO_FINAL' THEN
        UPDATE public.remitos 
        SET estado_asignacion = v_nuevo_estado_remito,
            tipo_flete = COALESCE(tipo_flete, 'LARGO_FINAL'),
            gf_pago_aprobado = true,
            gf_pago_aprobado_at = NOW(),
            gf_pago_aprobado_por = 'Sistema (Superado en Reembolse)'
        WHERE id = p_remito_id;
    ELSE
        UPDATE public.remitos SET estado_asignacion = v_nuevo_estado_remito WHERE id = p_remito_id;
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

-- 3. Actualizar ejecutar_asignacion_manual_remito para admitir 'FLETE_CORTO'
DROP FUNCTION IF EXISTS public.ejecutar_asignacion_manual_remito(bigint, jsonb, text, boolean);

CREATE OR REPLACE FUNCTION public.ejecutar_asignacion_manual_remito(
    p_remito_id bigint,
    p_asignaciones jsonb,
    p_usuario_email text DEFAULT 'desconocido'::text,
    p_forzar_diferencia boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_remito RECORD;
    v_items_count INT;
    v_total_asignado NUMERIC := 0;
    v_diferencia NUMERIC := 0;
    v_item RECORD;
    v_res JSONB;
    v_nueva_inst_id BIGINT;
    v_items_procesados JSONB := '[]'::jsonb;
BEGIN
    -- 1. Verificar existencia del remito
    SELECT * INTO v_remito FROM public.remitos WHERE id = p_remito_id;
    IF v_remito.id IS NULL THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'El remito indicado no existe.');
    END IF;

    -- 2. Verificar que no esté finalizado
    IF v_remito.estado_asignacion = 'FINALIZADO' OR v_remito.mision_estado = 'MISION_COMPLETADA' THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'El remito ya se encuentra finalizado y no puede ser modificado.');
    END IF;

    -- 3. Verificar que no tenga ya ítems vinculados
    SELECT COUNT(*) INTO v_items_count FROM public.remito_items WHERE remito_id = p_remito_id;
    IF v_items_count > 0 THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'El remito ya posee pedidos u órdenes de compra vinculadas.');
    END IF;

    -- 4. Validar que vengan asignaciones
    IF p_asignaciones IS NULL OR jsonb_array_length(p_asignaciones) = 0 THEN
        RETURN jsonb_build_object('status', 'ERROR', 'message', 'Debe seleccionar al menos una opción para asignar.');
    END IF;

    -- 5. Validar cada ítem y calcular total
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_asignaciones) AS x(origen_type text, origen_instance_id bigint, cantidad numeric)
    LOOP
        IF v_item.origen_type NOT IN ('PEDIDO', 'OC', 'FLETE_CORTO') THEN
            RETURN jsonb_build_object('status', 'ERROR', 'message', 'Tipo de origen no válido: ' || COALESCE(v_item.origen_type, 'NULL'));
        END IF;

        IF v_item.origen_instance_id IS NULL THEN
            RETURN jsonb_build_object('status', 'ERROR', 'message', 'Falta identificar la instancia origen a asignar.');
        END IF;

        IF v_item.cantidad IS NULL OR v_item.cantidad <= 0 THEN
            RETURN jsonb_build_object('status', 'ERROR', 'message', 'La cantidad asignada para cada opción debe ser mayor a 0 Ton.');
        END IF;

        v_total_asignado := v_total_asignado + v_item.cantidad;
    END LOOP;

    -- 6. Validar diferencia contra cantidad del remito
    v_diferencia := v_total_asignado - COALESCE(v_remito.cantidad_total, 0);
    IF abs(v_diferencia) > 0.01 AND NOT p_forzar_diferencia THEN
        RETURN jsonb_build_object(
            'status', 'DIFERENCIA_DETECTADA',
            'message', 'Las cantidades asignadas (' || v_total_asignado || ' Ton) no coinciden con el total del remito (' || COALESCE(v_remito.cantidad_total, 0) || ' Ton).',
            'cantidad_remito', v_remito.cantidad_total,
            'cantidad_asignada', v_total_asignado,
            'diferencia', v_diferencia
        );
    END IF;

    -- 7. Ejecutar asignaciones individuales
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_asignaciones) AS x(origen_type text, origen_instance_id bigint, cantidad numeric)
    LOOP
        v_res := public.ejecutar_asignacion_remito(p_remito_id, v_item.origen_type, v_item.origen_instance_id, v_item.cantidad);
        IF (v_res->>'status') <> 'SUCCESS' THEN
            RAISE EXCEPTION 'Fallo al procesar asignación: %', (v_res->>'message');
        END IF;

        v_nueva_inst_id := (v_res->>'nueva_instancia_id')::bigint;
        v_items_procesados := v_items_procesados || jsonb_build_array(v_res);

        -- Registrar en historial_eventos para auditoría de trazabilidad
        IF v_item.origen_type = 'PEDIDO' THEN
            INSERT INTO public.historial_eventos (
                pedido_instance_id,
                event_type,
                description,
                user_actor,
                details
            ) VALUES (
                v_nueva_inst_id,
                'MANUAL_OVERRIDE'::event_type,
                'Asignación manual de remito #' || v_remito.remito_ref_externa || ' por ' || p_usuario_email,
                p_usuario_email,
                jsonb_build_object(
                    'remito_id', p_remito_id,
                    'remito_ref', v_remito.remito_ref_externa,
                    'cantidad_asignada_item', v_item.cantidad,
                    'total_asignado_remito', v_total_asignado,
                    'total_declarado_remito', v_remito.cantidad_total,
                    'diferencia_total', v_diferencia,
                    'asignacion_manual', true
                )
            );
        ELSIF v_item.origen_type = 'OC' THEN
            INSERT INTO public.historial_eventos (
                oc_instance_id,
                event_type,
                description,
                user_actor,
                details
            ) VALUES (
                v_nueva_inst_id,
                'MANUAL_OVERRIDE'::event_type,
                'Asignación manual de remito #' || v_remito.remito_ref_externa || ' por ' || p_usuario_email,
                p_usuario_email,
                jsonb_build_object(
                    'remito_id', p_remito_id,
                    'remito_ref', v_remito.remito_ref_externa,
                    'cantidad_asignada_item', v_item.cantidad,
                    'total_asignado_remito', v_total_asignado,
                    'total_declarado_remito', v_remito.cantidad_total,
                    'diferencia_total', v_diferencia,
                    'asignacion_manual', true
                )
            );
        ELSE -- FLETE_CORTO
            INSERT INTO public.historial_eventos (
                event_type,
                description,
                user_actor,
                details
            ) VALUES (
                'MANUAL_OVERRIDE'::event_type,
                'Asignación manual de Flete Corto a Remito #' || v_remito.remito_ref_externa || ' por ' || p_usuario_email,
                p_usuario_email,
                jsonb_build_object(
                    'remito_id', p_remito_id,
                    'remito_ref', v_remito.remito_ref_externa,
                    'flete_corto_id', v_item.origen_instance_id,
                    'cantidad_asignada_item', v_item.cantidad,
                    'total_asignado_remito', v_total_asignado,
                    'total_declarado_remito', v_remito.cantidad_total,
                    'diferencia_total', v_diferencia,
                    'asignacion_manual', true
                )
            );
        END IF;
    END LOOP;

    -- 8. Actualizar remito con metadata de asignación manual
    UPDATE public.remitos
    SET estado_asignacion = 'ASIGNADO',
        metadata_extraida = jsonb_set(
            COALESCE(metadata_extraida, '{}'::jsonb),
            '{asignacion_manual}',
            jsonb_build_object(
                'asignado_por', p_usuario_email,
                'fecha', NOW(),
                'cantidad_remito', v_remito.cantidad_total,
                'cantidad_asignada', v_total_asignado,
                'diferencia', v_diferencia,
                'items_count', jsonb_array_length(p_asignaciones)
            ),
            true
        ),
        updated_at = NOW()
    WHERE id = p_remito_id;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'message', 'Asignación completada exitosamente.',
        'remito_id', p_remito_id,
        'total_asignado', v_total_asignado,
        'diferencia', v_diferencia,
        'items', v_items_procesados
    );
END;
$function$;

-- 4. Actualizar get_candidatos_para_remito(numeric) para incluir Fletes Cortos
DROP FUNCTION IF EXISTS public.get_candidatos_para_remito(numeric);

CREATE OR REPLACE FUNCTION public.get_candidatos_para_remito(p_cantidad_remito numeric)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_grupos_validos jsonb := '[]'::jsonb;
    v_grupos_insuficientes jsonb := '[]'::jsonb;
BEGIN
    WITH base_data AS (
        -- 1. Pedidos en 3.1.1 (Esperando Remito) con saldo > 0
        SELECT 
            'PEDIDO' as tipo,
            pi.id as id,
            pi.identificador_compuesto as ref,
            pi.saldo_pendiente as saldo,
            COALESCE(oi.current_data->>'lugar_carga', 'Origen No Especificado') as origen_nombre,
            COALESCE(pi.current_data->>'cliente_nombre', 'Cliente Desconocido') as entidad_nombre,
            false as es_reembolse,
            '3.1.1' as estado_codigo
        FROM pedido_instancias pi
        JOIN vinculaciones_pedido_oc v ON v.pedido_instance_id = pi.id
        JOIN oc_instancias oi ON oi.id = v.oc_instance_id
        JOIN state_definitions sd ON pi.current_state_id = sd.id
        WHERE sd.state_code = '3.1.1' 
          AND pi.status = 'ACTIVA'
          AND pi.saldo_pendiente > 0
        
        UNION ALL

        -- 2. Pedidos en 5.5 (Reembolse - Flete Largo pendiente) con saldo > 0
        SELECT 
            'PEDIDO' as tipo,
            pi.id as id,
            pi.identificador_compuesto as ref,
            pi.saldo_pendiente as saldo,
            COALESCE(d_reembolse.nombre, 'Planta Reembolse Desconocida') as origen_nombre,
            COALESCE(pi.current_data->>'cliente_nombre', 'Cliente Desconocido') as entidad_nombre,
            true as es_reembolse,
            '5.5' as estado_codigo
        FROM pedido_instancias pi
        JOIN state_definitions sd ON pi.current_state_id = sd.id
        LEFT JOIN LATERAL (
            SELECT COALESCE(d.nombre, 'Planta Reembolse Desconocida') as nombre
            FROM remito_items ri
            JOIN remitos r ON r.id = ri.remito_id
            LEFT JOIN depositos d ON d.id = COALESCE(r.deposito_descarga_id, r.deposito_intermedio_id)
            WHERE ri.destino_instance_id = pi.id OR ri.origen_instance_id = pi.parent_instance_id
            ORDER BY ri.created_at DESC
            LIMIT 1
        ) d_reembolse ON true
        WHERE sd.state_code = '5.5'
          AND pi.status = 'ACTIVA'
          AND pi.saldo_pendiente > 0
        
        UNION ALL
        
        -- 3. OCs en 2 (Disponibles) con saldo > 0
        SELECT 
            'OC' as tipo,
            oi.id as id,
            COALESCE(oi.identificador_compuesto, (SELECT oc_ref_externa FROM ordenes_compra WHERE id = oi.oc_id)) as ref,
            oi.cantidad_disponible as saldo,
            COALESCE(oi.current_data->>'lugar_carga', 'Origen No Especificado') as origen_nombre,
            COALESCE(oi.current_data->'proveedor'->>'razon_social', 'Proveedor Desconocido') as entidad_nombre,
            false as es_reembolse,
            '2' as estado_codigo
        FROM oc_instancias oi
        JOIN state_definitions sd ON oi.current_state_id = sd.id
        WHERE sd.state_code = '2' 
          AND oi.status = 'ACTIVA'
          AND oi.cantidad_disponible > 0

        UNION ALL

        -- 4. Fletes Cortos disponibles para consolidar (es_flete_corto = true AND parent_remito_id IS NULL)
        SELECT 
            'FLETE_CORTO' as tipo,
            r.id as id,
            r.remito_ref_externa as ref,
            r.cantidad_total as saldo,
            COALESCE(d_descarga.nombre, 'Planta Consolidación') as origen_nombre,
            'Flete Corto (' || COALESCE(ch.nombre_completo, 'Chofer') || ' - ' || COALESCE(d_carga.nombre, 'Origen') || ')' as entidad_nombre,
            false as es_reembolse,
            'FLETE_CORTO' as estado_codigo
        FROM public.remitos r
        LEFT JOIN public.depositos d_descarga ON d_descarga.id = r.deposito_descarga_id
        LEFT JOIN public.depositos d_carga ON d_carga.id = r.deposito_carga_id
        LEFT JOIN public.choferes ch ON ch.id = r.chofer_id
        WHERE r.es_flete_corto = true
          AND r.parent_remito_id IS NULL
          AND r.estado_asignacion <> 'ANULADO'
          AND r.cantidad_total > 0
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
                'entidad', entidad_nombre,
                'es_reembolse', es_reembolse,
                'estado_codigo', estado_codigo
            )) as items
        FROM base_data
        GROUP BY origen_nombre
        HAVING SUM(saldo) > 0
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
$function$;

-- 5. Actualizar get_candidatos_para_remito() (sin parámetros)
DROP FUNCTION IF EXISTS public.get_candidatos_para_remito();

CREATE OR REPLACE FUNCTION public.get_candidatos_para_remito()
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_pedidos jsonb;
    v_ocs jsonb;
    v_fletes jsonb;
BEGIN
    -- 1. Buscar Pedidos en Estado 3.1.1 (Esperando Remitos) con saldo > 0
    SELECT jsonb_agg(
        jsonb_build_object(
            'tipo', 'PEDIDO',
            'id', pi.id,
            'identificador', pi.identificador_compuesto,
            'saldo_ton', pi.saldo_pendiente,
            'cliente', (SELECT c.razon_social FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = pi.pedido_id)
        )
    ) INTO v_pedidos
    FROM pedido_instancias pi
    JOIN state_definitions sd ON pi.current_state_id = sd.id
    WHERE sd.state_code = '3.1.1' 
      AND pi.status = 'ACTIVA'
      AND pi.saldo_pendiente > 0;

    -- 2. Buscar OCs en Estado 2 (Disponible) con saldo > 0
    SELECT jsonb_agg(
        jsonb_build_object(
            'tipo', 'OC',
            'id', oi.id,
            'identificador', COALESCE(oi.identificador_compuesto, oc.oc_ref_externa),
            'saldo_ton', oi.cantidad_disponible,
            'proveedor', (SELECT razon_social FROM proveedores WHERE id = oc.proveedor_id)
        )
    ) INTO v_ocs
    FROM oc_instancias oi
    JOIN state_definitions sd ON oi.current_state_id = sd.id
    JOIN ordenes_compra oc ON oi.oc_id = oc.id
    WHERE sd.state_code = '2' 
      AND oi.status = 'ACTIVA'
      AND oi.cantidad_disponible > 0;

    -- 3. Buscar Fletes Cortos disponibles
    SELECT jsonb_agg(
        jsonb_build_object(
            'tipo', 'FLETE_CORTO',
            'id', r.id,
            'identificador', r.remito_ref_externa,
            'saldo_ton', r.cantidad_total,
            'entidad', 'Flete Corto (' || COALESCE(ch.nombre_completo, 'Chofer') || ')'
        )
    ) INTO v_fletes
    FROM public.remitos r
    LEFT JOIN public.choferes ch ON ch.id = r.chofer_id
    WHERE r.es_flete_corto = true
      AND r.parent_remito_id IS NULL
      AND r.estado_asignacion <> 'ANULADO'
      AND r.cantidad_total > 0;

    RETURN jsonb_build_object(
        'pedidos_candidatos', COALESCE(v_pedidos, '[]'::jsonb),
        'ocs_candidatas', COALESCE(v_ocs, '[]'::jsonb),
        'fletes_cortos_candidatos', COALESCE(v_fletes, '[]'::jsonb)
    );
END;
$function$;
