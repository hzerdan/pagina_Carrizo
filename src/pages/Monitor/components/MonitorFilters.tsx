import { Filter } from 'lucide-react';

interface MonitorFiltersProps {
  tipoMercado: string;
  setTipoMercado: (value: string) => void;
  colorAlerta: string;
  setColorAlerta: (value: string) => void;
}

export function MonitorFilters({ tipoMercado, setTipoMercado, colorAlerta, setColorAlerta }: MonitorFiltersProps) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4 items-center justify-between mb-6">
      <div className="flex items-center gap-2 text-gray-700 font-medium">
        <Filter className="w-5 h-5 text-gray-500" />
        <span>Filtros</span>
      </div>
      
      <div className="flex flex-wrap gap-4 w-full sm:w-auto">
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
      </div>
    </div>
  );
}
