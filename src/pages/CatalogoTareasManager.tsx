import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Search, X, Loader2, ClipboardList, ToggleLeft, ToggleRight, Eye, EyeOff, Camera, Bell, Clock, Sliders } from 'lucide-react';
import { cn } from '../lib/utils';

export interface TareaControl {
  id: number;
  tarea_template: string;
  tipo_tarea: string | null;
  orden_sugerido: number | null;
  requiere_foto: boolean | null;
  requiere_aviso: boolean | null;
  estado: string;
  estado_id: number | null;
  tipo_dato_esperado: string | null;
  mensaje_template: string | null;
  gracia_minutos_default: number | null;
  reintentos_max_default: number | null;
  // Joins
  mision_estados_definicion?: {
    codigo: string;
    nombre: string;
  } | null;
}

interface FormData {
  id?: number;
  tarea_template: string;
  tipo_tarea: string;
  orden_sugerido: string;
  requiere_foto: boolean;
  requiere_aviso: boolean;
  estado_id: string;
  tipo_dato_esperado: string;
  mensaje_template: string;
  gracia_minutos_default: string;
  reintentos_max_default: string;
}

const initialFormData: FormData = {
  tarea_template: '',
  tipo_tarea: 'CONTROL_GENERAL',
  orden_sugerido: '',
  requiere_foto: false,
  requiere_aviso: false,
  estado_id: '',
  tipo_dato_esperado: 'check',
  mensaje_template: '',
  gracia_minutos_default: '30',
  reintentos_max_default: '2',
};

