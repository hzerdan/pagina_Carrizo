-- 1. Crear Tablas Maestras
CREATE TABLE IF NOT EXISTS public.mision_estados_definicion (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    orden_logistico_default INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS public.mision_tipos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS public.mision_tipo_pasos (
    tipo_mision_id INTEGER REFERENCES public.mision_tipos(id) ON DELETE CASCADE,
    estado_id INTEGER REFERENCES public.mision_estados_definicion(id) ON DELETE CASCADE,
    orden_especifico INTEGER NOT NULL,
    PRIMARY KEY (tipo_mision_id, estado_id)
);

-- 2. Pre-poblar mision_estados_definicion
INSERT INTO public.mision_estados_definicion (codigo, nombre, descripcion, orden_logistico_default)
VALUES 
  ('OPERACION_PENDIENTE', 'Pendiente', 'Faltan datos o inicio', 1),
  ('ESPERANDO_PAPELES', 'Papeles', 'Confirmación de papeles', 2),
  ('PESAJE_TARA_ORIGEN', 'Tara Origen', 'Pesaje inicial vacío', 3),
  ('EN_CARGA', 'Carga', 'Carga y checklist', 4),
  ('PESAJE_BRUTO_ORIGEN', 'Bruto Origen', 'Pesaje cargado', 5),
  ('EN_TRANSITO', 'Tránsito', 'Viaje a destino', 6),
  ('PESAJE_BRUTO_DESTINO', 'Bruto Destino', 'Pesaje bruto entrada', 7),
  ('EN_DESCARGA', 'Descarga', 'Descarga final', 8),
  ('CONTROL_ENTREGA', 'Entrega', 'Remito Firmado', 9),
  ('PESAJE_TARA_DESTINO', 'Tara Destino', 'Pesaje tara salida', 10),
  ('MISION_COMPLETADA', 'Completada', 'Fin de la misión', 11)
ON CONFLICT (codigo) DO NOTHING;

-- 3. Pre-poblar mision_tipos
INSERT INTO public.mision_tipos (nombre, descripcion)
VALUES 
  ('Pesaje en Origen', 'Modalidad estándar con pesaje tara/bruto en origen (Escenario A)'),
  ('Flete Corto', 'Modalidad sin pesajes intermedios, directo a entrega'),
  ('Pesaje en Destino', 'Modalidad con pesajes bruto/tara en destino (Escenario B)')
ON CONFLICT (nombre) DO NOTHING;

-- 4. Pre-poblar mision_tipo_pasos
-- Pesaje en Origen (tipo_mision_id = 1)
INSERT INTO public.mision_tipo_pasos (tipo_mision_id, estado_id, orden_especifico)
SELECT 1, id, 1 FROM public.mision_estados_definicion WHERE codigo = 'OPERACION_PENDIENTE' UNION ALL
SELECT 1, id, 2 FROM public.mision_estados_definicion WHERE codigo = 'ESPERANDO_PAPELES' UNION ALL
SELECT 1, id, 3 FROM public.mision_estados_definicion WHERE codigo = 'PESAJE_TARA_ORIGEN' UNION ALL
SELECT 1, id, 4 FROM public.mision_estados_definicion WHERE codigo = 'EN_CARGA' UNION ALL
SELECT 1, id, 5 FROM public.mision_estados_definicion WHERE codigo = 'PESAJE_BRUTO_ORIGEN' UNION ALL
SELECT 1, id, 6 FROM public.mision_estados_definicion WHERE codigo = 'EN_TRANSITO' UNION ALL
SELECT 1, id, 7 FROM public.mision_estados_definicion WHERE codigo = 'CONTROL_ENTREGA' UNION ALL
SELECT 1, id, 8 FROM public.mision_estados_definicion WHERE codigo = 'MISION_COMPLETADA'
ON CONFLICT DO NOTHING;

-- Flete Corto (tipo_mision_id = 2)
INSERT INTO public.mision_tipo_pasos (tipo_mision_id, estado_id, orden_especifico)
SELECT 2, id, 1 FROM public.mision_estados_definicion WHERE codigo = 'OPERACION_PENDIENTE' UNION ALL
SELECT 2, id, 2 FROM public.mision_estados_definicion WHERE codigo = 'ESPERANDO_PAPELES' UNION ALL
SELECT 2, id, 3 FROM public.mision_estados_definicion WHERE codigo = 'EN_CARGA' UNION ALL
SELECT 2, id, 4 FROM public.mision_estados_definicion WHERE codigo = 'EN_TRANSITO' UNION ALL
SELECT 2, id, 5 FROM public.mision_estados_definicion WHERE codigo = 'EN_DESCARGA' UNION ALL
SELECT 2, id, 6 FROM public.mision_estados_definicion WHERE codigo = 'CONTROL_ENTREGA' UNION ALL
SELECT 2, id, 7 FROM public.mision_estados_definicion WHERE codigo = 'MISION_COMPLETADA'
ON CONFLICT DO NOTHING;

-- Pesaje en Destino (tipo_mision_id = 3)
INSERT INTO public.mision_tipo_pasos (tipo_mision_id, estado_id, orden_especifico)
SELECT 3, id, 1 FROM public.mision_estados_definicion WHERE codigo = 'OPERACION_PENDIENTE' UNION ALL
SELECT 3, id, 2 FROM public.mision_estados_definicion WHERE codigo = 'ESPERANDO_PAPELES' UNION ALL
SELECT 3, id, 3 FROM public.mision_estados_definicion WHERE codigo = 'EN_CARGA' UNION ALL
SELECT 3, id, 4 FROM public.mision_estados_definicion WHERE codigo = 'EN_TRANSITO' UNION ALL
SELECT 3, id, 5 FROM public.mision_estados_definicion WHERE codigo = 'PESAJE_BRUTO_DESTINO' UNION ALL
SELECT 3, id, 6 FROM public.mision_estados_definicion WHERE codigo = 'EN_DESCARGA' UNION ALL
SELECT 3, id, 7 FROM public.mision_estados_definicion WHERE codigo = 'CONTROL_ENTREGA' UNION ALL
SELECT 3, id, 8 FROM public.mision_estados_definicion WHERE codigo = 'PESAJE_TARA_DESTINO' UNION ALL
SELECT 3, id, 9 FROM public.mision_estados_definicion WHERE codigo = 'MISION_COMPLETADA'
ON CONFLICT DO NOTHING;

-- 5. Evolucionar catalogo_tareas_control
ALTER TABLE public.catalogo_tareas_control 
ADD COLUMN IF NOT EXISTS estado_id INTEGER REFERENCES public.mision_estados_definicion(id),
ADD COLUMN IF NOT EXISTS tipo_dato_esperado VARCHAR(50) CHECK (tipo_dato_esperado IN ('check', 'numero', 'imagen')) DEFAULT 'check',
ADD COLUMN IF NOT EXISTS mensaje_template TEXT;

-- Poblar datos en el catálogo
UPDATE public.catalogo_tareas_control SET estado_id = (SELECT id FROM public.mision_estados_definicion WHERE codigo = 'ESPERANDO_PAPELES'), tipo_dato_esperado = 'check', mensaje_template = 'Hola {chofer}, ¿me confirmas si ya tienes la documentación física en mano (remito y órdenes)?' WHERE id = 1;
UPDATE public.catalogo_tareas_control SET estado_id = (SELECT id FROM public.mision_estados_definicion WHERE codigo = 'PESAJE_TARA_ORIGEN'), tipo_dato_esperado = 'numero', mensaje_template = 'Hola {chofer}, por favor recordá realizar el pesaje de TARA (vacío) en {lugar} antes de cargar e informarlo por este medio.' WHERE id = 2;
UPDATE public.catalogo_tareas_control SET estado_id = (SELECT id FROM public.mision_estados_definicion WHERE codigo = 'EN_CARGA'), tipo_dato_esperado = 'imagen', mensaje_template = 'Hola {chofer}, por favor recordá realizar la verificación de estado de las bolsas y enviame una foto por este medio.' WHERE id = 3;
UPDATE public.catalogo_tareas_control SET estado_id = (SELECT id FROM public.mision_estados_definicion WHERE codigo = 'EN_CARGA'), tipo_dato_esperado = 'imagen', mensaje_template = 'Hola {chofer}, por favor recordá tomar una foto de control de calidad sobre papel blanco y enviármela por este medio.' WHERE id = 4;
UPDATE public.catalogo_tareas_control SET estado_id = (SELECT id FROM public.mision_estados_definicion WHERE codigo = 'EN_CARGA'), tipo_dato_esperado = 'imagen', mensaje_template = 'Hola {chofer}, por favor recordá enviar una foto al iniciar la carga.' WHERE id = 5;
UPDATE public.catalogo_tareas_control SET estado_id = (SELECT id FROM public.mision_estados_definicion WHERE codigo = 'EN_CARGA'), tipo_dato_esperado = 'imagen', mensaje_template = 'Hola {chofer}, por favor recordá enviar una foto a la mitad de la carga.' WHERE id = 6;
UPDATE public.catalogo_tareas_control SET estado_id = (SELECT id FROM public.mision_estados_definicion WHERE codigo = 'EN_CARGA'), tipo_dato_esperado = 'imagen', mensaje_template = 'Hola {chofer}, por favor recordá enviar una foto al finalizar la carga.' WHERE id = 7;
UPDATE public.catalogo_tareas_control SET estado_id = (SELECT id FROM public.mision_estados_definicion WHERE codigo = 'EN_CARGA'), tipo_dato_esperado = 'check', mensaje_template = 'Hola {chofer}, recordá que al menos una foto debe mostrar las patentes.' WHERE id = 8;
UPDATE public.catalogo_tareas_control SET estado_id = (SELECT id FROM public.mision_estados_definicion WHERE codigo = 'EN_CARGA'), tipo_dato_esperado = 'check', mensaje_template = 'Hola {chofer}, por favor recordá avisar cuando termines de cargar y estés listo para salir.' WHERE id = 9;
UPDATE public.catalogo_tareas_control SET estado_id = (SELECT id FROM public.mision_estados_definicion WHERE codigo = 'PESAJE_BRUTO_ORIGEN'), tipo_dato_esperado = 'numero', mensaje_template = 'Hola {chofer}, por favor recordá realizar el pesaje BRUTO (lleno) en {lugar} al salir.' WHERE id = 10;

-- 6. Evolucionar remitos
ALTER TABLE public.remitos 
ADD COLUMN IF NOT EXISTS tipo_mision_id INTEGER REFERENCES public.mision_tipos(id),
ADD COLUMN IF NOT EXISTS mision_estados_secuencia JSONB;

-- Sincronizar remitos existentes con su tipo de misión correspondiente
UPDATE public.remitos
SET tipo_mision_id = CASE 
    WHEN (COALESCE(tara_pesaje_momento, 'Antes de cargar') = 'Antes de cargar' AND COALESCE(bruto_pesaje_momento, 'Después de cargar') = 'Después de cargar') THEN 1 -- Pesaje en Origen
    ELSE 3 -- Pesaje en Destino
END
WHERE tipo_mision_id IS NULL;

-- 7. Crear helper get_next_mision_estado
CREATE OR REPLACE FUNCTION public.get_next_mision_estado(p_remito_id bigint, p_current_state_code text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq jsonb;
  v_idx int;
  v_item jsonb;
  v_next_code text;
  v_next_activo boolean;
BEGIN
  SELECT mision_estados_secuencia INTO v_seq
  FROM public.remitos
  WHERE id = p_remito_id;
  
  IF v_seq IS NULL OR jsonb_array_length(v_seq) = 0 THEN
    RETURN NULL;
  END IF;
  
  -- Buscar índice actual
  FOR i IN 0..jsonb_array_length(v_seq) - 1 LOOP
    v_item := v_seq->i;
    IF (v_item->>'code' = p_current_state_code) THEN
      v_idx := i;
      EXIT;
    END IF;
  END LOOP;
  
  IF v_idx IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Buscar siguiente estado activo
  FOR i IN (v_idx + 1)..jsonb_array_length(v_seq) - 1 LOOP
    v_item := v_seq->i;
    v_next_code := v_item->>'code';
    v_next_activo := COALESCE((v_item->>'activo')::boolean, true);
    
    IF v_next_activo THEN
      RETURN v_next_code;
    END IF;
  END LOOP;
  
  RETURN NULL;
END;
$$;

-- 8. Redefinir trg_fn_initialize_remito_protocol
CREATE OR REPLACE FUNCTION public.trg_fn_initialize_remito_protocol()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE
  v_elem jsonb;
  v_new_protocol jsonb := '[]'::jsonb;
  v_default_gracia int;
  v_default_reintentos int;
  v_task_id int;
BEGIN
  -- 1. Inicializar mision_estados_secuencia si está vacía
  IF NEW.mision_estados_secuencia IS NULL OR jsonb_array_length(NEW.mision_estados_secuencia) = 0 THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'code', ed.codigo,
        'label', ed.nombre,
        'desc', ed.descripcion,
        'activo', true
      ) ORDER BY mtp.orden_especifico ASC
    ) INTO NEW.mision_estados_secuencia
    FROM public.mision_tipo_pasos mtp
    JOIN public.mision_estados_definicion ed ON mtp.estado_id = ed.id
    WHERE mtp.tipo_mision_id = COALESCE(NEW.tipo_mision_id, 1);
  END IF;

  -- 2. Inicializar protocolo_control si está vacío
  IF NEW.protocolo_control IS NULL OR jsonb_array_length(NEW.protocolo_control) = 0 THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'tarea', c.tarea_template,
        'tarea_template', c.tarea_template,
        'tipo_tarea', c.tipo_tarea,
        'requiere_foto', c.requiere_foto,
        'requiere_aviso', c.requiere_aviso,
        'orden_sugerido', c.orden_sugerido,
        'asignada_a_chofer', true,
        'estado', 'PENDIENTE',
        'minutos_gracia', COALESCE(c.gracia_minutos_default, c.minutos_gracia_default, 30),
        'reintentos_max', COALESCE(c.reintentos_max_default, 2),
        'estado_id', ed.codigo,
        'tipo_dato_esperado', COALESCE(c.tipo_dato_esperado, 'check'),
        'valor_reportado', null,
        'calificacion', 0
      ) ORDER BY c.orden_sugerido ASC
    ) INTO NEW.protocolo_control
    FROM public.catalogo_tareas_control c
    JOIN public.mision_estados_definicion ed ON c.estado_id = ed.id
    WHERE c.estado = 'ACTIVO'
      AND ed.codigo IN (
        SELECT value->>'code' 
        FROM jsonb_array_elements(NEW.mision_estados_secuencia)
      );
  ELSE
    -- Sincronizar elementos preexistentes del protocolo_control
    FOR v_elem IN SELECT * FROM jsonb_array_elements(NEW.protocolo_control) LOOP
      v_task_id := (v_elem->>'id')::int;
      
      -- Asegurar existencia de minutos_gracia y reintentos_max
      IF NOT (v_elem ? 'minutos_gracia') OR NOT (v_elem ? 'reintentos_max') THEN
        SELECT COALESCE(gracia_minutos_default, minutos_gracia_default, 30), COALESCE(reintentos_max_default, 2)
        INTO v_default_gracia, v_default_reintentos
        FROM public.catalogo_tareas_control
        WHERE id = v_task_id;
        
        IF NOT (v_elem ? 'minutos_gracia') THEN
          v_elem := v_elem || jsonb_build_object('minutos_gracia', COALESCE(v_default_gracia, 30));
        END IF;
        IF NOT (v_elem ? 'reintentos_max') THEN
          v_elem := v_elem || jsonb_build_object('reintentos_max', COALESCE(v_default_reintentos, 2));
        END IF;
      END IF;

      -- Asegurar tipo_dato_esperado, estado_id, calificacion y valor_reportado
      IF NOT (v_elem ? 'tipo_dato_esperado') OR NOT (v_elem ? 'estado_id') OR NOT (v_elem ? 'calificacion') THEN
        DECLARE
          v_c_type VARCHAR(50);
          v_c_state VARCHAR(50);
        BEGIN
          SELECT COALESCE(c.tipo_dato_esperado, 'check'), ed.codigo
          INTO v_c_type, v_c_state
          FROM public.catalogo_tareas_control c
          JOIN public.mision_estados_definicion ed ON c.estado_id = ed.id
          WHERE c.id = v_task_id;
          
          v_elem := v_elem || jsonb_build_object(
            'tipo_dato_esperado', COALESCE(v_c_type, 'check'),
            'estado_id', v_c_state,
            'calificacion', COALESCE((v_elem->>'calificacion')::int, 0),
            'valor_reportado', COALESCE(v_elem->'valor_reportado', v_elem->'valor_reportado_chofer', 'null'::jsonb)
          );
        END;
      END IF;

      v_new_protocol := v_new_protocol || jsonb_build_array(v_elem);
    END LOOP;
    NEW.protocolo_control := v_new_protocol;
  END IF;

  RETURN NEW;
