import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import type { 
  OperacionItem, 
  MetricUnit, 
  DashboardTab, 
  StateDefinitionBasic, 
  MesBalance,
  ActiveStatusFilter,
  MercadoFilter,
  CurrencyMode,
  DrillDownFilter 
} from './types';
import type { InstanceData, EntityType } from '../../Monitor/types';
import { StackedBarChart } from './components/StackedBarChart';
import { BalanceMensualView } from './components/BalanceMensualView';
import { InformeTrazabilidadModal } from '../../Monitor/components/InformeTrazabilidadModal';
import { 
  Layers, Package, Scale, Calendar, Search, RefreshCw, 
  Eye, EyeOff, Clock, AlertTriangle, CheckCircle2, 
  Archive, Globe, Filter, X
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatDateDDMMYYYY } from '../../../lib/dateUtils';

export function OperacionesDashboard() {
  // Pestaña activa
  const [activeTab, setActiveTab] = useState<DashboardTab>('OC');
  
  // Métrica seleccionada para el Eje Y (en OC y Pedidos)
  const [metricUnit, setMetricUnit] = useState<MetricUnit>('PESOS');
  
  // Filtro de Activas / Inactivas / Todas
  const [activeFilter, setActiveFilter] = useState<ActiveStatusFilter>('ACTIVAS');

  // Filtro de Mercado (Todas / MI / ME)
  const [mercadoFilter, setMercadoFilter] = useState<MercadoFilter>('TODAS');

  // Modo de divisa para Mercado Externo (USD o ARS al tipo de cambio)
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>('USD');

  // Filtro de Drill-Down (cuando se hace clic en un color o base de estado)
  const [drillDownFilter, setDrillDownFilter] = useState<DrillDownFilter | null>(null);

  // Filtro visual de Estados (mostrar solo columnas con registros)
  const [showOnlyActiveStates, setShowOnlyActiveStates] = useState(true);

  // Buscador de texto
  const [searchTerm, setSearchTerm] = useState('');

  // Rangos de fecha dinámicos (por defecto últimos 12 meses móviles)
  const [datePreset, setDatePreset] = useState<'30D' | '3M' | '6M' | '12M' | 'YTD' | 'ALL' | 'CUSTOM'>('12M');
  const [fechaDesde, setFechaDesde] = useState(() => {
    const hoy = new Date();
    const d = new Date(hoy);
    d.setFullYear(d.getFullYear() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [fechaHasta, setFechaHasta] = useState(() => {
    const hoy = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
  });

  // Referencias a los inputs nativos para abrir el selector de calendario directamente al hacer clic
  const fechaDesdeRef = useRef<HTMLInputElement>(null);
  const fechaHastaRef = useRef<HTMLInputElement>(null);

  const openDatePicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (!ref.current) return;
    if ('showPicker' in HTMLInputElement.prototype && typeof ref.current.showPicker === 'function') {
      try {
        ref.current.showPicker();
        return;
      } catch (e) {
        // Fallback si el navegador lo bloquea
      }
    }
    ref.current.focus();
  };

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

  // Resetear drillDown al cambiar pestaña o filtros estructurales
  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    setDrillDownFilter(null);
  };

  const handleActiveFilterChange = (filter: ActiveStatusFilter) => {
    setActiveFilter(filter);
    setDrillDownFilter(null);
  };

  const handleMercadoFilterChange = (mercado: MercadoFilter) => {
    setMercadoFilter(mercado);
    setDrillDownFilter(null);
  };

  // Ajustar fechas según presets
  const handlePresetChange = (preset: '30D' | '3M' | '6M' | '12M' | 'YTD' | 'ALL') => {
    setDatePreset(preset);
    const hoy = new Date();
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
    } else if (preset === '12M') {
      const d = new Date(hoy);
      d.setFullYear(d.getFullYear() - 1);
      setFechaDesde(toYMD(d));
    } else if (preset === 'YTD') {
      setFechaDesde(`${hoy.getFullYear()}-01-01`);
    } else if (preset === 'ALL') {
      // Histórico completo: desde el inicio de registros hasta hoy
      setFechaDesde('2024-01-01');
      setFechaHasta(toYMD(hoy));
    }
  };

  // Carga de datos de la base de datos
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Cargar definiciones de estados FSM 1 (Pedidos) y FSM 2 (OC) + métricas de monitor en tiempo real
      const [defsPedidoRes, defsOcRes, monitorPedidosRes, monitorOcRes] = await Promise.all([
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
        supabase
          .from('vw_monitor_instancias_activas')
          .select('instancia_id, horas_transcurridas, color_alerta'),
        supabase
          .from('vw_monitor_oc_instancias_activas')
          .select('instancia_id, horas_transcurridas, color_alerta'),
      ]);

      if (defsPedidoRes.error) throw defsPedidoRes.error;
      if (defsOcRes.error) throw defsOcRes.error;

      setStatesPedidos(defsPedidoRes.data || []);
      setStatesOc(defsOcRes.data || []);

      const monitorPedidosMap = new Map<number, { horas: number; color: 'VERDE' | 'AMARILLO' | 'ROJO' }>();
      (monitorPedidosRes.data || []).forEach((m: any) => {
        monitorPedidosMap.set(m.instancia_id, {
          horas: Number(m.horas_transcurridas || 0),
          color: (m.color_alerta as any) || 'VERDE',
        });
      });

      const monitorOcMap = new Map<number, { horas: number; color: 'VERDE' | 'AMARILLO' | 'ROJO' }>();
      (monitorOcRes.data || []).forEach((m: any) => {
        monitorOcMap.set(m.instancia_id, {
          horas: Number(m.horas_transcurridas || 0),
          color: (m.color_alerta as any) || 'VERDE',
        });
      });

      // Cargar instancias de Pedidos (con tipo_mercado, updated_at y current_data)
      const { data: rawPedidos, error: errPedidos } = await supabase
        .from('pedido_instancias')
        .select(`
          id,
          identificador_compuesto,
          created_at,
          updated_at,
          status,
          current_data,
          cantidad_requerida_original,
          pedidos (
            id,
            pedido_ref_externa,
            fecha_pedido,
            cantidad_total_ton,
            precio_neto_kg,
            tipo_mercado,
            clientes ( razon_social )
          ),
          state_definitions (
            id,
            state_code,
            name
          )
        `);

      if (errPedidos) throw errPedidos;

      // Cargar instancias de Órdenes de Compra (con tipo_operatoria, updated_at y current_data)
      const { data: rawOc, error: errOc } = await supabase
        .from('oc_instancias')
        .select(`
          id,
          identificador_compuesto,
          created_at,
          updated_at,
          status,
          current_data,
          cantidad_total,
          ordenes_compra (
            id,
            oc_ref_externa,
            fecha_emision,
            cantidad_total_ton,
            precio_neto_kg,
            tipo_operatoria,
            proveedores ( razon_social )
          ),
          state_definitions (
            id,
            state_code,
            name
          )
        `);

      if (errOc) throw errOc;

      // Mapear Pedidos a OperacionItem
      const mappedPedidos: OperacionItem[] = (rawPedidos || []).map((pi: any) => {
        const ped = pi.pedidos;
        const sd = pi.state_definitions;
        const cd = pi.current_data || {};
        const status = (pi.status || 'ACTIVA').toUpperCase();

        const rawMercado = ped?.tipo_mercado || cd?.tipo_pedido || 'MI';
        const tipo_mercado: 'MI' | 'ME' = rawMercado.toUpperCase() === 'ME' ? 'ME' : 'MI';

        const ton = Number(pi.cantidad_requerida_original || ped?.cantidad_total_ton || 0);
        const precioKg = Number(ped?.precio_neto_kg || 0);

        // Precios y monedas
        let tipo_cambio: number | null = cd?.tipo_cambio ? Number(cd.tipo_cambio) : null;
        let dolares = 0;
        let pesos = 0;
        let moneda_original: 'ARS' | 'USD' = 'ARS';

        if (tipo_mercado === 'ME') {
          moneda_original = 'USD';
          const usdPorTon = Number(cd?.precio_total_informado_usd || (cd?.precio_kg_informado ? cd.precio_kg_informado * 1000 : 0));
          if (usdPorTon > 0) {
            dolares = ton * usdPorTon;
          } else if (Array.isArray(cd?.productos) && cd.productos.length > 0) {
            dolares = cd.productos.reduce((acc: number, p: any) => acc + (Number(p.cantidad || 0) * Number(p.precio_unitario_neto || 0)), 0);
          }

          if (tipo_cambio && tipo_cambio > 0) {
            pesos = dolares * tipo_cambio;
          } else if (precioKg > 0) {
            pesos = ton * 1000 * precioKg;
          }
        } else {
          moneda_original = 'ARS';
          pesos = ton * 1000 * precioKg;
        }

        // Cálculo de horas y SLA alineado 100% con Monitor de Instancias (tiempo en estado actual)
        const monitorData = monitorPedidosMap.get(pi.id);
        let horas = 0;
        let color_alerta: 'VERDE' | 'AMARILLO' | 'ROJO' = 'VERDE';

        if (monitorData) {
          horas = monitorData.horas;
          color_alerta = monitorData.color;
        } else {
          // Si está completada o anulada, tiempo de ciclo transcurrido hasta el fin
          const createdMs = new Date(pi.created_at).getTime();
          const updatedMs = pi.updated_at ? new Date(pi.updated_at).getTime() : createdMs;
          horas = Math.max(0, (updatedMs - createdMs) / (1000 * 3600));
          color_alerta = horas > 24 ? 'ROJO' : horas > 12 ? 'AMARILLO' : 'VERDE';
        }

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
          updated_at: pi.updated_at,
          horas_transcurridas: horas,
          color_alerta,
          toneladas: ton,
          precio_neto_kg: precioKg,
          pesos,
          dolares,
          tipo_cambio,
          moneda_original,
          status,
          tipo_mercado,
        };
      });

      // Mapear OCs a OperacionItem
      const mappedOc: OperacionItem[] = (rawOc || []).map((oi: any) => {
        const oc = oi.ordenes_compra;
        const sd = oi.state_definitions;
        const cd = oi.current_data || {};
        const status = (oi.status || 'ACTIVA').toUpperCase();

        const rawMercado = oc?.tipo_operatoria || cd?.tipo_operatoria || 'MI';
        const tipo_mercado: 'MI' | 'ME' = rawMercado.toUpperCase() === 'ME' ? 'ME' : 'MI';

        const ton = Number(oi.cantidad_total || oc?.cantidad_total_ton || 0);
        const precioKg = Number(oc?.precio_neto_kg || 0);

        // Precios y monedas
        let tipo_cambio: number | null = cd?.tipo_cambio ? Number(cd.tipo_cambio) : null;
        let dolares = 0;
        let pesos = 0;
        let moneda_original: 'ARS' | 'USD' = 'ARS';

        if (tipo_mercado === 'ME') {
          moneda_original = 'USD';
          const usdPorTon = Number(cd?.precio_usd_tonelada || (cd?.validaciones?.mi?.precio_kg_informado ? cd.validaciones.mi.precio_kg_informado * 1000 : 0));
          if (usdPorTon > 0) {
            dolares = ton * usdPorTon;
          } else if (Array.isArray(cd?.items) && cd.items.length > 0) {
            dolares = cd.items.reduce((acc: number, it: any) => acc + (Number(it.cantidad || 0) * Number(it.precio_unitario || 0)), 0);
          }

          if (tipo_cambio && tipo_cambio > 0) {
            pesos = dolares * tipo_cambio;
          } else if (precioKg > 0) {
            pesos = ton * 1000 * precioKg;
          }
        } else {
          moneda_original = 'ARS';
          pesos = ton * 1000 * precioKg;
        }

        // Cálculo de horas y SLA alineado 100% con Monitor de Instancias (tiempo en estado actual)
        const monitorData = monitorOcMap.get(oi.id);
        let horas = 0;
        let color_alerta: 'VERDE' | 'AMARILLO' | 'ROJO' = 'VERDE';

        if (monitorData) {
          horas = monitorData.horas;
          color_alerta = monitorData.color;
        } else {
          const createdMs = new Date(oi.created_at).getTime();
          const updatedMs = oi.updated_at ? new Date(oi.updated_at).getTime() : createdMs;
          horas = Math.max(0, (updatedMs - createdMs) / (1000 * 3600));
          color_alerta = horas > 24 ? 'ROJO' : horas > 12 ? 'AMARILLO' : 'VERDE';
        }

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
          updated_at: oi.updated_at,
          horas_transcurridas: horas,
          color_alerta,
          toneladas: ton,
          precio_neto_kg: precioKg,
          pesos,
          dolares,
          tipo_cambio,
          moneda_original,
          status,
          tipo_mercado,
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

  // Función genérica de filtrado
  const filterItem = (item: OperacionItem) => {
    // Rango de fechas
    if (fechaDesde && item.fecha_documento && item.fecha_documento < fechaDesde) return false;
    if (fechaHasta && item.fecha_documento && item.fecha_documento > fechaHasta) return false;

    // Filtro Activas / Inactivas / Todas
    if (activeFilter === 'ACTIVAS' && item.status !== 'ACTIVA') return false;
    if (activeFilter === 'INACTIVAS' && item.status === 'ACTIVA') return false;

    // Filtro Mercado
    if (mercadoFilter === 'MI' && item.tipo_mercado !== 'MI') return false;
    if (mercadoFilter === 'ME' && item.tipo_mercado !== 'ME') return false;

    // Buscador
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
  };

  const filteredPedidos = useMemo(() => {
    return pedidosItems.filter(filterItem);
  }, [pedidosItems, fechaDesde, fechaHasta, activeFilter, mercadoFilter, searchTerm]);

  const filteredOc = useMemo(() => {
    return ocItems.filter(filterItem);
  }, [ocItems, fechaDesde, fechaHasta, activeFilter, mercadoFilter, searchTerm]);

  // Cálculo mensual para el Balance
  const balancesMensuales = useMemo<MesBalance[]>(() => {
    const mesesMap = new Map<string, MesBalance>();
    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

    filteredPedidos.forEach(p => {
      const m = getOrInitMes(p.fecha_documento);
      if (m) {
        m.pedidosTn += p.toneladas;
        m.pedidosPesos += p.pesos;
        m.pedidosCount += 1;
      }
    });

    filteredOc.forEach(oc => {
      const m = getOrInitMes(oc.fecha_documento);
      if (m) {
        m.ocTn += oc.toneladas;
        m.ocPesos += oc.pesos;
        m.ocCount += 1;
      }
    });

    const sorted = Array.from(mesesMap.values()).sort((a, b) => a.mesClave.localeCompare(b.mesClave));
    sorted.forEach(m => {
      m.saldoTn = m.pedidosTn - m.ocTn;
      m.saldoPesos = m.pedidosPesos - m.ocPesos;
    });

    return sorted;
  }, [filteredPedidos, filteredOc]);

  // Handler para abrir modal de trazabilidad
  const handleOpenReport = (item: OperacionItem, tipo: 'OC' | 'PEDIDO') => {
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

  // Modo de divisa efectivo: si el mercado es ME, se respeta la elección (USD o ARS); si es TODAS o MI, la divisa unificada es ARS ($)
  const effectiveCurrencyMode: CurrencyMode = mercadoFilter === 'ME' ? currencyMode : 'ARS';

  // Items para la tabla inferior (filtrados por drill-down si está activo)
  const currentTabItems = activeTab === 'OC' ? filteredOc : filteredPedidos;
  const tableItems = useMemo(() => {
    if (!drillDownFilter) return currentTabItems;
    return currentTabItems.filter(item => {
      if (item.state_code !== drillDownFilter.stateCode) return false;
      if (drillDownFilter.colorAlerta && item.color_alerta !== drillDownFilter.colorAlerta) return false;
      return true;
    });
  }, [currentTabItems, drillDownFilter]);

  return (
    <div className="flex-1 overflow-auto bg-slate-50/60 p-4 lg:p-8 space-y-6">
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

      {/* Barra de Filtros Nivel 1: Pestañas Principales + Selector de Fechas */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Selector de Pestañas Principal */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80 text-xs font-semibold">
          <button
            onClick={() => handleTabChange('OC')}
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
            onClick={() => handleTabChange('PEDIDOS')}
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
            onClick={() => handleTabChange('BALANCE')}
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
          <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[11px] font-semibold border border-slate-200/70">
            {(['30D', '3M', '6M', '12M', 'YTD', 'ALL'] as const).map(p => (
              <button
                key={p}
                onClick={() => handlePresetChange(p)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-all",
                  (datePreset === p || (p === 'ALL' && datePreset === 'CUSTOM'))
                    ? "bg-white text-gray-900 shadow-sm font-bold"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                {p === '30D' ? '30d' : p === '3M' ? '3m' : p === '6M' ? '6m' : p === '12M' ? '12m' : p === 'YTD' ? `Año ${new Date().getFullYear()}` : 'Histórico'}
              </button>
            ))}
          </div>

          {/* Inputs de Fecha formateados como DD/MM/YYYY con apertura instantánea de calendario */}
          <div className="flex items-center gap-1.5 text-xs bg-slate-50 p-1 rounded-xl border border-slate-200 shadow-sm">
            {/* Fecha Desde */}
            <div 
              onClick={() => openDatePicker(fechaDesdeRef)}
              className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100/80 border border-slate-200/80 hover:border-brand-300 transition-all cursor-pointer group shadow-xs"
              title="Hacé clic para cambiar la fecha inicial (Desde)"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-600 transition-colors shrink-0" />
              <span className="font-semibold text-slate-700 group-hover:text-brand-600 transition-colors select-none">
                {fechaDesde ? formatDateDDMMYYYY(fechaDesde) : 'DD/MM/YYYY'}
              </span>
              <input
                ref={fechaDesdeRef}
                type="date"
                value={fechaDesde}
                onChange={(e) => {
                  setFechaDesde(e.target.value);
                  setDatePreset('CUSTOM');
                }}
                onClick={(e) => {
                  try {
                    (e.currentTarget as any).showPicker?.();
                  } catch {}
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Seleccionar fecha desde"
              />
            </div>

            <span className="text-slate-400 font-bold select-none px-0.5">→</span>

            {/* Fecha Hasta */}
            <div 
              onClick={() => openDatePicker(fechaHastaRef)}
              className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100/80 border border-slate-200/80 hover:border-brand-300 transition-all cursor-pointer group shadow-xs"
              title="Hacé clic para cambiar la fecha final (Hasta)"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-600 transition-colors shrink-0" />
              <span className="font-semibold text-slate-700 group-hover:text-brand-600 transition-colors select-none">
                {fechaHasta ? formatDateDDMMYYYY(fechaHasta) : 'DD/MM/YYYY'}
              </span>
              <input
                ref={fechaHastaRef}
                type="date"
                value={fechaHasta}
                onChange={(e) => {
                  setFechaHasta(e.target.value);
                  setDatePreset('CUSTOM');
                }}
                onClick={(e) => {
                  try {
                    (e.currentTarget as any).showPicker?.();
                  } catch {}
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Seleccionar fecha hasta"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Nivel 2: Activas/Inactivas, Mercado ME/MI, Métrica Eje Y y Búsqueda */}
      {activeTab !== 'BALANCE' && (
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* 1. Filtro: Activas / Inactivas / Todas */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Estado Instancia:
              </span>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
                <button
                  onClick={() => handleActiveFilterChange('ACTIVAS')}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all",
                    activeFilter === 'ACTIVAS'
                      ? "bg-white text-emerald-700 shadow-sm font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Solo Activas
                </button>
                <button
                  onClick={() => handleActiveFilterChange('INACTIVAS')}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all",
                    activeFilter === 'INACTIVAS'
                      ? "bg-white text-slate-800 shadow-sm font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Archive className="w-3.5 h-3.5 text-slate-400" />
                  Inactivas
                </button>
                <button
                  onClick={() => handleActiveFilterChange('TODAS')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg transition-all",
                    activeFilter === 'TODAS'
                      ? "bg-white text-gray-900 shadow-sm font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Todas
                </button>
              </div>
            </div>

            {/* 2. Filtro: Mercado (Todas / MI / ME) */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Mercado:
              </span>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
                <button
                  onClick={() => handleMercadoFilterChange('TODAS')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg transition-all",
                    mercadoFilter === 'TODAS'
                      ? "bg-white text-gray-900 shadow-sm font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Todas
                </button>
                <button
                  onClick={() => handleMercadoFilterChange('MI')}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg transition-all",
                    mercadoFilter === 'MI'
                      ? "bg-white text-brand-700 shadow-sm font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  MI (Interno)
                </button>
                <button
                  onClick={() => handleMercadoFilterChange('ME')}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all",
                    mercadoFilter === 'ME'
                      ? "bg-white text-amber-700 shadow-sm font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Globe className="w-3 h-3 text-amber-600" />
                  ME (Expo)
                </button>
              </div>
            </div>

            {/* 3. Selector de Métrica Eje Y */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Eje Y:
              </span>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
                <button
                  onClick={() => setMetricUnit('PESOS')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg transition-all",
                    metricUnit === 'PESOS'
                      ? "bg-white text-gray-900 shadow-sm font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {mercadoFilter === 'ME' && currencyMode === 'USD'
                    ? '💵 Dólares (USD)'
                    : mercadoFilter === 'TODAS'
                    ? '💲 Pesos ($ conv.)'
                    : '💲 Pesos ($)'}
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
                  🔢 Cantidad
                </button>
              </div>
            </div>

            {/* Selector Contextual de Divisa si es ME y métrica Importes */}
            {mercadoFilter === 'ME' && metricUnit === 'PESOS' && (
              <div className="flex items-center gap-1.5 bg-amber-50/80 px-2.5 py-1 rounded-xl border border-amber-200/80 text-xs">
                <span className="text-[10.5px] font-bold text-amber-800">Divisa ME:</span>
                <div className="inline-flex p-0.5 bg-white rounded-lg border border-amber-200 text-[11px] font-bold">
                  <button
                    onClick={() => setCurrencyMode('USD')}
                    className={cn(
                      "px-2 py-0.5 rounded transition-all",
                      currencyMode === 'USD' ? "bg-amber-500 text-white shadow-sm" : "text-amber-700 hover:bg-amber-50"
                    )}
                  >
                    USD ($)
                  </button>
                  <button
                    onClick={() => setCurrencyMode('ARS')}
                    className={cn(
                      "px-2 py-0.5 rounded transition-all",
                      currencyMode === 'ARS' ? "bg-amber-500 text-white shadow-sm" : "text-amber-700 hover:bg-amber-50"
                    )}
                  >
                    ARS ($ T.C.)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Opciones de filtro visual: Buscador y toggle de columnas vacías */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por número o entidad..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 w-52"
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

      {/* Manejo de Error */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>Error al procesar los datos: {error}</span>
        </div>
      )}

      {/* Contenido Principal */}
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
            currencyMode={effectiveCurrencyMode}
            onSelectItem={(item) => handleOpenReport(item, 'OC')}
            showOnlyActiveStates={showOnlyActiveStates}
            drillDown={drillDownFilter}
            onDrillDown={setDrillDownFilter}
          />

          {/* Tabla de Detalle sincronizada */}
          <DetalleItemsTable
            items={tableItems}
            tipo="OC"
            drillDown={drillDownFilter}
            onClearDrillDown={() => setDrillDownFilter(null)}
            onSelect={(item) => handleOpenReport(item, 'OC')}
            currencyMode={effectiveCurrencyMode}
            mercadoFilter={mercadoFilter}
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
            currencyMode={effectiveCurrencyMode}
            onSelectItem={(item) => handleOpenReport(item, 'PEDIDO')}
            showOnlyActiveStates={showOnlyActiveStates}
            drillDown={drillDownFilter}
            onDrillDown={setDrillDownFilter}
          />

          {/* Tabla de Detalle sincronizada */}
          <DetalleItemsTable
            items={tableItems}
            tipo="PEDIDO"
            drillDown={drillDownFilter}
            onClearDrillDown={() => setDrillDownFilter(null)}
            onSelect={(item) => handleOpenReport(item, 'PEDIDO')}
            currencyMode={effectiveCurrencyMode}
            mercadoFilter={mercadoFilter}
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
  drillDown: DrillDownFilter | null;
  onClearDrillDown: () => void;
  onSelect: (item: OperacionItem) => void;
  currencyMode: CurrencyMode;
  mercadoFilter: MercadoFilter;
}

function DetalleItemsTable({ 
  items, 
  tipo, 
  drillDown, 
  onClearDrillDown, 
  onSelect,
  currencyMode,
  mercadoFilter,
}: DetalleItemsTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const displayItems = isExpanded ? items : items.slice(0, 10);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
      {/* Banner si hay drill-down activo */}
      {drillDown && (
        <div className="bg-amber-50/70 border-b border-amber-200/80 px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-amber-900 font-semibold">
            <Filter className="w-3.5 h-3.5 text-amber-600" />
            <span>
              Filtrado por: Estado <strong>{drillDown.stateCode} ({drillDown.stateName})</strong>
              {drillDown.colorAlerta && (
                <span> · Alerta SLA: <strong>{drillDown.colorAlerta}</strong></span>
              )}
            </span>
          </div>
          <button
            onClick={onClearDrillDown}
            className="text-amber-800 hover:text-amber-950 font-bold underline flex items-center gap-1 text-[11px]"
          >
            <X className="w-3.5 h-3.5" />
            Quitar filtro y ver todos
          </button>
        </div>
      )}

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
              <th className="py-3 px-4">Mercado</th>
              <th className="py-3 px-4">{tipo === 'OC' ? 'Proveedor' : 'Cliente'}</th>
              <th className="py-3 px-4">Estado Actual</th>
              <th className="py-3 px-4 text-center">Antigüedad (SLA)</th>
              <th className="py-3 px-4 text-right">Volumen</th>
              <th className="py-3 px-4 text-right">
                {mercadoFilter === 'ME' && currencyMode === 'USD' ? 'Importe (USD)' : 'Importe ($)'}
              </th>
              <th className="py-3 px-4 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium">
            {displayItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-400">
                  No se encontraron {tipo === 'OC' ? 'órdenes' : 'pedidos'} con los filtros seleccionados.
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
                  <td className="py-3 px-4 text-gray-500 font-medium">
                    {formatDateDDMMYYYY(item.fecha_documento)}
                  </td>
                  <td className="py-3 px-4">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold border",
                      item.tipo_mercado === 'ME' 
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    )}>
                      {item.tipo_mercado}
                    </span>
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
                    {mercadoFilter === 'ME' && currencyMode === 'USD'
                      ? `US$${(item.dolares || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                      : `$${(item.pesos || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
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
