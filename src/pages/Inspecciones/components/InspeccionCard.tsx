import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, User, CalendarClock, Package, FileCheck2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../../../lib/utils';
import type { InspeccionKanban } from '../types';

interface InspeccionCardProps {
  inspeccion: InspeccionKanban;
  onClick: (inspeccion: InspeccionKanban) => void;
}

const tipoCargaColors: Record<string, string> = {
  Bolsas: 'bg-amber-100 text-amber-800 border-amber-200',
  Crudo: 'bg-rose-100 text-rose-800 border-rose-200',
  Contenedor: 'bg-sky-100 text-sky-800 border-sky-200',
};

const docStatusColors: Record<string, { bg: string; text: string; dot: string }> = {
  '3.D0': { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  '3.D1': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  '3.D2': { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  '3.D3': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  '3.D4': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  '3.D5': { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
};

export function InspeccionCard({ inspeccion, onClick }: InspeccionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: inspeccion.id,
    data: { type: 'Inspeccion', inspeccion },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const tipoCargaClass = tipoCargaColors[inspeccion.tipo_carga] || 'bg-gray-100 text-gray-700 border-gray-200';
  const statusColors = docStatusColors[inspeccion.export_doc_status] || docStatusColors['3.D0'];

  const fechaFormatted = (() => {
    try {
      return format(parseISO(inspeccion.fecha_pactada), "dd MMM yyyy · HH:mm", { locale: es });
    } catch {
      return inspeccion.fecha_pactada || '—';
    }
  })();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative bg-white rounded-xl shadow-sm border border-gray-100 transition-all overflow-hidden flex flex-col ring-1 ring-transparent",
        isDragging
          ? "opacity-40 ring-brand-500 shadow-xl scale-105 z-50 cursor-grabbing"
          : "hover:shadow-md hover:border-gray-200"
      )}
    >
      {/* Left accent */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1.5 z-10", statusColors.dot)} />

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

        {/* Content */}
        <div
          onClick={() => onClick(inspeccion)}
          className="p-3.5 flex-1 flex flex-col cursor-pointer min-w-0"
        >
          {/* Header: ID + Tipo Carga */}
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-gray-500 font-mono">
              #INS-{inspeccion.id}
            </span>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", tipoCargaClass)}>
              {inspeccion.tipo_carga}
            </span>
          </div>

          {/* Inspector */}
          <div className="flex items-center gap-1.5 mb-2">
            <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-800 truncate">
              {inspeccion.inspector_nombre}
            </span>
          </div>

          {/* Fecha Pactada */}
          <div className="flex items-center gap-1.5 mb-3">
            <CalendarClock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-600">{fechaFormatted}</span>
          </div>

          {/* Pedidos Badges */}
          {inspeccion.pedidos && inspeccion.pedidos.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {inspeccion.pedidos.map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded-md"
                >
                  <Package className="w-3 h-3" />
                  {p.identificador_compuesto}
                </span>
              ))}
            </div>
          )}

          {/* Estado Documental Badge */}
          <div className="mt-auto">
            <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full", statusColors.bg, statusColors.text)}>
              <FileCheck2 className="w-3 h-3" />
              {inspeccion.export_doc_status}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
