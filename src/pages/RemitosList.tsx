import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Truck, Package, AlertCircle, Phone } from 'lucide-react';
import type { RemitoActivo } from '../types/remito';

export function RemitosList() {
  const [remitos, setRemitos] = useState<RemitoActivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRemitos();
  }, []);

  const fetchRemitos = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('get_remitos_activos');
      
      if (error) throw error;
      setRemitos(data || []);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los remitos activos.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 h-full flex items-center justify-center flex-col gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-red-700 bg-red-50 px-4 py-2 rounded-lg border border-red-200">{error}</p>
        <button 
          onClick={fetchRemitos}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 h-full overflow-y-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <Truck className="w-8 h-8 text-brand-600" />
        <h1 className="text-2xl font-bold text-gray-900">Monitor de Remitos</h1>
      </div>

      {remitos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-lg">No hay remitos activos en este momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {remitos.map((remito) => (
            <div key={remito.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition flex flex-col">
              <div className="mb-4">
                <span className="inline-block px-2 py-1 text-xs font-semibold bg-brand-100 text-brand-700 rounded-full mb-2">
                  #{remito.nro_remito}
                </span>
                <h3 className="font-bold text-gray-900 truncate" title={remito.chofer_nombre || 'Sin chofer asignado'}>
                  {remito.chofer_nombre || 'Sin chofer asignado'}
                </h3>
                {remito.chofer_telefono && (
                  <div className="flex items-center gap-1.5 text-gray-500 text-sm mt-1">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{remito.chofer_telefono}</span>
                  </div>
                )}
              </div>
              
              <div className="flex-1 mb-6 flex flex-col min-h-0">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 shrink-0">Pedidos Vinculados</p>
                {remito.instancias_vinculadas && remito.instancias_vinculadas.length > 0 ? (
                  <ul className="space-y-1 overflow-y-auto max-h-[200px] pr-2 shrink-0">
                    {remito.instancias_vinculadas.map((pedido, idx) => (
                      <li key={idx} className="text-sm text-gray-600 flex flex-col gap-0.5 ml-2 mb-2 p-2 bg-gray-50 rounded border border-gray-100">
                        <div className="font-medium text-gray-800">Pedido: {pedido.pedido_ref || '-'}</div>
                        <div className="text-xs text-gray-500">OC: {pedido.oc_ref || '-'}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400 italic">Ningún pedido vinculado</p>
                )}
              </div>

              <button
                onClick={() => navigate(`/remitos/${remito.id}`)}
                className="w-full py-2.5 px-4 bg-gray-50 hover:bg-brand-50 hover:text-brand-700 text-gray-700 font-medium rounded-lg transition-colors border border-gray-200 hover:border-brand-200"
              >
                Editar Datos Logísticos
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
