-- Migration: Implement State 6 validation functions, FSM transitions 6->7, 5.5->6, 5.7->7, and auto-advance
-- 1. Función f_val_p_601: Remito conformado recibido (Entrega)
CREATE OR REPLACE FUNCTION public.f_val_p_601(p_instancia_id bigint, p_json_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remito RECORD;
  v_has_conformado BOOLEAN := false;
BEGIN
  SELECT r.id, r.mision_estado, r.protocolo_control, r.archivo_url
  INTO v_remito
  FROM public.remito_items ri
  JOIN public.remitos r ON ri.remito_id = r.id
  WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id)
    AND ri.origen_type = 'PEDIDO'
  LIMIT 1;

  IF v_remito.id IS NULL THEN
    RETURN jsonb_build_object('status', 'FAILURE', 'message', 'No hay remito asociado a esta instancia.');
  END IF;

  -- Se considera recibido si la misión está en CONTROL_ENTREGA / MISION_COMPLETADA o si la tarea del remito firmado tiene evidencia/reporte
  IF v_remito.mision_estado IN ('CONTROL_ENTREGA', 'MISION_COMPLETADA') THEN
    v_has_conformado := true;
  ELSIF v_remito.protocolo_control IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(v_remito.protocolo_control) elem
      WHERE (elem->>'estado_id' = 'CONTROL_ENTREGA' OR (elem->>'id')::int = 13)
        AND (
          elem->>'estado' IN ('REPORTADO_CHOFER', 'COMPLETADO') 
          OR elem->>'valor_reportado_chofer' IS NOT NULL 
          OR (elem->>'done')::boolean = true
        )
    ) INTO v_has_conformado;
  END IF;

  IF v_has_conformado THEN
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Remito conformado/firmado verificado y recibido en destino.');
  ELSE
    RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Pendiente recepción de foto del remito conformado por el chofer/cliente.');
  END IF;
END;
$$;

-- 2. Función f_val_p_602: Validación número de remito (Entrega)
CREATE OR REPLACE FUNCTION public.f_val_p_602(p_instancia_id bigint, p_json_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ref TEXT;
BEGIN
  SELECT r.remito_ref_externa INTO v_ref
  FROM public.remito_items ri
  JOIN public.remitos r ON ri.remito_id = r.id
  WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id)
    AND ri.origen_type = 'PEDIDO'
  LIMIT 1;

  IF v_ref IS NOT NULL AND v_ref <> '' THEN
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Número de remito verificado (' || v_ref || ').');
  ELSE
    RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Número de remito externo no asignado.');
  END IF;
END;
$$;

-- 3. Función f_val_p_603: Identificación contacto cliente (Entrega)
CREATE OR REPLACE FUNCTION public.f_val_p_603(p_instancia_id bigint, p_json_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cliente TEXT;
BEGIN
  SELECT COALESCE(r.cliente, r.metadata_extraida->>'razon_social', p.razon_social) INTO v_cliente
  FROM public.remito_items ri
  JOIN public.remitos r ON ri.remito_id = r.id
  JOIN public.pedido_instancias pi ON pi.id = p_instancia_id
  JOIN public.pedidos p ON pi.pedido_id = p.id
  WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id)
    AND ri.origen_type = 'PEDIDO'
  LIMIT 1;

  IF v_cliente IS NOT NULL AND v_cliente <> '' THEN
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Contacto de cliente identificado (' || v_cliente || ').');
  ELSE
    RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Contacto de cliente no identificado.');
  END IF;
END;
$$;

-- 4. Función f_val_p_604: Fecha de entrega estimada (Entrega) [Opcional]
CREATE OR REPLACE FUNCTION public.f_val_p_604(p_instancia_id bigint, p_json_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fecha TEXT;
BEGIN
  SELECT COALESCE(r.fecha_probable_entrega::text, r.fecha_hora_estimada_carga::text) INTO v_fecha
  FROM public.remito_items ri
  JOIN public.remitos r ON ri.remito_id = r.id
  WHERE (ri.destino_instance_id = p_instancia_id OR ri.origen_instance_id = p_instancia_id)
    AND ri.origen_type = 'PEDIDO'
  LIMIT 1;

  IF v_fecha IS NOT NULL AND v_fecha <> '' THEN
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Fecha probable de entrega registrada (' || v_fecha || ').');
  ELSE
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Fecha de entrega opcional no especificada.');
  END IF;
END;
$$;

-- Otorgar permisos
GRANT ALL ON FUNCTION public.f_val_p_601(bigint, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.f_val_p_602(bigint, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.f_val_p_603(bigint, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.f_val_p_604(bigint, jsonb) TO anon, authenticated, service_role;

-- 5. Insertar transiciones FSM faltantes en fsm_transitions
-- 6 -> 7 (ON_ALL_SUCCESS)
INSERT INTO public.fsm_transitions (from_state_id, to_state_id, trigger_type, priority)
SELECT s6.id, s7.id, 'ON_ALL_SUCCESS', 1
FROM public.state_definitions s6
JOIN public.state_definitions s7 ON s7.state_code = '7' AND s7.fsm_id = 1
WHERE s6.state_code = '6' AND s6.fsm_id = 1
ON CONFLICT DO NOTHING;

-- 5.5 -> 6 (ON_ALL_SUCCESS)
INSERT INTO public.fsm_transitions (from_state_id, to_state_id, trigger_type, priority)
SELECT s55.id, s6.id, 'ON_ALL_SUCCESS', 1
FROM public.state_definitions s55
JOIN public.state_definitions s6 ON s6.state_code = '6' AND s6.fsm_id = 1
WHERE s55.state_code = '5.5' AND s55.fsm_id = 1
ON CONFLICT DO NOTHING;

-- 5.7 -> 7 (ON_ALL_SUCCESS)
INSERT INTO public.fsm_transitions (from_state_id, to_state_id, trigger_type, priority)
SELECT s57.id, s7.id, 'ON_ALL_SUCCESS', 1
FROM public.state_definitions s57
JOIN public.state_definitions s7 ON s7.state_code = '7' AND s7.fsm_id = 1
WHERE s57.state_code = '5.7' AND s57.fsm_id = 1
ON CONFLICT DO NOTHING;

-- 6. Re-evaluar e intentar la autotransición de las instancias 212 y 213 (asociadas al remito #21)
PERFORM public.ejecutar_validaciones_iniciales(213, '{}'::jsonb);
PERFORM public.intentar_transicion_automatica_pedido(213);

PERFORM public.ejecutar_validaciones_iniciales(212, '{}'::jsonb);
PERFORM public.intentar_transicion_automatica_pedido(212);
