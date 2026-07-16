import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Search, X, Loader2, ToggleLeft, ToggleRight, Eye, EyeOff, ClipboardList } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MisionEstadoDef {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden_logistico_default: number;
  estado: string;
}

interface FormData {
  id?: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  orden_logistico_default: string;
}

const initialFormData: FormData = {
  codigo: '',
  nombre: '',
  descripcion: '',
  orden_logistico_default: '',
};

export function MisionEstadosManager() {
  const [estados, setEstados] = useState<MisionEstadoDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('mision_estados_definicion')
        .select('*')
        .order('orden_logistico_default', { ascending: true });

      if (error) throw error;
      setEstados(data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      showToast('error', 'Error al cargar los estados de misión.');
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

  const handleOpenModal = (estado?: MisionEstadoDef) => {
    setValidationError(null);
    if (estado) {
      setFormData({
        id: estado.id,
        codigo: estado.codigo,
        nombre: estado.nombre,
        descripcion: estado.descripcion || '',
        orden_logistico_default: estado.orden_logistico_default.toString(),
      });
    } else {
      setFormData(initialFormData);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData(initialFormData);
    setValidationError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    
    const formattedCodigo = formData.codigo.trim().toUpperCase().replace(/\s+/g, '_');
    
    if (!formattedCodigo) {
      setValidationError('El código es obligatorio.');
      return;
    }

    // Check duplicate code locally
    const isDuplicate = estados.some(
      est => est.codigo === formattedCodigo && est.id !== formData.id
    );
    if (isDuplicate) {
      setValidationError(`Ya existe un estado con el código "${formattedCodigo}".`);
      return;
    }

    try {
      setSaving(true);
      const payload = {
        codigo: formattedCodigo,
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim() || null,
        orden_logistico_default: parseInt(formData.orden_logistico_default) || 0,
        estado: 'ACTIVO'
      };

      if (formData.id) {
        const { error } = await supabase
          .from('mision_estados_definicion')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('mision_estados_definicion')
          .insert([payload]);
        if (error) throw error;
      }

      showToast('success', 'Estado guardado exitosamente.');
      handleCloseModal();
      fetchData();
    } catch (err: any) {
      console.error('Error saving data:', err);
      showToast('error', 'Error al guardar el estado: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEstado = async (estado: MisionEstadoDef) => {
    const nuevoEstado = estado.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    
    if (estado.estado === 'ACTIVO') {
      const confirmDeactivate = window.confirm(`¿Estás seguro de que quieres desactivar el estado "${estado.nombre}"?`);
      if (!confirmDeactivate) return;
    }

    try {
      const { error } = await supabase
        .from('mision_estados_definicion')
        .update({ estado: nuevoEstado })
        .eq('id', estado.id);
      if (error) throw error;
      showToast('success', `Estado ${nuevoEstado === 'ACTIVO' ? 'activado' : 'desactivado'} exitosamente.`);
      fetchData();
    } catch (err: any) {
      console.error('Error toggling state:', err);
      showToast('error', 'Error al cambiar el estado: ' + err.message);
    }
  };

  const filteredEstados = estados.filter(est => {
    const matchesSearch = est.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      est.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (est.descripcion && est.descripcion.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!showInactive && est.estado === 'INACTIVO') return false;
    return matchesSearch;
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
          <h1 className="text-2xl font-bold text-gray-800">Estados de Misión</h1>
          <p className="text-sm text-gray-500">Definición maestra de estados de viaje para el motor FSM</p>
        </div>
        <div className="flex w-full md:w-auto gap-4">
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
          </div>
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border transition text-sm font-medium cursor-pointer",
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer font-semibold shadow-xs"
          >
            <Plus className="w-5 h-5" />
            <span>Nuevo Estado</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider w-24 text-center">Orden Def.</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider">Código (FSM)</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider">Nombre</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider">Descripción</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider w-36 text-center">Estado</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider w-28 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    <div className="flex justify-center items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      <span>Cargando estados...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredEstados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No se encontraron estados de misión registrados.
                  </td>
                </tr>
              ) : (
                filteredEstados.map((est) => (
                  <tr key={est.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 text-center font-mono text-gray-700 font-bold">{est.orden_logistico_default}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-800 rounded font-mono text-xs font-bold border">
                        {est.codigo}
                      </span>
                    </td>
                    <td className="p-4 font-semibold text-gray-900">{est.nombre}</td>
                    <td className="p-4 text-sm text-gray-500 max-w-xs truncate" title={est.descripcion || ''}>
                      {est.descripcion || <span className="italic text-gray-300">Sin descripción</span>}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleToggleEstado(est)}
                        className="group inline-flex items-center gap-2 cursor-pointer focus:outline-none"
                        title={est.estado === 'ACTIVO' ? 'Clic para desactivar' : 'Clic para activar'}
                      >
                        {est.estado === 'ACTIVO' ? (
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
                          onClick={() => handleOpenModal(est)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleEstado(est)}
                          className={cn(
                            "p-2 rounded-lg transition cursor-pointer",
                            est.estado === 'ACTIVO' ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"
                          )}
                          title={est.estado === 'ACTIVO' ? "Dar de baja" : "Dar de alta"}
                        >
                          {est.estado === 'ACTIVO' ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
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
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-50 animate-in slide-in-from-right duration-250">
            <div className="flex items-center justify-between p-6 border-b bg-gray-50">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-800">
                  {formData.id ? 'Editar Estado' : 'Nuevo Estado de Misión'}
                </h2>
              </div>
              <button onClick={handleCloseModal} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {validationError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold">
                  ⚠️ {validationError}
                </div>
              )}

              <form id="estadoDefForm" onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Código (Único, Mayúsculas) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. ESPERANDO_PAPELES"
                    disabled={!!formData.id} // Los códigos FSM se bloquean tras la creación
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-mono text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                    value={formData.codigo}
                    onChange={(e) => setFormData({...formData, codigo: e.target.value})}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Identificador lógico usado por el motor FSM (ej. PESAJE_TARA).</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Nombre legible *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Confirmación de Papeles"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                    value={formData.nombre}
                    onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Orden Logístico por Defecto *</label>
                  <input
                    type="number"
                    required
                    placeholder="Ej. 10"
                    min={0}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                    value={formData.orden_logistico_default}
                    onChange={(e) => setFormData({...formData, orden_logistico_default: e.target.value})}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Secuencia lógica sugerida para ordenar este estado en las listas.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                  <textarea
                    placeholder="Describa brevemente el propósito de este estado..."
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] bg-white text-sm"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                  />
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
                form="estadoDefForm"
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-xs disabled:opacity-50 cursor-pointer text-sm font-bold"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Guardar Estado</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
