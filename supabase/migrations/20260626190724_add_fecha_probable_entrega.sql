-- 1. Agregar columnas a la tabla remitos
ALTER TABLE public.remitos 
  ADD COLUMN IF NOT EXISTS fecha_probable_entrega timestamp with time zone,
  ADD COLUMN IF NOT EXISTS mi_sobre_proveedor_preparado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mi_sobre_cliente_preparado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS me_planillas_t48_emitidas boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS me_checklist_enviado_operario boolean DEFAULT false;

-- 2. Modificar get_full_context_by_remito para exponer tipo_mercado en los pedidos
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
                    'cantidad', ri.cantidad,
                    'tipo_mercado', p.tipo_mercado
                )
            ), '[]'::jsonb)
            FROM public.remito_items ri
            JOIN public.pedido_instancias pi ON ri.origen_instance_id = pi.id
            JOIN public.pedidos p ON pi.pedido_id = p.id
            JOIN public.clientes c ON p.cliente_id = c.id
            WHERE ri.remito_id = p_remito_id
        ),
        'catalogos', jsonb_build_object(
            'choferes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre_completo, 'dni', dni, 'telefono', telefono)), '[]'::jsonb) FROM public.choferes),
            'camiones', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'patente', patente, 'tipo', tipo)), '[]'::jsonb) FROM public.camiones),
            'balanzas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre)), '[]'::jsonb) FROM public.lugares_pesaje),
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
                WHERE r.codigo = 'SUP'
            ),
            'operadores', (
                SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre_completo)), '[]'::jsonb) 
                FROM public.personal_ac p
                JOIN public.personal_ac_roles pr ON p.id = pr.personal_ac_id
                JOIN public.roles r ON pr.role_id = r.id
                WHERE r.codigo = 'OP'
            ),
            'tareas_control', (SELECT COALESCE(jsonb_agg(to_jsonb(tc.*) ORDER BY tc.orden_sugerido ASC), '[]'::jsonb) FROM public.catalogo_tareas_control tc)
        )
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- 3. Modificar save_remito_update_admin para procesar actualizaciones y generar logs
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
        VALUES (
            v_pedido_instancia_id, 
            'DATA_UPDATE', 
            CASE 
                WHEN v_campo = 'mi_sobre_proveedor_preparado' THEN 'Sobre para proveedor marcado como ' || CASE WHEN v_valor_nuevo = 'true' THEN 'REALIZADO' ELSE 'PENDIENTE' END
                WHEN v_campo = 'mi_sobre_cliente_preparado' THEN 'Sobre para cliente marcado como ' || CASE WHEN v_valor_nuevo = 'true' THEN 'REALIZADO' ELSE 'PENDIENTE' END
                WHEN v_campo = 'me_planillas_t48_emitidas' THEN 'Planillas T-48 marcadas como ' || CASE WHEN v_valor_nuevo = 'true' THEN 'REALIZADAS' ELSE 'PENDIENTES' END
                WHEN v_campo = 'me_checklist_enviado_operario' THEN 'Checklist enviado al operario marcado como ' || CASE WHEN v_valor_nuevo = 'true' THEN 'REALIZADO' ELSE 'PENDIENTE' END
                WHEN v_campo = 'fecha_probable_entrega' THEN 'Fecha probable de entrega actualizada a: ' || COALESCE(v_valor_nuevo, 'Sin asignar')
                ELSE format('Campo [%s] actualizado desde Dashboard Admin', v_campo)
            END, 
            p_admin_email, 
            jsonb_build_object('campo', v_campo, 'valor', v_valor_nuevo)
        );
    END LOOP;

    UPDATE public.remitos
    SET 
        chofer_id = CASE WHEN p_updates ? 'chofer_id' THEN NULLIF((p_updates->>'chofer_id')::INT, 0) ELSE chofer_id END,
        camion_id = CASE WHEN p_updates ? 'camion_id' THEN NULLIF((p_updates->>'camion_id')::INT, 0) ELSE camion_id END,
        acoplado_id = CASE WHEN p_updates ? 'acoplado_id' THEN NULLIF((p_updates->>'acoplado_id')::INT, 0) ELSE acoplado_id END,
        supervisor_id = CASE WHEN p_updates ? 'supervisor_id' THEN NULLIF((p_updates->>'supervisor_id')::INT, 0) ELSE supervisor_id END,
        operador_id = CASE WHEN p_updates ? 'operador_id' THEN NULLIF((p_updates->>'operador_id')::INT, 0) ELSE operador_id END,
        parent_remito_id = CASE WHEN p_updates ? 'parent_remito_id' THEN NULLIF((p_updates->>'parent_remito_id')::BIGINT, 0) ELSE parent_remito_id END,
        inspector_id = CASE WHEN p_updates ? 'inspector_id' THEN NULLIF((p_updates->>'inspector_id')::INT, 0) ELSE inspector_id END,
        
        instrucciones_texto = CASE WHEN p_updates ? 'instrucciones_texto' THEN p_updates->>'instrucciones_texto' ELSE instrucciones_texto END,
        protocolo_control = CASE WHEN p_updates ? 'protocolo_control' THEN p_updates->'protocolo_control' ELSE protocolo_control END,
        
        tara_pesaje_momento = CASE WHEN p_updates ? 'tara_pesaje_momento' THEN p_updates->>'tara_pesaje_momento' ELSE tara_pesaje_momento END,
        tara_pesaje_lugar_id = CASE WHEN p_updates ? 'tara_pesaje_lugar_id' THEN NULLIF((p_updates->>'tara_pesaje_lugar_id')::INT, 0) ELSE tara_pesaje_lugar_id END,
        bruto_pesaje_momento = CASE WHEN p_updates ? 'bruto_pesaje_momento' THEN p_updates->>'bruto_pesaje_momento' ELSE bruto_pesaje_momento END,
        bruto_pesaje_lugar_id = CASE WHEN p_updates ? 'bruto_pesaje_lugar_id' THEN NULLIF((p_updates->>'bruto_pesaje_lugar_id')::INT, 0) ELSE bruto_pesaje_lugar_id END,
        
        fecha_hora_estimada_carga = CASE WHEN p_updates ? 'fecha_hora_estimada_carga' THEN (p_updates->>'fecha_hora_estimada_carga')::timestamp with time zone ELSE fecha_hora_estimada_carga END,
        debe_pasar_por_reembolse = CASE WHEN p_updates ? 'debe_pasar_por_reembolse' THEN (p_updates->>'debe_pasar_por_reembolse')::boolean ELSE debe_pasar_por_reembolse END,
        es_flete_corto = CASE WHEN p_updates ? 'es_flete_corto' THEN (p_updates->>'es_flete_corto')::boolean ELSE es_flete_corto END,
        
        -- Nuevos campos agregados
        fecha_probable_entrega = CASE WHEN p_updates ? 'fecha_probable_entrega' THEN NULLIF(p_updates->>'fecha_probable_entrega', '')::timestamp with time zone ELSE fecha_probable_entrega END,
        mi_sobre_proveedor_preparado = CASE WHEN p_updates ? 'mi_sobre_proveedor_preparado' THEN (p_updates->>'mi_sobre_proveedor_preparado')::boolean ELSE mi_sobre_proveedor_preparado END,
        mi_sobre_cliente_preparado = CASE WHEN p_updates ? 'mi_sobre_cliente_preparado' THEN (p_updates->>'mi_sobre_cliente_preparado')::boolean ELSE mi_sobre_cliente_preparado END,
        me_planillas_t48_emitidas = CASE WHEN p_updates ? 'me_planillas_t48_emitidas' THEN (p_updates->>'me_planillas_t48_emitidas')::boolean ELSE me_planillas_t48_emitidas END,
        me_checklist_enviado_operario = CASE WHEN p_updates ? 'me_checklist_enviado_operario' THEN (p_updates->>'me_checklist_enviado_operario')::boolean ELSE me_checklist_enviado_operario END,
        
        metadata_extraida = COALESCE(metadata_extraida, '{}'::jsonb) || p_updates,
        updated_at = NOW()
    WHERE id = p_remito_id;

    RETURN jsonb_build_object('status', 'SUCCESS');
