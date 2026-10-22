import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { 
  OperacionItem, 
  MetricUnit, 
  DashboardTab, 
  StateDefinitionBasic, 
  MesBalance 
} from './types';
import type { InstanceData, EntityType } from '../../Monitor/types';
import { StackedBarChart } from './components/StackedBarChart';
import { BalanceMensualView } from './components/BalanceMensualView';
import { InformeTrazabilidadModal } from '../../Monitor/components/InformeTrazabilidadModal';
import { 
  Layers, Package, Scale, Calendar, Search, RefreshCw, 
  Eye, EyeOff, Clock, AlertTriangle
} from 'lucide-react';
import { cn } from '../../../lib/utils';

export function OperacionesDashboard() {
  // Pestaña activa
  const [activeTab, setActiveTab] = useState<DashboardTab>('OC');
  
  // Métrica seleccionada para el Eje Y (en OC y Pedidos)
  const [metricUnit, setMetricUnit] = useState<MetricUnit>('PESOS');
  
  // Filtro de Estados
  const [showOnlyActiveStates, setShowOnlyActiveStates] = useState(true);

  // Buscador de texto
  const [searchTerm, setSearchTerm] = useState('');

  // Rangos de fecha (por defecto cubriendo los últimos 6 meses del año en curso)
  const [datePreset, setDatePreset] = useState<'30D' | '3M' | '6M' | 'YTD' | 'ALL' | 'CUSTOM'>('6M');
  const [fechaDesde, setFechaDesde] = useState('2026-05-01');
  const [fechaHasta, setFechaHasta] = useState('2026-10-31');

  // Estados de carga y datos
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pedidosItems, setPedidosItems] = useState<OperacionItem[]>([]);
  const [ocItems, setOcItems] = useState<OperacionItem[]>([]);
  const [statesPedidos, setStatesPedidos] = useState<StateDefinitionBasic[]>([]);
  const [statesOc, setStatesOc] = useState<StateDefinitionBasic[]>([]);

  // Modal de informe de trazabilidad
  const [selectedInstanceForReport, setSelectedInstanceForReport] = useState<{
    instance: InstanceData;
    entityType: EntityType;
  } | null>(null);

  // Ajustar fechas según presets
  const handlePresetChange = (preset: '30D' | '3M' | '6M' | 'YTD' | 'ALL') => {
    setDatePreset(preset);
    const hoy = new Date(); // fecha actual en sistema
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    setFechaHasta(toYMD(hoy));

    if (preset === '30D') {
      const d = new Date(hoy);
      d.setDate(d.getDate() - 30);
      setFechaDesde(toYMD(d));
    } else if (preset === '3M') {
      const d = new Date(hoy);
      d.setMonth(d.getMonth() - 3);
      setFechaDesde(toYMD(d));
    } else if (preset === '6M') {
      const d = new Date(hoy);
      d.setMonth(d.getMonth() - 6);
      setFechaDesde(toYMD(d));
    } else if (preset === 'YTD') {
      setFechaDesde(`${hoy.getFullYear()}-01-01`);
    } else if (preset === 'ALL') {
      setFechaDesde('2025-01-01');
      setFechaHasta('2027-12-31');
    }
  };

  // Carga de datos de la base de datos
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Cargar definiciones de estados FSM 1 (Pedidos) y FSM 2 (OC)
      const [defsPedidoRes, defsOcRes] = await Promise.all([
        supabase
          .from('state_definitions')
          .select('state_code, name')
          .eq('fsm_id', 1)
          .order('state_code', { ascending: true }),
        supabase
          .from('state_definitions')
          .select('state_code, name')
          .eq('fsm_id', 2)
          .order('state_code', { ascending: true }),
      ]);

      if (defsPedidoRes.error) throw defsPedidoRes.error;
      if (defsOcRes.error) throw defsOcRes.error;

      setStatesPedidos(defsPedidoRes.data || []);
      setStatesOc(defsOcRes.data || []);

      // Cargar instancias de Pedidos
      const { data: rawPedidos, error: errPedidos } = await supabase
        .from('pedido_instancias')
        .select(`
          id,
          identificador_compuesto,
          created_at,
          status,
          cantidad_requerida_original,
          pedidos (
            id,
            pedido_ref_externa,
            fecha_pedido,
            cantidad_total_ton,
            precio_neto_kg,
            clientes ( razon_social )
          ),
          state_definitions (
            id,
            state_code,
            name
          )
        `);

      if (errPedidos) throw errPedidos;

      // Cargar instancias de Órdenes de Compra
      const { data: rawOc, error: errOc } = await supabase
        .from('oc_instancias')
        .select(`
          id,
          identificador_compuesto,
          created_at,
          status,
          cantidad_total,
          ordenes_compra (
            id,
            oc_ref_externa,
            fecha_emision,
            cantidad_total_ton,
            precio_neto_kg,
            proveedores ( razon_social )
          ),
          state_definitions (
            id,
            state_code,
            name
          )
        `);

      if (errOc) throw errOc;

      const nowMs = Date.now();

      // Mapear Pedidos a OperacionItem
      const mappedPedidos: OperacionItem[] = (rawPedidos || []).map((pi: any) => {
        const ped = pi.pedidos;
        const sd = pi.state_definitions;
        const ton = Number(pi.cantidad_requerida_original || ped?.cantidad_total_ton || 0);
        const precioKg = Number(ped?.precio_neto_kg || 0);
        const pesos = ton * 1000 * precioKg;
        
        const createdMs = new Date(pi.created_at).getTime();
        const horas = Math.max(0, (nowMs - createdMs) / (1000 * 3600));
        const color_alerta: 'VERDE' | 'AMARILLO' | 'ROJO' =
          horas < 24 ? 'VERDE' : horas <= 48 ? 'AMARILLO' : 'ROJO';

        return {
          instancia_id: pi.id,
          identificador_compuesto: pi.identificador_compuesto || '',
          nro_documento: ped?.pedido_ref_externa || `PED-${pi.id}`,
          fecha_documento: ped?.fecha_pedido || '',
          entidad: ped?.clientes?.razon_social || 'Consumidor Final',
          state_id: sd?.id || 0,
          state_code: sd?.state_code || '?',
          state_name: sd?.name || 'Estado Desconocido',
          created_at: pi.created_at,
          horas_transcurridas: horas,
          color_alerta,
          toneladas: ton,
          precio_neto_kg: precioKg,
          pesos,
          status: pi.status || 'ACTIVA',
        };
      });

      // Mapear OCs a OperacionItem
      const mappedOc: OperacionItem[] = (rawOc || []).map((oi: any) => {
        const oc = oi.ordenes_compra;
        const sd = oi.state_definitions;
        const ton = Number(oi.cantidad_total || oc?.cantidad_total_ton || 0);
        const precioKg = Number(oc?.precio_neto_kg || 0);
        const pesos = ton * 1000 * precioKg;
        
        const createdMs = new Date(oi.created_at).getTime();
        const horas = Math.max(0, (nowMs - createdMs) / (1000 * 3600));
        const color_alerta: 'VERDE' | 'AMARILLO' | 'ROJO' =
          horas < 24 ? 'VERDE' : horas <= 48 ? 'AMARILLO' : 'ROJO';

        return {
          instancia_id: oi.id,
          identificador_compuesto: oi.identificador_compuesto || '',
          nro_documento: oc?.oc_ref_externa || `OC-${oi.id}`,
          fecha_documento: oc?.fecha_emision || '',
          entidad: oc?.proveedores?.razon_social || 'Proveedor Desconocido',
          state_id: sd?.id || 0,
          state_code: sd?.state_code || '?',
          state_name: sd?.name || 'Estado Desconocido',
          created_at: oi.created_at,
          horas_transcurridas: horas,
          color_alerta,
          toneladas: ton,
          precio_neto_kg: precioKg,
          pesos,
          status: oi.status || 'ACTIVA',
        };
      });

      setPedidosItems(mappedPedidos);
      setOcItems(mappedOc);
    } catch (err: any) {
      console.error('Error cargando operaciones dashboard:', err);
      setError(err.message || 'Error al conectar con la base de datos.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtrado de items por fecha_documento y texto de búsqueda
  const filteredPedidos = useMemo(() => {
    return pedidosItems.filter(item => {
      if (fechaDesde && item.fecha_documento < fechaDesde) return false;
      if (fechaHasta && item.fecha_documento > fechaHasta) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const match = 
          item.nro_documento.toLowerCase().includes(q) ||
          item.entidad.toLowerCase().includes(q) ||
          item.identificador_compuesto.toLowerCase().includes(q) ||
          item.state_name.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [pedidosItems, fechaDesde, fechaHasta, searchTerm]);

  const filteredOc = useMemo(() => {
    return ocItems.filter(item => {
      if (fechaDesde && item.fecha_documento < fechaDesde) return false;
      if (fechaHasta && item.fecha_documento > fechaHasta) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const match = 
          item.nro_documento.toLowerCase().includes(q) ||
          item.entidad.toLowerCase().includes(q) ||
          item.identificador_compuesto.toLowerCase().includes(q) ||
          item.state_name.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [ocItems, fechaDesde, fechaHasta, searchTerm]);

  // Cálculo mensual para el Balance (respetando el rango de fechas)
  const balancesMensuales = useMemo<MesBalance[]>(() => {
    const mesesMap = new Map<string, MesBalance>();

    // Nombres abreviados de meses
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Función auxiliar para registrar en el mapa
    const getOrInitMes = (fechaStr: string) => {
      if (!fechaStr) return null;
      const [year, month] = fechaStr.split('-');
      if (!year || !month) return null;
      const key = `${year}-${month}`;

      if (!mesesMap.has(key)) {
        const mIdx = parseInt(month, 10) - 1;
        mesesMap.set(key, {
          mesClave: key,
          mesEtiqueta: `${mesesNombres[mIdx] || month} ${year}`,
          pedidosTn: 0,
          pedidosPesos: 0,
          pedidosCount: 0,
          ocTn: 0,
          ocPesos: 0,
          ocCount: 0,
          saldoTn: 0,
          saldoPesos: 0,
        });
      }
      return mesesMap.get(key)!;
    };

    // Acumular Pedidos
    filteredPedidos.forEach(p => {
      const m = getOrInitMes(p.fecha_documento);
      if (m) {
        m.pedidosTn += p.toneladas;
        m.pedidosPesos += p.pesos;
        m.pedidosCount += 1;
      }
    });

    // Acumular OCs
    filteredOc.forEach(oc => {
      const m = getOrInitMes(oc.fecha_documento);
      if (m) {
        m.ocTn += oc.toneladas;
        m.ocPesos += oc.pesos;
        m.ocCount += 1;
      }
    });

    // Calcular saldos netos y ordenar cronológicamente
    const sorted = Array.from(mesesMap.values()).sort((a, b) => a.mesClave.localeCompare(b.mesClave));

    sorted.forEach(m => {
      m.saldoTn = m.pedidosTn - m.ocTn;
      m.saldoPesos = m.pedidosPesos - m.ocPesos;
    });

    return sorted;
  }, [filteredPedidos, filteredOc]);

  // Handler para abrir el modal de trazabilidad al hacer clic en un segmento o fila
  const handleOpenReport = (item: OperacionItem, tipo: 'OC' | 'PEDIDO') => {
    // Fabricar el objeto InstanceData mínimo necesario para InformeTrazabilidadModal
    const instanceData: InstanceData = {
      instancia_id: item.instancia_id,
      referencia_humana: item.identificador_compuesto,
      nro_pedido: item.nro_documento,
      tipo_mercado: (item.tipo_mercado as any) || 'MI',
      cliente: tipo === 'PEDIDO' ? item.entidad : null,
      proveedor: tipo === 'OC' ? item.entidad : null,
      nro_remito: null,
      estado_actual: `${item.state_code}: ${item.state_name}`,
      horas_transcurridas: item.horas_transcurridas,
      color_alerta: item.color_alerta,
      toneladas_originales: item.toneladas,
      toneladas_actuales: item.toneladas,
      bolsas_50kg_originales: Math.round((item.toneladas * 1000) / 50),
      tareas_faltantes: [],
      proximos_estados: [],
    };

    setSelectedInstanceForReport({
      instance: instanceData,
      entityType: tipo,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 lg:p-8 space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center shadow-md shadow-brand-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight">
                Control Operativo de OCs y Pedidos
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Análisis de cuellos de botella por estado, SLA en tiempo real y balance volumétrico y financiero.
              </p>
            </div>
          </div>
        </div>

        {/* Botón de Refresco */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-gray-500", isLoading && "animate-spin")} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Barra de Filtros: Pestañas + Selector de Rango de Fechas */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Selector de Pestañas Principal */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('OC')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
              activeTab === 'OC'
                ? "bg-white text-brand-700 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Layers className="w-4 h-4 text-amber-500" />
            Órdenes de Compra ({filteredOc.length})
          </button>
          <button
            onClick={() => setActiveTab('PEDIDOS')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
              activeTab === 'PEDIDOS'
                ? "bg-white text-brand-700 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Package className="w-4 h-4 text-blue-500" />
            Pedidos ({filteredPedidos.length})
          </button>
          <button
            onClick={() => setActiveTab('BALANCE')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
              activeTab === 'BALANCE'
                ? "bg-white text-brand-700 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Scale className="w-4 h-4 text-emerald-500" />
            Balance Mensual ({balancesMensuales.length} meses)
          </button>
        </div>

        {/* Filtro de Fechas Compartido */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Presets Rápidos */}
          <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[11px] font-semibold border border-slate-200/70">
            {(['30D', '3M', '6M', 'YTD', 'ALL'] as const).map(p => (
              <button
                key={p}
                onClick={() => handlePresetChange(p)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-all",
                  datePreset === p
                    ? "bg-white text-gray-900 shadow-sm font-bold"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                {p === '30D' ? '30d' : p === '3M' ? '3m' : p === '6M' ? '6m' : p === 'YTD' ? '2026' : 'Histórico'}
              </button>
            ))}
          </div>

          {/* Inputs Desde - Hasta */}
          <div className="flex items-center gap-1.5 text-xs bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => {
                setFechaDesde(e.target.value);
                setDatePreset('CUSTOM');
              }}
              className="bg-transparent border-none text-slate-700 font-medium focus:ring-0 p-0 text-xs cursor-pointer"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => {
                setFechaHasta(e.target.value);
                setDatePreset('CUSTOM');
              }}
              className="bg-transparent border-none text-slate-700 font-medium focus:ring-0 p-0 text-xs cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Controles secundarios para vistas de OC y Pedidos */}
      {activeTab !== 'BALANCE' && (
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Selector de Métrica Eje Y */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Eje Y:
            </span>
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setMetricUnit('PESOS')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all",
                  metricUnit === 'PESOS'
                    ? "bg-white text-gray-900 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                💲 Pesos ($)
              </button>
              <button
                onClick={() => setMetricUnit('TONELADAS')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all",
                  metricUnit === 'TONELADAS'
                    ? "bg-white text-gray-900 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                ⚖️ Toneladas (Tn)
              </button>
              <button
                onClick={() => setMetricUnit('CANTIDAD')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all",
                  metricUnit === 'CANTIDAD'
                    ? "bg-white text-gray-900 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                🔢 Cantidad de {activeTab === 'OC' ? 'OCs' : 'Pedidos'}
              </button>
            </div>
          </div>

          {/* Opciones de filtro visual: Buscador y toggle de estados */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por número o entidad..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 w-56"
              />
            </div>

            <button
              onClick={() => setShowOnlyActiveStates(!showOnlyActiveStates)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                showOnlyActiveStates
                  ? "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  : "bg-brand-50 text-brand-700 border-brand-200"
              )}
            >
              {showOnlyActiveStates ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showOnlyActiveStates ? 'Solo con registros' : 'Todos los estados'}
            </button>
          </div>
        </div>
      )}

      {/* Manejo de Error o Loading */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>Error al procesar los datos: {error}</span>
        </div>
      )}

      {/* Contenido Principal según Pestaña Activa */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm font-semibold text-gray-600">Calculando métricas y saldos...</p>
        </div>
      ) : activeTab === 'OC' ? (
        <div className="space-y-6">
          {/* Gráfico de Barras Apiladas OC */}
          <StackedBarChart
            items={filteredOc}
            allStates={statesOc}
            metricUnit={metricUnit}
            tipoEntidad="OC"
            onSelectItem={(item) => handleOpenReport(item, 'OC')}
            showOnlyActiveStates={showOnlyActiveStates}
          />

          {/* Tabla de Detalle de OCs en rango */}
          <DetalleItemsTable
            items={filteredOc}
            tipo="OC"
            onSelect={(item) => handleOpenReport(item, 'OC')}
          />
        </div>
      ) : activeTab === 'PEDIDOS' ? (
        <div className="space-y-6">
          {/* Gráfico de Barras Apiladas Pedidos */}
          <StackedBarChart
            items={filteredPedidos}
            allStates={statesPedidos}
            metricUnit={metricUnit}
            tipoEntidad="PEDIDO"
            onSelectItem={(item) => handleOpenReport(item, 'PEDIDO')}
            showOnlyActiveStates={showOnlyActiveStates}
          />

          {/* Tabla de Detalle de Pedidos en rango */}
          <DetalleItemsTable
            items={filteredPedidos}
            tipo="PEDIDO"
            onSelect={(item) => handleOpenReport(item, 'PEDIDO')}
          />
        </div>
      ) : (
        /* Vista de Balance Mensual */
        <BalanceMensualView balances={balancesMensuales} />
      )}

      {/* Modal de Informe de Trazabilidad */}
      {selectedInstanceForReport && (
        <InformeTrazabilidadModal
          isOpen={true}
          onClose={() => setSelectedInstanceForReport(null)}
          instance={selectedInstanceForReport.instance}
          entityType={selectedInstanceForReport.entityType}
        />
      )}
    </div>
  );
}

// Subcomponente Tabla de Detalles
interface DetalleItemsTableProps {
  items: OperacionItem[];
  tipo: 'OC' | 'PEDIDO';
  onSelect: (item: OperacionItem) => void;
}

function DetalleItemsTable({ items, tipo, onSelect }: DetalleItemsTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const displayItems = isExpanded ? items : items.slice(0, 10);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
      <div className="p-4 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <span>Detalle de {tipo === 'OC' ? 'Órdenes de Compra' : 'Pedidos'}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold">
            {items.length} total
          </span>
        </h4>
        <span className="text-xs text-gray-500">
          Haz clic en cualquier fila para inspeccionar su informe de trazabilidad
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-100">
            <tr>
              <th className="py-3 px-4">Documento</th>
              <th className="py-3 px-4">Fecha</th>
              <th className="py-3 px-4">{tipo === 'OC' ? 'Proveedor' : 'Cliente'}</th>
              <th className="py-3 px-4">Estado Actual</th>
              <th className="py-3 px-4 text-center">Antigüedad (SLA)</th>
              <th className="py-3 px-4 text-right">Volumen</th>
              <th className="py-3 px-4 text-right">Importe ($)</th>
              <th className="py-3 px-4 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium">
            {displayItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-400">
                  No se encontraron {tipo === 'OC' ? 'órdenes' : 'pedidos'} en el rango de fechas seleccionado.
                </td>
              </tr>
            ) : (
              displayItems.map(item => (
                <tr
                  key={item.instancia_id}
                  onClick={() => onSelect(item)}
                  className="hover:bg-brand-50/40 cursor-pointer transition-colors group"
                >
                  <td className="py-3 px-4 font-mono font-bold text-gray-900 group-hover:text-brand-700">
                    {item.nro_documento}
                  </td>
                  <td className="py-3 px-4 text-gray-500">
                    {item.fecha_documento || 'S/D'}
                  </td>
                  <td className="py-3 px-4 text-gray-900 font-medium truncate max-w-[200px]">
                    {item.entidad}
                  </td>
                  <td className="py-3 px-4 text-gray-700">
                    <span className="font-semibold text-slate-900 mr-1">{item.state_code}:</span>
                    {item.state_name}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border",
                      item.color_alerta === 'VERDE' && "bg-emerald-50 text-emerald-700 border-emerald-200",
                      item.color_alerta === 'AMARILLO' && "bg-amber-50 text-amber-700 border-amber-200",
                      item.color_alerta === 'ROJO' && "bg-rose-50 text-rose-700 border-rose-200"
                    )}>
                      <Clock className="w-3 h-3" />
                      {item.horas_transcurridas.toFixed(1)} hs
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-gray-900">
                    {item.toneladas.toFixed(1)} Tn
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-700">
                    ${item.pesos.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(item);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 font-semibold transition-colors text-[11px]"
                    >
                      Trazabilidad
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {items.length > 10 && (
        <div className="p-3 bg-gray-50/50 border-t border-gray-100 text-center">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs font-semibold text-brand-700 hover:text-brand-800 transition-colors"
          >
            {isExpanded ? 'Mostrar menos (primeros 10)' : `Ver todos los ${items.length} registros`}
          </button>
        </div>
      )}
    </div>
  );
}
