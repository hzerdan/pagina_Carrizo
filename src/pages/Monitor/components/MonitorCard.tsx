import type { InstanceData } from '../types';
import { cn } from '../../../lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Truck, User, Building2, Clock } from 'lucide-react';

interface MonitorCardProps {
  instance: InstanceData;
  onClick: (instance: InstanceData) => void;
}

export function MonitorCard({ instance, onClick }: MonitorCardProps) {
  // Alert color logic for the left border/indicator
  const getAlertColor = (color: string) => {
    switch (color) {
      case 'ROJO':
        return 'bg-red-500 border-red-500 shadow-red-100';
      case 'AMARILLO':
        return 'bg-yellow-400 border-yellow-400 shadow-yellow-100';
      case 'VERDE':
        return 'bg-green-500 border-green-500 shadow-green-100';
      default:
        return 'bg-gray-400 border-gray-400 shadow-gray-100';
    }
  };

  const alertColorClass = getAlertColor(instance.color_alerta);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: instance.instancia_id,
    data: {
      type: 'Instance',
      instance,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative bg-white rounded-xl shadow-sm border border-gray-100 transition-all overflow-hidden flex flex-col ring-1 ring-transparent",
        isDragging ? "opacity-40 ring-brand-500 shadow-xl scale-105 z-50 cursor-grabbing" : "hover:shadow-md"
      )}
    >
      {/* Left border indicator */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1.5 z-10", alertColorClass)}></div>

      <div className="flex flex-1">
        {/* Drag Handle */}
        <div 
          {...attributes}
          {...listeners}
          className="w-8 flex-shrink-0 flex items-center justify-center border-r border-gray-50 bg-gray-50/50 hover:bg-gray-100 cursor-grab active:cursor-grabbing z-20"
          title="Arrastrar tarjeta"
        >
          <GripVertical className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
        </div>

        {/* Content Box (Clickable for details) */}
        <div 
          onClick={() => onClick(instance)}
          className="p-4 flex-1 flex flex-col cursor-pointer"
        >
          {/* Header: Market Badge & Wait Time */}
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-md">
                {instance.tipo_mercado}
              </span>
              <span className="text-xs text-gray-500 truncate max-w-[120px]" title={instance.referencia_humana}>
                {instance.referencia_humana}
              </span>
            </div>
            
            <div className={cn(
               "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md",
               instance.color_alerta === 'ROJO' ? 'bg-red-50 text-red-700' :
               instance.color_alerta === 'AMARILLO' ? 'bg-yellow-50 text-yellow-700' :
               'bg-green-50 text-green-700'
            )}>
              <Clock className="w-3.5 h-3.5" />
              <span>{instance.horas_transcurridas}h</span>
            </div>
          </div>

          {/* Status Badge */}
          <div className="mb-4">
             <span className="inline-block px-3 py-1 bg-brand-50 text-brand-700 text-[10px] font-semibold rounded-full border border-brand-100/50 line-clamp-2">
               {instance.estado_actual}
             </span>
          </div>

          {/* Entities and Logistics Info */}
          <div className="mt-auto space-y-2">
             <div className="flex items-center text-xs text-gray-600">
               <Building2 className="w-3.5 h-3.5 mr-2 text-gray-400 flex-shrink-0" />
               <span className="truncate" title={instance.cliente}>{instance.cliente}</span>
             </div>
             
             <div className="flex items-center text-xs text-gray-600">
               <User className="w-3.5 h-3.5 mr-2 text-gray-400 flex-shrink-0" />
               <span className="truncate" title={instance.proveedor}>{instance.proveedor}</span>
             </div>

             {instance.nro_remito && (
               <div className="flex items-center text-xs text-brand-700 pt-1 font-medium bg-brand-50 w-fit px-2 py-0.5 rounded">
                 <Truck className="w-3 h-3 mr-1.5 flex-shrink-0" />
                 <span className="truncate max-w-[150px]" title={instance.nro_remito}>Rep: {instance.nro_remito}</span>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
