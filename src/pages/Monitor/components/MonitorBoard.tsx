import { useState } from 'react';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { KanbanColumn } from './KanbanColumn';
import { MonitorCard } from './MonitorCard';
import type { InstanceData, StateDefinition } from '../types';
import { LayoutDashboard } from 'lucide-react';

interface MonitorBoardProps {
  instances: InstanceData[];
  stateDefs: StateDefinition[];
  onCardClick: (instance: InstanceData) => void;
  onDragEnd: (event: DragEndEvent) => void;
  isLoading?: boolean;
}

export function MonitorBoard({ instances, stateDefs, onCardClick, onDragEnd, isLoading }: MonitorBoardProps) {
  const [activeInstance, setActiveInstance] = useState<InstanceData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const getInstancesForColumn = (stateCode: string) => {
    return instances.filter(i => i.estado_actual.startsWith(stateCode));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const instance = instances.find(i => i.instancia_id === active.id);
    if (instance) {
      setActiveInstance(instance);
    }
  };

  const handleDragEndInternal = (event: DragEndEvent) => {
    setActiveInstance(null);
    onDragEnd(event);
  };

  const handleDragCancel = () => {
    setActiveInstance(null);
  };

  if (stateDefs.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-100 shadow-sm min-h-[400px]">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
          <LayoutDashboard className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No se encontró configuración de estados</h3>
        <p className="text-gray-500 text-center max-w-sm">
          Asegúrate de que la tabla 'state_definitions' esté disponible.
        </p>
      </div>
    );
  }

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEndInternal}
      onDragCancel={handleDragCancel}
    >
      {/* Horizontal scrollable container for columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2 h-full min-h-0">
        <div className="flex gap-4 h-full min-h-0 w-max px-1">
          {stateDefs.map(stateDef => (
             <KanbanColumn 
               key={stateDef.state_code}
               stateDef={stateDef}
               instances={getInstancesForColumn(stateDef.state_code)}
               onCardClick={onCardClick}
               isLoading={isLoading}
             />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeInstance ? (
          <div className="w-80 shadow-2xl opacity-100 rotate-2 scale-105 cursor-grabbing">
            <MonitorCard instance={activeInstance} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
