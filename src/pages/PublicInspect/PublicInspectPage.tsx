import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { FileCheck2, Download, Upload, CheckCircle2, AlertCircle, Loader2, FileText, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface PublicInspeccionData {
  id: number;
  fecha_pactada: string;
  tipo_carga: string;
  inspector_nombre: string;
  planilla_personalizada_url: string | null;
}

const STORAGE_BUCKET = 'inspecciones_adjuntos';

export function PublicInspectPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicInspeccionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStr, setErrorStr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
        setErrorStr('Token no proporcionado.');
        setLoading(false);
        return;
    }

    const fetchInspeccion = async () => {
      try {
        const { data: result, error: rpcError } = await supabase.rpc('get_inspeccion_by_token', {
          p_token: token
        });

        if (rpcError) throw rpcError;
        
        setData(result as PublicInspeccionData);
      } catch (err: any) {
        console.error('Error fetching inspection:', err);
        setErrorStr(err.message || 'Error al obtener la inspección. Es posible que el enlace no sea válido.');
      } finally {
        setLoading(false);
      }
    };

    fetchInspeccion();
  }, [token]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  const handleUploadResultados = async () => {
    if (!selectedFile || !data || !token) return;

    try {
      setUploading(true);

      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'bin';
      const timestamp = Date.now();
      const storagePath = `resultados/resultado_ins_${data.id}_${timestamp}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, selectedFile, { upsert: false });

      if (storageError) throw storageError;

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      // Complete via RPC
      const { error: rpcError } = await supabase.rpc('inspeccion_completar_resultados', {
        p_token: token,
        p_archivo_url: publicUrl
      });

      if (rpcError) throw rpcError;

      setSuccess(true);
    } catch (err: any) {
      console.error('Upload Error:', err);
      setUploadError(err.message || 'Error desconocido al procesar la solicitud.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-4" />
        <p className="text-gray-500 font-medium">Validando acceso...</p>
      </div>
    );
  }

  if (errorStr || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden border border-red-100 p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Acceso Denegado</h1>
          <p className="text-gray-600 text-sm">{errorStr || 'El enlace que está intentando abrir ha expirado o ya fue utilizado.'}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden border border-emerald-100 p-8 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Envío Exitoso</h1>
          <p className="text-gray-600 text-sm mb-6">Los resultados de la inspección han sido registrados correctamente y notificados al coordinador.</p>
          <button onClick={() => window.close()} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition text-sm">
            Cerrar esta ventana
          </button>
        </div>
      </div>
    );
  }

  const fechaFormatted = data.fecha_pactada ? format(parseISO(data.fecha_pactada), "EEEE dd 'de' MMMM yyyy · HH:mm", { locale: es }) : 'No especificada';

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      {/* Header Público */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-6 h-6 text-brand-600" />
          <span className="text-lg font-bold text-gray-900 tracking-tight">Portal de Inspecciones</span>
        </div>
        <div className="text-sm font-medium text-gray-500 hidden sm:block">
          Control Documental · ID #{data.id}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-brand-600 to-brand-800 px-6 py-8 text-white relative overflow-hidden">
            <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-1/4 translate-y-1/4">
               <FileCheck2 className="w-64 h-64" />
            </div>
            
            <span className="text-brand-100 font-semibold tracking-wider uppercase text-xs mb-2 block">
              Recepción Documental
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 relative z-10">
              Bienvenido, {data.inspector_nombre}
            </h1>
            <p className="text-brand-100 relative z-10 max-w-lg">
              Por favor revisa la información de la inspección, descarga la plantilla si aún no lo hiciste y sube los resultados finales. Este enlace vencerá 48hs después de la fecha pactada.
            </p>
          </div>

          <div className="p-6 sm:p-8">
            <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3 mb-5">
              Detalles de la Carga
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
               <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Fecha Pactada</p>
                  <p className="text-md font-medium text-gray-900 capitalize">{fechaFormatted}</p>
               </div>
               <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tipo de Carga</p>
                  <p className="text-md font-medium text-gray-900">{data.tipo_carga}</p>
               </div>
            </div>

            <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3 mb-5 mt-8">
              Gestión de Archivos
            </h2>

            <div className="space-y-6">
               {/* Sección Descargar */}
               <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                       <FileText className="w-5 h-5 text-blue-600" /> 1. Planilla a Completar
                    </h3>
                    <p className="text-sm text-blue-700/80 mt-1 max-w-sm">Verás la plantilla preparada con los datos básicos de la inspección. Complétala antes de subirla.</p>
                  </div>
                  <a 
                    href={data.planilla_personalizada_url || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition flex-shrink-0 ${data.planilla_personalizada_url ? 'bg-white border border-blue-200 text-blue-700 shadow-sm hover:bg-blue-50 hover:shadow' : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}
                    onClick={(e) => { if(!data.planilla_personalizada_url) e.preventDefault(); }}
                  >
                    <Download className="w-4 h-4" /> 
                    {data.planilla_personalizada_url ? 'Descargar Planilla' : 'No disponible'}
                  </a>
               </div>

               {/* Sección Subir */}
               <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
                 <div>
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                       <Upload className="w-5 h-5 text-gray-600" /> 2. Subir Resultados
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Una vez finalizada la carga, sube la planilla o reporte completado en este apartado para finalizar tu tarea.</p>
                 </div>

                 {selectedFile && (
                    <div className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                      <FileCheck2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{selectedFile.name}</p>
                        <p className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button type="button" onClick={() => setSelectedFile(null)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                        Reemplazar
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

                 <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex-1 flex justify-center items-center gap-2 px-4 py-3 bg-white border-2 border-dashed border-gray-300 rounded-lg font-medium text-gray-600 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/50 transition duration-200 disabled:opacity-50 text-sm"
                    >
                      {selectedFile ? 'Seleccionar otro archivo...' : 'Explorar archivos'}
                    </button>
                    
                    <button
                      type="button"
                      onClick={handleUploadResultados}
                      disabled={uploading || !selectedFile}
                      className="flex-1 flex justify-center items-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-lg font-semibold hover:bg-brand-700 hover:shadow-md transition duration-200 disabled:opacity-50 disabled:bg-gray-300 disabled:shadow-none text-sm"
                    >
                      {uploading ? (
                         <><Loader2 className="w-5 h-5 animate-spin" /> Procesando...</>
                      ) : (
                         <>Enviar Resultados <ChevronRight className="w-5 h-5 -mx-1" /></>
                      )}
                    </button>
                 </div>
                 
                 {uploadError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-medium animate-in fade-in slide-in-from-top-1">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {uploadError}
                    </div>
                  )}
                  
               </div>

            </div>
          </div>
          
          <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 text-center">
            <p className="text-xs text-gray-400 font-medium">Al enviar este formulario se registrará su firma digital automática para el historial de eventos de calidad.</p>
          </div>
        </div>

      </main>
    </div>
  );
}
