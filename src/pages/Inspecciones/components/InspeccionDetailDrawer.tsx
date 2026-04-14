import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  User,
  CalendarClock,
  Package,
  FileCheck2,
  Upload,
  Loader2,
  FileText,
  ExternalLink,
  CheckCircle2,
  Download,
  Mail,
  Trash2,
  AlertTriangle,
  Save,
  MapPin,
  ArrowRight
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../../../lib/utils';
import { supabase } from '../../../lib/supabase';
import type { InspeccionKanban, StateDefinition } from '../types';

interface InspeccionDetailDrawerProps {
  isOpen: boolean;
  inspeccion: InspeccionKanban | null;
  stateDefs: StateDefinition[];
  onClose: () => void;
  onDataChanged: () => void;
  usuarioActor: string;
}

const STORAGE_BUCKET = 'inspecciones_adjuntos';

export function InspeccionDetailDrawer({
  isOpen,
  inspeccion,
  stateDefs,
  onClose,
  onDataChanged,
  usuarioActor,
}: InspeccionDetailDrawerProps) {
  const [uploading, setUploading] = useState(false);
  const [sendingEmaill, setSendingEmail] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dbData, setDbData] = useState<any>(null);
  const [loadingDbData, setLoadingDbData] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Lists for dropdowns
  const [inspectores, setInspectores] = useState<{ id: number; nombre: string }[]>([]);
  const [depositos, setDepositos] = useState<{ id: number; nombre: string }[]>([]);
  
  // Edit State
  const [editForm, setEditForm] = useState<{
    inspector_id: number | '';
    lugar_carga_id: number | '';
    fecha_hora_carga_pactada: string;
  }>({
    inspector_id: '',
    lugar_carga_id: '',
    fecha_hora_carga_pactada: ''
  });
  const [isSavingData, setIsSavingData] = useState(false);
  const [validationNotes, setValidationNotes] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);


  useEffect(() => {
    if (isOpen && inspeccion) {
      setLoadingDbData(true);
      const isEditablePhase = ['3.D0', '3.D1', '3.D2'].includes(inspeccion.state_code);
      
      const fetchAll = async () => {
        try {
          const { data } = await supabase.from('inspecciones').select('*').eq('id', inspeccion.id).single();
          let template_url = null;
          if (data && data.template_id) {
            const { data: tData } = await supabase.from('inspeccion_templates').select('archivo_url').eq('id', data.template_id).single();
            template_url = tData?.archivo_url;
          }
          setDbData({ ...data, template_url });
          
          if (data) {
            // format datetime-local input string: "YYYY-MM-DDTHH:mm"
            let formattedDate = '';
            if (data.fecha_hora_carga_pactada) {
               const d = new Date(data.fecha_hora_carga_pactada);
               const yr = d.getFullYear();
               const mo = String(d.getMonth() + 1).padStart(2, '0');
               const da = String(d.getDate()).padStart(2, '0');
               const hr = String(d.getHours()).padStart(2, '0');
               const mi = String(d.getMinutes()).padStart(2, '0');
               formattedDate = `${yr}-${mo}-${da}T${hr}:${mi}`;
            }
            
            setEditForm({
              inspector_id: data.inspector_id || '',
              lugar_carga_id: data.lugar_carga_id || '',
              fecha_hora_carga_pactada: formattedDate
            });
          }

          if (isEditablePhase) {
            const [inspRes, depRes] = await Promise.all([
              supabase.from('personal_ac_roles').select('personal_ac_id, personal_ac!inner(id, nombre_completo)').eq('role_id', 6),
              supabase.from('depositos').select('id, nombre').order('nombre')
            ]);
            
            if (inspRes.data) {
              const mapped = (inspRes.data as any[]).map(r => ({
                id: r.personal_ac.id,
                nombre: r.personal_ac.nombre_completo,
              }));
              const unique = Array.from(new Map(mapped.map(m => [m.id, m])).values());
              setInspectores(unique);
            }
            if (depRes.data) {
              setDepositos(depRes.data);
            }
          }
        } catch (error) {
          console.error("Error fetching dependencies:", error);
        } finally {
          setLoadingDbData(false);
        }
      };
      
      fetchAll();
    } else {
      setDbData(null);
      setValidationNotes('');
    }

  }, [isOpen, inspeccion]);

  if (!inspeccion) return null;

  const currentState = stateDefs.find(s => s.state_code === inspeccion.state_code);
  const isEditablePhase = ['3.D0', '3.D1', '3.D2'].includes(inspeccion.state_code);
  const isTerminalState = ['3.D4', '3.D5'].includes(inspeccion.state_code);


  const fechaFormatted = (() => {
    try {
      return format(parseISO(inspeccion.fecha_pactada), "EEEE dd 'de' MMMM yyyy · HH:mm", { locale: es });
    } catch {
      return inspeccion.fecha_pactada || '—';
    }
  })();

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  const handleDownloadMaestra = async () => {
    if (!inspeccion || !dbData?.template_url) return;
    
    await supabase.rpc('log_inspeccion_evento', {
      p_inspeccion_id: inspeccion.id,
      p_accion: 'PLANTILLA_MAESTRA_DESCARGADA',
      p_usuario_actor: usuarioActor
    });
    
    window.open(dbData.template_url, '_blank');
  };

  const handeEdgeFunctionEmail = async () => {
    if (!inspeccion) return;
    try {
      setSendingEmail(true);
      const { error } = await supabase.functions.invoke('send-inspection-email', {
        body: { 
          inspeccionId: inspeccion.id,
          origin: window.location.origin
        },
      });
      if (error) throw error;

      showToast('success', 'Correo enviado al inspector. Enlace mágico re-generado.');
      onDataChanged();
      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      showToast('error', `Error al enviar correo: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleDelete = async () => {
    if (!inspeccion) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la inspección #INS-${inspeccion.id}? Esta acción no se puede deshacer.`)) return;
    
    try {
      setIsDeleting(true);
      const { error } = await supabase.from('inspecciones').delete().eq('id', inspeccion.id);
      if (error) throw error;
      
      showToast('success', 'Inspección eliminada correctamente.');
      onDataChanged();
      onClose();
    } catch (err: any) {
      showToast('error', `Error al eliminar: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleSaveData = async () => {
    if (!inspeccion) return;
    if (!editForm.inspector_id || !editForm.lugar_carga_id || !editForm.fecha_hora_carga_pactada) {
       showToast('error', 'Todos los campos son obligatorios.');
       return;
    }
    
    try {
      setIsSavingData(true);
      const { error } = await supabase.rpc('actualizar_datos_inspeccion', {
         p_id: inspeccion.id,
         p_fecha: new Date(editForm.fecha_hora_carga_pactada).toISOString(),
         p_lugar_id: editForm.lugar_carga_id,
         p_inspector_id: editForm.inspector_id,
         p_usuario_actor: usuarioActor
      });
      if (error) throw error;
      
      showToast('success', 'Datos actualizados correctamente.');
      onDataChanged();
    } catch (err: any) {
      showToast('error', `Error al actualizar: ${err.message}`);
    } finally {
      setIsSavingData(false);
    }
  };
  
  const handleTransitionD2 = async () => {
     if (!inspeccion) return;
     try {
       setIsSavingData(true);
       const { error } = await supabase.rpc('inspeccion_intentar_transicion', {
          p_inspeccion_id: inspeccion.id,
          p_nuevo_estado_code: '3.D2',
          p_usuario_actor: usuarioActor
       });
       if (error) throw error;
       showToast('success', 'Confirmado. Estado movido a 3.D2.');
       onDataChanged();
       onClose();
     } catch (err: any) {
       showToast('error', `Error: ${err.message}`);
     } finally {
       setIsSavingData(false);
     }
  };

  const handleUploadPlanilla = async () => {
    if (!selectedFile || !inspeccion) return;

    try {
      setUploading(true);
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'bin';
      const timestamp = Date.now();
      
      let folder = '';
      if (isEditablePhase) {
        folder = 'personalizadas/';
      }
      
      const storagePath = `${folder}planilla_ins_${inspeccion.id}_${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, selectedFile, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      const updateData: any = {};
      if (isEditablePhase) {
        updateData.planilla_personalizada_url = publicUrl;
      } else {
        updateData.planilla_completada_url = publicUrl;
      }

      const { error: updateError } = await supabase
        .from('inspecciones')
        .update(updateData)
        .eq('id', inspeccion.id);

      if (updateError) throw updateError;

      setDbData((prev: any) => ({ ...prev, ...updateData }));

      if (!isEditablePhase) {
        const { error: transError } = await supabase.rpc('inspeccion_intentar_transicion', {
          p_inspeccion_id: inspeccion.id,
          p_nuevo_estado_code: '3.D3',
          p_usuario_actor: usuarioActor,
        });

        if (transError) {
          showToast('error', `Subido. Pero transición falló: ${transError.message}`);
        } else {
          showToast('success', 'Planilla final subida. Avanzado a Validación.');
        }
      } else {
        showToast('success', 'Planilla personalizada guardada correcamente.');
      }

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onDataChanged();
    } catch (err: any) {
      console.error('Error uploading planilla:', err);
      showToast('error', `Error al subir la planilla: ${err.message || 'Error desconocido'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleFinalize = async (resultado: 'OK' | 'NO_CONFORME') => {
    if (!inspeccion) return;
    if (resultado === 'NO_CONFORME' && !validationNotes.trim()) {
      showToast('error', 'Las notas de validación son obligatorias para marcar como No Conforme.');
      return;
    }

    try {
      setIsFinalizing(true);
      const { error } = await supabase.rpc('finalizar_inspeccion', {
        p_id: inspeccion.id,
        p_resultado: resultado,
        p_observaciones: validationNotes,
        p_usuario: usuarioActor
      });

      if (error) throw error;

      showToast('success', resultado === 'OK' ? 'Inspección aprobada con éxito' : 'Inspección marcada como No Conforme');
      onDataChanged();
      onClose();
    } catch (err: any) {
      showToast('error', `Error al finalizar la inspección: ${err.message}`);
    } finally {
      setIsFinalizing(false);
    }
  };


  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {toast && (
        <div
          className={`fixed top-4 right-4 z-[110] px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.text}
        </div>
      )}

      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full md:w-[480px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col border-l border-gray-200',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
          <div>
            <span className="text-xs font-bold text-gray-400 font-mono">#INS-{inspeccion.id}</span>
            <h2 className="text-lg font-bold text-gray-900">Detalle de Inspección</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex items-center gap-3">
            <FileCheck2 className="w-6 h-6 text-brand-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-brand-600 font-semibold uppercase tracking-wider">Estado Documental</p>
              <p className="text-sm font-bold text-brand-900">
                {inspeccion.state_code}
                {currentState ? ` — ${currentState.name}` : ` — ${inspeccion.export_doc_status}`}
              </p>
            </div>
          </div>
          
          {isTerminalState && (
            <div className={cn(
              "rounded-xl p-5 border flex flex-col gap-3 shadow-md border-opacity-60",
              inspeccion.state_code === '3.D4' 
                ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
                : "bg-orange-50 border-orange-200 text-orange-900"
            )}>
              <div className="flex items-center gap-2 font-black uppercase tracking-widest text-[10px]">
                {inspeccion.state_code === '3.D4' 
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  : <AlertTriangle className="w-4 h-4 text-orange-600" />
                }
                Veredicto Final: {inspeccion.state_code === '3.D4' ? 'APROBADO' : 'NO CONFORME'}
              </div>
              {dbData?.current_data?.observaciones_finales ? (
                <div className="bg-white/50 p-3 rounded-lg border border-current border-opacity-10">
                  <p className="text-sm font-medium leading-relaxed">
                    {dbData.current_data.observaciones_finales}
                  </p>
                </div>
              ) : (
                <p className="text-sm italic opacity-60">Sin observaciones adicionales.</p>
              )}
            </div>
          )}

          
          {inspeccion.state_code === '3.D1' && (
             <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-sm text-amber-800 font-medium">La inspección está actualmente coordinada. Una vez que inicie o finalice físicamente, confírmalo para moverla al estado de espera de resultados (3.D2).</p>
                <button
                   onClick={handleTransitionD2}
                   disabled={isSavingData}
                   className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 disabled:opacity-50 transition text-sm"
                >
                   {isSavingData ? <Loader2 className="animate-spin w-4 h-4"/> : <ArrowRight className="w-4 h-4" />}
                   Confirmar Carga Terminada Físicamente
                </button>
             </div>
          )}

          {inspeccion.state_code === '3.D3' && (
            <div className="bg-white border-2 border-brand-200 rounded-xl p-5 space-y-4 shadow-md bg-gradient-to-b from-brand-50/20 to-white">
              <div className="flex items-center gap-2 text-brand-700 mb-1">
                <FileCheck2 className="w-5 h-5" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Módulo de Validación</h3>
              </div>

              {dbData?.planilla_completada_url && (
                <div className="flex items-center justify-between p-3 bg-white border border-brand-100 rounded-lg shadow-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand-500" />
                    <span className="text-sm font-semibold text-gray-700">Planilla de Inspección</span>
                  </div>
                  <a 
                    href={dbData.planilla_completada_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-md text-xs font-bold hover:bg-brand-700 transition flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver Reporte
                  </a>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Notas de Validación</label>
                <textarea
                  value={validationNotes}
                  onChange={(e) => setValidationNotes(e.target.value)}
                  placeholder="Escribe aquí los motivos de la decisión o comentarios adicionales..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none min-h-[100px] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => handleFinalize('NO_CONFORME')}
                  disabled={isFinalizing}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold hover:bg-red-100 transition disabled:opacity-50 text-sm"
                >
                  {isFinalizing ? <Loader2 className="animate-spin w-4 h-4"/> : <X className="w-4 h-4" />}
                  No Conforme
                </button>
                <button
                  onClick={() => handleFinalize('OK')}
                  disabled={isFinalizing}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition disabled:opacity-50 text-sm"
                >
                  {isFinalizing ? <Loader2 className="animate-spin w-4 h-4"/> : <CheckCircle2 className="w-4 h-4" />}
                  Aprobar
                </button>
              </div>
            </div>
          )}


          {/* EDITABLE FIELDS IN D0, D1, D2 */}
          {isEditablePhase ? (
             <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm relative">
                {loadingDbData && (
                   <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-xl">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                   </div>
                )}
                <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
                  Datos Operativos
                </h3>
                
                <div>
                   <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1.5"><User className="w-4 h-4 text-gray-400" /> Inspector Asignado</label>
                   <select
                     value={editForm.inspector_id}
                     onChange={(e) => setEditForm(prev => ({...prev, inspector_id: parseInt(e.target.value)}))}
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                   >
                     <option value="">Seleccionar inspector...</option>
                     {inspectores.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                   </select>
                </div>

                <div>
                   <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1.5"><MapPin className="w-4 h-4 text-gray-400" /> Lugar de Carga</label>
                   <select
                     value={editForm.lugar_carga_id}
                     onChange={(e) => setEditForm(prev => ({...prev, lugar_carga_id: parseInt(e.target.value)}))}
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                   >
                     <option value="">Seleccionar depósito...</option>
                     {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                   </select>
                </div>

                <div>
                   <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1.5"><CalendarClock className="w-4 h-4 text-gray-400" /> Fecha y Hora Pactada</label>
                   <input
                     type="datetime-local"
                     value={editForm.fecha_hora_carga_pactada}
                     onChange={(e) => setEditForm(prev => ({...prev, fecha_hora_carga_pactada: e.target.value}))}
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                   />
                </div>

                <div className="pt-2">
                   <button
                     onClick={handleSaveData}
                     disabled={isSavingData}
                     className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 transition disabled:opacity-50 text-sm"
                   >
                     {isSavingData ? <Loader2 className="animate-spin w-4 h-4"/> : <Save className="w-4 h-4" />}
                     Guardar Cambios
                   </button>
                </div>
             </div>
          ) : (
             <div className="space-y-4">
               <div className="flex items-start gap-3">
                 <User className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                 <div>
                   <p className="text-xs text-gray-500 font-medium">Inspector</p>
                   <p className="text-sm font-semibold text-gray-900">{inspeccion.inspector_nombre}</p>
                 </div>
               </div>

               <div className="flex items-start gap-3">
                 <CalendarClock className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                 <div>
                   <p className="text-xs text-gray-500 font-medium">Fecha Pactada de Carga</p>
                   <p className="text-sm font-semibold text-gray-900 capitalize">{fechaFormatted}</p>
                 </div>
               </div>

               <div className="flex items-start gap-3">
                 <Package className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                 <div>
                   <p className="text-xs text-gray-500 font-medium">Tipo de Carga</p>
                   <p className="text-sm font-semibold text-gray-900">{inspeccion.tipo_carga}</p>
                 </div>
               </div>
             </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
              Pedidos Vinculados
            </h3>
            {inspeccion.pedidos && inspeccion.pedidos.length > 0 ? (
              <div className="space-y-2">
                {inspeccion.pedidos.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 p-3 rounded-lg"
                  >
                    <Package className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-indigo-800">
                      {p.identificador_compuesto}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Sin pedidos vinculados.</p>
            )}
          </div>

          <div>
            {isEditablePhase && (
              <div className="space-y-6">
                
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
                    Gestión de Documentos de Trabajo
                  </h3>
                  
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-800">Descargar Plantilla Maestra</h4>
                        <p className="text-xs text-gray-500">Descarga la plantilla para prepararle los datos específicos al inspector.</p>
                      </div>
                      <button 
                        onClick={handleDownloadMaestra}
                        disabled={!dbData?.template_url}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded shadow-sm text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" /> Bajar
                      </button>
                    </div>

                    <div className="border-t border-gray-200"></div>

                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-800">Subir Planilla Personalizada</h4>
                        <p className="text-xs text-gray-500">Adjunta el Excel editado listo para el inspector.</p>
                      </div>
                      
                      {dbData?.planilla_personalizada_url && (
                          <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            <span className="text-xs text-emerald-800 font-bold uppercase tracking-wider flex-1 truncate">Planilla Lista</span>
                            <a href={dbData.planilla_personalizada_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-800"><ExternalLink className="w-3 h-3" /></a>
                          </div>
                      )}

                      <div className="flex gap-2 items-center">
                          <input
                              ref={fileInputRef}
                              type="file"
                              accept=".pdf,.xlsx,.xls"
                              className="hidden"
                              onChange={handleFileChange}
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center justify-center px-4 py-2 bg-white border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-brand-400 hover:text-brand-600 transition disabled:opacity-50 flex-1"
                          >
                            {selectedFile ? selectedFile.name : 'Seleccionar Archivo...'}
                          </button>
                          {selectedFile && (
                              <button
                                  onClick={handleUploadPlanilla}
                                  disabled={uploading}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                              >
                                  {uploading ? <Loader2 className="animate-spin w-4 h-4"/> : <Upload className="w-4 h-4" />}
                              </button>
                          )}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
                    Comunicación con el Inspector
                  </h3>
                  
                  <div className="p-5 bg-brand-50 border border-brand-100 rounded-xl space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-brand-900">Enviar al Inspector</h4>
                        <p className="text-xs text-brand-700">Notifica al inspector vía email con un enlace seguro (Edge Function) a la planilla personalizada.</p>
                      </div>
                      <button
                        onClick={handeEdgeFunctionEmail}
                        disabled={sendingEmaill || !dbData?.planilla_personalizada_url}
                        className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 disabled:opacity-50 disabled:bg-brand-300 transition"
                      >
                        {sendingEmaill ? <Loader2 className="animate-spin w-5 h-5"/> : <Mail className="w-5 h-5" />}
                        {sendingEmaill ? 'Enviando...' : 'Enviar al Inspector'}
                      </button>
                      {!dbData?.planilla_personalizada_url && (
                          <p className="text-xs text-center text-brand-600 font-semibold mt-1">Sube la planilla personalizada para habilitar el envío.</p>
                      )}
                  </div>
                </div>

              </div>
            )}

            {!isEditablePhase && (
                 <div className="space-y-4">
                   <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
                     {isTerminalState ? "Documentación Final Cargada" : "Recepción de Planilla Final"}
                   </h3>
 
                   {loadingDbData && <div className="text-sm text-gray-400 mb-3">Cargando URLs documentales...</div>}
 
                   {dbData?.planilla_completada_url ? (
                     <div className="flex items-center gap-2 mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                       <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                       <span className="text-sm text-emerald-700 font-medium flex-1 truncate">
                         Planilla cargada correctamente
                       </span>
                       <a
                         href={dbData.planilla_completada_url}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="text-emerald-600 hover:text-emerald-800 p-1.5 bg-white border border-emerald-200 rounded-md shadow-sm hover:shadow transition"
                       >
                         <Download className="w-4 h-4" />
                       </a>
                     </div>
                   ) : (
                     <div className="flex items-center gap-2 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                       <FileText className="w-5 h-5 text-amber-500 flex-shrink-0" />
                       <span className="text-sm text-amber-700 font-medium">
                         Sin planilla cargada externamente ni subida manual.
                       </span>
                     </div>
                   )}
 
                   {!isTerminalState && (
                     <>
                        {selectedFile && (
                          <div className="flex items-center gap-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span className="text-blue-700 truncate flex-1">
                              {selectedFile.name}{' '}
                              <span className="text-blue-500">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                              }}
                              className="text-blue-500 hover:text-blue-700"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
      
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.xlsx,.xls"
                          className="hidden"
                          onChange={handleFileChange}
                        />
      
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center gap-2 flex-1 justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/30 transition disabled:opacity-50"
                          >
                            <Upload className="w-4 h-4" />
                            {selectedFile ? 'Cambiar archivo' : 'Forzar Subida Manual'}
                          </button>
      
                          {selectedFile && (
                            <button
                              type="button"
                              onClick={handleUploadPlanilla}
                              disabled={uploading}
                              className="flex items-center gap-2 px-5 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition text-sm font-medium disabled:opacity-50"
                            >
                              {uploading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Subiendo...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4" />
                                  Subir
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-2">
                          Esto intenta avanzar al estado <span className="font-semibold">3.D3 (Validación)</span>.
                        </p>
                     </>
                   )}
                 </div>
            )}
          </div>

          <div className="pt-8 mt-8 border-t-2 border-dashed border-gray-100">
            <h3 className="text-sm font-bold text-red-600 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Zona de Peligro
            </h3>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="text-xs text-red-700 mb-3">
                Eliminar esta inspección destruirá el registro de forma permanente.
              </p>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isDeleting ? 'Eliminando...' : 'Eliminar Inspección'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
