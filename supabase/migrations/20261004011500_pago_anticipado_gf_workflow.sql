-- ============================================================================
-- Migración: Flujo de Validación de Pago Anticipado por Gerencia Financiera (GF)
-- Fecha: 2026-10-04
-- Reglas AGENTS.md:
--   - Idempotencia en DDL
--   - DROP FUNCTION IF EXISTS previa con todas las firmas posibles
-- ============================================================================

-- 1. Agregar columnas a la tabla remitos para persistir la validación de GF
ALTER TABLE public.remitos
  ADD COLUMN IF NOT EXISTS gf_pago_aprobado BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gf_pago_aprobado_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gf_pago_aprobado_por TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gf_pago_comprobante_ref TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gf_pago_solicitado_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.remitos.gf_pago_aprobado IS 'Indica si la Gerencia Financiera aprobó el pago anticipado';
COMMENT ON COLUMN public.remitos.gf_pago_aprobado_at IS 'Fecha y hora de la validación del pago por parte de GF';
COMMENT ON COLUMN public.remitos.gf_pago_aprobado_por IS 'Usuario o email de GF que validó el pago';
COMMENT ON COLUMN public.remitos.gf_pago_comprobante_ref IS 'Referencia de comprobante o nota ingresada por GF';
COMMENT ON COLUMN public.remitos.gf_pago_solicitado_at IS 'Última fecha y hora en que se envió solicitud de validación a GF';

-- 2. Función para generar Magic Link con vigencia configurable (24h, 48h, 72h, etc.)
DROP FUNCTION IF EXISTS public.crear_magic_link_pago_anticipado(bigint, text, int);
DROP FUNCTION IF EXISTS public.crear_magic_link_pago_anticipado(bigint);
DROP FUNCTION IF EXISTS public.crear_magic_link_pago_anticipado(bigint, text);

CREATE OR REPLACE FUNCTION public.crear_magic_link_pago_anticipado(
    p_remito_id bigint,
    p_usuario_email text DEFAULT NULL,
    p_horas_validez int DEFAULT 72
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_token uuid := gen_random_uuid();
    v_expires_at timestamptz := now() + (COALESCE(p_horas_validez, 72) || ' hours')::interval;
    v_gf_email text := p_usuario_email;
BEGIN
    IF v_gf_email IS NULL OR trim(v_gf_email) = '' THEN
        SELECT p.email INTO v_gf_email
        FROM public.personal_ac p
        JOIN public.personal_ac_roles pr ON p.id = pr.personal_ac_id
        JOIN public.roles r ON pr.role_id = r.id
        WHERE r.codigo = 'GF' AND p.estado = 'ACTIVO'
        LIMIT 1;
    END IF;

    -- Invalidar tokens previos sin usar para este remito y tipo
    UPDATE public.magic_links
    SET used_at = now()
    WHERE instancia_id = p_remito_id
      AND tipo_entidad = 'GF_PAGO_ANTICIPADO'
      AND used_at IS NULL;

    INSERT INTO public.magic_links (
        token,
        instancia_id,
        tipo_entidad,
        usuario_email,
        expires_at
    ) VALUES (
        v_token,
        p_remito_id,
        'GF_PAGO_ANTICIPADO',
        v_gf_email,
        v_expires_at
    );

    UPDATE public.remitos
    SET gf_pago_solicitado_at = now()
    WHERE id = p_remito_id;

    RETURN jsonb_build_object(
        'token', v_token,
        'expires_at', v_expires_at,
        'usuario_email', v_gf_email
    );
END;
$function$;

-- 3. Función pública para obtener datos del pedido/remito mediante el token del Magic Link
DROP FUNCTION IF EXISTS public.get_pago_anticipado_context_by_token(text);

CREATE OR REPLACE FUNCTION public.get_pago_anticipado_context_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_token_uuid uuid;
    v_magic_link RECORD;
    v_remito RECORD;
    v_pedidos jsonb;
    v_status text;
BEGIN
    BEGIN
        v_token_uuid := p_token::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('valido', false, 'error', 'Token con formato inválido.');
    END;

    SELECT * INTO v_magic_link
    FROM public.magic_links
    WHERE token = v_token_uuid AND tipo_entidad = 'GF_PAGO_ANTICIPADO';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valido', false, 'error', 'Enlace no encontrado o no válido.');
    END IF;

    IF v_magic_link.expires_at < now() THEN
        v_status := 'EXPIRADO';
    ELSIF v_magic_link.used_at IS NOT NULL THEN
        v_status := 'USADO';
    ELSE
        v_status := 'PENDIENTE';
    END IF;

    SELECT * INTO v_remito
    FROM public.remitos
    WHERE id = v_magic_link.instancia_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valido', false, 'error', 'Remito no encontrado.');
    END IF;

    -- Obtener detalles de pedidos asociados
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'pedido_ref', p.pedido_ref_externa,
            'cliente', c.razon_social,
            'cuit_cliente', c.cuit,
            'cantidad', ri.cantidad,
            'tipo_mercado', p.tipo_mercado,
            'fecha_pedido', p.fecha_pedido,
            'precio_neto_kg', p.precio_neto_kg,
            'cotizacion_archivo_url', p.cotizacion_archivo_url,
            'forma_pago', pi_root.current_data->>'forma_pago',
            'productos', pi_root.current_data->'productos',
            'incoterm', pi_root.current_data->>'incoterm',
            'calidad_azucar', pi_root.current_data->>'calidad_azucar'
        )
    ), '[]'::jsonb)
    INTO v_pedidos
    FROM public.remito_items ri
    JOIN public.pedido_instancias pi_item ON ri.origen_instance_id = pi_item.id
    JOIN public.pedidos p ON pi_item.pedido_id = p.id
    JOIN public.clientes c ON p.cliente_id = c.id
    LEFT JOIN public.pedido_instancias pi_root ON pi_root.pedido_id = p.id AND pi_root.parent_instance_id IS NULL
    WHERE ri.remito_id = v_remito.id;

    RETURN jsonb_build_object(
        'valido', true,
        'estado_token', v_status,
        'expires_at', v_magic_link.expires_at,
        'used_at', v_magic_link.used_at,
        'usuario_email', v_magic_link.usuario_email,
        'remito', jsonb_build_object(
            'id', v_remito.id,
            'ref', v_remito.remito_ref_externa,
            'cantidad_total', v_remito.cantidad_total,
            'gf_pago_aprobado', v_remito.gf_pago_aprobado,
            'gf_pago_aprobado_at', v_remito.gf_pago_aprobado_at,
            'gf_pago_aprobado_por', v_remito.gf_pago_aprobado_por,
            'gf_pago_comprobante_ref', v_remito.gf_pago_comprobante_ref
        ),
        'pedidos', v_pedidos
    );
