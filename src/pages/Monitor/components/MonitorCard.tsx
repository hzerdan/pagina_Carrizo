import { useState } from 'react';
import type { InstanceData, EntityType } from '../types';
import { cn } from '../../../lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Truck, User, Building2, Clock, FileText, ExternalLink, Loader2, DollarSign, CheckCircle2 } from 'lucide-react';
import { openOriginalDocument } from '../../../services/documentService';

interface MonitorCardProps {
  instance: InstanceData;
  onClick: (instance: InstanceData) => void;
  onOpenTraceabilityReport?: (instance: InstanceData) => void;
  activeTab?: EntityType;
  onShowToast?: (type: 'info' | 'error', message: string) => void;
}

export function parseReferenciaHumana(ref: string, instanceId: number) {
  let pedido = '';
  let oc = '';
  let remito = '';
  let idInstancia = String(instanceId);

  if (!ref) {
    return { pedido, oc, remito, idInstancia };
  }

  const parts = ref.split('_');

  parts.forEach((part, index) => {
    if (part.startsWith('OC-')) {
      oc = part.substring(3);
    } else if (part.startsWith('PED-')) {
      pedido = part.substring(4);
    } else if (part.startsWith('REM-')) {
      remito = part.substring(4);
    } else if (/^\d+$/.test(part)) {
      if (part.length > 6) {
        pedido = part;
      } else {
        if (index === parts.length - 1) {
          idInstancia = part;
        }
      }
    } else if (part.includes('-')) {
      oc = part;
    } else {
      if (index === 0) {
        pedido = part;
      }
    }
  });

  return { pedido, oc, remito, idInstancia };
}

