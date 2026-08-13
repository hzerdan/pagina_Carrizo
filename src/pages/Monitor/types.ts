export type EntityType = 'PEDIDO' | 'OC';
export type FinalizadasFilterMode = 'RECIENTES' | 'TODAS' | 'ANTIGUAS';

export interface InstanceData {
  instancia_id: number;
  referencia_humana: string;
  nro_pedido: string;
  tipo_mercado: 'MI' | 'ME';
  cliente: string | null;
  proveedor: string | null;
  nro_remito: string | null;
  estado_actual: string;
  horas_transcurridas: number;
  color_alerta: 'VERDE' | 'AMARILLO' | 'ROJO';
  toneladas_originales: number;
  toneladas_actuales: number;
  bolsas_50kg_originales: number;
  tareas_faltantes: string[] | null;
  proximos_estados: string[] | null;
}

export interface StateDefinition {
  state_code: string;
  name: string;
}

export interface FilterState {
  tipoMercado: string;
  colorAlerta: string;
  searchPedido: string;
  stateFilterMode: 'TODOS' | 'CON_TARJETAS' | 'SELECCIONADOS';
  selectedStates: string[];
  finalizadasFilterMode: FinalizadasFilterMode;
}

export const DEFAULT_FILTERS: FilterState = {
  tipoMercado: 'TODOS',
  colorAlerta: 'TODOS',
  searchPedido: '',
  stateFilterMode: 'TODOS',
  selectedStates: [],
  finalizadasFilterMode: 'RECIENTES',
};


