import { X, Clock, CheckCircle2, Circle, ArrowRight, Weight, Package } from 'lucide-react';
import type { InstanceData } from '../types';
import { cn } from '../../../lib/utils';

interface InstanceDetailsDrawerProps {
  instance: InstanceData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function InstanceDetailsDrawer({ instance, isOpen, onClose }: InstanceDetailsDrawerProps) {
  if (!instance) return null;

  const isYellow = instance.color_alerta === 'AMARILLO';
  const isRed = instance.color_alerta === 'ROJO';

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

          {/* Pending Tasks */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider flex items-center gap-2">
              Tareas Pendientes
              {(!instance.tareas_faltantes || instance.tareas_faltantes.length === 0) && (
                <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full font-bold ml-1">COMPLETO</span>
              )}
            </h3>
            
            {(!instance.tareas_faltantes || instance.tareas_faltantes.length === 0) ? (
              <div className="bg-green-50 text-green-800 p-4 rounded-xl border border-green-100 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-medium">Sin tareas bloqueantes para este estado.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {instance.tareas_faltantes.map((tarea, idx) => (
                  <li key={idx} className="flex items-start gap-3 group">
                    <Circle className="w-5 h-5 text-gray-300 mt-0.5 flex-shrink-0 group-hover:text-gray-400 transition-colors" />
                    <span className="text-sm text-gray-700 font-medium">{tarea}</span>
                  </li>
                ))}
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
      </div>
    </>
  );
}
