-- Agregar columnas a la tabla remitos si no existen
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'remitos' AND column_name = 'fecha_hora_estimada_carga') THEN
        ALTER TABLE "public"."remitos" ADD COLUMN "fecha_hora_estimada_carga" timestamp with time zone;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'remitos' AND column_name = 'debe_pasar_por_reembolse') THEN
        ALTER TABLE "public"."remitos" ADD COLUMN "debe_pasar_por_reembolse" boolean DEFAULT false;
    END IF;
END $$;

-- Actualizar la función RPC para soportar los nuevos campos
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
        chofer_id = CASE WHEN p_updates ? 'chofer_id' THEN NULLIF((p_updates->>'chofer_id')::INT, 0) ELSE chofer_id END,
        camion_id = CASE WHEN p_updates ? 'camion_id' THEN NULLIF((p_updates->>'camion_id')::INT, 0) ELSE camion_id END,
        acoplado_id = CASE WHEN p_updates ? 'acoplado_id' THEN NULLIF((p_updates->>'acoplado_id')::INT, 0) ELSE acoplado_id END,
        supervisor_id = CASE WHEN p_updates ? 'supervisor_id' THEN NULLIF((p_updates->>'supervisor_id')::INT, 0) ELSE supervisor_id END,
        parent_remito_id = CASE WHEN p_updates ? 'parent_remito_id' THEN NULLIF((p_updates->>'parent_remito_id')::BIGINT, 0) ELSE parent_remito_id END,
        inspector_id = CASE WHEN p_updates ? 'inspector_id' THEN NULLIF((p_updates->>'inspector_id')::INT, 0) ELSE inspector_id END,
        
        instrucciones_texto = CASE WHEN p_updates ? 'instrucciones_texto' THEN p_updates->>'instrucciones_texto' ELSE instrucciones_texto END,
        protocolo_control = CASE WHEN p_updates ? 'protocolo_control' THEN p_updates->'protocolo_control' ELSE protocolo_control END,
        
        tara_pesaje_momento = CASE WHEN p_updates ? 'tara_pesaje_momento' THEN p_updates->>'tara_pesaje_momento' ELSE tara_pesaje_momento END,
        tara_pesaje_lugar_id = CASE WHEN p_updates ? 'tara_pesaje_lugar_id' THEN NULLIF((p_updates->>'tara_pesaje_lugar_id')::INT, 0) ELSE tara_pesaje_lugar_id END,
        bruto_pesaje_momento = CASE WHEN p_updates ? 'bruto_pesaje_momento' THEN p_updates->>'bruto_pesaje_momento' ELSE bruto_pesaje_momento END,
        bruto_pesaje_lugar_id = CASE WHEN p_updates ? 'bruto_pesaje_lugar_id' THEN NULLIF((p_updates->>'bruto_pesaje_lugar_id')::INT, 0) ELSE bruto_pesaje_lugar_id END,
        
        -- Nuevos campos
        fecha_hora_estimada_carga = CASE WHEN p_updates ? 'fecha_hora_estimada_carga' THEN (p_updates->>'fecha_hora_estimada_carga')::timestamp with time zone ELSE fecha_hora_estimada_carga END,
        debe_pasar_por_reembolse = CASE WHEN p_updates ? 'debe_pasar_por_reembolse' THEN (p_updates->>'debe_pasar_por_reembolse')::boolean ELSE debe_pasar_por_reembolse END,
        
        metadata_extraida = COALESCE(metadata_extraida, '{}'::jsonb) || p_updates,
        updated_at = NOW()
    WHERE id = p_remito_id;

    RETURN jsonb_build_object('status', 'SUCCESS');
END;
$$;
