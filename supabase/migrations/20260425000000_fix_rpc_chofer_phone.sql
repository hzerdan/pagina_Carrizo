-- Fix get_full_context_by_remito to include choferes phone number
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
                    'cantidad', ri.cantidad
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
            
            -- Los nuevos Catálogos de Roles Nativos:
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
                WHERE r.codigo IN ('SUP', 'OP')
            ),
            
            'tareas_control', (SELECT COALESCE(jsonb_agg(to_jsonb(tc.*) ORDER BY tc.orden_sugerido ASC), '[]'::jsonb) FROM public.catalogo_tareas_control tc)
        )
    ) INTO v_result;
    RETURN v_result;
END;
$$;
