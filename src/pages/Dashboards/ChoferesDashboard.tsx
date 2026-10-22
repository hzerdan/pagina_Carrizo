import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Star, Award, TrendingUp, AlertTriangle, ShieldCheck, 
  Search, Sliders, RefreshCw, ExternalLink, X, Loader2, ArrowUpDown,
  CheckCircle2, Clock, Check, Bot, Zap, XCircle, ChevronDown, ChevronUp,
  CheckSquare, MessageSquareOff
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Chofer {
  id: number;
  nombre_completo: string;
  dni: string | null;
  telefono: string | null;
  transportista_id: number | null;
  transportistas?: { razon_social: string } | null;
  estado: string;
  calificacion_promedio_estrellas: number | null;
  calificacion_promedio_score: number | null;
  calificacion_total_viajes: number;
  calificacion_nivel: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'CRITICO' | 'NUEVO' | null;
  calificacion_updated_at: string | null;
}

interface RemitoItem {
  id: number;
  chofer_id: number | null;
  remito_ref_externa?: string;
  mision_estado?: string | null;
  calificacion_score: number | null;
  calificacion_estrellas: number | null;
  calificacion_desglose: {
    cumplimiento?: {
      puntos: number;
      score_pct: number;
      peso_maximo: number;
      tareas_totales: number;
      criticas_totales: number;
      tareas_cumplidas: number;
      criticas_cumplidas: number;
    };
    autonomia?: {
      puntos: number;
      score_pct: number;
      peso_maximo: number;
      recordatorios_count: number;
    };
    escalamiento?: {
      puntos: number;
      score_pct: number;
      peso_maximo: number;
      escalado: boolean;
    };
  } | null;
  protocolo_control?: any[] | null;
  created_at?: string;
}

interface TaskBottleneck {
  nombre: string;
  totalEnProtocolo: number;
  totalCumplidas: number;
  totalOmitidas: number;
  totalNoRealizable: number;
  totalExigibles: number;
  pctCumplimientoExigible: number;
  pctOmisionExigible: number;
  esCritica: boolean;
}

