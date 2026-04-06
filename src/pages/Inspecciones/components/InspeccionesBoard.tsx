import { useState } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { InspeccionColumn } from './InspeccionColumn';
import { InspeccionCard } from './InspeccionCard';
import type { InspeccionKanban, StateDefinition } from '../types';
import { ClipboardList } from 'lucide-react';

interface InspeccionesBoardProps {
  inspecciones: InspeccionKanban[];
  stateDefs: StateDefinition[];
  onCardClick: (inspeccion: InspeccionKanban) => void;
  onDragEnd: (event: DragEndEvent) => void;
  isLoading?: boolean;
}

export function InspeccionesBoard({
  inspecciones,
  stateDefs,
  onCardClick,
  onDragEnd,
  isLoading,
}: InspeccionesBoardProps) {
  const [activeInspeccion, setActiveInspeccion] = useState<InspeccionKanban | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const getInspeccionesForColumn = (stateCode: string) =>
    inspecciones.filter(i => i.state_code === stateCode);

  const handleDragStart = (event: DragStartEvent) => {
    const inst = inspecciones.find(i => i.id === event.active.id);
    if (inst) setActiveInspeccion(inst);
  };

  const handleDragEndInternal = (event: DragEndEvent) => {
    setActiveInspeccion(null);
    onDragEnd(event);
  };

  const handleDragCancel = () => setActiveInspeccion(null);

  if (stateDefs.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-100 shadow-sm min-h-[400px]">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
          <ClipboardList className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          No se encontró configuración de estados
        </h3>
        <p className="text-gray-500 text-center max-w-sm">
          Asegúrate de que la FSM 3 (Control Documental Exportación) esté desplegada en
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm mx-1">state_definitions</code>.
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
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2 h-full min-h-0">
        <div className="flex gap-4 h-full min-h-0 w-max px-1">
          {stateDefs.map(sd => (
            <InspeccionColumn
              key={sd.state_code}
              stateDef={sd}
              inspecciones={getInspeccionesForColumn(sd.state_code)}
              onCardClick={onCardClick}
              isLoading={isLoading}
            />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeInspeccion ? (
          <div className="w-80 shadow-2xl opacity-100 rotate-2 scale-105 cursor-grabbing">
            <InspeccionCard inspeccion={activeInspeccion} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
