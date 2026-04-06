import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useMemo } from 'react';
import { cn } from '../../../lib/utils';
import { InspeccionCard } from './InspeccionCard';
import type { InspeccionKanban, StateDefinition } from '../types';

interface InspeccionColumnProps {
  stateDef: StateDefinition;
  inspecciones: InspeccionKanban[];
  onCardClick: (inspeccion: InspeccionKanban) => void;
  isLoading?: boolean;
}

const columnAccentColors: Record<string, string> = {
  '3.D0': 'from-gray-400 to-gray-500',
  '3.D1': 'from-blue-400 to-blue-600',
  '3.D2': 'from-indigo-400 to-indigo-600',
  '3.D3': 'from-amber-400 to-amber-600',
  '3.D4': 'from-emerald-400 to-emerald-600',
  '3.D5': 'from-green-500 to-green-700',
};

export function InspeccionColumn({ stateDef, inspecciones, onCardClick, isLoading }: InspeccionColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stateDef.state_code,
    data: { type: 'Column', stateDef },
  });

  const itemIds = useMemo(() => inspecciones.map(i => i.id), [inspecciones]);
  const accentGradient = columnAccentColors[stateDef.state_code] || 'from-gray-400 to-gray-500';

  return (
    <div className="flex flex-col w-[320px] flex-shrink-0 bg-gray-50/80 rounded-xl h-full border border-gray-200/60 shadow-sm overflow-hidden min-h-0">
      {/* Column Header */}
      <div className="relative px-4 py-3 border-b border-gray-200/80 flex-shrink-0">
        {/* Gradient top accent bar */}
        <div className={cn("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r", accentGradient)} />
        <div className="flex justify-between items-center pt-1">
          <h3 className="font-semibold text-gray-800 text-sm truncate pr-2" title={stateDef.name}>
            <span className="text-gray-400 font-mono text-[10px] mr-1.5 bg-gray-100 px-1.5 py-0.5 rounded">
              {stateDef.state_code}
            </span>
            {stateDef.name}
          </h3>
          <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center">
            {inspecciones.length}
          </span>
        </div>
      </div>

      {/* Column Body (Droppable) */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto min-h-0 p-3 space-y-3 transition-colors duration-200",
          isOver ? "bg-brand-50/60 ring-2 ring-inset ring-brand-200" : ""
        )}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-40 bg-gray-200/60 border border-gray-100 rounded-xl shadow-sm animate-pulse flex-shrink-0"
              />
            ))
          ) : inspecciones.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                <span className="text-lg">📋</span>
              </div>
              <p className="text-xs font-medium">Sin inspecciones</p>
            </div>
          ) : (
            inspecciones.map(inspeccion => (
              <InspeccionCard
                key={inspeccion.id}
                inspeccion={inspeccion}
                onClick={onCardClick}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
