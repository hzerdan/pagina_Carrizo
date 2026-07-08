/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { X, Clock, CheckCircle2, Circle, ArrowRight, Weight, Package, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import type { InstanceData } from '../types';
import { cn } from '../../../lib/utils';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

interface InstanceDetailsDrawerProps {
  instance: InstanceData | null;
  isOpen: boolean;
  onClose: () => void;
  onTransitionSuccess?: () => void;
}

interface ChecklistItem {
  codigo: string;
  nombre: string;
  es_bloqueante: boolean;
  cumplido: boolean;
  mensaje: string;
}

export function InstanceDetailsDrawer({ instance, isOpen, onClose, onTransitionSuccess }: InstanceDetailsDrawerProps) {
  const { user, personalAcId } = useAuth();
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Determinar si estamos en un estado transicionable
  const stateCode = instance?.estado_actual.split(':')[0].trim() || '';
  const isState32 = stateCode === '3.2';
  const isState4 = stateCode === '4';
  const isState5 = stateCode === '5';
  const isState51 = stateCode === '5.1';
  const isTransitionableState = isState32 || isState4 || isState5 || isState51;
  const nextStateCode = (() => {
    if (isState32) return '4';
    if (isState4) return '5';
    if (isState5) return '5.1';
    if (isState51) {
      if (instance?.proximos_estados && instance.proximos_estados.length > 0) {
        return instance.proximos_estados[0].split(':')[0].trim();
      }
      return '5.5';
    }
    return '';
  })();

  // Efecto para cargar el checklist dinámico y los permisos de supervisor
  useEffect(() => {
    if (!instance || !isOpen) return;

    const loadChecklist = async () => {
      try {
        setIsLoadingChecklist(true);
        if (stateCode === '5.1') {
          // Lógica para cargar las tareas dinámicas del chofer asociadas al remito
          const { data: remitoItems, error: remitoErr } = await supabase
            .from('remito_items')
            .select('remito_id, remitos(id, remito_ref_externa, protocolo_control, chofer_id)')
            .or(`destino_instance_id.eq.${instance.instancia_id},origen_instance_id.eq.${instance.instancia_id}`)
            .eq('origen_type', 'PEDIDO');

          if (remitoErr) throw remitoErr;

          const allTasks: ChecklistItem[] = [];
          if (!remitoItems || remitoItems.length === 0) {
            allTasks.push({
              codigo: 'VAL_P_511',
              nombre: 'Asociar remito al pedido',
              es_bloqueante: true,
              cumplido: false,
              mensaje: 'No hay remito asociado a esta instancia.'
            });
          } else {
            remitoItems.forEach((ri: any) => {
              if (ri.remitos) {
                // Verificar si tiene chofer asignado
                if (!ri.remitos.chofer_id) {
                  allTasks.push({
                    codigo: 'VAL_P_511',
                    nombre: `Asignar chofer al remito (${ri.remitos.remito_ref_externa || ri.remito_id})`,
                    es_bloqueante: true,
                    cumplido: false,
                    mensaje: 'Falta chofer asignado.'
                  });
                }
                // Obtener tareas del protocolo
                const protocol = ri.remitos.protocolo_control || [];
                const driverTasks = protocol.filter((t: any) => t.asignada_a_chofer);
                driverTasks.forEach((t: any) => {
                  let msg = '';
                  if (t.estado === 'REPORTADO_CHOFER') msg = 'Reportado por chofer - Pendiente de aprobación';
                  else if (t.estado === 'PENDIENTE') msg = 'Pendiente';
                  else if (t.estado === 'NO_REALIZABLE') msg = 'No realizable';
                  else if (t.estado === 'RECHAZADO') msg = 'Rechazado';
                  
                  allTasks.push({
                    codigo: t.tarea_template || t.tarea || `TASK_${t.id}`,
                    nombre: t.tarea,
                    es_bloqueante: true,
                    cumplido: t.estado === 'COMPLETADO',
                    mensaje: msg
                  });
                });
              }
            });
          }
          setChecklist(allTasks);
        } else {
          // Lógica original para otros estados
          const { data, error } = await supabase.rpc('get_checklist_instancia', {
            p_instancia_id: instance.instancia_id
          });

          if (error) throw error;
          setChecklist((data as ChecklistItem[]) || []);
        }
      } catch (err) {
        console.error('Error fetching checklist:', err);
      } finally {
        setIsLoadingChecklist(false);
      }
    };

    const checkSupervisorRole = async () => {
      if (!personalAcId) return;
      try {
        const { data, error } = await supabase
          .from('personal_ac_roles')
          .select('roles(codigo)')
          .eq('personal_ac_id', personalAcId);

        if (error) throw error;
        
        if (data) {
          const hasSup = data.some(
            (row: any) => row.roles && (row.roles.codigo === 'SUP' || row.roles.codigo === 'AD')
          );
          setIsSupervisor(hasSup);
        }
      } catch (err) {
        console.error('Error checking supervisor role:', err);
      }
    };

    loadChecklist();
    checkSupervisorRole();
    setTransitionError(null);
  }, [instance, isOpen, personalAcId, stateCode]);

  if (!instance) return null;

  const isYellow = instance.color_alerta === 'AMARILLO';
  const isRed = instance.color_alerta === 'ROJO';

  // Determinar si cumple todos los obligatorios
  const missingBlocking = checklist.some(item => item.es_bloqueante && !item.cumplido);
  const canAdvance = !missingBlocking && checklist.length > 0;

  // Manejar el avance normal
  const handleAdvance = async () => {
    const missingOptionals = checklist.some(item => !item.es_bloqueante && !item.cumplido);
    if (missingOptionals) {
      const confirm = window.confirm("Se avanzará al siguiente estado sin los datos opcionales. ¿Desea continuar?");
      if (!confirm) return;
    }

    try {
      setIsTransitioning(true);
      setTransitionError(null);

      const rpcName = stateCode === '5.1'
        ? 'intentar_transicion_carga_mercaderia'
        : 'intentar_transicion_automatica_pedido';

      const { data, error } = await supabase.rpc(rpcName, {
        p_instancia_id: instance.instancia_id
      });

      if (error) throw new Error(error.message);

      const res = data as { transicion_exitosa?: boolean; nuevo_estado_code?: string; mensaje_debug?: string } | null;
      if (res?.transicion_exitosa) {
        onTransitionSuccess?.();
        onClose();
      } else {
        throw new Error(res?.mensaje_debug || "No se pudo transicionar. Verifique que se cumplan las validaciones.");
      }
    } catch (err: any) {
      console.error(err);
      setTransitionError(err.message || "Error al realizar la transición.");
    } finally {
      setIsTransitioning(false);
    }
  };

  // Manejar el override del supervisor (Forzar)
  const handleForceAdvance = async () => {
    const motivo = window.prompt("Ingrese el motivo para forzar el cambio de estado (requerido):");
    if (motivo === null) return;
    if (!motivo.trim()) {
      alert("Debe ingresar un motivo válido.");
      return;
    }

    try {
      setIsTransitioning(true);
      setTransitionError(null);

      const { data, error } = await supabase.rpc('transicionar_instancia_manual', {
        p_instancia_id: instance.instancia_id,
        p_nuevo_estado_code: nextStateCode, // Siguiente estado dinámico
        p_usuario_nombre: user?.email || 'unknown',
        p_motivo: motivo
      });

      if (error) throw new Error(error.message);

      const res = data as { status?: string } | null;
      if (res?.status === 'SUCCESS') {
        onTransitionSuccess?.();
        onClose();
      } else {
        throw new Error("No se pudo forzar la transición.");
      }
    } catch (err: any) {
      console.error(err);
      setTransitionError(err.message || "Error al forzar la transición.");
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 transition-opacity backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={cn(
        "fixed inset-y-0 right-0 z-50 w-full md:w-[450px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col",
        isOpen ? "translate-x-0" : "translate-x-full",
        isRed ? "border-l-4 border-l-red-500" :
        isYellow ? "border-l-4 border-l-yellow-400" :
        "border-l-4 border-l-green-500"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-md mr-2">
              {instance.tipo_mercado}
            </span>
            <span className="text-sm font-semibold text-gray-900">Detalles de Instancia</span>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Header Info */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 truncate" title={instance.referencia_humana}>
              {instance.referencia_humana}
            </h2>
            <div className="inline-block px-3 py-1 bg-brand-50 text-brand-700 text-sm font-semibold rounded-full border border-brand-100/50">
              {instance.estado_actual}
            </div>
          </div>

          {/* Time Alert Showcase */}
          <div className={cn(
            "p-4 rounded-xl flex items-center gap-4",
            isRed ? "bg-red-50 text-red-800" :
            isYellow ? "bg-yellow-50 text-yellow-800" :
            "bg-green-50 text-green-800"
          )}>
            <div className={cn(
              "p-3 rounded-full flex-shrink-0",
               isRed ? "bg-red-100 text-red-600" :
               isYellow ? "bg-yellow-100 text-yellow-600" :
               "bg-green-100 text-green-600"
            )}>
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider opacity-80 mb-0.5">Tiempo en estado</p>
              <p className="text-2xl font-bold">{instance.horas_transcurridas} horas</p>
            </div>
          </div>

          {/* Metrics List */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">Métricas de Carga</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <Weight className="w-4 h-4" />
                  <span className="text-xs font-medium">Toneladas</span>
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {instance.toneladas_actuales} <span className="text-sm font-normal text-gray-500">/ {instance.toneladas_originales}</span>
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <Package className="w-4 h-4" />
                  <span className="text-xs font-medium">Bolsas 50kg</span>
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {instance.bolsas_50kg_originales}
                </p>
              </div>
            </div>
          </div>

          {/* Pending Tasks (Checklist Inteligente) */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider flex items-center gap-2">
              Tareas Pendientes
              {checklist.length > 0 && checklist.every(item => item.cumplido) && (
                <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold ml-1">COMPLETO</span>
              )}
            </h3>
            
            {isLoadingChecklist ? (
              <div className="flex items-center justify-center p-6 text-gray-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                <span className="text-sm">Evaluando requisitos...</span>
              </div>
            ) : checklist.length === 0 ? (
              <div className="bg-green-50 text-green-800 p-4 rounded-xl border border-green-100 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-medium">Sin tareas bloqueantes para este estado.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {checklist.map((item, idx) => {
                  const Icon = item.cumplido ? CheckCircle2 : Circle;
                  return (
                    <li key={idx} className="flex items-start gap-3 group" title={item.mensaje}>
                      <Icon className={cn(
                        "w-5 h-5 mt-0.5 flex-shrink-0 transition-colors",
                        item.cumplido ? "text-green-600" : 
                        item.es_bloqueante ? "text-blue-500 group-hover:text-blue-600" : "text-gray-300 group-hover:text-gray-400"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium leading-tight flex items-center gap-2 flex-wrap",
                          item.cumplido ? "text-gray-400 line-through" : "text-gray-700"
                        )}>
                          <span>{item.nombre}</span>
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                            item.es_bloqueante ? "text-blue-700 bg-blue-50" : "text-gray-500 bg-gray-100"
                          )}>
                            {item.es_bloqueante ? "Obligatorio" : "Opcional"}
                          </span>
                        </p>
                        {item.mensaje && (
                          <p className="text-xs text-gray-400 mt-1 italic">{item.mensaje}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Next Steps */}
          {instance.proximos_estados && instance.proximos_estados.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">Próximos Pasos Posibles</h3>
              <div className="space-y-2">
                {instance.proximos_estados.map((estado, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-brand-50/50 p-3 rounded-lg border border-brand-100/30">
                    <ArrowRight className="w-4 h-4 text-brand-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-brand-900">{estado}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Transition Actions Footer */}
        {isTransitionableState && (
          <div className="p-5 border-t border-gray-100 bg-gray-50/70 space-y-3 flex-shrink-0">
            {transitionError && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg flex items-start gap-2 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 mt-0.5" />
                <p>{transitionError}</p>
              </div>
            )}

            <div className="flex gap-2">
              {canAdvance ? (
                <button
                  onClick={handleAdvance}
                  disabled={isTransitioning || isLoadingChecklist}
                  className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-md transition-all duration-150 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
                >
                  {isTransitioning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      Procesar Avance de Estado
                    </>
                  )}
                </button>
              ) : stateCode === '5.1' ? (
                isSupervisor ? (
                  <button
                    onClick={handleForceAdvance}
                    disabled={isTransitioning || isLoadingChecklist}
                    className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-md transition-all duration-150 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {isTransitioning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-4 h-4" />
                        Forzar Avance de Estado (Supervisor/Admin)
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    disabled
                    className="flex-1 py-3 px-4 bg-gray-100 text-gray-400 text-sm font-bold rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-gray-200"
                  >
                    Procesar Avance de Estado
                  </button>
                )
              ) : isSupervisor ? (
                <button
                  onClick={handleForceAdvance}
                  disabled={isTransitioning || isLoadingChecklist}
                  className="flex-1 py-3 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-md transition-all duration-150 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
                >
                  {isTransitioning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4" />
                      Forzar Avance de Estado (Supervisor)
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-400 text-sm font-bold rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-gray-200"
                >
                  Procesar Avance de Estado
                </button>
              )}
            </div>
            
            {!canAdvance && stateCode === '5.1' && (
              isSupervisor ? (
                <p className="text-center text-xs text-red-600 font-semibold bg-red-50 py-1.5 rounded-lg border border-red-100/50">
                  Tareas incompletas. Habilitado override de Supervisor/Admin.
                </p>
              ) : (
                <p className="text-center text-xs text-blue-600 font-semibold bg-blue-50 py-1.5 rounded-lg border border-blue-100/50">
                  Complete las tareas obligatorias del chofer para habilitar el avance.
                </p>
              )
            )}

            {!canAdvance && stateCode !== '5.1' && !isSupervisor && (
              <p className="text-center text-xs text-blue-600 font-semibold bg-blue-50 py-1.5 rounded-lg border border-blue-100/50">
                Complete los requisitos obligatorios para habilitar el avance.
              </p>
            )}
            {!canAdvance && stateCode !== '5.1' && isSupervisor && (
              <p className="text-center text-xs text-orange-600 font-semibold bg-orange-50 py-1.5 rounded-lg border border-orange-100/50">
                Requisitos incompletos. Habilitado override de Supervisor.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

