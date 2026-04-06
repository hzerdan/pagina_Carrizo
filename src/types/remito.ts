export interface PedidoVinculado {
  id_instancia?: number;
  pedido_id?: number;
  oc_id?: number;
  pedido_ref?: string;
  oc_ref?: string;
  cliente?: string;
  proveedor?: string;
}

export interface RemitoActivo {
  id: number;
  nro_remito: string;
  archivo_url: string | null;
  chofer_nombre: string | null;
  chofer_telefono: string | null;
  instancias_vinculadas: PedidoVinculado[];
}

export interface RemitoContext {
  remito: any;
  pedidos: Array<{ cliente: string; cantidad: number; pedido_ref: string }>;
  catalogos: Catalogos;
  contexto: any;
}

export interface CatalogoItem {
  id: number;
  nombre?: string;
  patente?: string;
  tipo?: string;
  dni?: string;
  tarea?: string;
  tarea_template?: string;
  tipo_tarea?: string;
  estado?: string;
}

export interface Catalogos {
  balanzas: CatalogoItem[];
  camiones: CatalogoItem[];
  choferes: CatalogoItem[];
  personal: CatalogoItem[];
  tareas_control: CatalogoItem[];
}
