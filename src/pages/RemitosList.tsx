import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Truck, Package, AlertCircle, Phone, FileText, ExternalLink, Loader2 } from 'lucide-react';
import type { RemitoActivo } from '../types/remito';

type ToastType = 'info' | 'error';

export function RemitosList() {
  const [remitos, setRemitos] = useState<RemitoActivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: ToastType; text: string } | null>(null);
  // Track loading state per document: "remito-{id}", "pedido-{pedido_id}", "oc-{oc_id}"
  const [loadingDocs, setLoadingDocs] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    fetchRemitos();
  }, []);

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
      // Step 1: Resolve pedido_ref_externa → pedido id
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

      // Step 2: Get the root instance ID
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

      // Step 3: Get the document URL
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
      // Step 1: Resolve oc_ref_externa → oc id
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

      // Step 2: Get the root instance ID
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

      // Step 3: Get the document URL
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

  // --- Render ---

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
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block px-2 py-1 text-xs font-semibold bg-brand-100 text-brand-700 rounded-full">
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
                    {remito.instancias_vinculadas.map((pedido, idx) => {
                      const pedidoKey = `pedido-${pedido.pedido_ref}`;
                      const ocKey = `oc-${pedido.oc_ref}`;
                      const isPedidoLoading = loadingDocs.has(pedidoKey);
                      const isOcLoading = loadingDocs.has(ocKey);

                      return (
                        <li key={idx} className="text-sm text-gray-600 flex flex-col gap-0.5 ml-2 mb-2 p-2 bg-gray-50 rounded border border-gray-100">
                          <div className="font-medium text-gray-800 flex items-center gap-1.5">
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
    </div>
  );
}
