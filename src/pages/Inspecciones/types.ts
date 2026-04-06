// ── Inspecciones Kanban – Types ────────────────────────────────────────

/** Row returned by public.v_inspecciones_kanban */
export interface InspeccionKanban {
  id: number;
  tipo_carga: string;
  inspector_nombre: string;
  fecha_pactada: string;
  export_doc_status: string;
  state_code: string;
  planilla_url: string | null;
  pedidos: PedidoVinculado[];
}

export interface PedidoVinculado {
  identificador_compuesto: string;
}

/** Row from public.state_definitions WHERE fsm_id = 3 */
export interface StateDefinition {
  state_code: string;
  name: string;
}

/** Row from public.v_pedidos_elegibles_inspeccion */
export interface PedidoElegible {
  id: number;
  identificador: string;
  cliente: string;
  articulo: string;
}

/** Row from public.inspeccion_templates WHERE activo = true */
export interface InspeccionTemplate {
  id: number;
  codigo: string;
  nombre: string;
}

/** Inspector – personal_ac with role_id = 6 */
export interface Inspector {
  id: number;
  nombre: string;
}

/** Deposito (lugar de carga) */
export interface Deposito {
  id: number;
  nombre: string;
}

/** Tipo de carga options */
export const TIPOS_CARGA = ['Bolsas', 'Crudo', 'Contenedor'] as const;
export type TipoCarga = (typeof TIPOS_CARGA)[number];
