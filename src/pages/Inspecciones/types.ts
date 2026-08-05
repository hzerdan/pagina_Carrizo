// ── Inspecciones Kanban – Types ────────────────────────────────────────

/** Single received template item */
export interface PlanillaRecibida {
  id: number;
  archivo_url: string;
  nombre_archivo: string;
  etiqueta_identificador: string | null;
  created_at: string;
  subido_por: string | null;
}

/** Row returned by public.v_inspecciones_kanban */
export interface InspeccionKanban {
  id: number;
  tipo_carga: string;
  inspector_nombre: string;
  fecha_pactada: string;
  export_doc_status: string;
  state_code: string;
  planilla_completada_url: string | null;
  servicio_id: number | null;
  servicio_nombre: string | null;
  servicio_requiere_pedido: boolean;
  referencia_cliente: string | null;
  cantidad_plantillas_requeridas: number;
  cantidad_plantillas_recibidas: number;
  planillas_recibidas: PlanillaRecibida[] | null;
  pedidos: PedidoVinculado[] | null;
}

export interface ServicioInspeccion {
  id: number;
  codigo_servicio: string;
  nombre: string;
  requiere_pedido_ac: boolean;
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