END;
$$;

-- Sincronizar secuencias para remitos existentes
UPDATE public.remitos r
SET mision_estados_secuencia = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'code', ed.codigo,
      'label', ed.nombre,
      'desc', ed.descripcion,
      'activo', true
    ) ORDER BY mtp.orden_especifico ASC
  )
  FROM public.mision_tipo_pasos mtp
  JOIN public.mision_estados_definicion ed ON mtp.estado_id = ed.id
  WHERE mtp.tipo_mision_id = r.tipo_mision_id
)
WHERE r.mision_estados_secuencia IS NULL OR jsonb_array_length(r.mision_estados_secuencia) = 0;

-- 9. Redefinir trg_fn_fsm_auto_transition
CREATE OR REPLACE FUNCTION public.trg_fn_fsm_auto_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE
  v_nuevo_estado text;
  v_next_estado text;
  v_all_done boolean;
BEGIN
  IF NEW.protocolo_control IS NULL OR jsonb_array_length(NEW.protocolo_control) = 0 THEN
    RETURN NEW;
  END IF;

  v_nuevo_estado := COALESCE(NEW.mision_estado, 'OPERACION_PENDIENTE');

  LOOP
    -- Si estamos en un estado de espera externa, no podemos transicionar de forma automática
    IF v_nuevo_estado IN ('OPERACION_PENDIENTE', 'EN_TRANSITO', 'EN_DESCARGA', 'CONTROL_ENTREGA', 'MISION_COMPLETADA') THEN
      EXIT;
    END IF;

    -- Verificar si todas las tareas de este estado están completas
    SELECT COALESCE(bool_and(
      COALESCE((elem->>'asignada_a_chofer')::boolean, true) = false OR
      elem->>'estado' IN ('COMPLETADO', 'REPORTADO_CHOFER')
    ), true)
    INTO v_all_done
    FROM jsonb_array_elements(NEW.protocolo_control) AS elem
    WHERE elem->>'estado_id' = v_nuevo_estado;

    IF v_all_done THEN
      v_next_estado := public.get_next_mision_estado(NEW.id, v_nuevo_estado);
      IF v_next_estado IS NOT NULL AND v_next_estado <> v_nuevo_estado THEN
        v_nuevo_estado := v_next_estado;
      ELSE
        EXIT;
      END IF;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  -- Si cambió el estado, actualizar datos correspondientes
  IF v_nuevo_estado <> COALESCE(NEW.mision_estado, 'OPERACION_PENDIENTE') THEN
    NEW.mision_estado := v_nuevo_estado;
    NEW.ultimo_mensaje_chofer_at := NOW();
    NEW.retry_count := 0;
  END IF;

  RETURN NEW;
