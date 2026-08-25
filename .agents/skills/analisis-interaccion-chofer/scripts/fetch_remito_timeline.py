#!/usr/bin/env python3
"""
fetch_remito_timeline.py
Extrae la cronología de mensajes, tiempos transcurridos y estado del protocolo para un remito dado su ID o referencia externa.
"""
import sys
import json

def get_query(remito_param: str) -> str:
    remito_param = remito_param.strip()
    return f"""
    WITH target_remito AS (
      SELECT r.id, r.remito_ref_externa, r.chofer_id, c.nombre_completo AS chofer_nombre,
             r.mision_estado, r.estado_asignacion, r.fecha_hora_estimada_carga, r.fecha_probable_entrega,
             r.mi_sobre_proveedor_preparado, r.mi_sobre_cliente_preparado, r.protocolo_control,
             lp_t.nombre AS balanza_tara, lp_b.nombre AS balanza_bruto,
             dep_c.nombre AS deposito_carga, dep_d.nombre AS deposito_descarga
      FROM public.remitos r
      LEFT JOIN public.choferes c ON r.chofer_id = c.id
      LEFT JOIN public.lugares_pesaje lp_t ON r.tara_pesaje_lugar_id = lp_t.id
      LEFT JOIN public.lugares_pesaje lp_b ON r.bruto_pesaje_lugar_id = lp_b.id
      LEFT JOIN public.depositos dep_c ON r.deposito_carga_id = dep_c.id
      LEFT JOIN public.depositos dep_d ON r.deposito_descarga_id = dep_d.id
      WHERE r.id::text = '{remito_param}' OR r.remito_ref_externa = '{remito_param}'
      LIMIT 1
    ),
    timeline AS (
      SELECT 
        cm.id,
        cm.sender_role,
        cm.body_text,
        cm.created_at,
        to_char(cm.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI:SS.MS') AS created_at_local,
        LAG(cm.created_at) OVER (ORDER BY cm.created_at ASC) AS prev_created_at,
        LAG(cm.sender_role) OVER (ORDER BY cm.created_at ASC) AS prev_sender_role,
        ROUND(EXTRACT(EPOCH FROM (cm.created_at - LAG(cm.created_at) OVER (ORDER BY cm.created_at ASC)))::numeric, 1) AS segundos_desde_anterior
      FROM public.conversation_messages cm
      WHERE cm.remito_id = (SELECT id FROM target_remito)
      ORDER BY cm.created_at ASC
    )
    SELECT json_build_object(
      'remito', (SELECT to_jsonb(tr.*) FROM target_remito tr),
      'mensajes_count', (SELECT COUNT(*) FROM timeline),
      'timeline', (SELECT COALESCE(json_agg(t.*), '[]'::json) FROM timeline t)
    ) AS resultado;
    """

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python fetch_remito_timeline.py <remito_id_o_ref>")
        sys.exit(1)
    print(get_query(sys.argv[1]))