export function MonitorCard({ 
  instance, 
  onClick, 
  onOpenTraceabilityReport, 
  activeTab = 'PEDIDO', 
  onShowToast 
}: MonitorCardProps) {
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

  const parsed = parseReferenciaHumana(instance.referencia_humana, instance.instancia_id);
  const pedidoRef = activeTab === 'PEDIDO' ? (parsed.pedido || instance.nro_pedido) : parsed.pedido;
  const ocRef = activeTab === 'OC' ? (parsed.oc || instance.nro_pedido) : parsed.oc;
  const hasPedido = Boolean(pedidoRef);
  const hasOc = Boolean(ocRef);

  const [loadingDocType, setLoadingDocType] = useState<'PEDIDO' | 'OC' | null>(null);

  const handleOpenDoc = async (e: React.MouseEvent, type: 'PEDIDO' | 'OC', ref?: string) => {
    e.stopPropagation();
    try {
      setLoadingDocType(type);
      await openOriginalDocument(
        type,
        {
          instanceId: activeTab === type ? instance.instancia_id : undefined,
          ref
        },
        onShowToast
      );
    } finally {
      setLoadingDocType(null);
    }
  };

  const isAnticipado = Boolean(instance.forma_pago && instance.forma_pago.toUpperCase().includes('ANTICIPAD'));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative bg-white rounded-xl shadow-sm border border-gray-100 transition-all overflow-hidden flex flex-col ring-1 ring-transparent",
        isAnticipado && !instance.gf_pago_aprobado && "border-t-2 border-t-amber-400",
        isAnticipado && instance.gf_pago_aprobado && "border-t-2 border-t-emerald-400",
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
          className="p-3.5 flex-1 flex flex-col cursor-pointer min-w-0"
        >
          {/* Header: Market Badge, Info lines & Wait Time */}
          <div className="flex justify-between items-start mb-2.5 gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-md flex-shrink-0">
                {instance.tipo_mercado}
              </span>
              
              <div 
                className="flex-1 min-w-0 text-[11px] text-gray-500 font-medium space-y-0.5 overflow-hidden" 
                title={instance.referencia_humana}
              >
                {parsed.pedido && (
                  <div className="truncate">
                    <span className="text-gray-400 font-normal">Pedido:</span> {parsed.pedido}
                  </div>
                )}
                {parsed.oc && (
                  <div className="truncate">
                    <span className="text-gray-400 font-normal">OC:</span> {parsed.oc}
                  </div>
                )}
                {parsed.remito && (
                  <div className="truncate">
                    <span className="text-gray-400 font-normal">Remito:</span> {parsed.remito}
                  </div>
                )}
                {parsed.idInstancia && (
                  <div className="truncate">
                    <span className="text-gray-400 font-normal">Instancia:</span> {parsed.idInstancia}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <div className={cn(
                 "flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap",
                 instance.color_alerta === 'ROJO' ? 'bg-red-50 text-red-700' :
                 instance.color_alerta === 'AMARILLO' ? 'bg-yellow-50 text-yellow-700' :
                 'bg-green-50 text-green-700'
              )}>
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span>{instance.horas_transcurridas}h</span>
              </div>

              {onOpenTraceabilityReport && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTraceabilityReport(instance);
                  }}
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors flex-shrink-0"
                  title="Ver Informe de Trazabilidad e Historial"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Badge Destacado de Forma de Pago (Anticipado) */}
          {isAnticipado && (
            <div className="mb-2">
              <span className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-black uppercase tracking-wide border shadow-2xs",
                instance.gf_pago_aprobado
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-200"
                  : "bg-amber-100 text-amber-950 border-amber-300 ring-1 ring-amber-300"
              )}>
                {instance.gf_pago_aprobado ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <DollarSign className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                )}
                <span className="truncate">{instance.forma_pago}</span>
                <span className={cn(
                  "text-[9px] px-1 py-0.2 rounded font-bold ml-0.5",
                  instance.gf_pago_aprobado ? "bg-emerald-200 text-emerald-900" : "bg-amber-200 text-amber-900"
                )}>
                  {instance.gf_pago_aprobado ? 'COBRADO' : 'PENDIENTE GF'}
                </span>
              </span>
            </div>
          )}

          {/* Status Badge */}
          <div className="mb-4">
             <span className="inline-block px-3 py-1 bg-brand-50 text-brand-700 text-[10px] font-semibold rounded-full border border-brand-100/50 line-clamp-2">
               {instance.estado_actual}
             </span>
          </div>

          {/* Entities and Logistics Info */}
          <div className="mt-auto space-y-1.5 pt-1">
             {instance.cliente && (
               <div className="flex items-center text-xs text-gray-600">
                 <Building2 className="w-3.5 h-3.5 mr-2 text-gray-400 flex-shrink-0" />
                 <span className="truncate" title={instance.cliente}>{instance.cliente}</span>
               </div>
             )}
             
             {instance.proveedor && (
               <div className="flex items-center text-xs text-gray-600">
                 <User className="w-3.5 h-3.5 mr-2 text-gray-400 flex-shrink-0" />
                 <span className="truncate" title={instance.proveedor}>{instance.proveedor}</span>
               </div>
             )}

             {instance.nro_remito && (
               <div className="flex items-center text-xs text-brand-700 pt-0.5 font-medium bg-brand-50 w-fit px-2 py-0.5 rounded">
                 <Truck className="w-3 h-3 mr-1.5 flex-shrink-0" />
                 <span className="truncate max-w-[200px]" title={instance.nro_remito}>Rep: {instance.nro_remito}</span>
               </div>
             )}
          </div>

          {/* Dedicated Row for Original Document Badges (Centered) */}
          {(hasPedido || hasOc) && (
            <div className="pt-2 mt-2 border-t border-gray-100 flex items-center justify-center gap-2">
              {hasPedido && (
                <button
                  type="button"
                  onClick={(e) => handleOpenDoc(e, 'PEDIDO', pedidoRef)}
                  disabled={loadingDocType === 'PEDIDO'}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50/90 hover:bg-blue-100 hover:text-blue-900 border border-blue-200/90 rounded-lg transition-all shadow-2xs cursor-pointer disabled:cursor-wait disabled:opacity-50"
                  title={pedidoRef ? `Ver documento original del pedido (${pedidoRef})` : "Ver documento original del pedido"}
                >
                  {loadingDocType === 'PEDIDO' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  )}
                  <span>Doc Pedido</span>
                </button>
              )}

              {hasOc && (
                <button
                  type="button"
                  onClick={(e) => handleOpenDoc(e, 'OC', ocRef)}
                  disabled={loadingDocType === 'OC'}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50/90 hover:bg-emerald-100 hover:text-emerald-900 border border-emerald-200/90 rounded-lg transition-all shadow-2xs cursor-pointer disabled:cursor-wait disabled:opacity-50"
                  title={ocRef ? `Ver documento original de la OC (${ocRef})` : "Ver documento original de la OC"}
                >
                  {loadingDocType === 'OC' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  <span>Doc OC</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
