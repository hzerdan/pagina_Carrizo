#!/usr/bin/env python3
"""
reset_remito.py
Genera la sentencia SQL canónica para resetear la misión de un remito limpiando buffers, mensajes y alertas sin tocar balanzas ni depósitos.
"""
import sys

def get_reset_sql(remito_id: str) -> str:
    return f"""
    -- Reset canónico de la misión
    SELECT public.reset_remito_mision({remito_id});

    -- Reinicio de sobres a false
    UPDATE public.remitos 
    SET mi_sobre_proveedor_preparado = false, 
        mi_sobre_cliente_preparado = false 
    WHERE id = {remito_id};

    -- Verificación de estado limpio
    SELECT id, remito_ref_externa, chofer_id, mision_estado, estado_asignacion, mi_sobre_proveedor_preparado, mi_sobre_cliente_preparado, fecha_hora_estimada_carga, tara_pesaje_lugar_id, bruto_pesaje_lugar_id, deposito_carga_id, deposito_descarga_id
    FROM public.remitos
    WHERE id = {remito_id};
    """

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python reset_remito.py <remito_id>")
        sys.exit(1)
    print(get_reset_sql(sys.argv[1]))
