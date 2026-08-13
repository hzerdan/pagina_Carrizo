/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Clock, CheckCircle2, AlertCircle, AlertTriangle, User, RefreshCw, ChevronDown, ChevronUp, Code2, Filter, Layers, Truck, PackageCheck, CornerUpLeft, Network } from 'lucide-react';
import type { InstanceData, EntityType } from '../types';
import { supabase } from '../../../lib/supabase';
import { cn } from '../../../lib/utils';

interface EventItem {
  id: number;
  timestamp: string;
  event_type: string;
  description: string;
  user_actor: string;
  pedido_instance_id: number | null;
  oc_instance_id: number | null;
  details: Record<string, any> | null;
}

interface LinkedNode {
  id: number;
  type: EntityType | 'REMITO';
  refNumber: string;
  title: string;
  statusBadge: string;
  quantityInfo?: string;
}

interface TraceabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: InstanceData | null;
  entityType: EntityType;
}

export function TraceabilityModal({ isOpen, onClose, instance, entityType }: TraceabilityModalProps) {
  // Entidad actualmente enfocada en el árbol (inicia en la instancia recibida por props)
  const [focusedEntity, setFocusedEntity] = useState<{
    id: number;
    type: EntityType | 'REMITO';
    refNumber: string;
    title: string;
  } | null>(null);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  
  // Nodos vinculados de la Red 360°
  const [linkedOCs, setLinkedOCs] = useState<LinkedNode[]>([]);
  const [linkedPedidos, setLinkedPedidos] = useState<LinkedNode[]>([]);
  const [linkedRemitos, setLinkedRemitos] = useState<LinkedNode[]>([]);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);

  const [filterCategory, setFilterCategory] = useState<'ALL' | 'TRANSITION' | 'VALIDATION' | 'FAILURES'>('ALL');
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);

  // Inicializar la entidad enfocada cuando se abre el modal
  useEffect(() => {
    if (isOpen && instance) {
      setFocusedEntity({
        id: instance.instancia_id,
        type: entityType,
        refNumber: instance.referencia_humana || instance.nro_pedido,
        title: instance.cliente || instance.proveedor || ''
      });
      setFilterCategory('ALL');
      setExpandedEventId(null);
    }
  }, [isOpen, instance, entityType]);

  // Cargar eventos del documento enfocado actual
  const fetchEvents = useCallback(async () => {
    if (!focusedEntity) return;
    try {
      setIsLoadingEvents(true);
      setEventsError(null);

      let query = supabase.from('historial_eventos').select('*');

      if (focusedEntity.type === 'PEDIDO') {
        query = query.eq('pedido_instance_id', focusedEntity.id);
      } else if (focusedEntity.type === 'OC') {
        query = query.eq('oc_instance_id', focusedEntity.id);
      } else if (focusedEntity.type === 'REMITO') {
        query = query.filter('details->remito_id', 'eq', focusedEntity.id);
      }

      const { data, error: fetchErr } = await query.order('timestamp', { ascending: false });
      if (fetchErr) throw fetchErr;

      setEvents((data as EventItem[]) || []);
    } catch (err: any) {
      console.error('Error fetching historial_eventos:', err);
      setEventsError(err.message || 'Error al obtener el historial de eventos.');
    } finally {
      setIsLoadingEvents(false);
    }
  }, [focusedEntity]);

  // Cargar las relaciones (red 360°) mediante RPC get_trazabilidad_red_360
  const fetchTraceabilityGraph = useCallback(async () => {
    if (!instance) return;
    try {
      setIsLoadingGraph(true);

      const { data: resData, error: rpcErr } = await supabase.rpc('get_trazabilidad_red_360', {
        p_instancia_id: instance.instancia_id,
        p_entity_type: entityType
      });

      if (rpcErr) throw rpcErr;

      if (resData) {
        const ocs: LinkedNode[] = (resData.ocs || []).map((o: any) => ({
          id: o.id,
          type: 'OC',
          refNumber: o.ref_number,
          title: o.title,
          statusBadge: o.status_badge,
          quantityInfo: o.cantidad_vinculada ? `${o.cantidad_vinculada} TN` : undefined
        }));

        const peds: LinkedNode[] = (resData.pedidos || []).map((p: any) => ({
          id: p.id,
          type: 'PEDIDO',
          refNumber: p.ref_number,
          title: p.title,
          statusBadge: p.status_badge,
          quantityInfo: p.cantidad_vinculada ? `${p.cantidad_vinculada} TN` : undefined
        }));

        const rems: LinkedNode[] = (resData.remitos || []).map((r: any) => ({
          id: r.id,
          type: 'REMITO',
          refNumber: r.ref_number,
          title: r.title,
          statusBadge: r.status_badge
        }));

        setLinkedOCs(ocs);
        setLinkedPedidos(peds);
        setLinkedRemitos(rems);
      }
    } catch (err) {
      console.error('Error fetching 360 traceability graph via RPC:', err);
    } finally {
      setIsLoadingGraph(false);
    }
  }, [instance, entityType]);

  useEffect(() => {
    if (isOpen && instance) {
      fetchTraceabilityGraph();
    }
  }, [isOpen, instance, fetchTraceabilityGraph]);

  useEffect(() => {
    if (focusedEntity) {
      fetchEvents();
    }
  }, [focusedEntity, fetchEvents]);

  // Filtrado de eventos
  const filteredEvents = useMemo(() => {
    return events.filter(evt => {
      if (filterCategory === 'TRANSITION') return evt.event_type === 'STATE_TRANSITION';
      if (filterCategory === 'VALIDATION') return evt.event_type.startsWith('VALIDATION_');
      if (filterCategory === 'FAILURES') {
        return (
          evt.event_type === 'VALIDATION_FAILURE' ||
          evt.event_type === 'VALIDATION_DENIED' ||
          evt.description.toLowerCase().includes('fallo') ||
          evt.description.toLowerCase().includes('error')
        );
      }
      return true;
    });
  }, [events, filterCategory]);

  const stats = useMemo(() => {
    const total = events.length;
    const transitions = events.filter(e => e.event_type === 'STATE_TRANSITION').length;
    const failures = events.filter(e => e.event_type === 'VALIDATION_FAILURE' || e.event_type === 'VALIDATION_DENIED').length;
    return { total, transitions, failures };
  }, [events]);

  if (!isOpen || !instance || !focusedEntity) return null;

  const isMainFocused = focusedEntity.id === instance.instancia_id && focusedEntity.type === entityType;

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const getEventBadge = (evt: EventItem) => {
    const isFailure = evt.event_type === 'VALIDATION_FAILURE' || evt.event_type === 'VALIDATION_DENIED' || evt.description.toLowerCase().includes('fallo');
    const isSuccessVal = evt.event_type === 'VALIDATION_SUCCESS';
    const isTransition = evt.event_type === 'STATE_TRANSITION';
    const isManual = evt.details?.metodo === 'MANUAL_UI' || evt.description.toLowerCase().includes('manual');

    if (isFailure) {
      return {
        icon: AlertCircle,
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-700',
        iconColor: 'text-red-600',
        badgeText: 'Fallo / Bloqueante'
      };
    }
    if (isManual) {
      return {
        icon: AlertTriangle,
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        textColor: 'text-amber-800',
        iconColor: 'text-amber-600',
        badgeText: 'Movimiento Manual'
      };
    }
    if (isTransition) {
      return {
        icon: Layers,
        bgColor: 'bg-brand-50',
        borderColor: 'border-brand-200',
        textColor: 'text-brand-800',
        iconColor: 'text-brand-600',
        badgeText: 'Transición de Estado'
      };
    }
    if (isSuccessVal) {
      return {
        icon: CheckCircle2,
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-200',
        textColor: 'text-emerald-800',
        iconColor: 'text-emerald-600',
        badgeText: 'Validación OK'
      };
    }

    return {
      icon: Clock,
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      textColor: 'text-gray-700',
      iconColor: 'text-gray-500',
      badgeText: evt.event_type
    };
  };

  // Nodos a renderizar en la columna de suministro (excluyendo el nodo enfocado si coincide)
  const leftNodes = entityType === 'PEDIDO'
    ? linkedOCs.filter(o => !(o.id === focusedEntity.id && focusedEntity.type === 'OC'))
    : linkedPedidos.filter(p => !(p.id === focusedEntity.id && focusedEntity.type === 'PEDIDO'));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header del Modal */}
        <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5 text-brand-600" />
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                Trazabilidad 360° e Historial de Eventos
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">
              Documento Principal: {instance.referencia_humana || instance.nro_pedido} • {instance.cliente || instance.proveedor || ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isMainFocused && (
              <button
                type="button"
                onClick={() => setFocusedEntity({
                  id: instance.instancia_id,
                  type: entityType,
                  refNumber: instance.referencia_humana || instance.nro_pedido,
                  title: instance.cliente || instance.proveedor || ''
                })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors cursor-pointer"
                title="Volver a ver el historial del documento principal"
              >
                <CornerUpLeft className="w-3.5 h-3.5" />
                <span>Volver al Principal</span>
              </button>
            )}

            <button
              onClick={fetchEvents}
              disabled={isLoadingEvents}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              title="Actualizar eventos"
            >
              <RefreshCw className={cn("w-4 h-4", isLoadingEvents && "animate-spin")} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mapa de Nodos Navegables de Trazabilidad 360° */}
        <div className="p-4 bg-slate-900 text-white flex-shrink-0 overflow-x-auto border-b border-slate-800">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5 text-brand-400" />
              Mapa de Relaciones 360° (Hacé clic en cualquier nodo para ver sus eventos)
            </span>
            {isLoadingGraph && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin text-brand-400" /> Cargando red...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-w-[650px] items-stretch">
            {/* Columna 1: Suministro (OCs o Pedidos Origen) */}
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <PackageCheck className="w-3.5 h-3.5 text-amber-400" />
                {entityType === 'PEDIDO' ? 'Suministro (Órdenes de Compra)' : 'Pedidos Suministrados'}
              </span>

              <div className="space-y-1.5 overflow-y-auto max-h-28 pr-1">
                {leftNodes.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-1">Sin vinculaciones detectadas</p>
                ) : (
                  leftNodes.map(node => {
                    const isSelected = focusedEntity.id === node.id && focusedEntity.type === node.type;
                    return (
                      <button
                        key={`${node.type}-${node.id}`}
                        type="button"
                        onClick={() => setFocusedEntity({
                          id: node.id,
                          type: node.type,
                          refNumber: node.refNumber,
                          title: node.title
                        })}
                        className={cn(
                          "w-full text-left p-2 rounded-lg text-xs transition-all cursor-pointer border flex justify-between items-center gap-2",
                          isSelected
                            ? "bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400"
                            : "bg-slate-700/60 border-slate-600 hover:bg-slate-700 text-slate-200"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="font-bold truncate">{node.refNumber}</p>
                          <p className="text-[10px] text-slate-400 truncate">{node.title}</p>
                        </div>
                        {node.quantityInfo && (
                          <span className="bg-amber-400/10 text-amber-300 font-mono text-[10px] px-1.5 py-0.5 rounded border border-amber-400/30 flex-shrink-0">
                            {node.quantityInfo}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Columna 2: Documento Central (Instancia Actual) */}
            <div className="bg-slate-800/80 p-3 rounded-xl border border-brand-500/80 flex flex-col justify-between relative shadow-lg">
              <div>
                <span className="text-[10px] font-bold text-brand-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <Layers className="w-3.5 h-3.5" />
                  Documento Enfocado
                </span>
                <p className="text-sm font-bold text-white truncate" title={focusedEntity.refNumber}>
                  {focusedEntity.refNumber}
                </p>
                <p className="text-xs text-slate-300 truncate" title={focusedEntity.title}>
                  {focusedEntity.title}
                </p>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between items-center">
                <span className="bg-brand-500/20 text-brand-300 border border-brand-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {focusedEntity.type}
                </span>
                {isMainFocused && (
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Principal
                  </span>
                )}
              </div>
            </div>

            {/* Columna 3: Despachos y Logística (Remitos) */}
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-emerald-400" />
                Despachos y Logística (Remitos)
              </span>

              <div className="space-y-1.5 overflow-y-auto max-h-28 pr-1">
                {linkedRemitos.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-1">Sin remitos asociados aún</p>
                ) : (
                  linkedRemitos.map(remNode => {
                    const isSelected = focusedEntity.id === remNode.id && focusedEntity.type === 'REMITO';
                    return (
                      <button
                        key={`rem-${remNode.id}`}
                        type="button"
                        onClick={() => setFocusedEntity({
                          id: remNode.id,
                          type: 'REMITO',
                          refNumber: remNode.refNumber,
                          title: remNode.title
                        })}
                        className={cn(
                          "w-full text-left p-2 rounded-lg text-xs transition-all cursor-pointer border flex justify-between items-center gap-2",
                          isSelected
                            ? "bg-emerald-500/20 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400"
                            : "bg-slate-700/60 border-slate-600 hover:bg-slate-700 text-slate-200"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="font-bold truncate">{remNode.refNumber}</p>
                          <p className="text-[10px] text-slate-400 truncate">{remNode.title}</p>
                        </div>
                        <span className="bg-emerald-400/10 text-emerald-300 font-mono text-[9px] px-1.5 py-0.5 rounded border border-emerald-400/30 flex-shrink-0">
                          {remNode.statusBadge}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Summary Bar */}
        <div className="px-6 py-2.5 bg-white border-b border-gray-100 grid grid-cols-3 gap-4 flex-shrink-0 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-600 flex-shrink-0" />
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-400">Total Eventos</p>
              <p className="text-sm font-bold text-gray-800">{stats.total}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-400">Transiciones</p>
              <p className="text-sm font-bold text-emerald-700">{stats.transitions}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-400">Fallos / Alertas</p>
              <p className="text-sm font-bold text-red-600">{stats.failures}</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-2.5 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between gap-2 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Eventos de: <strong className="text-gray-900">{focusedEntity.refNumber}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterCategory('ALL')}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                filterCategory === 'ALL' ? "bg-brand-600 text-white shadow-xs" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              )}
            >
              Todos ({events.length})
            </button>
            <button
              onClick={() => setFilterCategory('TRANSITION')}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                filterCategory === 'TRANSITION' ? "bg-brand-600 text-white shadow-xs" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              )}
            >
              Transiciones
            </button>
            <button
              onClick={() => setFilterCategory('VALIDATION')}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                filterCategory === 'VALIDATION' ? "bg-brand-600 text-white shadow-xs" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              )}
            >
              Validaciones
            </button>
            <button
              onClick={() => setFilterCategory('FAILURES')}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                filterCategory === 'FAILURES' ? "bg-red-600 text-white shadow-xs" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              )}
            >
              Solo Fallos
            </button>
          </div>
        </div>

        {/* Content: Timeline */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {eventsError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Error al cargar historial</p>
                <p className="mt-0.5">{eventsError}</p>
              </div>
            </div>
          )}

          {isLoadingEvents ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
              <span className="text-sm font-medium">Cargando eventos de auditoría para {focusedEntity.refNumber}...</span>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium">No se encontraron eventos registrados para este documento en este filtro.</p>
            </div>
          ) : (
            <div className="relative pl-6 border-l-2 border-gray-200 space-y-6">
              {filteredEvents.map(evt => {
                const badge = getEventBadge(evt);
                const Icon = badge.icon;
                const isExpanded = expandedEventId === evt.id;

                return (
                  <div key={evt.id} className="relative group">
                    {/* Timeline Node Icon */}
                    <div className={cn(
                      "absolute -left-[31px] top-0 w-6 h-6 rounded-full border-2 bg-white flex items-center justify-center shadow-xs",
                      badge.borderColor
                    )}>
                      <Icon className={cn("w-3.5 h-3.5", badge.iconColor)} />
                    </div>

                    {/* Card Content */}
                    <div className={cn(
                      "p-4 rounded-xl border transition-all bg-white shadow-xs",
                      badge.borderColor,
                      isExpanded ? "ring-2 ring-brand-500/20" : "hover:border-gray-300"
                    )}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border uppercase", badge.bgColor, badge.textColor, badge.borderColor)}>
                              {badge.badgeText}
                            </span>
                            
                            <span className="text-xs text-gray-400 font-mono">
                              {formatDate(evt.timestamp)}
                            </span>
                          </div>

                          <p className="text-xs font-semibold text-gray-900 mt-1 leading-relaxed">
                            {evt.description}
                          </p>
                        </div>

                        {/* Actor Badge */}
                        <div className="flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0" title="Usuario / Actor que registró el evento">
                          <User className="w-3 h-3 text-gray-400" />
                          <span>{evt.user_actor || 'Sistema'}</span>
                        </div>
                      </div>

                      {/* Expandable JSON Details */}
                      {evt.details && Object.keys(evt.details).length > 0 && (
                        <div className="mt-3 pt-2 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                            className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-brand-600 transition-colors cursor-pointer"
                          >
                            <Code2 className="w-3.5 h-3.5 text-gray-400" />
                            <span>{isExpanded ? 'Ocultar detalles técnicos' : 'Ver detalles técnicos (JSON)'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-lg font-mono text-[11px] overflow-x-auto border border-gray-800 shadow-inner">
                              <pre className="whitespace-pre-wrap leading-tight">
                                {JSON.stringify(evt.details, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 shadow-xs transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
