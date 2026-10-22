-- Migración: Sistema de Calificación de Choferes, Remitos y Transportistas
-- Fecha: 2026-10-08

-- 1. Tabla de Configuración de Calificaciones
CREATE TABLE IF NOT EXISTS public.calificacion_config (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL DEFAULT 'Configuración Estándar',
    descripcion TEXT DEFAULT 'Pesos ponderados y penalizaciones para la evaluación de choferes',
    activo BOOLEAN NOT NULL DEFAULT true,
    
    -- Pesos de los 3 niveles / dimensiones (deben sumar 100%)
    peso_cumplimiento_tareas NUMERIC(5,2) NOT NULL DEFAULT 55.00,
    peso_autonomia_recordatorios NUMERIC(5,2) NOT NULL DEFAULT 30.00,
    peso_sin_escalamiento NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    
    -- Factores y Penalidades
    factor_tarea_critica NUMERIC(4,2) NOT NULL DEFAULT 2.00,
    penalizacion_por_recordatorio NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    penalizacion_reintentos_agotados NUMERIC(5,2) NOT NULL DEFAULT 40.00,
    
    -- Criterios de Agregación
    ventana_viajes_promedio INT NOT NULL DEFAULT 15,
    minimo_viajes_consolidado INT NOT NULL DEFAULT 5,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT DEFAULT NULL
);

-- Habilitar RLS en calificacion_config si no está habilitado
ALTER TABLE public.calificacion_config ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'calificacion_config' AND policyname = 'Allow read calificacion_config for authenticated'
    ) THEN
        CREATE POLICY "Allow read calificacion_config for authenticated" 
            ON public.calificacion_config FOR SELECT 
            TO authenticated, anon 
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'calificacion_config' AND policyname = 'Allow write calificacion_config for authenticated'
    ) THEN
        CREATE POLICY "Allow write calificacion_config for authenticated" 
            ON public.calificacion_config FOR ALL 
            TO authenticated 
            USING (true) 
            WITH CHECK (true);
    END IF;
END $$;

-- Sembrar configuración predeterminada si la tabla está vacía
INSERT INTO public.calificacion_config (
    nombre, 
    descripcion, 
    activo, 
    peso_cumplimiento_tareas, 
    peso_autonomia_recordatorios, 
    peso_sin_escalamiento, 
    factor_tarea_critica, 
    penalizacion_por_recordatorio, 
    penalizacion_reintentos_agotados, 
    ventana_viajes_promedio, 
    minimo_viajes_consolidado
)
SELECT 
    'Configuración Estándar', 
    'Pesos estándar acordados: 55% cumplimiento, 30% autonomía, 15% sin escalamiento',
    true, 
    55.00, 
    30.00, 
    15.00, 
    2.00, 
    15.00, 
    40.00, 
    15, 
    5
WHERE NOT EXISTS (SELECT 1 FROM public.calificacion_config);

