-- Migración: Inspecciones Documentales vinculadas a Tabla de Servicios (Con o Sin Pedido AC)
-- Fecha: 2026-07-29

-- 1. Agregar columnas a public.servicios si no existen
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS requiere_pedido_ac BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true NOT NULL;

-- 2. Insertar/Asegurar servicios iniciales
INSERT INTO public.servicios (codigo_servicio, nombre, requiere_pedido_ac, activo) 
VALUES 
    ('INSP_EXP', 'Inspección Documental de Exportación', true, true),
    ('INSP_EXT', 'Servicio de Inspección Externa', false, true)
ON CONFLICT (codigo_servicio) DO UPDATE 
SET requiere_pedido_ac = EXCLUDED.requiere_pedido_ac, 
    activo = EXCLUDED.activo;

-- 3. Agregar columna servicio_id a public.inspecciones
ALTER TABLE public.inspecciones ADD COLUMN IF NOT EXISTS servicio_id INTEGER REFERENCES public.servicios(id);

-- 4. Asignar servicio por defecto (INSP_EXP) a inspecciones existentes sin servicio_id
UPDATE public.inspecciones 
SET servicio_id = (SELECT id FROM public.servicios WHERE codigo_servicio = 'INSP_EXP' LIMIT 1) 
WHERE servicio_id IS NULL;

-- 5. Actualizar la vista public.v_inspecciones_kanban
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