export function CatalogoTareasManager() {
  const [tareas, setTareas] = useState<TareaControl[]>([]);
  const [estados, setEstados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [selectedEstadoFilter, setSelectedEstadoFilter] = useState<string>('todos');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch tasks with joined state code and name
      const { data: tareasData, error: tareasError } = await supabase
        .from('catalogo_tareas_control')
        .select('*, mision_estados_definicion(codigo, nombre)')
        .order('orden_sugerido', { ascending: true });

      if (tareasError) throw tareasError;
      setTareas(tareasData || []);

      // Fetch active FSM states for select dropdowns
      const { data: estadosData, error: estadosError } = await supabase
        .from('mision_estados_definicion')
        .select('*')
        .eq('estado', 'ACTIVO')
        .order('orden_logistico_default', { ascending: true });

      if (estadosError) throw estadosError;
      setEstados(estadosData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      showToast('error', 'Error al cargar catálogo de tareas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
  };

  const handleOpenModal = (tarea?: TareaControl) => {
    if (tarea) {
      setFormData({
        id: tarea.id,
        tarea_template: tarea.tarea_template,
        tipo_tarea: tarea.tipo_tarea || 'CONTROL_GENERAL',
        orden_sugerido: tarea.orden_sugerido?.toString() || '',
        requiere_foto: !!tarea.requiere_foto,
        requiere_aviso: !!tarea.requiere_aviso,
        estado_id: tarea.estado_id?.toString() || '',
        tipo_dato_esperado: tarea.tipo_dato_esperado || 'check',
        mensaje_template: tarea.mensaje_template || '',
        gracia_minutos_default: tarea.gracia_minutos_default?.toString() || '30',
        reintentos_max_default: tarea.reintentos_max_default?.toString() || '2',
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
        estado_id: formData.estado_id ? parseInt(formData.estado_id) : null,
        tipo_dato_esperado: formData.tipo_dato_esperado,
        mensaje_template: formData.mensaje_template.trim() || null,
        gracia_minutos_default: formData.gracia_minutos_default ? parseInt(formData.gracia_minutos_default) : null,
        reintentos_max_default: formData.reintentos_max_default ? parseInt(formData.reintentos_max_default) : null,
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
    } catch (err) {
      console.error('Error saving data:', err);
      showToast('error', 'Error al guardar la tarea.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEstado = async (tarea: TareaControl) => {
    const nuevoEstado = tarea.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    
    if (tarea.estado === 'ACTIVO') {
      const confirmDeactivate = window.confirm(`¿Estás seguro de que quieres desactivar la tarea "${tarea.tarea_template}"?`);
      if (!confirmDeactivate) return;
    }

    try {
      const { error } = await supabase
        .from('catalogo_tareas_control')
        .update({ estado: nuevoEstado })
        .eq('id', tarea.id);
      if (error) throw error;
      showToast('success', `Tarea ${nuevoEstado === 'ACTIVO' ? 'activada' : 'desactivada'} exitosamente.`);
      fetchData();
    } catch (err) {
      console.error('Error toggling state:', err);
      showToast('error', 'Error al cambiar el estado de la tarea.');
    }
  };

  const filteredTareas = tareas.filter(t => {
    const matchesSearch = t.tarea_template.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.tipo_tarea && t.tipo_tarea.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.mision_estados_definicion?.nombre && t.mision_estados_definicion.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesEstadoFilter = selectedEstadoFilter === 'todos' || t.estado_id?.toString() === selectedEstadoFilter;
    
    if (!showInactive && t.estado === 'INACTIVO') return false;
    return matchesSearch && matchesEstadoFilter;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toastMessage && (
        <div className={cn(
          "fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-white font-semibold transition-all duration-300 transform translate-y-0",
          toastMessage.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        )}>
          {toastMessage.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Catálogo de Tareas de Control</h1>
          <p className="text-sm text-gray-500">Definición de tareas asociadas a cada hito lógico del viaje</p>
        </div>
        <div className="flex flex-col md:flex-row w-full md:w-auto gap-3">
          {/* Filtro por Estado (Hito FSM) */}
          <div className="relative w-full md:w-56">
            <select
              value={selectedEstadoFilter}
              onChange={(e) => setSelectedEstadoFilter(e.target.value)}
              className="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm text-gray-700 font-semibold cursor-pointer"
            >
              <option value="todos">Todos los Estados (Hitos)</option>
              {estados.map(est => (
                <option key={`filt-${est.id}`} value={est.id}>{est.nombre}</option>
              ))}
            </select>
          </div>

          <div className="relative w-full md:w-60">
            <input
              type="text"
              placeholder="Buscar por tarea o tipo..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>

          <button
            onClick={() => setShowInactive(!showInactive)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border transition text-sm font-medium cursor-pointer shrink-0",
              showInactive 
                ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100" 
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
            title={showInactive ? "Ocultar inactivos" : "Mostrar inactivos"}
          >
            {showInactive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{showInactive ? "Ocultar Inactivos" : "Ver Inactivos"}</span>
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer font-semibold shadow-xs shrink-0"
          >
            <Plus className="w-5 h-5" />
            <span>Nueva Tarea</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 font-bold text-gray-500 text-xs w-16 text-center uppercase tracking-wider">Orden</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider">Hito / Estado FSM</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider">Tarea Template</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider">Tipo Dato</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider w-16 text-center">Foto</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider w-16 text-center">Aviso</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider w-36 text-center">Estado</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider w-28 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    <div className="flex justify-center items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      <span>Cargando catálogo...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTareas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    No se encontraron tareas registradas en este filtro.
                  </td>
                </tr>
              ) : (
                filteredTareas.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 text-center font-mono text-gray-600 font-bold">{t.orden_sugerido || '-'}</td>
                    <td className="p-4">
                      {t.mision_estados_definicion ? (
                        <div>
                          <div className="font-semibold text-gray-800 text-xs">{t.mision_estados_definicion.nombre}</div>
                          <div className="font-mono text-[9px] text-gray-400 uppercase">{t.mision_estados_definicion.codigo}</div>
                        </div>
                      ) : (
                        <span className="italic text-gray-300 text-xs">Sin asignar</span>
                      )}
                    </td>
                    <td className="p-4 font-medium text-gray-900 max-w-xs truncate" title={t.tarea_template}>{t.tarea_template}</td>
                    <td className="p-4 text-xs font-mono text-gray-600 uppercase">
                      <span className={cn(
                        "px-2 py-0.5 rounded font-bold border",
                        t.tipo_dato_esperado === 'imagen' ? "bg-purple-50 text-purple-700 border-purple-200" :
                        t.tipo_dato_esperado === 'numero' ? "bg-amber-50 text-amber-700 border-amber-200" :
                        "bg-blue-50 text-blue-700 border-blue-200"
                      )}>
                        {t.tipo_dato_esperado || 'check'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {t.requiere_foto ? <Camera className="w-4 h-4 text-blue-500 mx-auto" /> : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="p-4 text-center">
                      {t.requiere_aviso ? <Bell className="w-4 h-4 text-amber-500 mx-auto" /> : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleToggleEstado(t)}
                        className="group inline-flex items-center gap-2 cursor-pointer focus:outline-none"
                        title={t.estado === 'ACTIVO' ? 'Clic para desactivar' : 'Clic para activar'}
                      >
                        {t.estado === 'ACTIVO' ? (
                          <>
                            <ToggleRight className="w-6 h-6 text-emerald-500 group-hover:text-emerald-600 transition" />
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              Activo
                            </span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-6 h-6 text-gray-400 group-hover:text-gray-500 transition" />
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
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
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleEstado(t)}
                          className={cn(
                            "p-2 rounded-lg transition cursor-pointer",
                            t.estado === 'ACTIVO' ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"
                          )}
                          title={t.estado === 'ACTIVO' ? "Dar de baja" : "Dar de alta"}
                        >
                          {t.estado === 'ACTIVO' ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="fixed inset-0 bg-black/50" onClick={handleCloseModal}></div>
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col z-50 animate-in slide-in-from-right duration-250">
            <div className="flex items-center justify-between p-6 border-b bg-gray-50">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-800">
                  {formData.id ? 'Editar Tarea' : 'Nueva Tarea de Control'}
                </h2>
              </div>
              <button onClick={handleCloseModal} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <form id="tareaForm" onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Hito / Estado FSM Asociado *</label>
                  <select
                    required
                    value={formData.estado_id}
                    onChange={(e) => setFormData({...formData, estado_id: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                  >
                    <option value="">Seleccionar hito...</option>
                    {estados.map(est => (
                      <option key={`drop-${est.id}`} value={est.id}>{est.nombre} ({est.codigo})</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">Hito del Road Map del viaje en el que se solicitará esta tarea.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Tarea Template *</label>
                  <textarea
                    required
                    placeholder="Ej. Verificar precinto de seguridad trasero..."
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] bg-white text-sm"
                    value={formData.tarea_template}
                    onChange={(e) => setFormData({...formData, tarea_template: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Tipo de Tarea</label>
                    <select
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                      value={formData.tipo_tarea}
                      onChange={(e) => setFormData({...formData, tipo_tarea: e.target.value})}
                    >
                      <option value="CONTROL_GENERAL">Control General / Checklist</option>
                      <option value="PESAJE_TARA">Pesaje Tara (Vacío)</option>
                      <option value="PESAJE_BRUTO">Pesaje Bruto (Lleno)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Orden Sugerido</label>
                    <input
                      type="number"
                      placeholder="Ej. 10"
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                      value={formData.orden_sugerido}
                      onChange={(e) => setFormData({...formData, orden_sugerido: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Dato Esperado *</label>
                    <select
                      required
                      value={formData.tipo_dato_esperado}
                      onChange={(e) => setFormData({...formData, tipo_dato_esperado: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                    >
                      <option value="check">Check de Realizado (Sí/No)</option>
                      <option value="numero">Valor Numérico (Pesaje)</option>
                      <option value="imagen">Captura de Imagen / Evidencia</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Template de Mensaje (Bot WhatsApp)</label>
                  <textarea
                    placeholder="Ej. Por favor chofer, envíe una foto del ticket de pesaje tara..."
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] bg-white text-sm"
                    value={formData.mensaje_template}
                    onChange={(e) => setFormData({...formData, mensaje_template: e.target.value})}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">El mensaje exacto que el Bot de WhatsApp enviará al chofer para solicitar el cumplimiento de esta tarea.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      Minutos Gracia por Defecto
                    </label>
                    <input
                      type="number"
                      placeholder="Ej. 30"
                      min={0}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-bold"
                      value={formData.gracia_minutos_default}
                      onChange={(e) => setFormData({...formData, gracia_minutos_default: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                      <Sliders className="w-3.5 h-3.5 text-gray-400" />
                      Reintentos Max. por Defecto
                    </label>
                    <input
                      type="number"
                      placeholder="Ej. 2"
                      min={0}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-bold"
                      value={formData.reintentos_max_default}
                      onChange={(e) => setFormData({...formData, reintentos_max_default: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-3 bg-gray-50 p-4 rounded-xl border">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">Requerimientos Adicionales</h3>
                  
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
                      <span className="text-xs text-gray-700 group-hover:text-gray-900 transition">Requiere captura de foto</span>
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
                      <span className="text-xs text-gray-700 group-hover:text-gray-900 transition">Requiere aviso/notificación</span>
                    </div>
                  </label>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 transition cursor-pointer text-sm font-bold bg-white"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="tareaForm"
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-xs disabled:opacity-50 cursor-pointer text-sm font-bold"
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
