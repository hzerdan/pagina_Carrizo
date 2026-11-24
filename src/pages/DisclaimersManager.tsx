import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Search, X, Loader2, FileText, CheckCircle2, AlertCircle, Eye } from 'lucide-react';

export interface DisclaimerTemplate {
  id: number;
  codigo: string;
  titulo: string;
  cuerpo: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

interface FormData {
  id?: number;
  codigo: string;
  titulo: string;
  cuerpo: string;
  activo: boolean;
}

const initialFormData: FormData = {
  codigo: '',
  titulo: '',
  cuerpo: '',
  activo: true,
};

const PLACEHOLDERS = [
  { tag: '{cliente}', label: 'Nombre Cliente' },
  { tag: '{remito}', label: 'Ref Remito' },
  { tag: '{chofer}', label: 'Nombre Chofer' },
  { tag: '{patente}', label: 'Patente Camión' },
  { tag: '{deposito_descarga}', label: 'Destino Descarga' },
  { tag: '{fecha_arribo}', label: 'Fecha Estimada' },
];

export function DisclaimersManager() {
  const [templates, setTemplates] = useState<DisclaimerTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
  };

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('disclaimer_templates')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (err: any) {
      console.error('Error fetching templates:', err);
      showToast('error', 'Error al cargar las plantillas de disclaimer.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenModal = (template?: DisclaimerTemplate) => {
    if (template) {
      setFormData({
        id: template.id,
        codigo: template.codigo || '',
        titulo: template.titulo,
        cuerpo: template.cuerpo,
        activo: template.activo,
      });
    } else {
      setFormData(initialFormData);
    }
    setPreviewMode(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData(initialFormData);
  };

  const insertTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      cuerpo: prev.cuerpo + (prev.cuerpo.endsWith(' ') || prev.cuerpo.endsWith('\n') || prev.cuerpo === '' ? '' : ' ') + tag + ' '
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titulo.trim() || !formData.cuerpo.trim()) {
      showToast('error', 'El título y el cuerpo del disclaimer son obligatorios.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        codigo: formData.codigo.trim() || null,
        titulo: formData.titulo.trim(),
        cuerpo: formData.cuerpo.trim(),
        activo: formData.activo,
        updated_at: new Date().toISOString()
      };

      if (formData.id) {
        const { error } = await supabase
          .from('disclaimer_templates')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
        showToast('success', 'Plantilla actualizada exitosamente.');
      } else {
        const { error } = await supabase
          .from('disclaimer_templates')
          .insert([payload]);
        if (error) throw error;
        showToast('success', 'Plantilla creada exitosamente.');
      }

      handleCloseModal();
      fetchData();
    } catch (err: any) {
      console.error('Error saving template:', err);
      showToast('error', err.message || 'Error al guardar la plantilla.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActivo = async (template: DisclaimerTemplate) => {
    try {
      const { error } = await supabase
        .from('disclaimer_templates')
        .update({ activo: !template.activo, updated_at: new Date().toISOString() })
        .eq('id', template.id);

      if (error) throw error;
      setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, activo: !t.activo } : t));
      showToast('success', `Plantilla ${!template.activo ? 'activada' : 'desactivada'}.`);
    } catch (err: any) {
      console.error('Error toggling template:', err);
      showToast('error', 'Error al cambiar estado.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta plantilla de disclaimer?')) return;
    try {
      const { error } = await supabase
        .from('disclaimer_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setTemplates(prev => prev.filter(t => t.id !== id));
      showToast('success', 'Plantilla eliminada correctamente.');
    } catch (err: any) {
      console.error('Error deleting template:', err);
      showToast('error', 'Error al eliminar plantilla. Podría estar asignada a remitos.');
    }
  };

  const getSimulatedPreview = (text: string) => {
    return text
      .replace(/{cliente}/g, 'MOLINOS CAÑUELAS S.A.')
      .replace(/{remito}/g, 'REM-00045892')
      .replace(/{chofer}/g, 'Carlos Gómez')
      .replace(/{patente}/g, 'AF-321-JK')
      .replace(/{deposito_descarga}/g, 'Planta Cañuelas - Silos 4')
      .replace(/{fecha_arribo}/g, new Date().toLocaleDateString('es-AR', { hour: '2-digit', minute: '2-digit' }));
  };

