export type MetricUnit = 'PESOS' | 'TONELADAS' | 'CANTIDAD';
export type DashboardTab = 'OC' | 'PEDIDOS' | 'BALANCE';

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
  horas_transcurridas: number;
  color_alerta: 'VERDE' | 'AMARILLO' | 'ROJO';
  toneladas: number;
  precio_neto_kg: number;
  pesos: number;
  status: string;
  tipo_mercado?: string;
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
