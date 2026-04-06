import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { InspeccionesBoard } from './components/InspeccionesBoard';
import { NuevaInspeccionModal } from './components/NuevaInspeccionModal';
import { TransicionExcepcionModal } from './components/TransicionExcepcionModal';
import { InspeccionDetailDrawer } from './components/InspeccionDetailDrawer';
import type { InspeccionKanban, StateDefinition } from './types';
import { RefreshCw, AlertCircle, Plus, ClipboardCheck, Filter } from 'lucide-react';
import type { DragEndEvent } from '@dnd-kit/core';

export function InspeccionesKanbanPage() {
  const { user } = useAuth();
  const usuarioActor = user?.email || 'unknown';

  // ── Data State ─────────────────────────────────────────────────────
  const [inspecciones, setInspecciones] = useState<InspeccionKanban[]>([]);
  const [stateDefs, setStateDefs] = useState<StateDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filters ────────────────────────────────────────────────────────
  const [filterTipoCarga, setFilterTipoCarga] = useState<string>('TODOS');
  const [filterInspector, setFilterInspector] = useState<string>('TODOS');

  // ── Modals / Drawers ──────────────────────────────────────────────
  const [showNuevaModal, setShowNuevaModal] = useState(false);
  const [selectedInspeccion, setSelectedInspeccion] = useState<InspeccionKanban | null>(null);

  // ── Transition State ──────────────────────────────────────────────
  const [pendingTransition, setPendingTransition] = useState<{
    inspeccion: InspeccionKanban;
    newStateCode: string;
  } | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showExcepcionModal, setShowExcepcionModal] = useState(false);

  // ── Data Fetching ─────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [insRes, statesRes] = await Promise.all([
        supabase.from('v_inspecciones_kanban').select('*'),
        supabase
          .from('state_definitions')
          .select('state_code, name')
          .eq('fsm_id', 3)
          .order('state_code', { ascending: true }),
      ]);

      if (insRes.error) throw new Error(insRes.error.message);
      if (statesRes.error) throw new Error(statesRes.error.message);

      console.log('--- Datos recuperados de Supabase ---');
      console.log('Inspecciones:', insRes.data);
      console.log('State Defs (FSM 3):', statesRes.data);

      setInspecciones(insRes.data || []);
      setStateDefs(statesRes.data || []);
    } catch (err: any) {
      console.error('Error fetching inspecciones data:', err);
      setError(err.message || 'Error desconocido al obtener la información.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Unique values for filters ─────────────────────────────────────
  const tiposCargaUnicos = useMemo(() => {
    const set = new Set(inspecciones.map(i => i.tipo_carga));
    return Array.from(set).sort();
  }, [inspecciones]);

  const inspectoresUnicos = useMemo(() => {
    const set = new Set(inspecciones.map(i => i.inspector_nombre));
    return Array.from(set).sort();
  }, [inspecciones]);

  // ── Filtered data ─────────────────────────────────────────────────
  const filteredInspecciones = useMemo(() => {
    return inspecciones.filter(i => {
      const matchTipo = filterTipoCarga === 'TODOS' || i.tipo_carga === filterTipoCarga;
      const matchInsp = filterInspector === 'TODOS' || i.inspector_nombre === filterInspector;
      return matchTipo && matchInsp;
    });
  }, [inspecciones, filterTipoCarga, filterInspector]);

  // ── Drag & Drop: Dual Transition Flow ─────────────────────────────
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const inspeccion = inspecciones.find(i => i.id === active.id);
    if (!inspeccion) return;

    // Determine target state_code
    let targetStateCode = over.id as string;

    // If dropped over a card, resolve the column from that card's state
    if (over.data.current?.type === 'Inspeccion') {
      const targetInsp = over.data.current.inspeccion as InspeccionKanban;
      targetStateCode = targetInsp.state_code;
    }

    // Don't transition to the same state
    if (targetStateCode === inspeccion.state_code) return;

    // Step 1: Attempt automatic transition
    try {
      setIsTransitioning(true);
      const { error: rpcError } = await supabase.rpc('inspeccion_intentar_transicion', {
        p_inspeccion_id: inspeccion.id,
        p_nuevo_estado_code: targetStateCode,
        p_usuario_actor: usuarioActor,
      });

      if (rpcError) {
        // Step 2: Transition failed → show exception modal
        setPendingTransition({ inspeccion, newStateCode: targetStateCode });
        setTransitionError(rpcError.message);
        setShowExcepcionModal(true);
      } else {
        // Success — refresh
        await fetchData();
      }
    } catch (err: any) {
      console.error('Transition attempt error:', err);
      setPendingTransition({ inspeccion, newStateCode: targetStateCode });
      setTransitionError(err.message || 'Error inesperado durante la transición.');
      setShowExcepcionModal(true);
    } finally {
      setIsTransitioning(false);
    }
  };

  // ── Force Transition (bypass) ─────────────────────────────────────
  const handleForceTransition = async (motivo: string) => {
    if (!pendingTransition) return;

    try {
      setIsTransitioning(true);
      const { error: rpcError } = await supabase.rpc('inspeccion_forzar_transicion', {
        p_inspeccion_id: pendingTransition.inspeccion.id,
        p_nuevo_estado_code: pendingTransition.newStateCode,
        p_usuario_actor: usuarioActor,
        p_motivo_excepcion: motivo,
      });

      if (rpcError) throw new Error(rpcError.message);

      await fetchData();
      setShowExcepcionModal(false);
      setPendingTransition(null);
      setTransitionError(null);
    } catch (err: any) {
      console.error('Force transition error:', err);
      alert(`Error al forzar la transición: ${err.message}`);
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleCloseExcepcionModal = () => {
    if (!isTransitioning) {
      setShowExcepcionModal(false);
      setPendingTransition(null);
      setTransitionError(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50">
      <div className="p-4 md:p-6 flex-1 overflow-hidden flex flex-col h-full">
        {/* Header */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="w-5 h-5 text-brand-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                Inspecciones Documentales
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                Control Documental de Exportación · FSM 3
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNuevaModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva Inspección
            </button>
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-start gap-3 flex-shrink-0">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-600" />
            <div>
              <h3 className="text-sm font-semibold">Error de conexión</h3>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex-shrink-0 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter className="w-4 h-4" />
            <span className="font-medium">Filtros:</span>
          </div>

          <select
            value={filterTipoCarga}
            onChange={e => setFilterTipoCarga(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="TODOS">Tipo de Carga: Todos</option>
            {tiposCargaUnicos.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={filterInspector}
            onChange={e => setFilterInspector(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="TODOS">Inspector: Todos</option>
            {inspectoresUnicos.map(i => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>

          {(filterTipoCarga !== 'TODOS' || filterInspector !== 'TODOS') && (
            <button
              onClick={() => {
                setFilterTipoCarga('TODOS');
                setFilterInspector('TODOS');
              }}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2"
            >
              Limpiar filtros
            </button>
          )}

          <span className="ml-auto text-xs text-gray-400 font-medium">
            {filteredInspecciones.length} inspección{filteredInspecciones.length !== 1 ? 'es' : ''}
          </span>
        </div>

        {/* Board */}
        <div className="flex-1 min-h-0 bg-white/50 rounded-xl overflow-hidden shadow-inner border border-gray-100 p-2 sm:p-4">
          <InspeccionesBoard
            inspecciones={filteredInspecciones}
            stateDefs={stateDefs}
            onCardClick={setSelectedInspeccion}
            onDragEnd={handleDragEnd}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* ── Modals & Drawers ───────────────────────────────────────── */}

      {/* Nueva Inspección */}
      <NuevaInspeccionModal
        isOpen={showNuevaModal}
        onClose={() => setShowNuevaModal(false)}
        onCreated={fetchData}
        usuarioActor={usuarioActor}
      />

      {/* Detail Drawer */}
      <InspeccionDetailDrawer
        isOpen={!!selectedInspeccion}
        inspeccion={selectedInspeccion}
        stateDefs={stateDefs}
        onClose={() => setSelectedInspeccion(null)}
        onDataChanged={fetchData}
        usuarioActor={usuarioActor}
      />

      {/* Excepción Modal */}
      <TransicionExcepcionModal
        isOpen={showExcepcionModal}
        onClose={handleCloseExcepcionModal}
        onForceTransition={handleForceTransition}
        isLoading={isTransitioning}
        inspeccion={pendingTransition?.inspeccion || null}
        newStateCode={pendingTransition?.newStateCode || null}
        stateDefs={stateDefs}
        errorMessage={transitionError}
      />

      {/* Transitioning Overlay */}
      {isTransitioning && !showExcepcionModal && (
        <div className="fixed inset-0 z-[90] bg-black/20 backdrop-blur-[2px] flex items-center justify-center">
          <div className="bg-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <span className="text-sm font-medium text-gray-700">Procesando transición...</span>
          </div>
        </div>
      )}
    </div>
  );
}