  const filteredTemplates = templates.filter(t => 
    t.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.codigo && t.codigo.toLowerCase().includes(searchTerm.toLowerCase())) ||
    t.cuerpo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white font-medium transition-all ${
          toastMessage.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Plantillas de Disclaimer</h1>
              <p className="text-sm text-gray-500">
                Gestión de avisos y cláusulas de recepción de mercadería (plazo de reclamo 24hs).
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Plantilla</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
        <Search className="w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por título, código o contenido..."
          className="w-full bg-transparent text-sm focus:outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Grid or Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center items-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mr-3 text-blue-600" />
            <span>Cargando plantillas...</span>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-700">No se encontraron plantillas de disclaimer</p>
            <p className="text-sm text-gray-400 mt-1">Crea una nueva plantilla para usarla en los remitos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="p-4">Título / Identificador</th>
                  <th className="p-4">Código</th>
                  <th className="p-4">Extracto del Cuerpo</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredTemplates.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-gray-900">{t.titulo}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Actualizado: {new Date(t.updated_at).toLocaleDateString('es-AR')}
                      </div>
                    </td>
                    <td className="p-4">
                      {t.codigo ? (
                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                          {t.codigo}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Sin código</span>
                      )}
                    </td>
                    <td className="p-4 max-w-md">
                      <p className="text-gray-600 line-clamp-2 text-xs leading-relaxed">
                        {t.cuerpo}
                      </p>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleToggleActivo(t)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                          t.activo 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' 
                            : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                        }`}
                        title="Click para cambiar estado"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${t.activo ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {t.activo ? 'Activa' : 'Inactiva'}
                      </button>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenModal(t)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Editar plantilla"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Eliminar plantilla"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Alta / Edición */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={handleCloseModal}></div>
          <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-800">
                  {formData.id ? 'Editar Plantilla de Disclaimer' : 'Nueva Plantilla de Disclaimer'}
                </h2>
              </div>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Título de la Plantilla *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Aviso de Arribo y Disclaimer 24hs Granel"
                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Código Identificador
                  </label>
                  <input
                    type="text"
                    placeholder="EJ. DISC_GRANEL"
                    className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>

              {/* Botones de tags / placeholders */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Variables Dinámicas (Haz clic para insertar en el texto):
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewMode(!previewMode)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{previewMode ? 'Ocultar Vista Previa' : 'Ver Vista Previa Simulada'}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map((p) => (
                    <button
                      key={p.tag}
                      type="button"
                      onClick={() => insertTag(p.tag)}
                      className="px-2.5 py-1 text-xs bg-white text-slate-700 border border-slate-200 rounded-md hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition flex items-center gap-1 font-mono shadow-2xs"
                      title={`Insertar ${p.label}`}
                    >
                      <span>{p.tag}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor / Textarea */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Cuerpo del Disclaimer / Correo *
                </label>
                <textarea
                  required
                  rows={9}
                  placeholder="Redacta aquí el mensaje que recibirá el cliente..."
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed font-sans"
                  value={formData.cuerpo}
                  onChange={(e) => setFormData({ ...formData, cuerpo: e.target.value })}
                />
              </div>

              {/* Vista previa si está activada */}
              {previewMode && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-blue-800 font-semibold text-xs uppercase tracking-wider">
                    <Eye className="w-4 h-4" />
                    <span>Vista Previa con Datos Simulados:</span>
                  </div>
                  <div className="bg-white p-3.5 rounded-lg border border-blue-100 text-xs text-gray-800 whitespace-pre-wrap leading-relaxed shadow-2xs font-sans">
                    {getSimulatedPreview(formData.cuerpo) || <span className="text-gray-400 italic">Escribe el cuerpo para ver la simulación...</span>}
                  </div>
                </div>
              )}

              {/* Estado Activo */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="activoCheckbox"
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                />
                <label htmlFor="activoCheckbox" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Plantilla activa para selección en remitos
                </label>
              </div>

              {/* Footer Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{formData.id ? 'Guardar Cambios' : 'Crear Plantilla'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