-- 6. Actualizar RPC crear_nueva_inspeccion_v2 con soporte para servicio_id y referencia_cliente
CREATE OR REPLACE FUNCTION public.crear_nueva_inspeccion_v2(
    p_pedido_instance_ids bigint[],
    p_inspector_id integer,
    p_template_id integer,
    p_tipo_carga text,
    p_fecha_pactada timestamp with time zone,
    p_lugar_id integer,
    p_usuario_actor text,
    p_servicio_id integer DEFAULT NULL,
    p_referencia_cliente text DEFAULT NULL
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
BEGIN
    -- Si no se especifica servicio_id, asignamos por defecto el servicio de exportación
    IF v_effective_servicio_id IS NULL THEN
        SELECT id INTO v_effective_servicio_id FROM public.servicios WHERE codigo_servicio = 'INSP_EXP' LIMIT 1;
        IF v_effective_servicio_id IS NULL THEN
            SELECT id INTO v_effective_servicio_id FROM public.servicios ORDER BY id LIMIT 1;
        END IF;
    END IF;

    -- Verificar si el servicio seleccionado exige pedidos de AC
    IF v_effective_servicio_id IS NOT NULL THEN
        SELECT COALESCE(requiere_pedido_ac, true) INTO v_requiere_pedido FROM public.servicios WHERE id = v_effective_servicio_id;
    END IF;

    -- Validar pedidos si el servicio los exige
    IF v_requiere_pedido AND (p_pedido_instance_ids IS NULL OR array_length(p_pedido_instance_ids, 1) IS NULL OR array_length(p_pedido_instance_ids, 1) = 0) THEN
        RAISE EXCEPTION 'El servicio seleccionado requiere asociar al menos un pedido de AC.';
    END IF;

    -- Armar datos de contexto si existe referencia de cliente/carga externa
    IF p_referencia_cliente IS NOT NULL AND TRIM(p_referencia_cliente) != '' THEN
        v_current_data := jsonb_build_object('referencia_cliente', TRIM(p_referencia_cliente));
    END IF;

    -- Obtener el estado inicial FSM (3.D0)
    SELECT id INTO v_state_id_d0 FROM public.state_definitions WHERE state_code = '3.D0';

    -- Crear cabecera de inspección
    INSERT INTO public.inspecciones (
        inspector_id, 
        template_id, 
        tipo_carga, 
        fecha_hora_carga_pactada, 
        lugar_carga_id, 
        current_state_id,
        servicio_id,
        current_data
    ) VALUES (
        p_inspector_id, 
        p_template_id, 
        p_tipo_carga, 
        p_fecha_pactada, 
        p_lugar_id, 
        v_state_id_d0,
        v_effective_servicio_id,
        v_current_data
    ) RETURNING id INTO v_inspeccion_id;

    -- Vincular pedidos si aplica
    IF p_pedido_instance_ids IS NOT NULL AND array_length(p_pedido_instance_ids, 1) > 0 THEN
        FOREACH v_pid IN ARRAY p_pedido_instance_ids LOOP
            INSERT INTO public.inspeccion_items_pedido (inspeccion_id, pedido_instance_id)
            VALUES (v_inspeccion_id, v_pid);

            INSERT INTO public.historial_eventos (
                pedido_instance_id, inspeccion_id, event_type, description, user_actor, details
            ) VALUES (
                v_pid, v_inspeccion_id, 'STATE_TRANSITION', 'Inspección Iniciada con plantilla ID: ' || p_template_id, 
                p_usuario_actor, jsonb_build_object('inspeccion_id', v_inspeccion_id, 'servicio_id', v_effective_servicio_id)
            );
        END LOOP;
    ELSE
        -- Registrar historial de evento sin pedido vinculado
        INSERT INTO public.historial_eventos (
            inspeccion_id, event_type, description, user_actor, details
        ) VALUES (
            v_inspeccion_id, 'STATE_TRANSITION', 'Inspección Externa Iniciada con plantilla ID: ' || p_template_id, 
            p_usuario_actor, jsonb_build_object('inspeccion_id', v_inspeccion_id, 'servicio_id', v_effective_servicio_id, 'referencia_cliente', p_referencia_cliente)
        );
    END IF;

    RETURN v_inspeccion_id;
END;
$$;

GRANT ALL ON FUNCTION public.crear_nueva_inspeccion_v2(bigint[], integer, integer, text, timestamp with time zone, integer, text, integer, text) TO anon;
GRANT ALL ON FUNCTION public.crear_nueva_inspeccion_v2(bigint[], integer, integer, text, timestamp with time zone, integer, text, integer, text) TO authenticated;
GRANT ALL ON FUNCTION public.crear_nueva_inspeccion_v2(bigint[], integer, integer, text, timestamp with time zone, integer, text, integer, text) TO service_role;

-- 7. Actualizar RPC log_inspeccion_evento para tolerar inspecciones sin pedido
CREATE OR REPLACE FUNCTION public.log_inspeccion_evento(
    p_inspeccion_id bigint, 
    p_accion text, 
    p_usuario_actor text, 
    p_detalles jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_pedido RECORD;
    v_count integer := 0;
BEGIN
    FOR v_pedido IN 
        SELECT pedido_instance_id FROM public.inspeccion_items_pedido WHERE inspeccion_id = p_inspeccion_id
    LOOP
        v_count := v_count + 1;
        INSERT INTO public.historial_eventos (
            pedido_instance_id,
            inspeccion_id,
            event_type,
            description,
            user_actor,
            details,
            timestamp
        ) VALUES (
            v_pedido.pedido_instance_id,
            p_inspeccion_id,
            'STATE_TRANSITION',
            p_accion,
            p_usuario_actor,
            p_detalles,
            NOW()
        );
    END LOOP;

    -- Si la inspección no está vinculada a ningún pedido de AC, registrar el evento directamente a la inspección
    IF v_count = 0 THEN
        INSERT INTO public.historial_eventos (
            pedido_instance_id,
            inspeccion_id,
            event_type,
            description,
            user_actor,
            details,
            timestamp
        ) VALUES (
            NULL,
            p_inspeccion_id,
            'STATE_TRANSITION',
            p_accion,
            p_usuario_actor,
            p_detalles,
            NOW()
        );
    END IF;
END;
$$;

GRANT ALL ON FUNCTION public.log_inspeccion_evento(bigint, text, text, jsonb) TO anon;
GRANT ALL ON FUNCTION public.log_inspeccion_evento(bigint, text, text, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.log_inspeccion_evento(bigint, text, text, jsonb) TO service_role;