END;
$function$;

-- 4. Función pública para confirmar el pago desde el portal de GF
DROP FUNCTION IF EXISTS public.validar_pago_anticipado_por_token(text, text, text);
DROP FUNCTION IF EXISTS public.validar_pago_anticipado_por_token(text, text);
DROP FUNCTION IF EXISTS public.validar_pago_anticipado_por_token(text);

CREATE OR REPLACE FUNCTION public.validar_pago_anticipado_por_token(
    p_token text,
    p_comprobante_ref text DEFAULT NULL,
    p_validador_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_token_uuid uuid;
    v_magic_link RECORD;
    v_validador text;
BEGIN
    BEGIN
        v_token_uuid := p_token::uuid;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token con formato inválido.');
    END;

    SELECT * INTO v_magic_link
    FROM public.magic_links
    WHERE token = v_token_uuid AND tipo_entidad = 'GF_PAGO_ANTICIPADO';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Enlace no válido o inexistente.');
    END IF;

    IF v_magic_link.expires_at < now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'El enlace ha expirado. Solicite uno nuevo a Logística.');
    END IF;

    IF v_magic_link.used_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Este enlace ya fue utilizado previamente.');
    END IF;

    v_validador := COALESCE(NULLIF(trim(p_validador_email), ''), v_magic_link.usuario_email, 'Gerencia Financiera');

    -- Quemar token
    UPDATE public.magic_links
    SET used_at = now()
    WHERE token = v_token_uuid;

    -- Aprobar el remito
    UPDATE public.remitos
    SET gf_pago_aprobado = true,
        gf_pago_aprobado_at = now(),
        gf_pago_aprobado_por = v_validador,
        gf_pago_comprobante_ref = NULLIF(trim(p_comprobante_ref), '')
    WHERE id = v_magic_link.instancia_id;

    RETURN jsonb_build_object(
        'success', true,
        'remito_id', v_magic_link.instancia_id,
        'fecha_aprobacion', now(),
        'validador', v_validador
    );
END;
$function$;

-- 5. Actualización de get_full_context_by_remito para proveer los flags de pago anticipado y contacto de GF
DROP FUNCTION IF EXISTS public.get_full_context_by_remito(bigint);

