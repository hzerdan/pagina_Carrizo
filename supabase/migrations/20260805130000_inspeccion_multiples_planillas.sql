-- Migration: 20260805130000_inspeccion_multiples_planillas.sql
-- Descripción: Soporte para múltiples planillas recibidas por inspección (contenedores/camiones)

-- 1. Agregar columna cantidad_plantillas_requeridas a public.inspecciones
ALTER TABLE public.inspecciones 
ADD COLUMN IF NOT EXISTS cantidad_plantillas_requeridas INTEGER DEFAULT 1 NOT NULL CHECK (cantidad_plantillas_requeridas > 0);

-- 2. Crear tabla public.inspeccion_planillas_recibidas
CREATE TABLE IF NOT EXISTS public.inspeccion_planillas_recibidas (
    id BIGSERIAL PRIMARY KEY,
    inspeccion_id BIGINT NOT NULL REFERENCES public.inspecciones(id) ON DELETE CASCADE,
    nombre_archivo TEXT NOT NULL,
    archivo_url TEXT NOT NULL,
    etiqueta_identificador TEXT,
    subido_por TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS & Permisos
ALTER TABLE public.inspeccion_planillas_recibidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total para autenticados" ON public.inspeccion_planillas_recibidas;
CREATE POLICY "Acceso total para autenticados" ON public.inspeccion_planillas_recibidas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.inspeccion_planillas_recibidas TO anon;
GRANT ALL ON TABLE public.inspeccion_planillas_recibidas TO authenticated;
GRANT ALL ON TABLE public.inspeccion_planillas_recibidas TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.inspeccion_planillas_recibidas_id_seq TO anon, authenticated, service_role;

-- 3. Migrar planillas_completadas_url existentes a la nueva tabla si no se migraron
INSERT INTO public.inspeccion_planillas_recibidas (inspeccion_id, nombre_archivo, archivo_url, etiqueta_identificador, subido_por)
SELECT 
    id, 
    'Planilla Inicial', 
    planilla_completada_url, 
    'Planilla #1', 
    'Sistema (Migración)'
FROM public.inspecciones
WHERE planilla_completada_url IS NOT NULL 
  AND planilla_completada_url != ''
  AND id NOT IN (SELECT inspeccion_id FROM public.inspeccion_planillas_recibidas);

-- 4. Actualizar la vista public.v_inspecciones_kanban
DROP VIEW IF EXISTS public.v_inspecciones_kanban CASCADE;
CREATE OR REPLACE VIEW public.v_inspecciones_kanban AS
 SELECT 
    i.id,
    i.tipo_carga,
    p.nombre_completo AS inspector_nombre,
    i.fecha_hora_carga_pactada AS fecha_pactada,
    i.export_doc_status,
    i.resultado_final,
    i.planilla_completada_url,
    sd.state_code,
    i.servicio_id,
    s.nombre AS servicio_nombre,
    COALESCE(s.requiere_pedido_ac, true) AS servicio_requiere_pedido,
    i.current_data->>'referencia_cliente' AS referencia_cliente,
    COALESCE(i.cantidad_plantillas_requeridas, 1) AS cantidad_plantillas_requeridas,
    (SELECT COUNT(*)::integer FROM public.inspeccion_planillas_recibidas ipr WHERE ipr.inspeccion_id = i.id) AS cantidad_plantillas_recibidas,
    ( SELECT json_agg(
            json_build_object(
                'id', ipr.id,
                'archivo_url', ipr.archivo_url,
                'nombre_archivo', ipr.nombre_archivo,
                'etiqueta_identificador', ipr.etiqueta_identificador,
                'created_at', ipr.created_at,
                'subido_por', ipr.subido_por
            ) ORDER BY ipr.id ASC
        ) FROM public.inspeccion_planillas_recibidas ipr WHERE ipr.inspeccion_id = i.id
    ) AS planillas_recibidas,
    ( SELECT json_agg(json_build_object('identificador_compuesto', pi.identificador_compuesto)) AS json_agg
       FROM public.inspeccion_items_pedido iip
         JOIN public.pedido_instancias pi ON iip.pedido_instance_id = pi.id
      WHERE iip.inspeccion_id = i.id) AS pedidos
   FROM public.inspecciones i
     LEFT JOIN public.personal_ac p ON i.inspector_id = p.id
     LEFT JOIN public.state_definitions sd ON i.current_state_id = sd.id
     LEFT JOIN public.servicios s ON i.servicio_id = s.id;

GRANT ALL ON TABLE public.v_inspecciones_kanban TO anon;
GRANT ALL ON TABLE public.v_inspecciones_kanban TO authenticated;
GRANT ALL ON TABLE public.v_inspecciones_kanban TO service_role;

-- 5. Actualizar RPC crear_nueva_inspeccion_v2
CREATE OR REPLACE FUNCTION public.crear_nueva_inspeccion_v2(
    p_pedido_instance_ids bigint[],
    p_inspector_id integer,
    p_template_id integer,
    p_tipo_carga text,
    p_fecha_pactada timestamp with time zone,
    p_lugar_id integer,
    p_usuario_actor text,
    p_servicio_id integer DEFAULT NULL,
    p_referencia_cliente text DEFAULT NULL,
    p_cantidad_plantillas_requeridas integer DEFAULT 1
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inspeccion_id BIGINT;
    v_state_id_d0 INTEGER;
    v_pid BIGINT;
    v_requiere_pedido BOOLEAN := true;
    v_effective_servicio_id INTEGER := p_servicio_id;
    v_current_data JSONB := '{}'::jsonb;
    v_cant_req INTEGER := COALESCE(p_cantidad_plantillas_requeridas, 1);
BEGIN
    IF v_cant_req < 1 THEN
        v_cant_req := 1;
    END IF;

    -- Servicio por defecto
    IF v_effective_servicio_id IS NULL THEN
        SELECT id INTO v_effective_servicio_id FROM public.servicios WHERE codigo_servicio = 'INSP_EXP' LIMIT 1;
        IF v_effective_servicio_id IS NULL THEN
            SELECT id INTO v_effective_servicio_id FROM public.servicios ORDER BY id LIMIT 1;
        END IF;
    END IF;

    IF v_effective_servicio_id IS NOT NULL THEN
        SELECT COALESCE(requiere_pedido_ac, true) INTO v_requiere_pedido FROM public.servicios WHERE id = v_effective_servicio_id;
    END IF;

    IF v_requiere_pedido AND (p_pedido_instance_ids IS NULL OR array_length(p_pedido_instance_ids, 1) IS NULL OR array_length(p_pedido_instance_ids, 1) = 0) THEN
        RAISE EXCEPTION 'El servicio seleccionado requiere asociar al menos un pedido de AC.';
    END IF;

    IF p_referencia_cliente IS NOT NULL AND TRIM(p_referencia_cliente) != '' THEN
        v_current_data := jsonb_build_object('referencia_cliente', TRIM(p_referencia_cliente));
    END IF;

    SELECT id INTO v_state_id_d0 FROM public.state_definitions WHERE state_code = '3.D0';

    INSERT INTO public.inspecciones (
        inspector_id, 
        template_id, 
        tipo_carga, 
        fecha_hora_carga_pactada, 
        lugar_carga_id, 
        current_state_id,
        servicio_id,
        current_data,
        cantidad_plantillas_requeridas
    ) VALUES (
        p_inspector_id, 
        p_template_id, 
        p_tipo_carga, 
        p_fecha_pactada, 
        p_lugar_id, 
        v_state_id_d0,
        v_effective_servicio_id,
        v_current_data,
        v_cant_req
    ) RETURNING id INTO v_inspeccion_id;

    IF p_pedido_instance_ids IS NOT NULL AND array_length(p_pedido_instance_ids, 1) > 0 THEN
        FOREACH v_pid IN ARRAY p_pedido_instance_ids LOOP
            INSERT INTO public.inspeccion_items_pedido (inspeccion_id, pedido_instance_id)
            VALUES (v_inspeccion_id, v_pid);

            INSERT INTO public.historial_eventos (
                pedido_instance_id, evento_tipo, usuario_actor, metadata
            ) VALUES (
                v_pid, 'INSPECCION_DOC_CREADA', p_usuario_actor, 
                jsonb_build_object('inspeccion_id', v_inspeccion_id, 'servicio_id', v_effective_servicio_id)
            );
        END LOOP;
    END IF;

    PERFORM public.log_inspeccion_evento(
        v_inspeccion_id, 
        'CREACION', 
        p_usuario_actor, 
        jsonb_build_object('servicio_id', v_effective_servicio_id, 'cantidad_plantillas_requeridas', v_cant_req)
    );

    RETURN v_inspeccion_id;
END;
$$;

-- 6. RPC registrar_planilla_recibida
CREATE OR REPLACE FUNCTION public.registrar_planilla_recibida(
    p_inspeccion_id BIGINT,
    p_archivo_url TEXT,
    p_nombre_archivo TEXT,
    p_etiqueta TEXT DEFAULT NULL,
    p_usuario_actor TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_planilla_id BIGINT;
    v_cant_requeridas INT;
    v_cant_recibidas INT;
    v_state_code TEXT;
    v_transicion_auto BOOLEAN := FALSE;
    v_trans_err TEXT := NULL;
    v_effective_etiqueta TEXT := p_etiqueta;
BEGIN
    SELECT COUNT(*)::integer INTO v_cant_recibidas
    FROM public.inspeccion_planillas_recibidas WHERE inspeccion_id = p_inspeccion_id;

    IF v_effective_etiqueta IS NULL OR TRIM(v_effective_etiqueta) = '' THEN
        v_effective_etiqueta := 'Planilla #' || (v_cant_recibidas + 1);
    END IF;

    INSERT INTO public.inspeccion_planillas_recibidas (
        inspeccion_id, archivo_url, nombre_archivo, etiqueta_identificador, subido_por
    ) VALUES (
        p_inspeccion_id, p_archivo_url, p_nombre_archivo, v_effective_etiqueta, p_usuario_actor
    ) RETURNING id INTO v_planilla_id;

    -- Mantener la columna legada sincronizada
    UPDATE public.inspecciones 
    SET planilla_completada_url = p_archivo_url 
    WHERE id = p_inspeccion_id;

    SELECT COALESCE(cantidad_plantillas_requeridas, 1) INTO v_cant_requeridas
    FROM public.inspecciones WHERE id = p_inspeccion_id;

    v_cant_recibidas := v_cant_recibidas + 1;

    SELECT sd.state_code INTO v_state_code
    FROM public.inspecciones i
    JOIN public.state_definitions sd ON i.current_state_id = sd.id
    WHERE i.id = p_inspeccion_id;

    -- Transición automática a 3.D3 al completar o superar las planillas requeridas
    IF v_cant_recibidas >= v_cant_requeridas AND v_state_code IN ('3.D0', '3.D1', '3.D2') THEN
        BEGIN
            PERFORM public.inspeccion_intentar_transicion(p_inspeccion_id, '3.D3', p_usuario_actor);
            v_transicion_auto := TRUE;
        EXCEPTION WHEN OTHERS THEN
            v_trans_err := SQLERRM;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'planilla_id', v_planilla_id,
        'cant_recibidas', v_cant_recibidas,
        'cant_requeridas', v_cant_requeridas,
        'transicion_automatica', v_transicion_auto,
        'transicion_error', v_trans_err
    );
END;
$$;

-- 7. RPC eliminar_planilla_recibida
CREATE OR REPLACE FUNCTION public.eliminar_planilla_recibida(
    p_planilla_id BIGINT,
    p_usuario_actor TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.inspeccion_planillas_recibidas WHERE id = p_planilla_id;
    RETURN FOUND;
END;
$$;

-- 8. RPC actualizar_etiqueta_planilla
CREATE OR REPLACE FUNCTION public.actualizar_etiqueta_planilla(
    p_planilla_id BIGINT,
    p_etiqueta TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.inspeccion_planillas_recibidas
    SET etiqueta_identificador = TRIM(p_etiqueta)
    WHERE id = p_planilla_id;
    RETURN FOUND;
END;
$$;
