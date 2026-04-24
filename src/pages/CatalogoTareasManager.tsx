import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Search, X, Loader2, ClipboardList, ToggleLeft, ToggleRight, Eye, EyeOff, Camera, Bell } from 'lucide-react';
import { cn } from '../lib/utils';

export interface TareaControl {
  id: number;
  tarea_template: string;
  tipo_tarea: string | null;
  orden_sugerido: number | null;
  requiere_foto: boolean | null;
  requiere_aviso: boolean | null;
  estado: string;
}

interface FormData {
  id?: number;
  tarea_template: string;
  tipo_tarea: string;
  orden_sugerido: string;
  requiere_foto: boolean;
  requiere_aviso: boolean;
}

const initialFormData: FormData = {
  tarea_template: '',
  tipo_tarea: '',
  orden_sugerido: '',
  requiere_foto: false,
  requiere_aviso: false,
};

export function CatalogoTareasManager() {
  const [tareas, setTareas] = useState<TareaControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchData();
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('catalogo_tareas_control')
        .select('*')
        .order('orden_sugerido', { ascending: true });

      if (error) throw error;
      setTareas(data || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      showToast('error', 'Error al cargar catálogo de tareas.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (tarea?: TareaControl) => {
    if (tarea) {
      setFormData({
        id: tarea.id,
        tarea_template: tarea.tarea_template,
        tipo_tarea: tarea.tipo_tarea || '',
        orden_sugerido: tarea.orden_sugerido?.toString() || '',
        requiere_foto: !!tarea.requiere_foto,
        requiere_aviso: !!tarea.requiere_aviso,
      });
    } else {
      setFormData(initialFormData);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData(initialFormData);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {
        tarea_template: formData.tarea_template.trim(),
        tipo_tarea: formData.tipo_tarea.trim() || null,
        orden_sugerido: formData.orden_sugerido ? parseInt(formData.orden_sugerido) : null,
        requiere_foto: formData.requiere_foto,
        requiere_aviso: formData.requiere_aviso,
        estado: 'ACTIVO'
      };

      if (formData.id) {
        const { error } = await supabase
          .from('catalogo_tareas_control')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('catalogo_tareas_control')
          .insert([payload]);
        if (error) throw error;
      }

      showToast('success', 'Tarea guardada exitosamente.');
      handleCloseModal();
      fetchData();
    } catch (err: any) {
      console.error('Error saving data:', err);
      showToast('error', 'Error al guardar la tarea.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEstado = async (tarea: TareaControl) => {
    const nuevoEstado = tarea.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      const { error } = await supabase
        .from('catalogo_tareas_control')
        .update({ estado: nuevoEstado })
        .eq('id', tarea.id);
      if (error) throw error;
      showToast('success', `Tarea ${nuevoEstado === 'ACTIVO' ? 'activada' : 'desactivada'} exitosamente.`);
      fetchData();
    } catch (err: any) {
      console.error('Error toggling state:', err);
      showToast('error', 'Error al cambiar el estado de la tarea.');
    }
  };

  const filteredTareas = tareas.filter(t => {
    const matchesSearch = t.tarea_template.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.tipo_tarea?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!showInactive && t.estado === 'INACTIVO') return false;
    return matchesSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-white ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMessage.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Catálogo de Tareas de Control</h1>
        <div className="flex w-full md:w-auto gap-4">
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Buscar por tarea o tipo..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
          </div>
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg border transition text-sm font-medium",
                showInactive 
                    ? "bg-amber-50 border-amber-200 text-amber-700" 
                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
            title={showInactive ? "Ocultar inactivos" : "Mostrar inactivos"}
          >
            {showInactive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{showInactive ? "Ocultar Inactivos" : "Ver Inactivos"}</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-5 h-5" />
            <span>Nueva Tarea</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center items-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mr-2" />
            Cargando...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border-b">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="p-4 font-semibold text-gray-600 w-16 text-center">Orden</th>
                  <th className="p-4 font-semibold text-gray-600">Tarea Template</th>
                  <th className="p-4 font-semibold text-gray-600">Tipo de Tarea</th>
                  <th className="p-4 font-semibold text-gray-600 text-center">Foto</th>
                  <th className="p-4 font-semibold text-gray-600 text-center">Aviso</th>
                  <th className="p-4 font-semibold text-gray-600">Estado</th>
                  <th className="p-4 font-semibold text-gray-600 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTareas.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-center font-mono text-gray-600">{t.orden_sugerido || '-'}</td>
                    <td className="p-4 font-medium text-gray-900">{t.tarea_template}</td>
                    <td className="p-4 text-gray-600">
                        {t.tipo_tarea ? (
                            <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium uppercase text-gray-600">
                                {t.tipo_tarea}
                            </span>
                        ) : '-'}
                    </td>
                    <td className="p-4 text-center">
                        {t.requiere_foto ? <Camera className="w-5 h-5 text-blue-500 mx-auto" /> : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="p-4 text-center">
                        {t.requiere_aviso ? <Bell className="w-5 h-5 text-amber-500 mx-auto" /> : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleToggleEstado(t)}
                        className="group flex items-center gap-2 cursor-pointer"
                        title={t.estado === 'ACTIVO' ? 'Clic para desactivar' : 'Clic para activar'}
                      >
                        {t.estado === 'ACTIVO' ? (
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
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(t)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Editar"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleToggleEstado(t)}
                          className={cn(
                            "p-2 rounded-lg transition",
                            t.estado === 'ACTIVO' ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"
                          )}
                          title={t.estado === 'ACTIVO' ? "Dar de baja" : "Dar de alta"}
                        >
                          {t.estado === 'ACTIVO' ? <Trash2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredTareas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      No se encontraron tareas registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="fixed inset-0 bg-black/50" onClick={handleCloseModal}></div>
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col z-50 animate-in slide-in-from-right">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-800">
                    {formData.id ? 'Editar Tarea' : 'Nueva Tarea de Control'}
                </h2>
              </div>
              <button onClick={handleCloseModal} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <form id="tareaForm" onSubmit={handleSave} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tarea Template *</label>
                    <textarea
                        required
                        placeholder="Ej: Verificar precinto de seguridad..."
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                        value={formData.tarea_template}
                        onChange={(e) => setFormData({...formData, tarea_template: e.target.value})}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Tarea</label>
                        <input
                            type="text"
                            placeholder="Ej: Seguridad, Calidad..."
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.tipo_tarea}
                            onChange={(e) => setFormData({...formData, tipo_tarea: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Orden Sugerido</label>
                        <input
                            type="number"
                            placeholder="Ej: 10"
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.orden_sugerido}
                            onChange={(e) => setFormData({...formData, orden_sugerido: e.target.value})}
                        />
                    </div>
                </div>

                <div className="space-y-3 bg-gray-50 p-4 rounded-xl border">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Requerimientos de Tarea</h3>
                    
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={cn(
                            "w-10 h-6 rounded-full transition-colors relative",
                            formData.requiere_foto ? "bg-blue-600" : "bg-gray-300"
                        )}>
                            <div className={cn(
                                "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform",
                                formData.requiere_foto ? "translate-x-4" : "translate-x-0"
                            )} />
                        </div>
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={formData.requiere_foto}
                            onChange={(e) => setFormData({...formData, requiere_foto: e.target.checked})}
                        />
                        <div className="flex items-center gap-2">
                            <Camera className={cn("w-4 h-4", formData.requiere_foto ? "text-blue-600" : "text-gray-400")} />
                            <span className="text-sm text-gray-700 group-hover:text-gray-900 transition">Requiere captura de foto</span>
                        </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={cn(
                            "w-10 h-6 rounded-full transition-colors relative",
                            formData.requiere_aviso ? "bg-amber-500" : "bg-gray-300"
                        )}>
                            <div className={cn(
                                "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform",
                                formData.requiere_aviso ? "translate-x-4" : "translate-x-0"
                            )} />
                        </div>
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={formData.requiere_aviso}
                            onChange={(e) => setFormData({...formData, requiere_aviso: e.target.checked})}
                        />
                        <div className="flex items-center gap-2">
                            <Bell className={cn("w-4 h-4", formData.requiere_aviso ? "text-amber-600" : "text-gray-400")} />
                            <span className="text-sm text-gray-700 group-hover:text-gray-900 transition">Requiere aviso/notificación</span>
                        </div>
                    </label>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 transition"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="tareaForm"
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-md disabled:opacity-50"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Guardar Tarea</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
