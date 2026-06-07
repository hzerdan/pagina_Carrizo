import { useState } from 'react';
import { Filter, Search, ChevronDown } from 'lucide-react';
import type { StateDefinition } from '../types';
import { cn } from '../../../lib/utils';

interface MonitorFiltersProps {
  tipoMercado: string;
  setTipoMercado: (value: string) => void;
  colorAlerta: string;
  setColorAlerta: (value: string) => void;
  searchPedido: string;
  setSearchPedido: (value: string) => void;
  stateFilterMode: 'TODOS' | 'CON_TARJETAS' | 'SELECCIONADOS';
  setStateFilterMode: (value: 'TODOS' | 'CON_TARJETAS' | 'SELECCIONADOS') => void;
  selectedStates: string[];
  setSelectedStates: (value: string[]) => void;
  stateDefs: StateDefinition[];
  statesWithCards: Set<string>;
}

export function MonitorFilters({ 
  tipoMercado, 
  setTipoMercado, 
  colorAlerta, 
  setColorAlerta,
  searchPedido,
  setSearchPedido,
  stateFilterMode,
  setStateFilterMode,
  selectedStates,
  setSelectedStates,
  stateDefs,
  statesWithCards
}: MonitorFiltersProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col lg:flex-row gap-4 items-center justify-between mb-6">
      <div className="flex items-center gap-2 text-gray-700 font-medium">
        <Filter className="w-5 h-5 text-gray-500" />
        <span>Filtros</span>
      </div>
      
      <div className="flex flex-wrap gap-4 w-full lg:w-auto items-center">
        {/* Búsqueda por Pedido */}
        <div className="relative flex-1 min-w-[200px] sm:flex-initial">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchPedido}
            onChange={(e) => setSearchPedido(e.target.value)}
            placeholder="Buscar por Nº Pedido..."
            className="block w-full pl-10 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50 hover:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">Mercado:</label>
          <select 
            value={tipoMercado} 
            onChange={(e) => setTipoMercado(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50 hover:bg-white transition-colors cursor-pointer"
          >
            <option value="TODOS">Todos</option>
            <option value="MI">Mercado Interno (MI)</option>
            <option value="ME">Mercado Externo (ME)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">Alerta:</label>
          <select 
            value={colorAlerta} 
            onChange={(e) => setColorAlerta(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50 hover:bg-white transition-colors cursor-pointer"
          >
            <option value="TODOS">Todos</option>
            <option value="VERDE">Verde (Normal)</option>
            <option value="AMARILLO">Amarillo (+12hs)</option>
            <option value="ROJO">Rojo (+24hs)</option>
          </select>
        </div>

        {/* Filtro de Estados */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">Estados:</label>
          <select 
            value={stateFilterMode} 
            onChange={(e) => setStateFilterMode(e.target.value as 'TODOS' | 'CON_TARJETAS' | 'SELECCIONADOS')}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50 hover:bg-white transition-colors cursor-pointer"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="CON_TARJETAS">Estados con tarjetas</option>
            <option value="SELECCIONADOS">Selección personalizada</option>
          </select>
        </div>

        {/* Botón selector de columnas para modos no "TODOS" */}
        {stateFilterMode !== 'TODOS' && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50 hover:bg-white transition-colors cursor-pointer text-gray-700 font-medium shadow-sm animate-fade-in"
            >
              <span>Columnas ({stateFilterMode === 'CON_TARJETAS' ? statesWithCards.size + selectedStates.filter(s => !statesWithCards.has(s)).length : selectedStates.length})</span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>

            {isDropdownOpen && (
              <>
                {/* Backdrop invisible para cerrar al hacer click fuera */}
                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-3 max-h-80 overflow-y-auto z-50 flex flex-col gap-2">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-100 flex-shrink-0">
                    <span className="text-xs font-semibold text-gray-500">Seleccionar Columnas</span>
                    {stateFilterMode === 'SELECCIONADOS' && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedStates(stateDefs.map(s => s.state_code))}
                          className="text-[10px] text-brand-600 hover:text-brand-700 font-semibold cursor-pointer"
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStates([])}
                          className="text-[10px] text-gray-500 hover:text-gray-600 font-semibold cursor-pointer"
                        >
                          Limpiar
                        </button>
                      </div>
                    )}
                    {stateFilterMode === 'CON_TARJETAS' && (
                      <button
                        type="button"
                        onClick={() => setSelectedStates([])}
                        className="text-[10px] text-gray-500 hover:text-gray-600 font-semibold cursor-pointer"
                      >
                        Limpiar extras
                      </button>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto py-1 flex-1">
                    {stateDefs.map(stateDef => {
                      const hasCards = statesWithCards.has(stateDef.state_code);
                      const isChecked = stateFilterMode === 'CON_TARJETAS' 
                        ? (hasCards || selectedStates.includes(stateDef.state_code))
                        : selectedStates.includes(stateDef.state_code);
                      const isDisabled = stateFilterMode === 'CON_TARJETAS' && hasCards;

                      const handleCheckboxChange = () => {
                        if (isDisabled) return;
                        if (isChecked) {
                          setSelectedStates(selectedStates.filter(s => s !== stateDef.state_code));
                        } else {
                          setSelectedStates([...selectedStates, stateDef.state_code]);
                        }
                      };

                      return (
                        <label
                          key={stateDef.state_code}
                          className={cn(
                            "flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors",
                            isDisabled ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "hover:bg-gray-50 text-gray-700"
                          )}
                          onClick={handleCheckboxChange}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            onChange={() => {}} // Manejado por el label click
                            className="rounded text-brand-600 focus:ring-brand-500 border-gray-300 w-3.5 h-3.5 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span className="font-mono text-gray-400">{stateDef.state_code}</span>
                          <span className="truncate flex-1 text-left" title={stateDef.name}>{stateDef.name}</span>
                          {hasCards && (
                            <span className="bg-brand-50 text-brand-700 font-bold px-1.5 py-0.5 rounded-full text-[9px] flex-shrink-0">
                              Con tarjetas
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
