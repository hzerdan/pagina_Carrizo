import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Truck, 
  Package, 
  AlertCircle, 
  Phone, 
  FileText, 
  ExternalLink, 
  Loader2, 
  Search, 
  Calendar, 
  CheckCircle2, 
  Lock, 
  RotateCcw,
  Eye,
  Plus
} from 'lucide-react';
import type { RemitoActivo } from '../types/remito';
import { CargarRemitoLargoModal } from './Remitos/components/CargarRemitoLargoModal';

type ToastType = 'info' | 'error';
type EstadoFilterType = 'ACTIVOS' | 'FINALIZADOS' | 'TODOS';

export function RemitosList() {
  const [remitos, setRemitos] = useState<RemitoActivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: ToastType; text: string } | null>(null);
  const [isCargarLargoOpen, setIsCargarLargoOpen] = useState(false);

  // Filters state
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilterType>('ACTIVOS');
  const [nroRemitoFilter, setNroRemitoFilter] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Track loading state per document: "remito-{id}", "pedido-{pedido_id}", "oc-{oc_id}"
  const [loadingDocs, setLoadingDocs] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const fetchRemitos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc('get_remitos_filtrados', {
        p_estado: estadoFilter,
        p_nro_remito: nroRemitoFilter.trim() || null,
        p_fecha_desde: fechaDesde || null,
        p_fecha_hasta: fechaHasta || null,
      });

      if (error) throw error;
      setRemitos(data || []);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      setError(errMsg || 'Error al cargar los remitos.');
    } finally {
      setLoading(false);
    }
  }, [estadoFilter, nroRemitoFilter, fechaDesde, fechaHasta]);

  useEffect(() => {
    fetchRemitos();
  }, [fetchRemitos]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (type: ToastType, text: string) => {
    setToastMessage({ type, text });
  };

  const setDocLoading = useCallback((key: string, isLoading: boolean) => {
    setLoadingDocs(prev => {
      const next = new Set(prev);
      if (isLoading) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const handleClearFilters = () => {
    setEstadoFilter('ACTIVOS');
    setNroRemitoFilter('');
    setFechaDesde('');
    setFechaHasta('');
  };

  const hasActiveFilters = estadoFilter !== 'ACTIVOS' || nroRemitoFilter !== '' || fechaDesde !== '' || fechaHasta !== '';

  // --- Document viewing handlers ---

  const handleOpenRemitoDoc = async (e: React.MouseEvent, remitoId: number) => {
    e.stopPropagation();
    const key = `remito-${remitoId}`;
    setDocLoading(key, true);
    try {
      const { data, error } = await supabase
        .from('remitos')
        .select('archivo_url')
        .eq('id', remitoId)
        .limit(1)
        .single();

      if (error || !data?.archivo_url) {
        showToast('info', 'Documento original no disponible');
        return;
      }
      window.open(data.archivo_url, '_blank');
    } catch {
      showToast('error', 'Error al intentar recuperar el documento');
    } finally {
      setDocLoading(key, false);
    }
  };

  const handleOpenPedidoDoc = async (e: React.MouseEvent, pedidoRef: string) => {
    e.stopPropagation();
    const key = `pedido-${pedidoRef}`;
    setDocLoading(key, true);
    try {
      const { data: pedidoData, error: pedidoError } = await supabase
        .from('pedidos')
        .select('id')
        .eq('pedido_ref_externa', pedidoRef)
        .limit(1)
        .single();

      if (pedidoError || !pedidoData) {
        showToast('info', 'Documento original no disponible');
        return;
      }

      const { data: instanceData, error: instanceError } = await supabase
        .from('pedido_instancias')
        .select('id')
        .eq('pedido_id', pedidoData.id)
        .is('parent_instance_id', null)
        .limit(1)
        .single();

      if (instanceError || !instanceData) {
        showToast('info', 'Documento original no disponible');
        return;
      }

      const { data: docData, error: docError } = await supabase
        .from('documentos')
        .select('storage_path')
        .eq('pedido_instance_id', instanceData.id)
        .eq('document_type', 'DOCUMENTO_ORIGEN_PEDIDO')
        .limit(1)
        .single();

      if (docError || !docData?.storage_path) {
        showToast('info', 'Documento original no disponible');
        return;
      }

      window.open(docData.storage_path, '_blank');
    } catch {
      showToast('error', 'Error al intentar recuperar el documento');
    } finally {
      setDocLoading(key, false);
    }
  };

  const handleOpenOcDoc = async (e: React.MouseEvent, ocRef: string) => {
    e.stopPropagation();
    const key = `oc-${ocRef}`;
    setDocLoading(key, true);
    try {
      const { data: ocData, error: ocError } = await supabase
        .from('ordenes_compra')
        .select('id')
        .eq('oc_ref_externa', ocRef)
        .limit(1)
        .single();

      if (ocError || !ocData) {
        showToast('info', 'Documento original no disponible');
        return;
      }

      const { data: instanceData, error: instanceError } = await supabase
        .from('oc_instancias')
        .select('id')
        .eq('oc_id', ocData.id)
        .is('parent_instance_id', null)
        .limit(1)
        .single();

      if (instanceError || !instanceData) {
        showToast('info', 'Documento original no disponible');
        return;
      }

      const { data: docData, error: docError } = await supabase
        .from('documentos')
        .select('storage_path')
        .eq('oc_instance_id', instanceData.id)
        .eq('document_type', 'DOCUMENTO_ORIGEN_OC')
        .limit(1)
        .single();

      if (docError || !docData?.storage_path) {
        showToast('info', 'Documento original no disponible');
        return;
      }

      window.open(docData.storage_path, '_blank');
    } catch {
      showToast('error', 'Error al intentar recuperar el documento');
    } finally {
      setDocLoading(key, false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 h-full overflow-y-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <Truck className="w-8 h-8 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Monitor de Remitos</h1>
            <p className="text-sm text-gray-500">Gestión y seguimiento de cargas y remitos conformados</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setIsCargarLargoOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cargar Remito Largo</span>
          </button>

          {/* Filter Tabs: Activos | Finalizados | Todos */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl shrink-0 border border-gray-200">
          <button
            onClick={() => setEstadoFilter('ACTIVOS')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              estadoFilter === 'ACTIVOS'
                ? 'bg-white text-brand-700 shadow-sm font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Activos
          </button>
          <button
            onClick={() => setEstadoFilter('FINALIZADOS')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              estadoFilter === 'FINALIZADOS'
                ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Finalizados
          </button>
          <button
            onClick={() => setEstadoFilter('TODOS')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              estadoFilter === 'TODOS'
                ? 'bg-white text-gray-900 shadow-sm font-semibold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Todos
          </button>
        </div>
      </div>
    </div>

      {/* Filter Toolbar: Nro Remito & Rango de Fechas */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row items-stretch md:items-center gap-4">
        {/* Search Nro Remito */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por N° de Remito..."
            value={nroRemitoFilter}
            onChange={(e) => setNroRemitoFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        {/* Rango de Fechas */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="hidden sm:inline">Desde:</span>
          </div>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          <div className="text-sm text-gray-500">
            <span className="hidden sm:inline">Hasta:</span>
          </div>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-red-600 bg-gray-50 hover:bg-red-50 rounded-lg border border-gray-200 transition-colors shrink-0"
            title="Limpiar todos los filtros"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpiar</span>
          </button>
        )}
      </div>

      {/* Main Content State */}
      {loading ? (
        <div className="flex items-center justify-center p-12 h-64">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        </div>
      ) : error ? (
        <div className="p-8 flex items-center justify-center flex-col gap-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-700 bg-red-50 px-4 py-2 rounded-lg border border-red-200">{error}</p>
          <button
            onClick={fetchRemitos}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition"
          >
            Reintentar
          </button>
        </div>
      ) : remitos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-lg">
            {estadoFilter === 'FINALIZADOS'
              ? 'No se encontraron remitos finalizados con los criterios ingresados.'
              : 'No hay remitos que coincidan con la búsqueda.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm transition"
            >
              Restablecer Filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {remitos.map((remito) => {
            const isFinalizado =
              remito.estado_asignacion === 'FINALIZADO' ||
              remito.mision_estado === 'MISION_COMPLETADA';

            return (
              <div
                key={remito.id}
                className={`bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition flex flex-col ${
                  isFinalizado ? 'border-emerald-200 bg-emerald-50/10' : 'border-gray-100'
                }`}
              >
                <div className="mb-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block px-2.5 py-1 text-xs font-semibold bg-brand-100 text-brand-700 rounded-full">
                        #{remito.nro_remito}
                      </span>
                      <button
                        onClick={(e) => handleOpenRemitoDoc(e, remito.id)}
                        disabled={loadingDocs.has(`remito-${remito.id}`)}
                        className="text-gray-400 hover:text-blue-500 transition-colors cursor-pointer disabled:cursor-wait"
                        title="Ver documento del remito"
                      >
                        {loadingDocs.has(`remito-${remito.id}`) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Status Badge */}
                    {isFinalizado ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        FINALIZADO
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                        ACTIVO
                      </span>
                    )}
                  </div>

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
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 shrink-0">
                    Pedidos Vinculados
                  </p>
                  {remito.instancias_vinculadas && remito.instancias_vinculadas.length > 0 ? (
                    <ul className="space-y-1 overflow-y-auto max-h-[200px] pr-2 shrink-0">
                      {remito.instancias_vinculadas.map((pedido, idx) => {
                        const pedidoKey = `pedido-${pedido.pedido_ref}`;
                        const ocKey = `oc-${pedido.oc_ref}`;
                        const isPedidoLoading = loadingDocs.has(pedidoKey);
                        const isOcLoading = loadingDocs.has(ocKey);
                        const isPedidoFinalized = pedido.estado_pedido_code === '7';

                        return (
                          <li
                            key={idx}
                            className={`text-sm flex flex-col gap-0.5 ml-2 mb-2 p-2 rounded border ${
                              isPedidoFinalized
                                ? 'bg-emerald-50/50 border-emerald-100 text-emerald-900'
                                : 'bg-gray-50 border-gray-100 text-gray-600'
                            }`}
                          >
                            <div className="font-medium flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span>Pedido: {pedido.pedido_ref || '-'}</span>
                                {pedido.pedido_ref && pedido.pedido_ref !== '-' && (
                                  <button
                                    onClick={(e) => handleOpenPedidoDoc(e, pedido.pedido_ref!)}
                                    disabled={isPedidoLoading}
                                    className="text-gray-400 hover:text-blue-500 transition-colors cursor-pointer disabled:cursor-wait"
                                    title="Ver documento del pedido"
                                  >
                                    {isPedidoLoading ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                              {isPedidoFinalized && (
                                <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.2 font-semibold rounded">
                                  Est. 7
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-1.5">
                              <span>OC: {pedido.oc_ref || '-'}</span>
                              {pedido.oc_ref && pedido.oc_ref !== '-' && (
                                <button
                                  onClick={(e) => handleOpenOcDoc(e, pedido.oc_ref!)}
                                  disabled={isOcLoading}
                                  className="text-gray-400 hover:text-blue-500 transition-colors cursor-pointer disabled:cursor-wait"
                                  title="Ver documento de la OC"
                                >
                                  {isOcLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Ningún pedido vinculado</p>
                  )}
                </div>

                {/* Bottom Action Button */}
                {isFinalizado ? (
                  <button
                    onClick={() => navigate(`/remitos/${remito.id}`)}
                    className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-medium rounded-lg transition-colors border border-emerald-200 flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4 text-emerald-600" />
                    <span>Ver Detalles (Solo Lectura)</span>
                    <Lock className="w-3.5 h-3.5 text-emerald-500 ml-auto" />
                  </button>
                ) : (
                  <button
                    onClick={() => navigate(`/remitos/${remito.id}`)}
                    className="w-full py-2.5 px-4 bg-gray-50 hover:bg-brand-50 hover:text-brand-700 text-gray-700 font-medium rounded-lg transition-colors border border-gray-200 hover:border-brand-200"
                  >
                    Editar Datos Logísticos
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium flex items-center gap-2 animate-fade-in ${
            toastMessage.type === 'error' ? 'bg-red-600' : 'bg-gray-800'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <FileText className="w-4 h-4 shrink-0" />
          )}
          {toastMessage.text}
        </div>
      )}

      {/* Modal de Cargar Remito Largo desde Estación Intermedia */}
      <CargarRemitoLargoModal 
        isOpen={isCargarLargoOpen}
        onClose={() => setIsCargarLargoOpen(false)}
        onSuccess={() => {
          showToast('info', 'Remito Largo emitido y stock descontado con éxito');
          fetchRemitos();
        }}
      />
    </div>
  );
}