END;
$$;

-- 10. Redefinir trg_fn_fsm_text_transition
CREATE OR REPLACE FUNCTION public.trg_fn_fsm_text_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_remito_id bigint;
  v_mision_estado text;
  v_clean_text text;
  v_nuevo_estado text;
  v_pedido_instance_id bigint;
  v_has_image boolean;
BEGIN
  -- Solo actuar si el mensaje proviene del chofer
  IF NEW.direction <> 'in' THEN
    RETURN NEW;
  END IF;

  -- Obtener remito
  v_remito_id := NEW.remito_id;
  IF v_remito_id IS NULL THEN
    SELECT remito_actual_id INTO v_remito_id
    FROM public.conversations
    WHERE id = NEW.conversation_id;
  END IF;

  IF v_remito_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bloquear remito de forma segura
  SELECT mision_estado INTO v_mision_estado
  FROM public.remitos
  WHERE id = v_remito_id
  FOR UPDATE;

  IF v_mision_estado IS NULL OR v_mision_estado = 'MISION_COMPLETADA' OR v_mision_estado = 'OPERACION_PENDIENTE' THEN
    RETURN NEW;
  END IF;

  -- Normalizar entrada
  v_clean_text := lower(translate(NEW.body_text, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'));
  v_has_image := (NEW.message_type = 'image' OR (NEW.media_urls IS NOT NULL AND cardinality(NEW.media_urls) > 0));

  v_nuevo_estado := v_mision_estado;

  IF v_mision_estado = 'EN_TRANSITO' THEN
    IF v_clean_text LIKE '%llegue%' OR v_clean_text LIKE '%llegado%' OR v_clean_text LIKE '%estoy en destino%' OR v_clean_text LIKE '%ingres%' THEN
      v_nuevo_estado := COALESCE(public.get_next_mision_estado(v_remito_id, v_mision_estado), v_mision_estado);
    END IF;
    
  ELSIF v_mision_estado = 'EN_DESCARGA' THEN
    IF v_clean_text LIKE '%termine%' OR v_clean_text LIKE '%vacio%' OR v_clean_text LIKE '%descargado%' OR v_clean_text LIKE '%listo%' OR v_clean_text LIKE '%complete%' THEN
      v_nuevo_estado := COALESCE(public.get_next_mision_estado(v_remito_id, v_mision_estado), v_mision_estado);
    END IF;
    
  ELSIF v_mision_estado = 'CONTROL_ENTREGA' THEN
    IF v_has_image THEN
      v_nuevo_estado := COALESCE(public.get_next_mision_estado(v_remito_id, v_mision_estado), v_mision_estado);
    END IF;
  END IF;

  -- Guardar transición y auditar
  IF v_nuevo_estado <> v_mision_estado THEN
    UPDATE public.remitos
    SET mision_estado = v_nuevo_estado,
        ultimo_mensaje_chofer_at = NOW(),
        retry_count = 0,
        updated_at = NOW()
    WHERE id = v_remito_id;

    SELECT origen_instance_id INTO v_pedido_instance_id 
    FROM public.remito_items 
    WHERE remito_id = v_remito_id LIMIT 1;

    INSERT INTO public.historial_eventos (
      pedido_instance_id,
      event_type,
      description,
      user_actor,
      details
    ) VALUES (
      v_pedido_instance_id,
      'STATE_TRANSITION',
      format('Transición FSM automática de misión del remito #%s a %s basada en chat del chofer', v_remito_id, v_nuevo_estado),
      'sistema_fsm_texto',
      jsonb_build_object(
        'remito_id', v_remito_id,
        'to_state', v_nuevo_estado,
        'forced', false,
        'comentarios', format('Mensaje: "%s", Tipo: %s, Tiene imagen: %s', NEW.body_text, NEW.message_type, v_has_image)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 11. Redefinir save_remito_update_admin
CREATE OR REPLACE FUNCTION public.save_remito_update_admin(p_remito_id bigint, p_updates jsonb, p_admin_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
        operador_id = CASE WHEN p_updates ? 'operador_id' THEN NULLIF((p_updates->>'operador_id')::INT, 0) ELSE operador_id END,
        
        instrucciones_texto = CASE WHEN p_updates ? 'instrucciones_texto' THEN p_updates->>'instrucciones_texto' ELSE instrucciones_texto END,
        protocolo_control = CASE WHEN p_updates ? 'protocolo_control' THEN p_updates->'protocolo_control' ELSE protocolo_control END,
        
        tara_pesaje_momento = CASE WHEN p_updates ? 'tara_pesaje_momento' THEN p_updates->>'tara_pesaje_momento' ELSE tara_pesaje_momento END,
        tara_pesaje_lugar_id = CASE WHEN p_updates ? 'tara_pesaje_lugar_id' THEN NULLIF((p_updates->>'tara_pesaje_lugar_id')::INT, 0) ELSE tara_pesaje_lugar_id END,
        bruto_pesaje_momento = CASE WHEN p_updates ? 'bruto_pesaje_momento' THEN p_updates->>'bruto_pesaje_momento' ELSE bruto_pesaje_momento END,
        bruto_pesaje_lugar_id = CASE WHEN p_updates ? 'bruto_pesaje_lugar_id' THEN NULLIF((p_updates->>'bruto_pesaje_lugar_id')::INT, 0) ELSE bruto_pesaje_lugar_id END,
        
        fecha_hora_estimada_carga = CASE WHEN p_updates ? 'fecha_hora_estimada_carga' THEN (p_updates->>'fecha_hora_estimada_carga')::timestamp with time zone ELSE fecha_hora_estimada_carga END,
        debe_pasar_por_reembolse = CASE WHEN p_updates ? 'debe_pasar_por_reembolse' THEN (p_updates->>'debe_pasar_por_reembolse')::boolean ELSE debe_pasar_por_reembolse END,
        es_flete_corto = CASE WHEN p_updates ? 'es_flete_corto' THEN (p_updates->>'es_flete_corto')::boolean ELSE es_flete_corto END,
        fecha_probable_entrega = CASE WHEN p_updates ? 'fecha_probable_entrega' THEN (p_updates->>'fecha_probable_entrega')::timestamp with time zone ELSE fecha_probable_entrega END,
        
        mi_sobre_proveedor_preparado = CASE WHEN p_updates ? 'mi_sobre_proveedor_preparado' THEN (p_updates->>'mi_sobre_proveedor_preparado')::boolean ELSE mi_sobre_proveedor_preparado END,
        mi_sobre_cliente_preparado = CASE WHEN p_updates ? 'mi_sobre_cliente_preparado' THEN (p_updates->>'mi_sobre_cliente_preparado')::boolean ELSE mi_sobre_cliente_preparado END,
        me_planillas_t48_emitidas = CASE WHEN p_updates ? 'me_planillas_t48_emitidas' THEN (p_updates->>'me_planillas_t48_emitidas')::boolean ELSE me_planillas_t48_emitidas END,
        me_checklist_enviado_operario = CASE WHEN p_updates ? 'me_checklist_enviado_operario' THEN (p_updates->>'me_checklist_enviado_operario')::boolean ELSE me_checklist_enviado_operario END,
        
        deposito_carga_id = CASE WHEN p_updates ? 'deposito_carga_id' THEN NULLIF((p_updates->>'deposito_carga_id')::INT, 0) ELSE deposito_carga_id END,
        deposito_descarga_id = CASE WHEN p_updates ? 'deposito_descarga_id' THEN NULLIF((p_updates->>'deposito_descarga_id')::INT, 0) ELSE deposito_descarga_id END,
        retry_count = CASE WHEN p_updates ? 'retry_count' THEN (p_updates->>'retry_count')::INT ELSE retry_count END,
        
        mision_estado = CASE WHEN p_updates ? 'mision_estado' THEN p_updates->>'mision_estado' ELSE mision_estado END,
        tiene_incidencias_carga = CASE WHEN p_updates ? 'tiene_incidencias_carga' THEN (p_updates->>'tiene_incidencias_carga')::boolean ELSE tiene_incidencias_carga END,
        ultimo_mensaje_chofer_at = CASE WHEN p_updates ? 'ultimo_mensaje_chofer_at' THEN (p_updates->>'ultimo_mensaje_chofer_at')::timestamp with time zone ELSE ultimo_mensaje_chofer_at END,
        
        -- Nuevos campos dinámicos
        tipo_mision_id = CASE WHEN p_updates ? 'tipo_mision_id' THEN NULLIF((p_updates->>'tipo_mision_id')::INT, 0) ELSE tipo_mision_id END,
        mision_estados_secuencia = CASE WHEN p_updates ? 'mision_estados_secuencia' THEN p_updates->'mision_estados_secuencia' ELSE mision_estados_secuencia END,

        metadata_extraida = COALESCE(metadata_extraida, '{}'::jsonb) || p_updates,
        updated_at = NOW()
    WHERE id = p_remito_id;

    RETURN jsonb_build_object('status', 'SUCCESS');
END;
$$;

-- 12. Crear RPC enviar_mensaje_directo_chofer
CREATE OR REPLACE FUNCTION public.enviar_mensaje_directo_chofer(p_remito_id bigint, p_mensaje text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res json;
  v_conversation_id bigint;
BEGIN
  v_res := public.notify_n8n_whatsapp_requirement(p_remito_id, p_mensaje, 'DIRECT_MESSAGE');
  v_conversation_id := (v_res->>'conversation_id')::bigint;
  
  IF v_conversation_id IS NOT NULL THEN
    INSERT INTO public.conversation_messages (
      conversation_id,
      remito_id,
      direction,
      body_text,
      is_system_requirement,
      requirement_status
    ) VALUES (
      v_conversation_id,
      p_remito_id,
      'out',
      p_mensaje,
      false,
      null
    );
    
    RETURN jsonb_build_object('success', true, 'message', 'Mensaje enviado e insertado en el chat.');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'No se pudo obtener el ID de conversación.');
  END IF;
END;
$$;

-- 13. Crear audit log trigger y función
CREATE OR REPLACE FUNCTION public.trg_fn_audit_protocolo_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE
  v_old_elem jsonb;
  v_new_elem jsonb;
  v_old_item RECORD;
  v_new_item RECORD;
  v_pedido_instance_id bigint;
  v_user_email text;
BEGIN
  IF OLD.protocolo_control IS NULL OR NEW.protocolo_control IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT origen_instance_id INTO v_pedido_instance_id FROM public.remito_items WHERE remito_id = NEW.id LIMIT 1;
  
  BEGIN
    v_user_email := current_setting('request.jwt.claims', true)::jsonb->>'email';
  EXCEPTION WHEN OTHERS THEN
    v_user_email := 'operador';
  END;
  
  IF v_user_email IS NULL THEN
    v_user_email := 'operador';
  END IF;

  FOR v_new_elem IN SELECT * FROM jsonb_array_elements(NEW.protocolo_control) LOOP
    SELECT * INTO v_new_item FROM jsonb_to_record(v_new_elem) AS (id int, tarea text, estado text, calificacion int);
    
    SELECT * INTO v_old_item 
    FROM jsonb_to_recordset(OLD.protocolo_control) AS (id int, tarea text, estado text, calificacion int)
    WHERE id = v_new_item.id;
    
    IF FOUND THEN
      -- Auditar cambio de calificación
      IF COALESCE(v_new_item.calificacion, 0) <> COALESCE(v_old_item.calificacion, 0) THEN
        INSERT INTO public.historial_eventos (
          pedido_instance_id,
          event_type,
          description,
          user_actor,
          details
        ) VALUES (
          v_pedido_instance_id,
          'PERFORMANCE_RATING_CHANGED',
          format('Calificación de la tarea "%s" (ID: %s) cambiada de %s a %s', v_new_item.tarea, v_new_item.id, v_old_item.calificacion, v_new_item.calificacion),
          v_user_email,
          jsonb_build_object('tarea_id', v_new_item.id, 'old_calificacion', v_old_item.calificacion, 'new_calificacion', v_new_item.calificacion)
        );
      END IF;
      
      -- Auditar rechazo de tarea
      IF v_new_item.estado = 'RECHAZADO' AND COALESCE(v_old_item.estado, '') <> 'RECHAZADO' THEN
        INSERT INTO public.historial_eventos (
          pedido_instance_id,
          event_type,
          description,
          user_actor,
          details
        ) VALUES (
          v_pedido_instance_id,
          'TASK_REJECTED',
          format('Tarea "%s" (ID: %s) marcada como RECHAZADA por el operador', v_new_item.tarea, v_new_item.id),
          v_user_email,
          jsonb_build_object('tarea_id', v_new_item.id, 'old_estado', v_old_item.estado, 'new_estado', v_new_item.estado)
        );
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_protocolo_changes ON public.remitos;
CREATE TRIGGER trg_audit_protocolo_changes
BEFORE UPDATE OF protocolo_control ON public.remitos
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_audit_protocolo_changes();
