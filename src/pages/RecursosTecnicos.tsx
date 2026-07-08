import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  ShieldAlert, 
  RefreshCw, 
  CheckCircle2, 
  Search, 
  ArrowRight, 
  Info, 
  AlertTriangle, 
  Play, 
  Send, 
  Activity,
  MessageSquare,
  Edit2,
  Check,
  X
} from 'lucide-react';


export function RecursosTecnicos() {
  const { user } = useAuth();
  const [remitoId, setRemitoId] = useState('');
  const [remitoInfo, setRemitoInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [metadataLabels, setMetadataLabels] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [tempLabel, setTempLabel] = useState('');
  const [filterQuery, setFilterQuery] = useState('');


  // Verificar si es el usuario hzerdan@gmail.com
  const isAuthorized = user?.email === 'hzerdan@gmail.com';

  const fetchMetadataLabels = async () => {
    try {
      const { data, error } = await supabase
        .from('metadata_labels')
        .select('key, label');
      if (error) throw error;
      if (data) {
        const mapping = data.reduce((acc: Record<string, string>, item: any) => {
          acc[item.key] = item.label;
          return acc;
        }, {});
        setMetadataLabels(mapping);
      }
    } catch (err: any) {
      console.error("Error fetching metadata labels:", err);
    }
  };



  useEffect(() => {
    if (isAuthorized) {
      fetchMetadataLabels();
    }
  }, [isAuthorized]);

  const handleSaveLabel = async (key: string) => {
    if (!tempLabel.trim()) return;
    try {
      const { error } = await supabase
        .from('metadata_labels')
        .upsert({ key, label: tempLabel.trim(), updated_at: new Date().toISOString() });
      if (error) throw error;
      setMetadataLabels(prev => ({ ...prev, [key]: tempLabel.trim() }));
      setEditingKey(null);
    } catch (err: any) {
      alert("Error al guardar la etiqueta: " + err.message);
    }
  };


  const handleSearchRemito = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remitoId.trim()) return;

    setLoading(true);
    setMessage(null);
    setRemitoInfo(null);
    setSimResult(null);

    try {
      const { data, error } = await supabase
        .from('remitos')
        .select('id, remito_ref_externa, mision_estado, tiene_incidencias_carga, chofer_id, metadata_extraida, protocolo_control, choferes(nombre_completo)')
        .eq('id', Number(remitoId))
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setMessage({ type: 'error', text: `No se encontró ningún remito con ID #${remitoId}` });
      } else {
        setRemitoInfo(data);
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Error al buscar el remito: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetMision = async () => {
    if (!remitoInfo) return;

    const confirmReset = window.confirm(
      `¿Estás seguro de que quieres restablecer la misión del Remito #${remitoInfo.id} (${remitoInfo.remito_ref_externa})?\n\nESTO ELIMINARÁ TODO EL HISTORIAL DE CONVERSACIÓN ASOCIADO Y VOLVERÁ EL ESTADO A "ESPERANDO_DOCS".`
    );

    if (!confirmReset) return;

    setResetting(true);
    setMessage(null);
    setSimResult(null);

    try {
      const { data, error } = await supabase.rpc('reset_remito_mision', {
        p_remito_id: remitoInfo.id,
      });

      if (error) throw error;

      setMessage({
        type: 'success',
        text: data?.message || 'Misión del remito restablecida correctamente.',
      });
      
      // Actualizar información mostrada
      setRemitoInfo({
        ...remitoInfo,
        mision_estado: 'ESPERANDO_DOCS',
        tiene_incidencias_carga: false,
      });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Error al restablecer la misión: ' + err.message });
    } finally {
      setResetting(false);
    }
  };

  const handleSimulateCron = async () => {
    if (!remitoInfo) return;

    setSimulating(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc('simular_monitoreo_remito', {
        p_remito_id: remitoInfo.id
      });

      if (error) throw error;
      setSimResult(data);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Error al simular monitoreo: ' + err.message });
    } finally {
      setSimulating(false);
    }
  };

  const handleTriggerAlert = async () => {
    if (!remitoInfo) return;

    const confirmSend = window.confirm(
      `¿Estás seguro de que quieres FORZAR el envío del recordatorio para el estado "${remitoInfo.mision_estado}"?\n\nEsto enviará la notificación real a n8n y registrará el evento de alerta en el historial.`
    );

    if (!confirmSend) return;

    setTriggering(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc('ejecutar_alerta_monitoreo_remito', {
        p_remito_id: remitoInfo.id
      });

      if (error) throw error;
      
      if (data?.success) {
        setMessage({
          type: 'success',
          text: `Alerta manual disparada con éxito. Mensaje enviado: "${data.mensaje_enviado}"`
        });
      } else {
        setMessage({
          type: 'error',
          text: data?.error || 'No se pudo enviar el recordatorio.'
        });
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Error al disparar la alerta: ' + err.message });
    } finally {
      setTriggering(false);
    }
  };

  const filteredEntries = remitoInfo && remitoInfo.metadata_extraida
    ? Object.entries(remitoInfo.metadata_extraida).filter(([key, val]) => {
        const query = filterQuery.toLowerCase().trim();
        if (!query) return true;
        
        const keyMatch = key.toLowerCase().includes(query);
        const label = (metadataLabels[key] || '').toLowerCase();
        const labelMatch = label.includes(query);
        
        let valStr = '';
        if (val === null || val === undefined) {
          valStr = 'vacío';
        } else if (typeof val === 'object') {
          valStr = JSON.stringify(val);
        } else {
          valStr = String(val);
        }
        const valMatch = valStr.toLowerCase().includes(query);
        
        return keyMatch || labelMatch || valMatch;
      })
    : [];

  if (!isAuthorized) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-6 text-center h-[calc(100vh-4rem)]">
        <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-800">Acceso No Autorizado</h2>
        <p className="text-sm text-gray-500 mt-2">
          Esta sección está reservada exclusivamente para propósitos de desarrollo técnico.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 font-sans space-y-6">
      
      {/* Banner de alerta delgado en la parte superior */}
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>
            <strong className="font-bold">Recursos Técnicos de Desarrollo</strong> — Herramientas avanzadas para pruebas unitarias e integración en entorno de staging.
          </span>
        </div>
        <span className="px-2 py-0.5 bg-red-100 border border-red-200 text-red-800 rounded text-[9px] font-bold tracking-wide uppercase">
          Dev Mode
        </span>
      </div>

      {/* Alerta de Staging */}
      {!message && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3 text-amber-800 text-xs">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">Información de Operación</span>
            <p className="text-gray-600">
              Las acciones realizadas en este panel modifican directamente los registros de la base de datos de pruebas (QA/Staging). Úsalas con criterio.
            </p>
          </div>
        </div>
      )}

      {message && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs animate-in fade-in duration-200 ${
          message.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          )}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      {/* Cabecera horizontal compacta */}
      <header className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <form onSubmit={handleSearchRemito} className="flex gap-2 flex-grow max-w-md">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="number"
              value={remitoId}
              onChange={(e) => setRemitoId(e.target.value)}
              placeholder="Buscar remito por ID de Base de Datos (ej: 21)"
              disabled={loading}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-red-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !remitoId}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Buscando...' : 'Cargar'}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {remitoInfo && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs border-t md:border-t-0 md:border-l border-gray-100 pt-3 md:pt-0 md:pl-6 animate-in fade-in duration-200">
            <div>
              <span className="text-gray-400 mr-1.5 font-bold uppercase text-[9px]">ID Remito</span>
              <span className="font-mono text-gray-800 font-bold">#{remitoInfo.id}</span>
            </div>
            <div>
              <span className="text-gray-400 mr-1.5 font-bold uppercase text-[9px]">Referencia</span>
              <span className="text-gray-800 font-bold">{remitoInfo.remito_ref_externa}</span>
            </div>
            <div>
              <span className="text-gray-400 mr-1.5 font-bold uppercase text-[9px]">Estado Misión</span>
              <span className="px-2 py-0.5 bg-brand-50 border border-brand-200 text-brand-700 rounded-full font-bold text-[10px] uppercase tracking-wide">
                {remitoInfo.mision_estado || 'ESPERANDO_DOCS'}
              </span>
            </div>
            <div>
              <span className="text-gray-400 mr-1.5 font-bold uppercase text-[9px]">Chofer</span>
              <span className="text-gray-800 font-medium">{remitoInfo.choferes?.nombre_completo || 'No asignado'}</span>
            </div>
          </div>
        )}
      </header>

      {/* Grid de Dos Columnas (Split-View) */}
      {remitoInfo && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-300">
          
          {/* Columna Izquierda: Datos del Remito (8/12) */}
          <div className="lg:col-span-8 flex flex-col bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[calc(100vh-220px)]">
            
            {/* Header del visualizador y filtro rápido */}
            <div className="border-b border-gray-100 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-red-600" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                    Metadatos Extraídos del Remito
                  </h2>
                </div>
                <span className="text-[10px] text-gray-400 font-medium font-mono">metadata_extraida (JSON)</span>
              </div>

              {/* Filtro Rápido */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filtrar por clave técnica, significado o valor..."
                  className="w-full pl-9 pr-8 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-red-500 transition-colors bg-gray-50/50"
                />
                {filterQuery && (
                  <button
                    onClick={() => setFilterQuery('')}
                    className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 text-xs font-semibold cursor-pointer"
                  >
                    X
                  </button>
                )}
              </div>
            </div>

            {/* Contenedor scrollable con sticky headers */}
            <div className="flex-1 overflow-y-auto mt-4 rounded-lg border border-gray-100 relative">
              <table className="min-w-full divide-y divide-gray-200 text-xs relative">
                <thead className="sticky top-0 bg-gray-50 z-10 shadow-xs">
                  <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left w-[200px] bg-gray-50 sticky top-0">Clave Técnica</th>
                    <th className="px-4 py-3 text-left w-[240px] bg-gray-50 sticky top-0">Significado Humano</th>
                    <th className="px-4 py-3 text-left bg-gray-50 sticky top-0">Valor Registrado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-400 italic">
                        No se encontraron metadatos que coincidan con el filtro.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map(([key, val]: [string, any]) => {
                      // Formatear valor según tipo
                      let displayVal: React.ReactNode = '';
                      if (val === null || val === undefined) {
                        displayVal = <span className="text-gray-400 italic">(Vacío)</span>;
                      } else if (typeof val === 'boolean') {
                        displayVal = val ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[9px] font-bold">Sí</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-200 rounded-full text-[9px] font-bold">No</span>
                        );
                      } else if (Array.isArray(val)) {
                        if (key === 'productos') {
                          displayVal = (
                            <div className="space-y-2 bg-gray-50 p-2.5 rounded border border-gray-200/50 max-w-md">
                              {val.map((prod: any, i: number) => (
                                <div key={i} className="text-[10px] border-b border-gray-200 last:border-0 pb-1.5 last:pb-0">
                                  <p className="font-semibold text-gray-700">{prod.descripcion_articulo || 'Sin descripción'}</p>
                                  <p className="text-gray-500 mt-0.5">
                                    Cód: {prod.codigo_articulo || '-'} | Bolsas: {prod.cantidad_de_bolsas || '-'} | Peso: {prod.peso_total || '-'} tn
                                  </p>
                                </div>
                              ))}
                            </div>
                          );
                        } else if (key === 'protocolo_control') {
                          // Usar el protocolo de control en vivo (columna root) o caer a val (snapshot estático) si no se obtuvo
                          const liveProtocol = remitoInfo.protocolo_control || val;
                          const total = liveProtocol.length;
                          const completados = liveProtocol.filter((t: any) => t.estado === 'COMPLETADO').length;
                          const reportados = liveProtocol.filter((t: any) => t.estado === 'REPORTADO_CHOFER').length;
                          displayVal = (
                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200/50 text-[10px] space-y-3 w-full max-w-2xl overflow-x-auto">
                              <p className="font-bold text-gray-700 border-b border-gray-200 pb-1.5 flex items-center justify-between">
                                <span className="flex items-center gap-1 text-gray-600 font-bold">
                                  Checklist en Vivo <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[8px] uppercase tracking-wider font-bold">LIVE</span>
                                </span>
                                <span className="text-[9px] bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full font-mono">
                                  {completados}/{total} completados ({reportados} ptes. operador)
                                </span>
                              </p>
                              <table className="min-w-full divide-y divide-gray-200/60 text-[10px]">
                                <thead>
                                  <tr className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">
                                    <th className="py-1 text-left">ID</th>
                                    <th className="py-1 text-left px-2">Tarea</th>
                                    <th className="py-1 text-center">Chofer Asig.</th>
                                    <th className="py-1 text-center">Chofer Realizó</th>
                                    <th className="py-1 text-center px-2">Estado</th>
                                    <th className="py-1 text-left px-2">Fecha Reporte</th>
                                    <th className="py-1 text-left px-2">Valor/Foto</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200/40">
                                  {liveProtocol.map((t: any) => (
                                    <tr key={t.id} className="hover:bg-gray-100/50">
                                      <td className="py-1.5 font-mono text-gray-400 align-middle">{t.id}</td>
                                      <td className="py-1.5 px-2 font-medium text-gray-700 align-middle break-words max-w-[200px]">{t.tarea}</td>
                                      <td className="py-1.5 text-center align-middle">
                                        {t.asignada_a_chofer ? (
                                          <span className="text-blue-600 font-bold">Sí</span>
                                        ) : (
                                          <span className="text-gray-400">No</span>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-center align-middle">
                                        {t.chofer_realizo ? (
                                          <span className="text-emerald-600 font-bold">✓</span>
                                        ) : (
                                          <span className="text-gray-300">✗</span>
                                        )}
                                      </td>
                                      <td className="py-1.5 px-2 align-middle text-center">
                                        <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold ${
                                          t.estado === 'COMPLETADO'
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                            : t.estado === 'REPORTADO_CHOFER'
                                            ? 'bg-amber-50 text-amber-800 border border-amber-200 animate-pulse'
                                            : t.estado === 'RECHAZADO'
                                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                            : 'bg-gray-50 text-gray-500 border border-gray-200'
                                        }`}>
                                          {t.estado === 'REPORTADO_CHOFER' ? 'Pend. Operador' : t.estado || 'PENDIENTE'}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-2 text-gray-400 font-mono align-middle">
                                        {t.chofer_reporto_at ? (
                                          new Date(t.chofer_reporto_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' ' +
                                          new Date(t.chofer_reporto_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                                        ) : (
                                          '-'
                                        )}
                                      </td>
                                      <td className="py-1.5 px-2 align-middle">
                                        {t.valor_reportado_chofer ? (
                                          t.valor_reportado_chofer.startsWith('http') ? (
                                            <a
                                              href={t.valor_reportado_chofer}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-[9px] text-blue-600 hover:underline bg-blue-50 px-1 py-0.5 rounded border border-blue-100 font-medium inline-block"
                                            >
                                              📷 Ver Foto
                                            </a>
                                          ) : (
                                            <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 font-mono">
                                              {t.valor_reportado_chofer}
                                            </span>
                                          )
                                        ) : (
                                          '-'
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        } else {
                          displayVal = <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 text-[10px]">{val.join(', ')}</span>;
                        }
                      } else if (typeof val === 'object') {
                        displayVal = (
                          <pre className="font-mono text-[9px] bg-gray-50 p-2 rounded border border-gray-200 max-h-32 overflow-y-auto w-full max-w-md">
                            {JSON.stringify(val, null, 2)}
                          </pre>
                        );
                      } else {
                        const strValue = String(val);
                        const shouldTruncate = strValue.length > 70;
                        displayVal = (
                          <span 
                            title={shouldTruncate ? strValue : undefined}
                            className={shouldTruncate ? "block max-w-xs truncate text-gray-800 font-medium cursor-help" : "text-gray-800 font-medium break-all"}
                          >
                            {shouldTruncate ? `${strValue.substring(0, 67)}...` : strValue}
                          </span>
                        );
                      }

                      return (
                        <tr key={key} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-[10px] text-gray-500 align-top max-w-[200px] truncate" title={key}>{key}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-700 align-top max-w-[240px]">
                            {editingKey === key ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={tempLabel}
                                  onChange={e => setTempLabel(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveLabel(key);
                                    if (e.key === 'Escape') setEditingKey(null);
                                  }}
                                  className="p-1 text-xs border border-gray-300 rounded focus:border-red-500 outline-none w-full"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveLabel(key)}
                                  className="p-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded hover:bg-emerald-100 cursor-pointer"
                                  title="Guardar"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setEditingKey(null)}
                                  className="p-1 bg-gray-50 text-gray-400 border border-gray-200 rounded hover:bg-gray-100 cursor-pointer"
                                  title="Cancelar"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between group gap-2">
                                <span className="break-words">
                                  {metadataLabels[key] || (
                                    <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 text-[9px] font-bold">
                                      Pendiente traducción
                                    </span>
                                  )}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingKey(key);
                                    setTempLabel(metadataLabels[key] || '');
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-100 rounded transition-opacity cursor-pointer text-gray-400 hover:text-gray-600 flex-shrink-0"
                                  title="Editar etiqueta"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 align-top">{displayVal}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Columna Derecha: Acciones / Herramientas (4/12) */}
          <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-6">
            
            {/* Herramienta 1: Reset de Misión */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="border-b border-gray-100 pb-2 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-red-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Reset de Misión de Transporte
                  </h2>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Restablece el ciclo físico del viaje a su estado inicial. Borra todo el historial de chat con el chofer, desactiva incidencias y reinicia el checklist a <span className="font-semibold text-gray-700">PENDIENTE</span>.
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetMision}
                disabled={resetting}
                className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
                {resetting ? 'Restableciendo...' : 'Restablecer Misión'}
              </button>
            </section>

            {/* Herramienta 2: Simulador del Cronjob */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="border-b border-gray-100 pb-2 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-amber-500" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Simulador de Cronjob de Alta Frecuencia
                  </h2>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Evalúa las reglas de inactividad de la FSM de manera inmediata. Simula si el tiempo transcurrido desde el último mensaje del chofer supera el límite configurado para alertar a n8n.
                </p>

                {simResult && (
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2.5 text-[10px] text-gray-700 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-1.5">
                      <span className="font-bold text-gray-800">Resultado de Evaluación:</span>
                      <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[8px] ${
                        simResult.debe_alertar 
                          ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {simResult.debe_alertar ? 'Alerta Requerida' : 'OK / Silencio'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <p><span className="text-gray-400 font-medium">Inactividad detectada:</span> <strong className="text-gray-800">{simResult.diferencia_minutos} minutos</strong></p>
                      <p><span className="text-gray-400 font-medium">Límite establecido:</span> <strong className="text-gray-800">{simResult.intervalo_limite_minutos} minutos</strong></p>
                      <p><span className="text-gray-400 font-medium">¿Alerta reciente enviada?:</span> <strong className="text-gray-800">{simResult.alerta_enviada_reciente ? 'Sí' : 'No'}</strong></p>
                      <p className="text-gray-600 italic bg-white p-2 rounded border border-gray-100 text-[9px] mt-1.5">
                        💡 {simResult.motivo}
                      </p>
                    </div>

                    {simResult.mensaje_a_enviar && (
                      <div className="space-y-1 mt-2">
                        <span className="text-gray-400 block font-bold text-[8px] uppercase">Mensaje de Recordatorio:</span>
                        <div className="bg-brand-50 text-brand-900 p-2 rounded-lg border border-brand-100/70 text-[9px] font-medium flex gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-brand-600 flex-shrink-0 mt-0.5" />
                          <span>"{simResult.mensaje_a_enviar}"</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSimulateCron}
                  disabled={simulating}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 border border-gray-200"
                >
                  <Play className={`w-3.5 h-3.5 ${simulating ? 'animate-pulse' : ''}`} />
                  {simulating ? 'Simulando...' : 'Evaluar Reglas'}
                </button>
                
                <button
                  type="button"
                  onClick={handleTriggerAlert}
                  disabled={triggering || !remitoInfo}
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${triggering ? 'animate-bounce' : ''}`} />
                  {triggering ? 'Disparando...' : 'Disparar Alerta'}
                </button>
              </div>
            </section>

          </div>
        </div>
      )}
    </div>
  );
}