CREATE OR REPLACE FUNCTION public.get_full_context_by_remito(p_remito_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_result JSONB;
    v_rec RECORD;
    v_tara_en_predio BOOLEAN := false;
    v_bruto_en_predio BOOLEAN := false;
    v_destino_pesaje_en_predio BOOLEAN := false;
    v_deposito_carga_nombre TEXT;
    v_deposito_descarga_nombre TEXT;
    v_balanza_tara_nombre TEXT;
    v_balanza_bruto_nombre TEXT;
    v_requiere_pago_anticipado BOOLEAN := false;
BEGIN
    SELECT r.id, r.deposito_carga_id, r.deposito_descarga_id, 
           r.tara_pesaje_lugar_id, r.bruto_pesaje_lugar_id,
           r.tara_pesaje_momento, r.bruto_pesaje_momento,
           dep_c.nombre AS dep_c_nom, dep_d.nombre AS dep_d_nom,
           lp_t.nombre AS lp_t_nom, lp_b.nombre AS lp_b_nom,
           lp_t.deposito_id AS lp_t_dep_id, lp_b.deposito_id AS lp_b_dep_id
    INTO v_rec
    FROM public.remitos r
    LEFT JOIN public.depositos dep_c ON r.deposito_carga_id = dep_c.id
    LEFT JOIN public.depositos dep_d ON r.deposito_descarga_id = dep_d.id
    LEFT JOIN public.lugares_pesaje lp_t ON r.tara_pesaje_lugar_id = lp_t.id
    LEFT JOIN public.lugares_pesaje lp_b ON r.bruto_pesaje_lugar_id = lp_b.id
    WHERE r.id = p_remito_id;

    IF v_rec.id IS NOT NULL THEN
      v_deposito_carga_nombre := v_rec.dep_c_nom;
      v_deposito_descarga_nombre := v_rec.dep_d_nom;
      v_balanza_tara_nombre := v_rec.lp_t_nom;
      v_balanza_bruto_nombre := v_rec.lp_b_nom;

      IF v_rec.tara_pesaje_momento = 'Después de descargar' THEN
        v_tara_en_predio := (v_rec.deposito_descarga_id IS NOT NULL AND v_rec.lp_t_dep_id = v_rec.deposito_descarga_id);
      ELSE
        v_tara_en_predio := (v_rec.deposito_carga_id IS NOT NULL AND v_rec.lp_t_dep_id = v_rec.deposito_carga_id);
      END IF;

      IF v_rec.bruto_pesaje_momento = 'Antes de descargar' THEN
        v_bruto_en_predio := (v_rec.deposito_descarga_id IS NOT NULL AND v_rec.lp_b_dep_id = v_rec.deposito_descarga_id);
      ELSE
        v_bruto_en_predio := (v_rec.deposito_carga_id IS NOT NULL AND v_rec.lp_b_dep_id = v_rec.deposito_carga_id);
      END IF;

      v_destino_pesaje_en_predio := (
        (v_rec.tara_pesaje_momento = 'Después de descargar' AND v_tara_en_predio) OR
        (v_rec.bruto_pesaje_momento = 'Antes de descargar' AND v_bruto_en_predio)
      );
    END IF;

    -- Verificar si algún pedido asociado tiene condición de pago anticipado
    SELECT EXISTS (
        SELECT 1 
        FROM public.remito_items ri
        JOIN public.pedido_instancias pi_item ON ri.origen_instance_id = pi_item.id
        JOIN public.pedido_instancias pi_root ON pi_root.pedido_id = pi_item.pedido_id AND pi_root.parent_instance_id IS NULL
        WHERE ri.remito_id = p_remito_id
          AND (pi_root.current_data->>'forma_pago') ILIKE '%anticipad%'
    ) INTO v_requiere_pago_anticipado;

    SELECT jsonb_build_object(
        'remito', (
            SELECT to_jsonb(r.*) || jsonb_build_object(
                'requiere_pago_anticipado', v_requiere_pago_anticipado,
                'mensajes_sin_respuesta_count', (
                    SELECT COUNT(*)::int
                    FROM public.conversation_messages cm
                    WHERE cm.remito_id = p_remito_id
                      AND cm.direction = 'out'
                      AND cm.created_at > COALESCE(
                        (SELECT MAX(created_at) FROM public.conversation_messages WHERE remito_id = p_remito_id AND direction = 'in'),
                        '1970-01-01 00:00:00+00'::timestamptz
                      )
                ),
                'balanza_tara_en_mismo_predio', v_tara_en_predio,
                'balanza_bruto_en_mismo_predio', v_bruto_en_predio,
                'pesaje_destino_en_mismo_predio', v_destino_pesaje_en_predio,
                'deposito_carga_nombre', v_deposito_carga_nombre,
                'deposito_descarga_nombre', v_deposito_descarga_nombre,
                'balanza_tara_nombre', v_balanza_tara_nombre,
                'balanza_bruto_nombre', v_balanza_bruto_nombre
            )
            FROM public.remitos r 
            WHERE r.id = p_remito_id
        ),
        'pedidos', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'pedido_ref', p.pedido_ref_externa,
                    'cliente', c.razon_social,
                    'cantidad', ri.cantidad,
                    'tipo_mercado', p.tipo_mercado,
                    'forma_pago', pi_root.current_data->>'forma_pago',
                    'es_anticipado', (pi_root.current_data->>'forma_pago') ILIKE '%anticipad%'
                )
            ), '[]'::jsonb)
            FROM public.remito_items ri
            JOIN public.pedido_instancias pi_item ON ri.origen_instance_id = pi_item.id
            JOIN public.pedidos p ON pi_item.pedido_id = p.id
            JOIN public.clientes c ON p.cliente_id = c.id
            LEFT JOIN public.pedido_instancias pi_root ON pi_root.pedido_id = p.id AND pi_root.parent_instance_id IS NULL
            WHERE ri.remito_id = p_remito_id
        ),
        'catalogos', jsonb_build_object(
            'choferes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre_completo, 'dni', dni, 'telefono', telefono)), '[]'::jsonb) FROM public.choferes),
            'camiones', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'patente', patente, 'tipo', tipo)), '[]'::jsonb) FROM public.camiones),
            'balanzas', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'direccion', direccion, 'google_maps_link', google_maps_link, 'deposito_id', deposito_id)), '[]'::jsonb) FROM public.lugares_pesaje WHERE estado = 'ACTIVO'),
            'depositos', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'tipo', tipo, 'funcion', funcion, 'calle', calle, 'numero', numero, 'localidad', localidad, 'provincia', provincia, 'google_maps_link', google_maps_link)), '[]'::jsonb) FROM public.depositos WHERE estado = 'ACTIVO'),
            'gf', (
                SELECT jsonb_build_object('id', p.id, 'nombre', p.nombre_completo, 'email', p.email, 'celular', p.celular)
                FROM public.personal_ac p
                JOIN public.personal_ac_roles pr ON p.id = pr.personal_ac_id
                JOIN public.roles r ON pr.role_id = r.id
                WHERE r.codigo = 'GF' AND p.estado = 'ACTIVO'
                LIMIT 1
            ),
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
$function$;