export function ChoferesDashboard() {
  const navigate = useNavigate();

  // Active Tab: 'ranking' | 'tareas' | 'autonomia'
  const [activeTab, setActiveTab] = useState<'ranking' | 'tareas' | 'autonomia'>('ranking');

  // Data states
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [remitos, setRemitos] = useState<RemitoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isReevaluating, setIsReevaluating] = useState(false);
  const [reevalSuccess, setReevalSuccess] = useState<string | null>(null);

  // Filters & Sorting for Ranking Tab
  const [search, setSearch] = useState('');
  const [selectedNivel, setSelectedNivel] = useState<string>('TODOS');
  const [selectedTransportista, setSelectedTransportista] = useState<string>('TODOS');
  const [sortBy, setSortBy] = useState<'score' | 'viajes' | 'nombre'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filters for Tareas Tab
  const [searchTarea, setSearchTarea] = useState('');
  const [soloCriticas, setSoloCriticas] = useState(false);

  // Modal Historial
  const [selectedChoferForHistorial, setSelectedChoferForHistorial] = useState<Chofer | null>(null);
  const [remitosHistorial, setRemitosHistorial] = useState<RemitoItem[]>([]);
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);
  const [expandedRemitoId, setExpandedRemitoId] = useState<number | null>(null);

  // Catálogo de tareas para criticidad gobernada por BD
  const [catalogoTareas, setCatalogoTareas] = useState<any[]>([]);

  // Carga inicial
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [choferesRes, remitosRes, catalogoRes] = await Promise.all([
        supabase
          .from('choferes')
          .select(`
            id,
            nombre_completo,
            dni,
            telefono,
            transportista_id,
            estado,
            calificacion_promedio_estrellas,
            calificacion_promedio_score,
            calificacion_total_viajes,
            calificacion_nivel,
            calificacion_updated_at,
            transportistas (
              razon_social
            )
          `)
          .order('calificacion_promedio_score', { ascending: false, nullsFirst: false }),

        supabase
          .from('remitos')
          .select('id, chofer_id, remito_ref_externa, mision_estado, calificacion_score, calificacion_estrellas, calificacion_desglose, protocolo_control, created_at')
          .not('calificacion_score', 'is', null)
          .order('id', { ascending: false }),

        supabase
          .from('catalogo_tareas_control')
          .select('id, tarea_template, tipo_tarea, es_critica')
      ]);

      if (choferesRes.error) throw choferesRes.error;
      if (remitosRes.error) throw remitosRes.error;

      setChoferes((choferesRes.data as unknown as Chofer[]) || []);
      setRemitos((remitosRes.data as unknown as RemitoItem[]) || []);
      setCatalogoTareas(catalogoRes.data || []);
    } catch (err) {
      console.error('Error fetching data for dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const criticalTasksSet = useMemo(() => {
    const ids = new Set<number>();
    const templates = new Set<string>();
    catalogoTareas.forEach(ct => {
      if (ct.es_critica) {
        if (ct.id) ids.add(Number(ct.id));
        if (ct.tarea_template) templates.add(ct.tarea_template.toLowerCase().trim());
      }
    });
    return { ids, templates };
  }, [catalogoTareas]);

  const checkIfTaskIsCritical = useCallback((t: any): boolean => {
    if (t.es_critica === true) return true;
    if (t.id && criticalTasksSet.ids.has(Number(t.id))) return true;
    const tmpl = (t.tarea_template || t.tarea || '').toLowerCase().trim();
    if (tmpl && criticalTasksSet.templates.has(tmpl)) return true;
    return false;
  }, [criticalTasksSet]);

  // Re-evaluar calificaciones
  const handleReevaluarTodo = async () => {
    setIsReevaluating(true);
    setReevalSuccess(null);
    try {
      const { data, error } = await supabase.rpc('reevaluar_calificaciones', {
        p_remito_id: null
      });
      if (error) throw error;
      setReevalSuccess(`Actualizado con éxito (${data?.remitos_actualizados || 0} viajes reevaluados)`);
      await fetchData();
      setTimeout(() => setReevalSuccess(null), 5000);
    } catch (err) {
      console.error('Error reevaluando calificaciones:', err);
      alert('Error al reevaluar: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setIsReevaluating(false);
    }
  };

  // Abrir historial
  const handleOpenHistorial = async (chofer: Chofer) => {
    setSelectedChoferForHistorial(chofer);
    setIsLoadingHistorial(true);
    setExpandedRemitoId(null);
    try {
      const { data, error } = await supabase
        .from('remitos')
        .select('id, remito_ref_externa, mision_estado, calificacion_score, calificacion_estrellas, calificacion_desglose, protocolo_control, created_at')
        .eq('chofer_id', chofer.id)
        .order('id', { ascending: false });

      if (error) throw error;
      setRemitosHistorial((data as unknown as RemitoItem[]) || []);
    } catch (err) {
      console.error('Error loading remitos historial:', err);
      setRemitosHistorial([]);
    } finally {
      setIsLoadingHistorial(false);
    }
  };

  // Cálculos de métricas globales (KPIs)
  const stats = useMemo(() => {
    const choferesConViajes = choferes.filter(c => (c.calificacion_total_viajes || 0) > 0);
    const totalChoferesConViajes = choferesConViajes.length;
    const totalViajesFlota = remitos.length;

    const sumaEstrellas = choferesConViajes.reduce((acc, c) => acc + (Number(c.calificacion_promedio_estrellas) || 0), 0);
    const sumaScores = choferesConViajes.reduce((acc, c) => acc + (Number(c.calificacion_promedio_score) || 0), 0);

    const promedioEstrellas = totalChoferesConViajes > 0 ? (sumaEstrellas / totalChoferesConViajes).toFixed(2) : '0.00';
    const promedioScore = totalChoferesConViajes > 0 ? (sumaScores / totalChoferesConViajes).toFixed(1) : '0.0';

    // Métricas de Cumplimiento de Tareas Agregadas
    let totalTareasAsignadas = 0;
    let totalTareasCumplidas = 0;
    let totalCriticasAsignadas = 0;
    let totalCriticasCumplidas = 0;
    let sumaCumplimientoPct = 0;

    // Métricas de Autonomía Agregadas
    let viajesSinRecordatorios = 0;
    let viajesAutonomosSinEscalar = 0;
    let sumaAutonomiaPct = 0;

    remitos.forEach(r => {
      const c = r.calificacion_desglose?.cumplimiento;
      if (c) {
        totalTareasAsignadas += c.tareas_totales || 0;
        totalTareasCumplidas += c.tareas_cumplidas || 0;
        totalCriticasAsignadas += c.criticas_totales || 0;
        totalCriticasCumplidas += c.criticas_cumplidas || 0;
        sumaCumplimientoPct += c.score_pct || 0;
      }

      const a = r.calificacion_desglose?.autonomia;
      if (a) {
        if ((a.recordatorios_count || 0) === 0) viajesSinRecordatorios++;
        sumaAutonomiaPct += a.score_pct || 0;
      }

      const e = r.calificacion_desglose?.escalamiento;
      if (e) {
        if (!e.escalado) viajesAutonomosSinEscalar++;
      }
    });

    const avgCumplimientoPct = totalViajesFlota > 0 ? (sumaCumplimientoPct / totalViajesFlota).toFixed(1) : '0.0';
    const avgAutonomiaPct = totalViajesFlota > 0 ? (sumaAutonomiaPct / totalViajesFlota).toFixed(1) : '0.0';
    const pctViajesSinRecordatorios = totalViajesFlota > 0 ? ((viajesSinRecordatorios / totalViajesFlota) * 100).toFixed(1) : '0.0';
    const pctViajesSinEscalar = totalViajesFlota > 0 ? ((viajesAutonomosSinEscalar / totalViajesFlota) * 100).toFixed(1) : '0.0';

    // Distribución por nivel
    const niveles = {
      EXCELENTE: choferesConViajes.filter(c => c.calificacion_nivel === 'EXCELENTE').length,
      BUENO: choferesConViajes.filter(c => c.calificacion_nivel === 'BUENO').length,
      REGULAR: choferesConViajes.filter(c => c.calificacion_nivel === 'REGULAR').length,
      CRITICO: choferesConViajes.filter(c => c.calificacion_nivel === 'CRITICO').length,
      NUEVO: choferesConViajes.filter(c => c.calificacion_nivel === 'NUEVO').length,
    };

    return {
      totalChoferes: choferes.length,
      totalChoferesConViajes,
      sinViajesCount: choferes.filter(c => (c.calificacion_total_viajes || 0) === 0).length,
      totalViajesFlota,
      promedioEstrellas,
      promedioScore,
      niveles,
      // Tareas
      avgCumplimientoPct,
      totalTareasAsignadas,
      totalTareasCumplidas,
      totalCriticasAsignadas,
      totalCriticasCumplidas,
      // Autonomía
      avgAutonomiaPct,
      viajesSinRecordatorios,
      pctViajesSinRecordatorios,
      viajesAutonomosSinEscalar,
      pctViajesSinEscalar,
    };
  }, [choferes, remitos]);

  // Análisis de Cuello de Botella de Tareas (Agregación sobre todos los viajes)
  const taskBottlenecks = useMemo<TaskBottleneck[]>(() => {
    const map = new Map<string, { 
      totalEnProtocolo: number; 
      totalCumplidas: number; 
      totalOmitidas: number; 
      totalNoRealizable: number; 
      esCritica: boolean 
    }>();

    const getCanonicalTaskName = (t: any): string => {
      const tipo = t.tipo_tarea || '';
      const template = (t.tarea_template || '').trim();
      const tarea = (t.tarea || '').trim();

      if (tipo === 'PESAJE_TARA' || template.toLowerCase().includes('hacer tara') || tarea.toLowerCase().includes('hacer tara')) {
        return 'Hacer Tara en balanza (Pesaje inicial)';
      }
      if (tipo === 'PESAJE_BRUTO' || template.toLowerCase().includes('pesar el camión lleno') || tarea.toLowerCase().includes('pesar el camión lleno')) {
        return 'Pesar camión lleno en balanza (Pesaje bruto)';
      }
      if (template) return template;
      return tarea || 'Sin nombre';
    };

    remitos.forEach(r => {
      if (r.protocolo_control && Array.isArray(r.protocolo_control)) {
        r.protocolo_control.forEach((t: any) => {
          const nombre = getCanonicalTaskName(t);
          const cumplida = t.estado === 'REPORTADO_CHOFER' || t.estado === 'COMPLETADO' || !!t.chofer_realizo;
          const esNoRealizable = t.estado === 'NO_REALIZABLE';
          const esCritica = checkIfTaskIsCritical(t);

          if (!map.has(nombre)) {
            map.set(nombre, { 
              totalEnProtocolo: 0, 
              totalCumplidas: 0, 
              totalOmitidas: 0, 
              totalNoRealizable: 0, 
              esCritica 
            });
          }

          const item = map.get(nombre)!;
          item.totalEnProtocolo += 1;
          if (cumplida) {
            item.totalCumplidas += 1;
          } else if (esNoRealizable) {
            item.totalNoRealizable += 1;
          } else {
            item.totalOmitidas += 1;
          }
          if (esCritica) item.esCritica = true;
        });
      }
    });

    const list: TaskBottleneck[] = [];
    map.forEach((val, nombre) => {
      const totalExigibles = val.totalCumplidas + val.totalOmitidas;
      const pctCumplimientoExigible = totalExigibles > 0 ? (val.totalCumplidas / totalExigibles) * 100 : 0;
      const pctOmisionExigible = 100 - pctCumplimientoExigible;

      list.push({
        nombre,
        totalEnProtocolo: val.totalEnProtocolo,
        totalCumplidas: val.totalCumplidas,
        totalOmitidas: val.totalOmitidas,
        totalNoRealizable: val.totalNoRealizable,
        totalExigibles,
        pctCumplimientoExigible: Math.round(pctCumplimientoExigible * 10) / 10,
        pctOmisionExigible: Math.round(pctOmisionExigible * 10) / 10,
        esCritica: val.esCritica
      });
    });

    // Ordenar por volumen en protocolo y omisión
    return list.sort((a, b) => {
      // Priorizar tareas que tienen omisiones o no realizables
      if (b.pctOmisionExigible !== a.pctOmisionExigible) {
        return b.pctOmisionExigible - a.pctOmisionExigible;
      }
      return b.totalEnProtocolo - a.totalEnProtocolo;
    });
  }, [remitos]);

  const filteredTaskBottlenecks = useMemo(() => {
    return taskBottlenecks.filter(t => {
      const matchSearch = t.nombre.toLowerCase().includes(searchTarea.toLowerCase());
      const matchCritica = !soloCriticas || t.esCritica;
      return matchSearch && matchCritica;
    });
  }, [taskBottlenecks, searchTarea, soloCriticas]);

  // Lista de transportistas únicos para filtro
  const transportistasList = useMemo(() => {
    const setT = new Set<string>();
    choferes.forEach(c => {
      const nombre = c.transportistas?.razon_social;
      if (nombre) setT.add(nombre);
    });
    return Array.from(setT).sort();
  }, [choferes]);

  // Filtrado y ordenamiento de choferes
  const filteredAndSortedChoferes = useMemo(() => {
    return choferes
      .filter(c => {
        const matchSearch = 
          c.nombre_completo.toLowerCase().includes(search.toLowerCase()) ||
          (c.dni && c.dni.includes(search)) ||
          (c.transportistas?.razon_social && c.transportistas.razon_social.toLowerCase().includes(search.toLowerCase()));

        const matchNivel = selectedNivel === 'TODOS' || 
          (selectedNivel === 'SIN_CALIFICAR' ? (c.calificacion_total_viajes === 0) : c.calificacion_nivel === selectedNivel);

        const matchTransportista = selectedTransportista === 'TODOS' || 
          c.transportistas?.razon_social === selectedTransportista;

        return matchSearch && matchNivel && matchTransportista;
      })
      .sort((a, b) => {
        let valA: number | string = 0;
        let valB: number | string = 0;

        if (sortBy === 'score') {
          valA = Number(a.calificacion_promedio_score) || 0;
          valB = Number(b.calificacion_promedio_score) || 0;
        } else if (sortBy === 'viajes') {
          valA = a.calificacion_total_viajes || 0;
          valB = b.calificacion_total_viajes || 0;
        } else {
          valA = a.nombre_completo.toLowerCase();
          valB = b.nombre_completo.toLowerCase();
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [choferes, search, selectedNivel, selectedTransportista, sortBy, sortOrder]);

  const renderNivelBadge = (nivel: string | null, totalViajes: number) => {
    if (totalViajes === 0 || !nivel) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
          Sin viajes
        </span>
      );
    }
    switch (nivel) {
      case 'EXCELENTE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Award className="w-3.5 h-3.5" /> Excelente
          </span>
        );
      case 'BUENO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Bueno
          </span>
        );
      case 'REGULAR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5" /> Regular
          </span>
        );
      case 'CRITICO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" /> Crítico
          </span>
        );
      case 'NUEVO':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <ShieldCheck className="w-3.5 h-3.5" /> En evaluación
          </span>
        );
    }
  };

  const handleToggleSort = (field: 'score' | 'viajes' | 'nombre') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header Superior */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                  Dashboard de Desempeño de Choferes
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Monitoreo integral de cumplimiento de protocolos, autonomía en viajes y calificaciones de la flota.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => navigate('/calificacion-config')}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition shadow-sm"
              title="Ajustar pesos de cálculo de la fórmula"
            >
              <Sliders className="w-3.5 h-3.5 text-gray-500" />
              Configurar Ponderaciones
            </button>

            <button
              onClick={handleReevaluarTodo}
              disabled={isReevaluating}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-brand-600 rounded-xl hover:bg-brand-700 transition shadow-sm disabled:opacity-50"
              title="Recalcular calificaciones de todos los viajes registrados"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReevaluating ? 'animate-spin' : ''}`} />
              {isReevaluating ? 'Reevaluando...' : 'Reevaluar Flota'}
            </button>
          </div>
        </div>

        {/* Alerta de éxito si se reevaluó */}
        {reevalSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between text-xs font-medium animate-fadeIn">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{reevalSuccess}</span>
            </div>
            <button onClick={() => setReevalSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TARJETAS MACRO (KPIs) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Promedio Estrellas */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Promedio de Flota</span>
              <div className="p-2 bg-amber-50 text-amber-500 rounded-xl">
                <Star className="w-5 h-5 fill-amber-400" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-gray-900">{stats.promedioEstrellas}</span>
                <span className="text-xs font-semibold text-gray-400">/ 5.00</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Puntaje medio: <strong className="text-gray-700">{stats.promedioScore}</strong> / 100 pts
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400">
              <span>{stats.totalChoferesConViajes} choferes evaluados</span>
              <span className="text-emerald-600 font-medium">{stats.totalViajesFlota} viajes</span>
            </div>
          </div>

          {/* Card 2: Tasa de Cumplimiento de Protocolo */}
          <div 
            onClick={() => setActiveTab('tareas')}
            className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between cursor-pointer hover:border-brand-300 transition"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cumplimiento Protocolo</span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <CheckSquare className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-blue-600">{stats.avgCumplimientoPct}%</span>
                <span className="text-xs font-semibold text-gray-400">efectividad</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Tareas: <strong className="text-gray-700">{stats.totalTareasCumplidas}</strong> / {stats.totalTareasAsignadas} cumplidas
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400">
              <span>Críticas: {stats.totalCriticasCumplidas}/{stats.totalCriticasAsignadas}</span>
              <span className="text-brand-600 font-medium">Ver cuellos de botella →</span>
            </div>
          </div>

          {/* Card 3: Índice de Autonomía Digital */}
          <div 
            onClick={() => setActiveTab('autonomia')}
            className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between cursor-pointer hover:border-emerald-300 transition"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Autonomía Digital</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Bot className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-emerald-600">{stats.pctViajesSinRecordatorios}%</span>
                <span className="text-xs font-semibold text-gray-400">sin alertas</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                <strong className="text-gray-700">{stats.viajesSinRecordatorios}</strong> de {stats.totalViajesFlota} viajes sin insistencias
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400">
              <span>Score medio: {stats.avgAutonomiaPct}%</span>
              <span className="text-emerald-600 font-medium">Ver desglose →</span>
            </div>
          </div>

          {/* Card 4: Contención IA vs Escalamiento */}
          <div 
            onClick={() => setActiveTab('autonomia')}
            className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-300 transition"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contención IA</span>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <MessageSquareOff className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-purple-600">{stats.pctViajesSinEscalar}%</span>
                <span className="text-xs font-semibold text-gray-400">100% IA</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                <strong className="text-gray-700">{stats.viajesAutonomosSinEscalar}</strong> viajes resueltos sin operador
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400">
              <span>{stats.totalViajesFlota - stats.viajesAutonomosSinEscalar} escalados</span>
              <span className="text-purple-600 font-medium">Detalle →</span>
            </div>
          </div>
        </div>

        {/* NAVEGACIÓN POR PESTAÑAS (TABS) */}
        <div className="flex border-b border-gray-200 gap-2 bg-white px-6 pt-3 rounded-t-2xl shadow-xs">
          <button
            onClick={() => setActiveTab('ranking')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'ranking' 
                ? 'border-brand-600 text-brand-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4" />
            1. Ranking & Desempeño de Choferes ({filteredAndSortedChoferes.length})
          </button>

          <button
            onClick={() => setActiveTab('tareas')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'tareas' 
                ? 'border-brand-600 text-brand-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            2. Cuello de Botella de Tareas ({taskBottlenecks.length})
          </button>

          <button
            onClick={() => setActiveTab('autonomia')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'autonomia' 
                ? 'border-brand-600 text-brand-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Bot className="w-4 h-4" />
            3. Índice de Autonomía Digital & Escalamiento
          </button>
        </div>

        {/* CONTENIDO PESTAÑA 1: RANKING Y DISTRIBUCIÓN DE CHOFERES */}
        {activeTab === 'ranking' && (
          <div className="space-y-6">
            {/* Distribución Visual de Niveles */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-brand-600" />
                    Distribución de Calidad de la Flota
                  </h2>
                  <p className="text-xs text-gray-500">
                    Segmentación según nivel de desempeño calculado automáticamente. Haz clic en un nivel para filtrar la tabla.
                  </p>
                </div>

                {selectedNivel !== 'TODOS' && (
                  <button
                    onClick={() => setSelectedNivel('TODOS')}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1 self-start sm:self-auto"
                  >
                    Limpiar filtro de nivel ({selectedNivel})
                  </button>
                )}
              </div>

              {/* Barra de progreso distribuida */}
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
                {stats.totalChoferesConViajes > 0 ? (
                  <>
                    <div 
                      style={{ width: `${(stats.niveles.EXCELENTE / stats.totalChoferesConViajes) * 100}%` }} 
                      className="bg-emerald-500 h-full transition-all duration-500" 
                      title={`Excelente: ${stats.niveles.EXCELENTE}`}
                    />
                    <div 
                      style={{ width: `${(stats.niveles.BUENO / stats.totalChoferesConViajes) * 100}%` }} 
                      className="bg-blue-500 h-full transition-all duration-500" 
                      title={`Bueno: ${stats.niveles.BUENO}`}
                    />
                    <div 
                      style={{ width: `${(stats.niveles.REGULAR / stats.totalChoferesConViajes) * 100}%` }} 
                      className="bg-amber-500 h-full transition-all duration-500" 
                      title={`Regular: ${stats.niveles.REGULAR}`}
                    />
                    <div 
                      style={{ width: `${(stats.niveles.CRITICO / stats.totalChoferesConViajes) * 100}%` }} 
                      className="bg-rose-500 h-full transition-all duration-500" 
                      title={`Crítico: ${stats.niveles.CRITICO}`}
                    />
                    <div 
                      style={{ width: `${(stats.niveles.NUEVO / stats.totalChoferesConViajes) * 100}%` }} 
                      className="bg-slate-400 h-full transition-all duration-500" 
                      title={`En evaluación: ${stats.niveles.NUEVO}`}
                    />
                  </>
                ) : (
                  <div className="w-full bg-gray-200 h-full" />
                )}
              </div>

              {/* Tarjetas interactivas de cada nivel */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                {[
                  { id: 'EXCELENTE', label: 'Excelente', count: stats.niveles.EXCELENTE, color: 'border-emerald-300 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-100/60', dot: 'bg-emerald-500' },
                  { id: 'BUENO', label: 'Bueno', count: stats.niveles.BUENO, color: 'border-blue-300 text-blue-800 bg-blue-50/50 hover:bg-blue-100/60', dot: 'bg-blue-500' },
                  { id: 'REGULAR', label: 'Regular', count: stats.niveles.REGULAR, color: 'border-amber-300 text-amber-800 bg-amber-50/50 hover:bg-amber-100/60', dot: 'bg-amber-500' },
                  { id: 'CRITICO', label: 'Crítico', count: stats.niveles.CRITICO, color: 'border-rose-300 text-rose-800 bg-rose-50/50 hover:bg-rose-100/60', dot: 'bg-rose-500' },
                  { id: 'NUEVO', label: 'En Evaluación', count: stats.niveles.NUEVO, color: 'border-slate-300 text-slate-800 bg-slate-50/50 hover:bg-slate-100/60', dot: 'bg-slate-400' },
                ].map(tier => {
                  const isSelected = selectedNivel === tier.id;
                  const pct = stats.totalChoferesConViajes > 0 ? Math.round((tier.count / stats.totalChoferesConViajes) * 100) : 0;
                  return (
                    <button
                      key={tier.id}
                      onClick={() => setSelectedNivel(isSelected ? 'TODOS' : tier.id)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        isSelected ? 'ring-2 ring-brand-600 shadow-sm border-transparent bg-white' : tier.color
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${tier.dot}`} />
                          {tier.label}
                        </span>
                        <span className="text-[10px] text-gray-400">{pct}%</span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-xl font-black">{tier.count}</span>
                        <span className="text-[10px] text-gray-500">chofer{tier.count === 1 ? '' : 'es'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Matriz y Ranking de Choferes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden space-y-4 p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand-600" />
                    Ranking y Registro de la Flota ({filteredAndSortedChoferes.length})
                  </h2>
                  <p className="text-xs text-gray-500">
                    Puntajes consolidados y desglose detallado por conductor.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar chofer, DNI..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <select
                    value={selectedTransportista}
                    onChange={(e) => setSelectedTransportista(e.target.value)}
                    className="py-2 px-3 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="TODOS">Todos los transportistas</option>
                    {transportistasList.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>

                  <select
                    value={selectedNivel}
                    onChange={(e) => setSelectedNivel(e.target.value)}
                    className="py-2 px-3 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="TODOS">Todos los niveles</option>
                    <option value="EXCELENTE">Excelente</option>
                    <option value="BUENO">Bueno</option>
                    <option value="REGULAR">Regular</option>
                    <option value="CRITICO">Crítico</option>
                    <option value="NUEVO">En Evaluación</option>
                    <option value="SIN_CALIFICAR">Sin viajes</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                  <p className="text-xs text-gray-500 mt-2">Cargando métricas de choferes...</p>
                </div>
              ) : filteredAndSortedChoferes.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-xs">
                  No se encontraron choferes con los filtros seleccionados.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-gray-50/80 text-gray-500 uppercase font-semibold text-[10px] border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3.5 text-center w-12">#</th>
                        <th 
                          onClick={() => handleToggleSort('nombre')}
                          className="px-4 py-3.5 cursor-pointer hover:text-gray-900 transition select-none"
                        >
                          <div className="flex items-center gap-1.5">
                            Chofer
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          </div>
                        </th>
                        <th className="px-4 py-3.5">Transportista</th>
                        <th className="px-4 py-3.5 text-center">Nivel</th>
                        <th 
                          onClick={() => handleToggleSort('score')}
                          className="px-4 py-3.5 cursor-pointer hover:text-gray-900 transition select-none"
                        >
                          <div className="flex items-center gap-1.5">
                            Calificación & Desempeño
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          </div>
                        </th>
                        <th 
                          onClick={() => handleToggleSort('viajes')}
                          className="px-4 py-3.5 text-center cursor-pointer hover:text-gray-900 transition select-none"
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            Viajes Evaluados
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          </div>
                        </th>
                        <th className="px-4 py-3.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {filteredAndSortedChoferes.map((chofer, index) => {
                        const stars = chofer.calificacion_promedio_estrellas ? Number(chofer.calificacion_promedio_estrellas).toFixed(2) : '-';
                        const score = chofer.calificacion_promedio_score ? Number(chofer.calificacion_promedio_score).toFixed(1) : 0;
                        const scoreNum = Number(score);

                        return (
                          <tr key={chofer.id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-4 py-3.5 text-center text-gray-400 font-mono text-xs">
                              {index === 0 && Number(score) > 0 ? '🥇' : index === 1 && Number(score) > 0 ? '🥈' : index === 2 && Number(score) > 0 ? '🥉' : index + 1}
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="font-bold text-gray-900">{chofer.nombre_completo}</div>
                              <div className="text-[11px] text-gray-400 font-normal">
                                DNI: {chofer.dni || 'Sin registrar'}
                              </div>
                            </td>

                            <td className="px-4 py-3.5 text-gray-600 text-xs">
                              {chofer.transportistas?.razon_social ? (
                                <span className="font-medium text-gray-700">{chofer.transportistas.razon_social}</span>
                              ) : (
                                <span className="text-gray-400 italic">No asignado</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 text-center">
                              {renderNivelBadge(chofer.calificacion_nivel, chofer.calificacion_total_viajes)}
                            </td>

                            <td className="px-4 py-3.5">
                              {chofer.calificacion_total_viajes > 0 ? (
                                <div className="space-y-1.5 w-44">
                                  <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1 font-bold text-gray-900">
                                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                                      <span>{stars}</span>
                                    </div>
                                    <span className="text-[11px] font-semibold text-gray-500">
                                      {score} / 100 pts
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        scoreNum >= 85 ? 'bg-emerald-500' :
                                        scoreNum >= 70 ? 'bg-blue-500' :
                                        scoreNum >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${Math.min(100, Math.max(0, scoreNum))}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400 italic text-xs">Sin registros de viaje</span>
                              )}
                            </td>

                            <td className="px-4 py-3.5 text-center font-bold text-gray-800">
                              {chofer.calificacion_total_viajes || 0}
                            </td>

                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleOpenHistorial(chofer)}
                                  className="px-2.5 py-1 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition flex items-center gap-1 cursor-pointer"
                                  title="Ver historial de viajes y desglose de desempeño"
                                >
                                  Historial
                                </button>
                                <button
                                  onClick={() => navigate('/choferes')}
                                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                                  title="Ir al ABM de Choferes"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTENIDO PESTAÑA 2: CUELLO DE BOTELLA DE TAREAS (PROTOCOLO) */}
        {activeTab === 'tareas' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Diagnóstico de Protocolo: Tareas Más Omitidas por los Choferes
                  </h2>
                  <p className="text-xs text-gray-500">
                    Análisis consolidado sobre {stats.totalTareasAsignadas} instancias de tareas asignadas en {stats.totalViajesFlota} viajes monitoreados.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Filtrar tarea..."
                      value={searchTarea}
                      onChange={(e) => setSearchTarea(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={soloCriticas}
                      onChange={(e) => setSoloCriticas(e.target.checked)}
                      className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4"
                    />
                    <span>Solo Tareas Críticas ⚡</span>
                  </label>
                </div>
              </div>

              {/* Tarjetas resumen de diagnóstico */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Tasa Global Cumplimiento</span>
                  <div className="text-2xl font-black mt-1 text-blue-950">{stats.avgCumplimientoPct}%</div>
                  <p className="text-[11px] text-blue-800 mt-1">{stats.totalTareasCumplidas} de {stats.totalTareasAsignadas} tareas realizadas</p>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Efectividad en Críticas</span>
                  <div className="text-2xl font-black mt-1 text-amber-950">
                    {stats.totalCriticasAsignadas > 0 ? Math.round((stats.totalCriticasCumplidas / stats.totalCriticasAsignadas) * 100) : 0}%
                  </div>
                  <p className="text-[11px] text-amber-800 mt-1">{stats.totalCriticasCumplidas} de {stats.totalCriticasAsignadas} tareas críticas cumplidas</p>
                </div>

                <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 text-rose-900">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Fuga del Protocolo</span>
                  <div className="text-2xl font-black mt-1 text-rose-950">
                    {stats.totalTareasAsignadas - stats.totalTareasCumplidas} omisiones
                  </div>
                  <p className="text-[11px] text-rose-800 mt-1">
                    {stats.totalTareasAsignadas > 0 ? (100 - Number(stats.avgCumplimientoPct)).toFixed(1) : 0}% de los pasos son omitidos o salteados
                  </p>
                </div>
              </div>

              {/* Nota Operativa de Cobertura de Misiones */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>
                    <strong>Cobertura por Misión:</strong> Las 12 tareas de Carga, Control y Pesaje aplican al 100% de la flota (<strong>43 viajes</strong>). Las 3 tareas de Tránsito y Entrega aplican a <strong>38 viajes</strong> (los 5 viajes restantes son <em>Retiro por Cliente en Planta</em> sin viaje a destino ni remito firmado).
                  </span>
                </div>
              </div>

              {/* Tabla de Ranking de Tareas */}
              <div className="overflow-x-auto rounded-xl border border-gray-100 mt-4">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-500 uppercase font-semibold text-[10px] border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3.5">Paso / Tarea del Protocolo</th>
                      <th className="px-4 py-3.5 text-center">Tipo</th>
                      <th className="px-4 py-3.5 text-center" title="Total de viajes donde la tarea formó parte del protocolo planificado">
                        En Protocolo
                      </th>
                      <th className="px-4 py-3.5 text-center">Cumplidas</th>
                      <th className="px-4 py-3.5 text-center">Omitidas Chofer</th>
                      <th className="px-4 py-3.5 text-center" title="Tareas no realizadas por impedimento físico o restricción de planta (ej. no dejan bajar al chofer). No penalizan la nota del chofer.">
                        Impedimento Planta (Justificadas)
                      </th>
                      <th className="px-4 py-3.5">Efectividad Exigible vs Omisión</th>
                      <th className="px-4 py-3.5 text-center">Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {filteredTaskBottlenecks.map((t, idx) => {
                      const esCuelloDeBotella = t.pctOmisionExigible >= 50;
                      const esModerado = t.pctOmisionExigible >= 25 && t.pctOmisionExigible < 50;

                      return (
                        <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              {esCuelloDeBotella ? (
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                              ) : esModerado ? (
                                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              )}
                              <span className="font-bold text-gray-900 truncate max-w-md">{t.nombre}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            {t.esCritica ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                <Zap className="w-3 h-3 text-amber-600" /> Crítica
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                                General
                              </span>
                            )}
                          </td>

                          {/* En Protocolo */}
                          <td className="px-4 py-3.5 text-center font-bold text-gray-900">
                            {t.totalEnProtocolo}
                          </td>

                          {/* Cumplidas */}
                          <td className="px-4 py-3.5 text-center font-bold text-emerald-600">
                            {t.totalCumplidas}
                          </td>

                          {/* Omitidas */}
                          <td className="px-4 py-3.5 text-center font-bold text-rose-600">
                            {t.totalOmitidas}
                          </td>

                          {/* Impedimento Planta (No Realizable) */}
                          <td className="px-4 py-3.5 text-center">
                            {t.totalNoRealizable > 0 ? (
                              <span 
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                                title="No penaliza el puntaje del chofer por impedimento justificado en depósito"
                              >
                                {t.totalNoRealizable} viajes
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>

                          {/* Efectividad Exigible */}
                          <td className="px-4 py-3.5">
                            <div className="w-48 space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-emerald-700">{t.pctCumplimientoExigible}%</span>
                                <span className="text-gray-400">|</span>
                                <span className="font-bold text-rose-700">{t.pctOmisionExigible}% omitido</span>
                              </div>
                              <div className="w-full bg-rose-100 rounded-full h-2 overflow-hidden flex">
                                <div 
                                  className="bg-emerald-500 h-full transition-all"
                                  style={{ width: `${t.pctCumplimientoExigible}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-gray-400">
                                Base: {t.totalExigibles} exigibles ({t.totalCumplidas} cumplidas)
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            {esCuelloDeBotella ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                🚨 Cuello Crítico
                              </span>
                            ) : esModerado ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                ⚠️ Atención
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ✅ Óptima
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* CONTENIDO PESTAÑA 3: AUTONOMÍA DIGITAL Y ESCALAMIENTO */}
        {activeTab === 'autonomia' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Bot className="w-5 h-5 text-brand-600" />
                  Auditoría de Autonomía Digital & Contención de la IA
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Mide el grado de independencia de los choferes (viajes completados sin insistencias del bot) y la tasa de contención autónoma vs intervención de operadores humanos.
                </p>
              </div>

              {/* 2 Columnas de Análisis */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pilar A: Autonomía (Recordatorios & Alertas) */}
                <div className="p-5 rounded-2xl border border-gray-100 bg-gray-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      1. Independencia en el Protocolo (Recordatorios)
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Peso: 30% del score
                    </span>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-black text-emerald-600">{stats.pctViajesSinRecordatorios}%</div>
                      <div className="text-xs font-medium text-gray-600 mt-0.5">Viajes 100% Proactivos</div>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <div><strong>{stats.viajesSinRecordatorios}</strong> de {stats.totalViajesFlota} viajes</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">Sin alertas por demora de gracia</div>
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed">
                    Cuando un chofer no reporta un avance o foto dentro de la ventana de gracia, el sistema emite recordatorios programados (debounce). Cada aviso aplica una penalización configurable de 15 puntos en su nota de autonomía.
                  </p>

                  <div className="pt-2 border-t border-gray-100 text-xs flex justify-between text-gray-500">
                    <span>Score medio de autonomía:</span>
                    <strong className="text-gray-900">{stats.avgAutonomiaPct} / 100 pts</strong>
                  </div>
                </div>

                {/* Pilar B: Escalamiento (Intervención de Operador Humano) */}
                <div className="p-5 rounded-2xl border border-gray-100 bg-gray-50/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquareOff className="w-4 h-4 text-purple-600" />
                      2. Tasa de Contención de IA vs Escalamiento
                    </span>
                    <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                      Peso: 15% del score
                    </span>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-black text-purple-600">{stats.pctViajesSinEscalar}%</div>
                      <div className="text-xs font-medium text-gray-600 mt-0.5">Viajes Sin Escalar</div>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <div><strong>{stats.viajesAutonomosSinEscalar}</strong> de {stats.totalViajesFlota} viajes</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">Completados 100% por el bot</div>
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed">
                    Un viaje se marca como escalado cuando ocurre una incidencia logística, se agotan los reintentos automáticos del protocolo, o el chofer solicita atención directa de un operador humano.
                  </p>

                  <div className="pt-2 border-t border-gray-100 text-xs flex justify-between text-gray-500">
                    <span>Viajes que requirieron operador humano:</span>
                    <strong className="text-rose-700">{stats.totalViajesFlota - stats.viajesAutonomosSinEscalar} viajes</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL DE HISTORIAL DETALLADO DE VIAJES CON ACORDEÓN DE TAREAS */}
      {selectedChoferForHistorial && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header Modal */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-black text-sm">
                  {selectedChoferForHistorial.nombre_completo.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Historial de Desempeño: {selectedChoferForHistorial.nombre_completo}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedChoferForHistorial.transportistas?.razon_social || 'Sin empresa'} • DNI: {selectedChoferForHistorial.dni || 'Sin registrar'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                    <span className="text-lg font-black text-gray-900">
                      {selectedChoferForHistorial.calificacion_promedio_estrellas || '-'}
                    </span>
                    <span className="text-xs text-gray-400 font-semibold">/ 5.0</span>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {selectedChoferForHistorial.calificacion_promedio_score || 0} pts promedio ({selectedChoferForHistorial.calificacion_total_viajes || 0} viajes)
                  </p>
                </div>
                <button
                  onClick={() => setSelectedChoferForHistorial(null)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body: Tabla de Remitos con Acordeón */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {isLoadingHistorial ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="w-7 h-7 text-brand-600 animate-spin" />
                  <p className="text-xs text-gray-500 mt-3">Cargando viajes registrados...</p>
                </div>
              ) : remitosHistorial.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-xs">
                  Este chofer no tiene remitos asociados registrados en el sistema.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-600 uppercase font-semibold text-[10px] border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3">Remito / Ref</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3">Puntuación</th>
                        <th className="px-4 py-3">Desglose de Desempeño</th>
                        <th className="px-4 py-3 text-right">Ver</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {remitosHistorial.map((r) => {
                        const desglose = r.calificacion_desglose;
                        const isExpanded = expandedRemitoId === r.id;

                        return (
                          <React.Fragment key={r.id}>
                            <tr className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-bold text-gray-900">
                                <button
                                  type="button"
                                  onClick={() => setExpandedRemitoId(isExpanded ? null : r.id)}
                                  className="flex items-center gap-1.5 text-left hover:text-brand-600 cursor-pointer"
                                  title="Clic para ver detalle de tareas de este viaje"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-brand-600" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                  )}
                                  <span className="font-mono">#{r.id}</span>
                                  <span className="text-gray-500 font-normal">{r.remito_ref_externa}</span>
                                </button>
                              </td>
                              <td className="px-4 py-3 text-gray-500">
                                {r.created_at ? new Date(r.created_at).toLocaleDateString('es-AR') : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                                  {r.mision_estado || 'EN_PROCESO'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {r.calificacion_estrellas ? (
                                  <div className="flex items-center gap-1.5">
                                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                                    <span className="font-bold text-gray-900">
                                      {r.calificacion_estrellas}
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                      ({r.calificacion_score} pts)
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">Pendiente</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {desglose ? (
                                  <div className="space-y-0.5 text-[10px]">
                                    <span className="inline-block mr-2">
                                      Tareas: <strong>{desglose.cumplimiento?.tareas_cumplidas || 0}/{desglose.cumplimiento?.tareas_totales || 0}</strong> ({desglose.cumplimiento?.score_pct || 0}%)
                                    </span>
                                    <span className="inline-block mr-2">
                                      Avisos: <strong>{desglose.autonomia?.recordatorios_count || 0}</strong>
                                    </span>
                                    <span className="inline-block">
                                      Escalado: <strong className={desglose.escalamiento?.escalado ? 'text-red-600' : 'text-emerald-600'}>
                                        {desglose.escalamiento?.escalado ? 'Sí' : 'No'}
                                      </strong>
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRemitoId(isExpanded ? null : r.id)}
                                    className={`px-2 py-1 text-[11px] font-semibold rounded transition cursor-pointer ${
                                      isExpanded 
                                        ? 'bg-brand-100 text-brand-800' 
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                    }`}
                                  >
                                    {isExpanded ? 'Ocultar' : 'Ver Tareas'}
                                  </button>
                                  <button
                                    onClick={() => navigate(`/remitos/${r.id}`)}
                                    className="p-1 text-brand-600 hover:text-brand-800 hover:bg-brand-50 rounded transition cursor-pointer"
                                    title="Abrir Remito"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Acordeón Detallado de Auditoría de Tareas */}
                            {isExpanded && (
                              <tr className="bg-slate-50/90 border-b border-gray-200 animate-fadeIn">
                                <td colSpan={6} className="p-4 space-y-3 whitespace-normal">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-2">
                                    <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                      <ShieldCheck className="w-4 h-4 text-brand-600" />
                                      Auditoría de Protocolo & Autonomía Digital (Remito #{r.id})
                                    </h4>
                                    <div className="flex items-center gap-3 text-[11px]">
                                      <span className="text-gray-600">
                                        Avisos/Recordatorios: <strong className={desglose?.autonomia?.recordatorios_count ? 'text-amber-600 font-bold' : 'text-gray-900'}>{desglose?.autonomia?.recordatorios_count || 0}</strong>
                                      </span>
                                      <span className="text-gray-600">
                                        Escalado a Operador: <strong className={desglose?.escalamiento?.escalado ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                                          {desglose?.escalamiento?.escalado ? 'Sí (Intervención humana)' : 'No (100% IA)'}
                                        </strong>
                                      </span>
                                    </div>
                                  </div>

                                  {/* Listado de tareas */}
                                  {r.protocolo_control && Array.isArray(r.protocolo_control) && r.protocolo_control.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {r.protocolo_control
                                        .filter((t: any) => t.asignada_a_chofer !== false && t.estado !== 'NO_REALIZABLE')
                                        .map((t: any, idx: number) => {
                                          const cumplida = t.estado === 'REPORTADO_CHOFER' || t.estado === 'COMPLETADO' || !!t.chofer_realizo;
                                          const isCritica = checkIfTaskIsCritical(t);

                                          return (
                                            <div 
                                              key={idx} 
                                              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                                                cumplida 
                                                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
                                                  : 'bg-rose-50/70 border-rose-200 text-rose-950'
                                              }`}
                                            >
                                              {cumplida ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                              ) : (
                                                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                              )}
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                  <span className="font-semibold truncate">{t.tarea || t.tarea_template}</span>
                                                  {isCritica && (
                                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-200 text-amber-900 border border-amber-300 shrink-0 flex items-center gap-0.5">
                                                      <Zap className="w-2.5 h-2.5" /> Crítica
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] mt-0.5 text-gray-500">
                                                  <span>
                                                    {cumplida ? '✅ Cumplida por chofer' : `❌ Omitida (${t.estado || 'PENDIENTE'})`}
                                                  </span>
                                                  {t.valor_reportado_chofer && (
                                                    <span className="font-mono text-gray-700 bg-white/80 px-1 rounded border border-gray-200">
                                                      Valor: {t.valor_reportado_chofer}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-400 italic">No hay tareas de protocolo registradas para este remito.</p>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedChoferForHistorial(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChoferesDashboard;
