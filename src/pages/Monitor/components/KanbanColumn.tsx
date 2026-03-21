import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { MonitorCard } from './MonitorCard';
import type { InstanceData, StateDefinition } from '../types';
import { cn } from '../../../lib/utils';
import { useMemo } from 'react';

interface KanbanColumnProps {
  stateDef: StateDefinition;
  instances: InstanceData[];
  onCardClick: (instance: InstanceData) => void;
  isLoading?: boolean;
}

export function KanbanColumn({ stateDef, instances, onCardClick, isLoading }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stateDef.state_code,
    data: {
      type: 'Column',
      stateDef,
    },
  });

  const itemIds = useMemo(() => instances.map(i => i.instancia_id), [instances]);

  return (
    <div className="flex flex-col w-[320px] flex-shrink-0 bg-gray-100/50 rounded-xl h-full border border-gray-200/60 shadow-sm overflow-hidden min-h-0">
      {/* Column Header (Sticky) */}
      <div className="bg-gray-100 px-4 py-3 border-b border-gray-200/80 sticky top-0 z-10 flex justify-between items-center flex-shrink-0">
        <h3 className="font-semibold text-gray-800 text-sm truncate pr-2" title={stateDef.name}>
          <span className="text-gray-500 font-mono text-xs mr-2">{stateDef.state_code}</span>
          {stateDef.name}
        </h3>
        <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
          {instances.length}
        </span>
      </div>

      {/* Column Body (Droppable Area) */}
      <div 
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto min-h-0 p-3 space-y-3 transition-colors",
          isOver ? "bg-brand-50/50" : ""
        )}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {isLoading ? (
            // Skeleton Loaders
            [...Array(3)].map((_, i) => (
              <div key={i} className="h-44 bg-gray-200 border border-gray-100 rounded-xl shadow-sm animate-pulse flex-shrink-0" />
            ))
          ) : (
            instances.map(instance => (
              <MonitorCard 
                key={instance.instancia_id} 
                instance={instance} 
                onClick={onCardClick} 
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