END;
$$;

-- 4. Definición de las 6 funciones de validación para el Estado 4
-- VAL_P_404: Fecha probable de entrega
CREATE OR REPLACE FUNCTION public.f_val_p_404(p_instancia_id bigint, p_datos jsonb) RETURNS jsonb 
LANGUAGE plpgsql AS $$
DECLARE
    v_remito_id BIGINT;
    v_fecha TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT r.id, r.fecha_probable_entrega INTO v_remito_id, v_fecha
    FROM public.remito_items ri JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.'); END IF;

    IF v_fecha IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Fecha probable de entrega: ' || to_char(v_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'), 'checked_value', to_jsonb(v_fecha));
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta la fecha probable de entrega.');
    END IF;
END;
$$;

-- VAL_P_mi_401: Sobre para proveedor preparado (MI)
CREATE OR REPLACE FUNCTION public.f_val_p_mi_401(p_instancia_id bigint, p_datos jsonb) RETURNS jsonb 
LANGUAGE plpgsql AS $$
DECLARE
    v_remito_id BIGINT;
    v_val BOOLEAN;
BEGIN
    SELECT r.id, r.mi_sobre_proveedor_preparado INTO v_remito_id, v_val
    FROM public.remito_items ri JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.'); END IF;

    IF COALESCE(v_val, false) = true THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Sobre para proveedor preparado.', 'checked_value', true);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta preparar el sobre para el proveedor.');
    END IF;
