export interface InstanceData {
  instancia_id: number;
  referencia_humana: string;
  nro_pedido: string;
  tipo_mercado: 'MI' | 'ME';
  cliente: string;
  proveedor: string;
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
