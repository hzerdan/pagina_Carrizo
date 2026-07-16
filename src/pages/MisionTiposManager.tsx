import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Search, X, Loader2, ToggleLeft, ToggleRight, Eye, EyeOff, Layers, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../lib/utils';
import type { MisionEstadoDef } from './MisionEstadosManager';

export interface MisionTipo {
  id: number;
  nombre: string;
  descripcion: string | null;
  estado: string;
}

export interface MisionTipoPaso {
  tipo_mision_id: number;
  estado_id: number;
  orden_especifico: number;
  // Joins
  mision_estados_definicion?: {
    codigo: string;
    nombre: string;
  };
}

interface LocalPaso {
  estado_id: number;
  codigo: string;
  nombre: string;
  orden_especifico: number;
}

interface FormData {
  id?: number;
  nombre: string;
  descripcion: string;
}

const initialFormData: FormData = {
  nombre: '',
  descripcion: '',
};

export function MisionTiposManager() {
  const [tipos, setTipos] = useState<MisionTipo[]>([]);
  const [estados, setEstados] = useState<MisionEstadoDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [localPasos, setLocalPasos] = useState<LocalPaso[]>([]);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form paso input
  const [selectedEstadoId, setSelectedEstadoId] = useState<string>('');
  const [pasoOrden, setPasoOrden] = useState<string>('');
  
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch mission types
      const { data: tiposData, error: tiposError } = await supabase
        .from('mision_tipos')
        .select('*')
        .order('nombre', { ascending: true });

      if (tiposError) throw tiposError;
      setTipos(tiposData || []);

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
      showToast('error', 'Error al cargar los tipos de misiones.');
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

  const handleOpenModal = async (tipo?: MisionTipo) => {
    setValidationError(null);
    setSelectedEstadoId('');
    setPasoOrden('');

    if (tipo) {
      setFormData({
        id: tipo.id,
        nombre: tipo.nombre,
        descripcion: tipo.descripcion || '',
      });

      // Fetch steps for this type
      try {
        const { data: pasosData, error: pasosError } = await supabase
          .from('mision_tipo_pasos')
          .select('*, mision_estados_definicion(codigo, nombre)')
          .eq('tipo_mision_id', tipo.id)
          .order('orden_especifico', { ascending: true });

        if (pasosError) throw pasosError;
        
        const mappedPasos: LocalPaso[] = (pasosData || []).map(p => ({
          estado_id: p.estado_id,
          codigo: p.mision_estados_definicion?.codigo || '',
          nombre: p.mision_estados_definicion?.nombre || `Estado #${p.estado_id}`,
          orden_especifico: p.orden_especifico
        }));
        setLocalPasos(mappedPasos);
      } catch (err) {
        console.error('Error fetching steps:', err);
        showToast('error', 'Error al cargar los pasos del tipo de misión.');
        setLocalPasos([]);
      }
    } else {
      setFormData(initialFormData);
      setLocalPasos([]);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData(initialFormData);
    setLocalPasos([]);
    setValidationError(null);
  };

  const handleAddPaso = () => {
    if (!selectedEstadoId) return;
    const estId = parseInt(selectedEstadoId);
    
    // Check duplicate
    if (localPasos.some(p => p.estado_id === estId)) {
      alert('Este estado ya forma parte de los pasos de la misión.');
      return;
    }

    const matchedEst = estados.find(e => e.id === estId);
    if (!matchedEst) return;

    const ord = pasoOrden ? parseInt(pasoOrden) : (localPasos.length + 1) * 10;

    const newPaso: LocalPaso = {
      estado_id: estId,
      codigo: matchedEst.codigo,
      nombre: matchedEst.nombre,
      orden_especifico: ord
    };

    const updated = [...localPasos, newPaso].sort((a, b) => a.orden_especifico - b.orden_especifico);
    setLocalPasos(updated);
    setSelectedEstadoId('');
    setPasoOrden('');
  };

  const handleRemovePaso = (estadoId: number) => {
    const updated = localPasos.filter(p => p.estado_id !== estadoId);
    setLocalPasos(updated);
  };

  const handleMovePaso = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === localPasos.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...localPasos];
    
    // Swap steps
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;

    // Recalculate order_especifico sequentially (e.g. 10, 20, 30...)
    const reordered = updated.map((p, i) => ({
      ...p,
      orden_especifico: (i + 1) * 10
    }));

    setLocalPasos(reordered);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const nombreTrimmed = formData.nombre.trim();
    if (!nombreTrimmed) {
      setValidationError('El nombre es obligatorio.');
      return;
    }

    // Uniqueness validation locally
    const isDuplicate = tipos.some(
      t => t.nombre.toLowerCase() === nombreTrimmed.toLowerCase() && t.id !== formData.id
    );
    if (isDuplicate) {
      setValidationError(`Ya existe un tipo de misión con el nombre "${nombreTrimmed}".`);
      return;
    }

    if (localPasos.length === 0) {
      setValidationError('La misión debe tener al menos 1 paso configurado.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        nombre: nombreTrimmed,
        descripcion: formData.descripcion.trim() || null,
        estado: 'ACTIVO'
      };

      let tipoId = formData.id;

      if (formData.id) {
        // Update type
        const { error } = await supabase
          .from('mision_tipos')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        // Insert type
        const { data, error } = await supabase
          .from('mision_tipos')
          .insert([payload])
          .select('id')
          .single();
        if (error) throw error;
        tipoId = data.id;
      }

      if (tipoId) {
        // Delete all old steps
        const { error: deleteError } = await supabase
          .from('mision_tipo_pasos')
          .delete()
          .eq('tipo_mision_id', tipoId);
        if (deleteError) throw deleteError;

        // Insert new steps
        const stepsPayload = localPasos.map(p => ({
          tipo_mision_id: tipoId!,
          estado_id: p.estado_id,
          orden_especifico: p.orden_especifico
        }));

        const { error: insertError } = await supabase
          .from('mision_tipo_pasos')
          .insert(stepsPayload);
        if (insertError) throw insertError;
      }

      showToast('success', 'Tipo de misión y pasos guardados exitosamente.');
      handleCloseModal();
      fetchData();
    } catch (err: any) {
      console.error('Error saving mission type:', err);
      showToast('error', 'Error al guardar el tipo de misión: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEstado = async (tipo: MisionTipo) => {
    const nuevoEstado = tipo.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    
    if (tipo.estado === 'ACTIVO') {
      const confirmDeactivate = window.confirm(`¿Estás seguro de que quieres desactivar el tipo de misión "${tipo.nombre}"?`);
      if (!confirmDeactivate) return;
    }

    try {
      const { error } = await supabase
        .from('mision_tipos')
        .update({ estado: nuevoEstado })
        .eq('id', tipo.id);
      if (error) throw error;
      showToast('success', `Tipo de misión ${nuevoEstado === 'ACTIVO' ? 'activado' : 'desactivado'} exitosamente.`);
      fetchData();
    } catch (err: any) {
      console.error('Error toggling state:', err);
      showToast('error', 'Error al cambiar el estado: ' + err.message);
    }
  };

  const filteredTipos = tipos.filter(t => {
    const matchesSearch = t.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.descripcion && t.descripcion.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!showInactive && t.estado === 'INACTIVO') return false;
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
          <h1 className="text-2xl font-bold text-gray-800">Tipos de Misión</h1>
          <p className="text-sm text-gray-500">Configuración maestra de flujos de viaje y sus hojas de ruta (pasos)</p>
        </div>
        <div className="flex w-full md:w-auto gap-4">
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Buscar por nombre..."
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
            <span>Nuevo Tipo</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider">Nombre del Flujo</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider">Descripción</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider w-36 text-center">Estado</th>
                <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider w-28 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    <div className="flex justify-center items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      <span>Cargando tipos de misión...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTipos.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    No se encontraron tipos de misión registrados.
                  </td>
                </tr>
              ) : (
                filteredTipos.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 font-semibold text-gray-900">{t.nombre}</td>
                    <td className="p-4 text-sm text-gray-500 max-w-sm truncate" title={t.descripcion || ''}>
                      {t.descripcion || <span className="italic text-gray-300">Sin descripción</span>}
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
                          title="Editar e Hitos"
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
                <Layers className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-800">
                  {formData.id ? 'Editar Tipo de Misión' : 'Nuevo Tipo de Misión'}
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

              <form id="tipoForm" onSubmit={handleSave} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del Tipo de Misión *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Flete Corto Tucumán"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                    value={formData.nombre}
                    onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                  <textarea
                    placeholder="Describa el objetivo de este flujo..."
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px] bg-white text-sm"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                  />
                </div>
              </form>

              {/* Sub-CRUD: Pasos de la Misión */}
              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800 text-sm uppercase tracking-wider">Hojas de Ruta (Pasos de la Misión)</span>
                </div>
                
                {/* Formulario rápido para añadir paso */}
                <div className="p-4 bg-gray-50 border rounded-xl flex flex-col md:flex-row items-end gap-3">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Hito / Estado FSM</label>
                    <select
                      value={selectedEstadoId}
                      onChange={(e) => setSelectedEstadoId(e.target.value)}
                      className="w-full p-2 border rounded bg-white text-xs outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar estado...</option>
                      {estados.map(est => (
                        <option key={est.id} value={est.id}>
                          {est.nombre} ({est.codigo})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="w-full md:w-32">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Orden Específico</label>
                    <input
                      type="number"
                      placeholder="Ej. 10"
                      min={0}
                      value={pasoOrden}
                      onChange={(e) => setPasoOrden(e.target.value)}
                      className="w-full p-2 border rounded bg-white text-xs outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddPaso}
                    disabled={!selectedEstadoId}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer h-9 shrink-0"
                  >
                    Agregar Paso
                  </button>
                </div>

                {/* Listado de pasos agregados localmente */}
                <div className="bg-white border rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="p-3 font-bold text-gray-500 text-xs w-20 text-center">Orden</th>
                        <th className="p-3 font-bold text-gray-500 text-xs">Código</th>
                        <th className="p-3 font-bold text-gray-500 text-xs">Nombre del Hito</th>
                        <th className="p-3 font-bold text-gray-500 text-xs w-28 text-center">Reordenar</th>
                        <th className="p-3 font-bold text-gray-500 text-xs w-16 text-center">Quitar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {localPasos.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-xs text-gray-400 italic">
                            No se han agregado pasos a esta misión todavía.
                          </td>
                        </tr>
                      ) : (
                        localPasos.map((paso, idx) => (
                          <tr key={paso.estado_id} className="border-b last:border-0 hover:bg-gray-50/50">
                            <td className="p-3 text-center font-mono text-xs text-gray-700 font-bold">{paso.orden_especifico}</td>
                            <td className="p-3">
                              <span className="px-1.5 py-0.5 bg-gray-100 border text-gray-700 rounded font-mono text-[10px] font-bold">
                                {paso.codigo}
                              </span>
                            </td>
                            <td className="p-3 font-semibold text-gray-800 text-xs">{paso.nombre}</td>
                            <td className="p-3 text-center">
                              <div className="inline-flex gap-1 justify-center">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMovePaso(idx, 'up')}
                                  className="p-1 hover:bg-gray-200 rounded text-gray-500 disabled:opacity-30 cursor-pointer"
                                  title="Subir"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === localPasos.length - 1}
                                  onClick={() => handleMovePaso(idx, 'down')}
                                  className="p-1 hover:bg-gray-200 rounded text-gray-500 disabled:opacity-30 cursor-pointer"
                                  title="Bajar"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemovePaso(paso.estado_id)}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                title="Quitar paso"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
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
                form="tipoForm"
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-xs disabled:opacity-50 cursor-pointer text-sm font-bold"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Guardar Flujo</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