END;
$$;

-- VAL_P_mi_402: Sobre para cliente preparado (MI)
CREATE OR REPLACE FUNCTION public.f_val_p_mi_402(p_instancia_id bigint, p_datos jsonb) RETURNS jsonb 
LANGUAGE plpgsql AS $$
DECLARE
    v_remito_id BIGINT;
    v_val BOOLEAN;
BEGIN
    SELECT r.id, r.mi_sobre_cliente_preparado INTO v_remito_id, v_val
    FROM public.remito_items ri JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.'); END IF;

    IF COALESCE(v_val, false) = true THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Sobre para cliente preparado.', 'checked_value', true);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta preparar el sobre para el cliente.');
    END IF;
END;
$$;

-- VAL_P_me_401: Emisión planillas T-48 (ME)
CREATE OR REPLACE FUNCTION public.f_val_p_me_401(p_instancia_id bigint, p_datos jsonb) RETURNS jsonb 
LANGUAGE plpgsql AS $$
DECLARE
    v_remito_id BIGINT;
    v_val BOOLEAN;
BEGIN
    SELECT r.id, r.me_planillas_t48_emitidas INTO v_remito_id, v_val
    FROM public.remito_items ri JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.'); END IF;

    IF COALESCE(v_val, false) = true THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Planillas T-48 emitidas.', 'checked_value', true);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta emitir las planillas T-48.');
    END IF;
END;
$$;

-- VAL_P_me_402: Checklist enviado al operario (ME)
CREATE OR REPLACE FUNCTION public.f_val_p_me_402(p_instancia_id bigint, p_datos jsonb) RETURNS jsonb 
LANGUAGE plpgsql AS $$
DECLARE
    v_remito_id BIGINT;
    v_val BOOLEAN;
BEGIN
    SELECT r.id, r.me_checklist_enviado_operario INTO v_remito_id, v_val
    FROM public.remito_items ri JOIN public.remitos r ON ri.remito_id = r.id
    WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id) AND ri.origen_type = 'PEDIDO' LIMIT 1;

    IF v_remito_id IS NULL THEN RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado.'); END IF;

    IF COALESCE(v_val, false) = true THEN
        RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Checklist enviado al operario.', 'checked_value', true);
    ELSE
        RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Falta enviar el checklist al operario.');
    END IF;
END;
$$;

-- VAL_P_403: Alerta remito electrónico (Opcional - No bloqueante)
CREATE OR REPLACE FUNCTION public.f_val_p_403(p_instancia_id bigint, p_datos jsonb) RETURNS jsonb 
LANGUAGE plpgsql AS $$
BEGIN
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Alerta de remito electrónico confirmada (implicito).', 'checked_value', true);
END;
$$;

-- 5. Otorgar permisos de ejecución para las 6 funciones
GRANT ALL ON FUNCTION public.f_val_p_404(bigint, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.f_val_p_mi_401(bigint, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.f_val_p_mi_402(bigint, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.f_val_p_me_401(bigint, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.f_val_p_me_402(bigint, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.f_val_p_403(bigint, jsonb) TO anon, authenticated, service_role;

-- 6. Insertar definición de validación para la fecha probable de entrega en el catálogo
INSERT INTO public.validation_definitions (validation_code, name, description, is_blocking)
VALUES ('VAL_P_404', 'Fecha probable de entrega (Transporte)', 'Verifica que esté definida la fecha probable de entrega en el remito.', true)
ON CONFLICT (validation_code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, is_blocking = EXCLUDED.is_blocking;

-- 7. Mapear el nuevo requisito al Estado 4
INSERT INTO public.state_validation_requirements (state_id, validation_id)
VALUES (
    (SELECT id FROM public.state_definitions WHERE state_code = '4' AND fsm_id = 1),
    (SELECT id FROM public.validation_definitions WHERE validation_code = 'VAL_P_404')
) ON CONFLICT DO NOTHING;

-- 8. Registrar la transición de FSM ON_ALL_SUCCESS desde Estado 4 hacia Estado 5
INSERT INTO public.fsm_transitions (from_state_id, to_state_id, trigger_type, priority)
VALUES (
    (SELECT id FROM public.state_definitions WHERE state_code = '4' AND fsm_id = 1),
    (SELECT id FROM public.state_definitions WHERE state_code = '5' AND fsm_id = 1),
    'ON_ALL_SUCCESS',
    1
) ON CONFLICT DO NOTHING;;