-- 2. Nuevas columnas en REMITOS
ALTER TABLE public.remitos 
    ADD COLUMN IF NOT EXISTS calificacion_score NUMERIC(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS calificacion_estrellas NUMERIC(3,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS calificacion_desglose JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS calificacion_updated_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Nuevas columnas en CHOFERES
ALTER TABLE public.choferes 
    ADD COLUMN IF NOT EXISTS calificacion_promedio_estrellas NUMERIC(3,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS calificacion_promedio_score NUMERIC(5,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS calificacion_total_viajes INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS calificacion_nivel VARCHAR(50) DEFAULT 'NUEVO',
    ADD COLUMN IF NOT EXISTS calificacion_updated_at TIMESTAMPTZ DEFAULT NULL;

-- 4. Nuevas columnas en TRANSPORTISTAS
ALTER TABLE public.transportistas 
    ADD COLUMN IF NOT EXISTS calificacion_promedio_estrellas NUMERIC(3,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS calificacion_total_viajes INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS calificacion_updated_at TIMESTAMPTZ DEFAULT NULL;

-- 5. Función Canónica de Reevaluación de Calificaciones
-- Nota: Regla explícita de Antigravity: DROP FUNCTION IF EXISTS previa
DROP FUNCTION IF EXISTS public.reevaluar_calificaciones(BIGINT);
DROP FUNCTION IF EXISTS public.reevaluar_calificaciones(BIGINT, INT);
DROP FUNCTION IF EXISTS public.reevaluar_calificaciones();

CREATE OR REPLACE FUNCTION public.reevaluar_calificaciones(
    p_remito_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config RECORD;
    v_remito RECORD;
    v_task JSONB;
    
    -- Variables para remito individual
    v_peso_cumplido NUMERIC(10,2);
    v_peso_total NUMERIC(10,2);
    v_tareas_count INT;
    v_tareas_cumplidas INT;
    v_tareas_criticas_total INT;
    v_tareas_criticas_cumplidas INT;
    v_is_critica BOOLEAN;
    v_task_peso NUMERIC(5,2);
    v_task_estado TEXT;
    
    v_cumplimiento_score NUMERIC(10,2);
    v_cumplimiento_pts NUMERIC(10,2);
    
    v_recordatorios_count INT;
    v_autonomia_score NUMERIC(10,2);
    v_autonomia_pts NUMERIC(10,2);
    
    v_escalado BOOLEAN;
    v_escalamiento_score NUMERIC(10,2);
    v_escalamiento_pts NUMERIC(10,2);
    
    v_score_final NUMERIC(5,2);
    v_estrellas_final NUMERIC(3,2);
    v_desglose JSONB;
    
    -- Contadores globales
    v_remitos_procesados INT := 0;
    v_choferes_procesados INT := 0;
    v_transportistas_procesados INT := 0;
    v_chofer RECORD;
    v_transportista RECORD;
    v_promedio_estrellas NUMERIC(3,2);
    v_promedio_score NUMERIC(5,2);
    v_total_viajes INT;
    v_nivel TEXT;
BEGIN
    -- 1. Obtener la configuración activa
    SELECT * INTO v_config 
    FROM public.calificacion_config 
    WHERE activo = true 
    ORDER BY id DESC 
    LIMIT 1;

    IF NOT FOUND THEN
        -- Valores de fallback si no existe config
        v_config.peso_cumplimiento_tareas := 55.00;
        v_config.peso_autonomia_recordatorios := 30.00;
        v_config.peso_sin_escalamiento := 15.00;
        v_config.factor_tarea_critica := 2.00;
        v_config.penalizacion_por_recordatorio := 15.00;
        v_config.penalizacion_reintentos_agotados := 40.00;
        v_config.ventana_viajes_promedio := 15;
        v_config.minimo_viajes_consolidado := 5;
    END IF;

    -- 2. Procesar los remitos correspondientes
    FOR v_remito IN 
        SELECT r.id, r.chofer_id, r.mision_estado, r.protocolo_control, r.retry_count, r.tiene_incidencias_carga, r.bot_status
        FROM public.remitos r
        WHERE r.chofer_id IS NOT NULL 
          AND (p_remito_id IS NULL OR r.id = p_remito_id)
        ORDER BY r.id ASC
    LOOP
        v_peso_cumplido := 0.0;
        v_peso_total := 0.0;
        v_tareas_count := 0;
        v_tareas_cumplidas := 0;
        v_tareas_criticas_total := 0;
        v_tareas_criticas_cumplidas := 0;

        -- A. Evaluar tareas del protocolo de control
        IF v_remito.protocolo_control IS NOT NULL AND jsonb_typeof(v_remito.protocolo_control) = 'array' THEN
            FOR v_task IN SELECT * FROM jsonb_array_elements(v_remito.protocolo_control)
            LOOP
                -- Solo evaluamos si está asignada a chofer o no está explícitamente desasignada
                IF (v_task->>'asignada_a_chofer') IS NULL OR (v_task->>'asignada_a_chofer')::boolean = true THEN
                    v_task_estado := COALESCE(v_task->>'estado', 'PENDIENTE');

                    -- Si la tarea fue marcada como no realizable justificada, la excluimos
                    IF v_task_estado <> 'NO_REALIZABLE' THEN
                        v_tareas_count := v_tareas_count + 1;

                        -- Determinar si es crítica
                        v_is_critica := (
                            COALESCE((v_task->>'requiere_foto')::boolean, false) = true
                            OR COALESCE(v_task->>'tipo_tarea', '') IN ('PESAJE_TARA', 'PESAJE_BRUTO')
                            OR LOWER(COALESCE(v_task->>'tarea', '')) LIKE '%firmado%'
                        );

                        IF v_is_critica THEN
                            v_task_peso := v_config.factor_tarea_critica;
                            v_tareas_criticas_total := v_tareas_criticas_total + 1;
                        ELSE
                            v_task_peso := 1.0;
                        END IF;

                        v_peso_total := v_peso_total + v_task_peso;

                        -- Verificar si se cumplió
                        IF v_task_estado IN ('REPORTADO_CHOFER', 'COMPLETADO') 
                           OR COALESCE((v_task->>'chofer_realizo')::boolean, false) = true THEN
                            v_peso_cumplido := v_peso_cumplido + v_task_peso;
                            v_tareas_cumplidas := v_tareas_cumplidas + 1;
                            IF v_is_critica THEN
                                v_tareas_criticas_cumplidas := v_tareas_criticas_cumplidas + 1;
                            END IF;
                        END IF;
                    END IF;
                END IF;
            END LOOP;
        END IF;

        -- Calcular Dimensión Cumplimiento (0 - 100)
        IF v_peso_total > 0 THEN
            v_cumplimiento_score := LEAST(100.0, (v_peso_cumplido / v_peso_total) * 100.0);
        ELSE
            v_cumplimiento_score := 100.0;
        END IF;
        v_cumplimiento_pts := (v_cumplimiento_score / 100.0) * v_config.peso_cumplimiento_tareas;

        -- B. Evaluar Autonomía y Recordatorios
        SELECT COUNT(*) INTO v_recordatorios_count
        FROM public.conversation_messages cm
        WHERE cm.remito_id = v_remito.id
          AND cm.direction = 'outbound'
          AND (
              cm.template_code ILIKE '%recordatorio%' 
              OR cm.template_code ILIKE '%reminder%' 
              OR cm.body_text ILIKE '%recordatorio%' 
              OR cm.body_text ILIKE '%por favor record%'
          );

        -- Considerar también retry_count de remitos si es mayor
        v_recordatorios_count := GREATEST(v_recordatorios_count, COALESCE(v_remito.retry_count, 0));

        IF v_recordatorios_count = 0 THEN
            v_autonomia_score := 100.0;
        ELSE
            v_autonomia_score := GREATEST(0.0, 100.0 - (v_recordatorios_count * v_config.penalizacion_por_recordatorio));
            IF v_recordatorios_count >= 3 THEN
                v_autonomia_score := GREATEST(0.0, v_autonomia_score - v_config.penalizacion_reintentos_agotados);
            END IF;
        END IF;
        v_autonomia_pts := (v_autonomia_score / 100.0) * v_config.peso_autonomia_recordatorios;

        -- C. Evaluar Escalamiento / Incidencias
        SELECT EXISTS (
            SELECT 1 FROM public.alertas_escalamiento ae
            JOIN public.conversation_messages cm ON ae.trigger_message_id = cm.id
            WHERE cm.remito_id = v_remito.id
        ) INTO v_escalado;

        -- Si tiene incidencias de carga o escalamiento reportado
        IF v_escalado OR COALESCE(v_remito.tiene_incidencias_carga, false) = true THEN
            v_escalamiento_score := 0.0;
        ELSE
            v_escalamiento_score := 100.0;
        END IF;
        v_escalamiento_pts := (v_escalamiento_score / 100.0) * v_config.peso_sin_escalamiento;

        -- Score Final (0 - 100) y Estrellas (1 - 5)
        v_score_final := ROUND(v_cumplimiento_pts + v_autonomia_pts + v_escalamiento_pts, 2);
        v_estrellas_final := ROUND(GREATEST(1.0, LEAST(5.0, (v_score_final / 20.0))), 2);

        -- Desglose explicativo
        v_desglose := jsonb_build_object(
            'score', v_score_final,
            'estrellas', v_estrellas_final,
            'cumplimiento', jsonb_build_object(
                'score_pct', ROUND(v_cumplimiento_score, 1),
                'puntos', ROUND(v_cumplimiento_pts, 2),
                'peso_maximo', v_config.peso_cumplimiento_tareas,
                'tareas_totales', v_tareas_count,
                'tareas_cumplidas', v_tareas_cumplidas,
                'criticas_totales', v_tareas_criticas_total,
                'criticas_cumplidas', v_tareas_criticas_cumplidas
            ),
            'autonomia', jsonb_build_object(
                'score_pct', ROUND(v_autonomia_score, 1),
                'puntos', ROUND(v_autonomia_pts, 2),
                'peso_maximo', v_config.peso_autonomia_recordatorios,
                'recordatorios_count', v_recordatorios_count
            ),
            'escalamiento', jsonb_build_object(
                'score_pct', ROUND(v_escalamiento_score, 1),
                'puntos', ROUND(v_escalamiento_pts, 2),
                'peso_maximo', v_config.peso_sin_escalamiento,
                'escalado', v_escalado
            )
        );

        -- Actualizar Remito
        UPDATE public.remitos
        SET calificacion_score = v_score_final,
            calificacion_estrellas = v_estrellas_final,
            calificacion_desglose = v_desglose,
            calificacion_updated_at = NOW()
        WHERE id = v_remito.id;

        v_remitos_procesados := v_remitos_procesados + 1;
    END LOOP;

    -- 3. Actualizar promedios en CHOFERES
    FOR v_chofer IN
        SELECT DISTINCT c.id
        FROM public.choferes c
        JOIN public.remitos r ON r.chofer_id = c.id
        WHERE (p_remito_id IS NULL OR r.id = p_remito_id)
          AND r.calificacion_estrellas IS NOT NULL
    LOOP
        -- Calcular sobre los últimos N viajes
        WITH ultimos_viajes AS (
            SELECT r.calificacion_score, r.calificacion_estrellas
            FROM public.remitos r
            WHERE r.chofer_id = v_chofer.id
              AND r.calificacion_estrellas IS NOT NULL
            ORDER BY r.id DESC
            LIMIT v_config.ventana_viajes_promedio
        )
        SELECT 
            ROUND(AVG(calificacion_estrellas), 2),
            ROUND(AVG(calificacion_score), 2),
            COUNT(*)
        INTO v_promedio_estrellas, v_promedio_score, v_total_viajes
        FROM ultimos_viajes;

        -- Determinar nivel
        IF v_total_viajes < v_config.minimo_viajes_consolidado THEN
            v_nivel := 'NUEVO';
        ELSIF v_promedio_estrellas >= 4.5 THEN
            v_nivel := 'EXCELENTE';
        ELSIF v_promedio_estrellas >= 3.5 THEN
            v_nivel := 'BUENO';
        ELSIF v_promedio_estrellas >= 2.5 THEN
            v_nivel := 'REGULAR';
        ELSE
            v_nivel := 'CRITICO';
        END IF;

        UPDATE public.choferes
        SET calificacion_promedio_estrellas = v_promedio_estrellas,
            calificacion_promedio_score = v_promedio_score,
            calificacion_total_viajes = v_total_viajes,
            calificacion_nivel = v_nivel,
            calificacion_updated_at = NOW()
        WHERE id = v_chofer.id;

        v_choferes_procesados := v_choferes_procesados + 1;
    END LOOP;

    -- 4. Actualizar promedios en TRANSPORTISTAS
    FOR v_transportista IN
        SELECT DISTINCT t.id
        FROM public.transportistas t
        JOIN public.choferes c ON c.transportista_id = t.id
        JOIN public.remitos r ON r.chofer_id = c.id
        WHERE (p_remito_id IS NULL OR r.id = p_remito_id)
          AND r.calificacion_estrellas IS NOT NULL
    LOOP
        SELECT 
            ROUND(AVG(r.calificacion_estrellas), 2),
            COUNT(DISTINCT r.id)
        INTO v_promedio_estrellas, v_total_viajes
        FROM public.remitos r
        JOIN public.choferes c ON r.chofer_id = c.id
        WHERE c.transportista_id = v_transportista.id
          AND r.calificacion_estrellas IS NOT NULL;

        UPDATE public.transportistas
        SET calificacion_promedio_estrellas = v_promedio_estrellas,
            calificacion_total_viajes = v_total_viajes,
            calificacion_updated_at = NOW()
        WHERE id = v_transportista.id;

        v_transportistas_procesados := v_transportistas_procesados + 1;
    END LOOP;

    -- 5. Retornar resumen del resultado
    RETURN jsonb_build_object(
        'success', true,
        'remitos_procesados', v_remitos_procesados,
        'choferes_procesados', v_choferes_procesados,
        'transportistas_procesados', v_transportistas_procesados,
        'config_utilizada', jsonb_build_object(
            'peso_cumplimiento', v_config.peso_cumplimiento_tareas,
            'peso_autonomia', v_config.peso_autonomia_recordatorios,
            'peso_escalamiento', v_config.peso_sin_escalamiento,
            'ventana_viajes', v_config.ventana_viajes_promedio
        )
    );
END;
$$;
