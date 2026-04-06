import React, { useState, useRef } from 'react';
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!inspeccion) return null;

  const currentState = stateDefs.find(s => s.state_code === inspeccion.export_doc_status);

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

  const handleUploadPlanilla = async () => {
    if (!selectedFile || !inspeccion) return;

    try {
      setUploading(true);

      // Upload to inspecciones_adjuntos bucket
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'bin';
      const timestamp = Date.now();
      const storagePath = `planilla_ins_${inspeccion.id}_${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, selectedFile, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      // Update planilla_url
      const { error: updateError } = await supabase
        .from('inspecciones')
        .update({ planilla_url: publicUrl })
        .eq('id', inspeccion.id);

      if (updateError) throw updateError;

      // Transition to 3.D3 (Validación) via motor
      const { error: transError } = await supabase.rpc('inspeccion_intentar_transicion', {
        p_inspeccion_id: inspeccion.id,
        p_nuevo_estado_code: '3.D3',
        p_usuario_actor: usuarioActor,
      });

      if (transError) {
        // File uploaded but transition failed — still show partial success
        showToast('error', `Planilla subida, pero la transición a Validación falló: ${transError.message}`);
      } else {
        showToast('success', 'Planilla subida y estado avanzado a Validación.');
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

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[110] px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full md:w-[480px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col border-l border-gray-200',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
          <div>
            <span className="text-xs font-bold text-gray-400 font-mono">#INS-{inspeccion.id}</span>
            <h2 className="text-lg font-bold text-gray-900">Detalle de Inspección</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Current State */}
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex items-center gap-3">
            <FileCheck2 className="w-6 h-6 text-brand-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-brand-600 font-semibold uppercase tracking-wider">Estado Documental</p>
              <p className="text-sm font-bold text-brand-900">
                {inspeccion.export_doc_status}
                {currentState && ` — ${currentState.name}`}
              </p>
            </div>
          </div>

          {/* Info Grid */}
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

          {/* Pedidos Vinculados */}
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

          {/* Planilla Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
              Planilla Finalizada
            </h3>

            {/* Current planilla URL */}
            {inspeccion.planilla_url ? (
              <div className="flex items-center gap-2 mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-emerald-700 font-medium flex-1 truncate">
                  Planilla cargada
                </span>
                <a
                  href={inspeccion.planilla_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:text-emerald-800 p-1"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <FileText className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <span className="text-sm text-amber-700 font-medium">
                  Sin planilla cargada
                </span>
              </div>
            )}

            {/* Selected file */}
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
                {selectedFile ? 'Cambiar archivo' : 'Seleccionar Planilla'}
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
              Al subir la planilla se actualizará la URL y se intentará avanzar al estado{' '}
              <span className="font-semibold">3.D3 (Validación)</span>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
