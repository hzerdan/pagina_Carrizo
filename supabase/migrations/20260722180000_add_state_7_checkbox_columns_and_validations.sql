-- Migration: Add explicit boolean columns for State 7 operator checkboxes and validation functions
ALTER TABLE public.pedido_instancias 
ADD COLUMN IF NOT EXISTS revision_controles_carga_final BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS debito_interno_subconsignacion BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reclamo_transporte_incompleto BOOLEAN DEFAULT false;

-- 1. Función f_val_p_701: Revisión controles de carga (Final)
CREATE OR REPLACE FUNCTION public.f_val_p_701(p_instancia_id bigint, p_json_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cumplido BOOLEAN;
BEGIN
  SELECT COALESCE(revision_controles_carga_final, false) INTO v_cumplido
  FROM public.pedido_instancias
  WHERE id = p_instancia_id;

  IF v_cumplido THEN
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Revisión final de controles de carga aprobada y registrada.');
  ELSE
    RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Pendiente de revisión por el operador.');
  END IF;
END;
$$;

-- 2. Función f_val_p_702: Débito Interno realizado (si Subconsignación)
CREATE OR REPLACE FUNCTION public.f_val_p_702(p_instancia_id bigint, p_json_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cumplido BOOLEAN;
BEGIN
  SELECT COALESCE(debito_interno_subconsignacion, false) INTO v_cumplido
  FROM public.pedido_instancias
  WHERE id = p_instancia_id;

  IF v_cumplido THEN
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Débito interno registrado como realizado.');
  ELSE
    RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Pendiente de confirmación de débito interno.');
  END IF;
END;
$$;

-- 3. Función f_val_p_703: Reclamo a transporte (si incompleto)
CREATE OR REPLACE FUNCTION public.f_val_p_703(p_instancia_id bigint, p_json_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cumplido BOOLEAN;
BEGIN
  SELECT COALESCE(reclamo_transporte_incompleto, false) INTO v_cumplido
  FROM public.pedido_instancias
  WHERE id = p_instancia_id;

  IF v_cumplido THEN
    RETURN jsonb_build_object('status', 'SUCCESS', 'message', 'Reclamo a transporte registrado / procesado.');
  ELSE
    RETURN jsonb_build_object('status', 'FAILURE', 'message', 'Pendiente de verificar reclamo a transporte.');
  END IF;
END;
$$;

-- Otorgar permisos
GRANT ALL ON FUNCTION public.f_val_p_701(bigint, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.f_val_p_702(bigint, jsonb) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.f_val_p_703(bigint, jsonb) TO anon, authenticated, service_role;

-- 4. RPC para guardar el estado de los checkboxes del operador
CREATE OR REPLACE FUNCTION public.guardar_checkboxes_estado_7(
  p_instancia_id bigint,
  p_revision_controles_carga_final boolean DEFAULT NULL,
  p_debito_interno_subconsignacion boolean DEFAULT NULL,
  p_reclamo_transporte_incompleto boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.pedido_instancias
  SET 
    revision_controles_carga_final = COALESCE(p_revision_controles_carga_final, revision_controles_carga_final),
    debito_interno_subconsignacion = COALESCE(p_debito_interno_subconsignacion, debito_interno_subconsignacion),
    reclamo_transporte_incompleto = COALESCE(p_reclamo_transporte_incompleto, reclamo_transporte_incompleto),
    updated_at = NOW()
  WHERE id = p_instancia_id;

  INSERT INTO public.historial_eventos (
    pedido_instance_id,
    event_type,
    description,
    user_actor,
    details
  ) VALUES (
    p_instancia_id,
    'INPUT_RECEIVED',
    'Actualización de controles de operador (Estado 7)',
    'operador_web',
    jsonb_build_object(
      'revision_controles_carga_final', p_revision_controles_carga_final,
      'debito_interno_subconsignacion', p_debito_interno_subconsignacion,
      'reclamo_transporte_incompleto', p_reclamo_transporte_incompleto
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT ALL ON FUNCTION public.guardar_checkboxes_estado_7(bigint, boolean, boolean, boolean) TO anon, authenticated, service_role;
