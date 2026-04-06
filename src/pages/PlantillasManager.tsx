import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Search, X, Loader2, Upload, ExternalLink, FileText, ToggleLeft, ToggleRight } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────

interface InspeccionTemplate {
  id: number;
  codigo: string;
  nombre: string;
  archivo_url: string;
  activo: boolean;
  updated_at: string;
}

interface FormData {
  id?: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  archivo_url: string;
}

const initialFormData: FormData = {
  codigo: '',
  nombre: '',
  activo: true,
  archivo_url: '',
};

const STORAGE_BUCKET = 'templates';
const ACCEPTED_FILE_TYPES = '.pdf,.xlsx,.xls,.txt';

// ── Helper: extract storage path from a public URL ─────────────────────
function extractStoragePath(publicUrl: string): string | null {
  try {
    const marker = `/object/public/${STORAGE_BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(publicUrl.substring(idx + marker.length));
  } catch {
    return null;
  }
}

// ── Component ──────────────────────────────────────────────────────────

export function PlantillasManager() {
  const [templates, setTemplates] = useState<InspeccionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Toast auto-dismiss ───────────────────────────────────────────────
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // ── Initial fetch ────────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
  };

  // ── Fetch all templates ──────────────────────────────────────────────
  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('inspeccion_templates')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      showToast('error', 'Error al cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  };

  // ── Open / close modal ──────────────────────────────────────────────
  const handleOpenModal = (tpl?: InspeccionTemplate) => {
    if (tpl) {
      setFormData({
        id: tpl.id,
        codigo: tpl.codigo,
        nombre: tpl.nombre,
        activo: tpl.activo,
        archivo_url: tpl.archivo_url,
      });
    } else {
      setFormData(initialFormData);
    }
    setSelectedFile(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData(initialFormData);
    setSelectedFile(null);
  };

  // ── File selection ──────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  // ── Upload file to Supabase Storage ─────────────────────────────────
  const uploadFile = async (file: File, codigo: string): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const timestamp = Date.now();
    const storagePath = `${codigo}_${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return urlData.publicUrl;
  };

  // ── Delete old file from Storage ────────────────────────────────────
  const deleteOldFile = async (publicUrl: string) => {
    const path = extractStoragePath(publicUrl);
    if (!path) return;
    try {
      await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    } catch (err) {
      console.warn('Could not remove old file from Storage:', err);
    }
  };

  // ── Save (create / update) ─────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation: new template needs a file
    if (!formData.id && !selectedFile) {
      showToast('error', 'Debe seleccionar un archivo de plantilla.');
      return;
    }

    try {
      setSaving(true);

      let archivoUrl = formData.archivo_url;

      // ── Handle file upload ──────────────────────────────────────
      if (selectedFile) {
        setUploading(true);

        // If editing & replacing the file → delete old one
        if (formData.id && formData.archivo_url) {
          await deleteOldFile(formData.archivo_url);
        }

        archivoUrl = await uploadFile(selectedFile, formData.codigo);
        setUploading(false);
      }

      // ── Build DB payload ────────────────────────────────────────
      const payload = {
        codigo: formData.codigo.trim().toUpperCase(),
        nombre: formData.nombre.trim(),
        activo: formData.activo,
        archivo_url: archivoUrl,
      };

      if (formData.id) {
        const { error } = await supabase
          .from('inspeccion_templates')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('inspeccion_templates')
          .insert([payload]);
        if (error) throw error;
      }

      showToast('success', 'Plantilla guardada exitosamente.');
      handleCloseModal();
      fetchData();
    } catch (err: any) {
      console.error('Error saving template:', err);
      const isDuplicate =
        err?.message?.includes('duplicate') ||
        err?.message?.includes('unique') ||
        err?.code === '23505';
      showToast(
        'error',
        isDuplicate
          ? 'El código de plantilla ya existe. Use un código diferente.'
          : `Error al guardar la plantilla: ${err.message || 'Error desconocido'}`
      );
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // ── Toggle active/inactive inline ──────────────────────────────────
  const handleToggleActivo = async (tpl: InspeccionTemplate) => {
    try {
      const { error } = await supabase
        .from('inspeccion_templates')
        .update({ activo: !tpl.activo })
        .eq('id', tpl.id);
      if (error) throw error;
      showToast('success', `Plantilla ${!tpl.activo ? 'activada' : 'desactivada'}.`);
      fetchData();
    } catch (err: any) {
      console.error('Error toggling template:', err);
      showToast('error', 'Error al cambiar el estado de la plantilla.');
    }
  };

  // ── Filtered list ──────────────────────────────────────────────────
  const filteredTemplates = templates.filter(
    (t) =>
      t.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ── File icon helper ───────────────────────────────────────────────
  const fileExtension = (url: string): string => {
    try {
      const parts = url.split('.');
      return parts[parts.length - 1]?.toUpperCase() || '?';
    } catch {
      return '?';
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600'
              : 'bg-red-600'
          }`}
        >
          {toastMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Plantillas Documentales</h1>
          <p className="text-sm text-gray-500 mt-1">
            Administración de plantillas para inspecciones y controles.
          </p>
        </div>
        <div className="flex w-full md:w-auto gap-3">
          <div className="relative w-full md:w-64">
            <input
              id="search-templates"
              type="text"
              placeholder="Buscar por código o nombre..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>
          <button
            id="btn-new-template"
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition whitespace-nowrap text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Plantilla</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center items-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mr-3" />
            Cargando plantillas...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="p-4 font-semibold text-gray-600 text-sm">Código</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm">Nombre</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm">Estado</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm">Archivo</th>
                  <th className="p-4 font-semibold text-gray-600 text-sm text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((tpl) => (
                  <tr key={tpl.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-mono text-sm font-medium text-gray-900">{tpl.codigo}</td>
                    <td className="p-4 text-sm text-gray-700">{tpl.nombre}</td>
                    <td className="p-4">
                      <button
                        onClick={() => handleToggleActivo(tpl)}
                        className="group flex items-center gap-2 cursor-pointer"
                        title={tpl.activo ? 'Clic para desactivar' : 'Clic para activar'}
                      >
                        {tpl.activo ? (
                          <>
                            <ToggleRight className="w-6 h-6 text-emerald-500 group-hover:text-emerald-600 transition" />
                            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              Activo
                            </span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-6 h-6 text-gray-400 group-hover:text-gray-500 transition" />
                            <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              Inactivo
                            </span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="p-4">
                      <a
                        href={tpl.archivo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 hover:underline font-medium transition"
                        title="Previsualizar archivo"
                      >
                        <FileText className="w-4 h-4" />
                        <span>{fileExtension(tpl.archivo_url)}</span>
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleOpenModal(tpl)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="Editar plantilla"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredTemplates.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-gray-500">
                      <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No se encontraron plantillas.</p>
                      <p className="text-sm mt-1">Haga clic en "Nueva Plantilla" para crear una.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Slide-in Panel (Modal) ──────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="fixed inset-0 bg-black/50" onClick={handleCloseModal}></div>
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-50 animate-in slide-in-from-right">
            {/* Panel header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">
                {formData.id ? 'Editar Plantilla' : 'Nueva Plantilla'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Panel body */}
            <div className="p-6 overflow-y-auto flex-1">
              <form id="templateForm" onSubmit={handleSave} className="space-y-5">
                {/* Código */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código *
                  </label>
                  <input
                    id="input-codigo"
                    type="text"
                    required
                    placeholder="Ej: TEMP_BOLSAS_V1"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                    value={formData.codigo}
                    onChange={(e) =>
                      setFormData({ ...formData, codigo: e.target.value.toUpperCase().replace(/\s/g, '_') })
                    }
                    disabled={!!formData.id} // Código is immutable on edit
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.id
                      ? 'El código no es editable una vez creado.'
                      : 'Debe ser único. Se convierte a mayúsculas automáticamente.'}
                  </p>
                </div>

                {/* Nombre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre *
                  </label>
                  <input
                    id="input-nombre"
                    type="text"
                    required
                    placeholder="Ej: Planilla de Control de Carga - Bolsas"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  />
                </div>

                {/* Activo toggle */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
                  <button
                    type="button"
                    id="toggle-activo"
                    onClick={() => setFormData({ ...formData, activo: !formData.activo })}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition w-full ${
                      formData.activo
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                    }`}
                  >
                    {formData.activo ? (
                      <ToggleRight className="w-6 h-6 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-gray-400" />
                    )}
                    <span className="text-sm font-medium">
                      {formData.activo ? 'Activo — Disponible para inspecciones' : 'Inactivo — No visible en inspecciones'}
                    </span>
                  </button>
                </div>

                {/* File upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Archivo de Plantilla {!formData.id && '*'}
                  </label>

                  {/* Current file indicator (edit mode) */}
                  {formData.id && formData.archivo_url && !selectedFile && (
                    <div className="flex items-center gap-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                      <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="text-blue-700 truncate flex-1">
                        Archivo actual: <strong>{fileExtension(formData.archivo_url)}</strong>
                      </span>
                      <a
                        href={formData.archivo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  )}

                  {/* Selected file indicator */}
                  {selectedFile && (
                    <div className="flex items-center gap-2 mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
                      <FileText className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span className="text-emerald-700 truncate flex-1">
                        {selectedFile.name}{' '}
                        <span className="text-emerald-500">
                          ({(selectedFile.size / 1024).toFixed(0)} KB)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="text-emerald-600 hover:text-emerald-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Upload button */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    id="btn-upload-file"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 w-full justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/30 transition"
                  >
                    <Upload className="w-4 h-4" />
                    {selectedFile ? 'Cambiar archivo' : 'Subir Archivo de Plantilla'}
                  </button>
                  <p className="text-xs text-gray-500 mt-1.5">
                    Formatos aceptados: PDF, XLSX, XLS, TXT
                  </p>
                </div>
              </form>
            </div>

            {/* Panel footer */}
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 transition text-sm"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="templateForm"
                id="btn-save-template"
                className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition disabled:opacity-50 text-sm font-medium"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {uploading ? 'Subiendo archivo...' : 'Guardando...'}
                  </>
                ) : (
                  <span>Guardar Plantilla</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
