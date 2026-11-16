export type MetricUnit = 'PESOS' | 'TONELADAS' | 'CANTIDAD';
export type DashboardTab = 'OC' | 'PEDIDOS' | 'BALANCE';
export type ActiveStatusFilter = 'ACTIVAS' | 'INACTIVAS' | 'TODAS';
export type MercadoFilter = 'TODAS' | 'MI' | 'ME';
export type CurrencyMode = 'ARS' | 'USD';

export interface DrillDownFilter {
  stateCode: string;
  stateName: string;
  colorAlerta?: 'VERDE' | 'AMARILLO' | 'ROJO';
}

export interface OperacionItem {
  instancia_id: number;
  identificador_compuesto: string;
  nro_documento: string;
  fecha_documento: string; // YYYY-MM-DD
  entidad: string; // Cliente o Proveedor
  state_id: number;
  state_code: string;
  state_name: string;
  created_at: string; // timestamp ISO
  updated_at?: string;
  horas_transcurridas: number;
  color_alerta: 'VERDE' | 'AMARILLO' | 'ROJO';
  toneladas: number;
  precio_neto_kg: number;
  pesos: number;
  dolares: number;
  tipo_cambio?: number | null;
  moneda_original: 'ARS' | 'USD';
  status: string; // 'ACTIVA' | 'COMPLETADA' | 'ANULADA'
  tipo_mercado: 'MI' | 'ME' | string;
}

export interface StateDefinitionBasic {
  state_code: string;
  name: string;
}

export interface MesBalance {
  mesClave: string; // '2026-06'
  mesEtiqueta: string; // 'Jun 2026'
  pedidosTn: number;
  pedidosPesos: number;
  pedidosCount: number;
  ocTn: number;
  ocPesos: number;
  ocCount: number;
  saldoTn: number;
  saldoPesos: number;
}
