import { useState, useMemo, useEffect, useCallback } from 'react';
import { MonitorFilters } from './components/MonitorFilters';
import { MonitorBoard } from './components/MonitorBoard';
import { TransitionModal } from './components/TransitionModal';
import { InstanceDetailsDrawer } from './components/InstanceDetailsDrawer';
import type { InstanceData, StateDefinition } from './types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { RefreshCw, AlertCircle } from 'lucide-react';
import type { DragEndEvent } from '@dnd-kit/core';

export function MonitorPage() {
  const { user } = useAuth();
  
  const [data, setData] = useState<InstanceData[]>([]);
  const [stateDefs, setStateDefs] = useState<StateDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tipoMercado, setTipoMercado] = useState<string>('TODOS');
  const [colorAlerta, setColorAlerta] = useState<string>('TODOS');
  const [selectedInstance, setSelectedInstance] = useState<InstanceData | null>(null);

  // Transition State
  const [pendingTransition, setPendingTransition] = useState<{
    instance: InstanceData;
    newStateCode: string;
  } | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [instancesRes, statesRes] = await Promise.all([
        supabase.from('vw_monitor_instancias_activas').select('*'),
        supabase.from('state_definitions').select('state_code, name').eq('fsm_id', 1).order('state_code', { ascending: true })
      ]);

      if (instancesRes.error) throw new Error(instancesRes.error.message);
      if (statesRes.error) throw new Error(statesRes.error.message);
      
      setData(instancesRes.data || []);
      setStateDefs(statesRes.data || []);
    } catch (err: any) {
      console.error('Error fetching monitor data:', err);
      setError(err.message || 'Error desconocido al obtener la información.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtrado en el frontend
  const filteredData = useMemo(() => {
    return data.filter(instance => {
      const matchMercado = tipoMercado === 'TODOS' || instance.tipo_mercado === tipoMercado;
      const matchAlerta = colorAlerta === 'TODOS' || instance.color_alerta === colorAlerta;
      return matchMercado && matchAlerta;
    });
  }, [data, tipoMercado, colorAlerta]);

  const toggleRefresh = () => {
    setSelectedInstance(null); // Optional: close drawer on refresh
    fetchData();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const instanceId = active.id;
    const overId = over.id; // Either another instance or a column id (state_code)
    
    // Find the original instance
    const instance = data.find(i => i.instancia_id === instanceId);
    if (!instance) return;

    // Determine the target state_code
    let targetStateCode = overId as string;
    
    // If we dropped over another card, get its state_code
    if (over.data.current?.type === 'Instance') {
      const targetInstance = over.data.current.instance as InstanceData;
      // Extract state_code prefix from target instance
      const match = targetInstance.estado_actual.match(/^([\d.]+):/);
      if (match) {
        targetStateCode = match[1];
      }
    }

    // Extract current state code prefix
    const currentMatch = instance.estado_actual.match(/^([\d.]+):/);
    const currentStateCode = currentMatch ? currentMatch[1] : null;

    if (targetStateCode && targetStateCode !== currentStateCode) {
      setPendingTransition({
        instance,
        newStateCode: targetStateCode
      });
    }
  };

  const confirmTransition = async (motivo: string) => {
    if (!pendingTransition) return;
    
    try {
      setIsTransitioning(true);
      const { error: rpcError } = await supabase.rpc('transicionar_instancia_manual', {
        p_instancia_id: pendingTransition.instance.instancia_id,
        p_nuevo_estado_code: pendingTransition.newStateCode,
        p_usuario_nombre: user?.email || 'unknown',
        p_motivo: motivo
      });

      if (rpcError) throw new Error(rpcError.message);

      // Successfully transitioned, refresh data locally
      await fetchData();
      setPendingTransition(null);
    } catch (err: any) {
      console.error('Transition Error:', err);
      alert(`Error al transicionar manual: ${err.message}`);
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50">
      <div className="p-4 md:p-6 flex-1 overflow-hidden flex flex-col h-full">
        
        {/* Header de la página */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Monitor de Instancias</h1>
            <p className="mt-1 text-sm text-gray-500">
              Seguimiento operativo en tiempo real de pedidos y Órdenes de Compra.
            </p>
          </div>
          
          <button 
            onClick={toggleRefresh}
            disabled={isLoading}
            className="flex flex-shrink-0 items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl flex items-start gap-3 flex-shrink-0">
             <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-600" />
             <div>
               <h3 className="text-sm font-semibold">Error de conexión</h3>
               <p className="text-sm mt-1">{error}</p>
             </div>
          </div>
        )}

        {/* Filtros */}
        <div className="mb-4 flex-shrink-0">
          <MonitorFilters 
            tipoMercado={tipoMercado}
            setTipoMercado={setTipoMercado}
            colorAlerta={colorAlerta}
            setColorAlerta={setColorAlerta}
          />
        </div>

        {/* Board Principal */}
        <div className="flex-1 min-h-0 bg-white/50 rounded-xl overflow-hidden shadow-inner border border-gray-100 p-2 sm:p-4">
          <MonitorBoard 
            instances={filteredData}
            stateDefs={stateDefs}
            onCardClick={setSelectedInstance} 
            onDragEnd={handleDragEnd}
            isLoading={isLoading}
          />
        </div>
        
      </div>

      {/* Drawer de Detalles */}
      <InstanceDetailsDrawer 
        isOpen={!!selectedInstance}
        instance={selectedInstance}
        onClose={() => setSelectedInstance(null)}
      />

      {/* Modal de Transición Manual */}
      <TransitionModal
        isOpen={!!pendingTransition}
        onClose={() => !isTransitioning && setPendingTransition(null)}
        onConfirm={confirmTransition}
        isLoading={isTransitioning}
        instance={pendingTransition?.instance || null}
        newStateCode={pendingTransition?.newStateCode || null}
        stateDefs={stateDefs}
      />
    </div>
  );
}