-- 6. Salvaguarda en save_remito_update_admin (bloqueo a nivel base de datos)
DROP FUNCTION IF EXISTS public.save_remito_update_admin(bigint, jsonb, text);

CREATE OR REPLACE FUNCTION public.save_remito_update_admin(p_remito_id bigint, p_updates jsonb, p_admin_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_pedido_instancia_id BIGINT;
    v_campo TEXT;
    v_valor_nuevo TEXT;
    v_gf_aprobado BOOLEAN;
    v_requiere_pago BOOLEAN;
BEGIN
    -- Validar si el remito requiere pago anticipado y no fue aprobado aún
    SELECT r.gf_pago_aprobado INTO v_gf_aprobado FROM public.remitos r WHERE r.id = p_remito_id;
    
    SELECT EXISTS (
        SELECT 1 
        FROM public.remito_items ri
        JOIN public.pedido_instancias pi_item ON ri.origen_instance_id = pi_item.id
        JOIN public.pedido_instancias pi_root ON pi_root.pedido_id = pi_item.pedido_id AND pi_root.parent_instance_id IS NULL
        WHERE ri.remito_id = p_remito_id
          AND (pi_root.current_data->>'forma_pago') ILIKE '%anticipad%'
    ) INTO v_requiere_pago;

    IF v_requiere_pago AND NOT COALESCE(v_gf_aprobado, false) THEN
        -- Si solo se está actualizando la incidencia, permitirlo; si son datos logísticos de fondo, bloquear.
        IF NOT (p_updates ? 'tiene_incidencias_carga' AND (SELECT count(*) FROM jsonb_object_keys(p_updates)) = 1) THEN
            RAISE EXCEPTION 'Operación denegada: Este remito requiere validación de pago anticipado por parte de Gerencia Financiera.';
        END IF;
    END IF;

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
        
        tipo_mision_id = CASE WHEN p_updates ? 'tipo_mision_id' THEN NULLIF((p_updates->>'tipo_mision_id')::INT, 0) ELSE tipo_mision_id END,
        mision_estados_secuencia = CASE WHEN p_updates ? 'mision_estados_secuencia' THEN p_updates->'mision_estados_secuencia' ELSE mision_estados_secuencia END,

        metadata_extraida = COALESCE(metadata_extraida, '{}'::jsonb) || p_updates,
        updated_at = NOW()
    WHERE id = p_remito_id;

    RETURN jsonb_build_object('status', 'SUCCESS');
END;
$function$;
