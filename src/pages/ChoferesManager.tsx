import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Loader2, Truck, Star, X, ExternalLink, ChevronDown, ChevronUp, Zap, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export interface Transportista {
  id: number;
  razon_social: string;
}

export interface Chofer {
  id: number;
  transportista_id: number | null;
  nombre_completo: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  calificacion_promedio_estrellas?: number | null;
  calificacion_promedio_score?: number | null;
  calificacion_total_viajes?: number | null;
  calificacion_nivel?: string | null;
  calificacion_updated_at?: string | null;
  transportistas?: {
    razon_social: string;
  };
}

export function ChoferesManager() {
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChofer, setEditingChofer] = useState<Chofer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Historial Modal state
  const navigate = useNavigate();
  const [historialChofer, setHistorialChofer] = useState<Chofer | null>(null);
  const [remitosHistorial, setRemitosHistorial] = useState<any[]>([]);
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);
  const [expandedRemitoId, setExpandedRemitoId] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    nombre_completo: '',
    dni: '',
    telefono: '',
    email: '',
    transportista_id: '' as string | number,
  });

  const [catalogoTareas, setCatalogoTareas] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [choferesRes, transRes, catalogoRes] = await Promise.all([
        supabase
          .from('choferes')
          .select('*, transportistas(razon_social)')
          .order('id', { ascending: false }),
        supabase
          .from('transportistas')
          .select('id, razon_social')
          .order('razon_social'),
        supabase
          .from('catalogo_tareas_control')
          .select('id, tarea_template, tipo_tarea, es_critica')
      ]);

      if (choferesRes.error) throw choferesRes.error;
      if (transRes.error) throw transRes.error;

      setChoferes(choferesRes.data || []);
      setTransportistas(transRes.data || []);
      setCatalogoTareas(catalogoRes.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      // Podrías manejar un estado global de error aquí si lo deseas
    } finally {
      setIsLoading(false);
    }
  }, []);

  const criticalTasksSet = useMemo(() => {
    const ids = new Set<number>();
    const templates = new Set<string>();
    catalogoTareas.forEach(ct => {
      if (ct.es_critica) {
        if (ct.id) ids.add(Number(ct.id));
        if (ct.tarea_template) templates.add(ct.tarea_template.toLowerCase().trim());
      }
    });
    return { ids, templates };
  }, [catalogoTareas]);

  const checkIfTaskIsCritical = useCallback((t: any): boolean => {
    if (t.es_critica === true) return true;
    if (t.id && criticalTasksSet.ids.has(Number(t.id))) return true;
    const tmpl = (t.tarea_template || t.tarea || '').toLowerCase().trim();
    if (tmpl && criticalTasksSet.templates.has(tmpl)) return true;
    return false;
  }, [criticalTasksSet]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenModal = (chofer?: Chofer) => {
    setErrorMsg(null);
    if (chofer) {
      setEditingChofer(chofer);
      setFormData({
        nombre_completo: chofer.nombre_completo,
        dni: chofer.dni || '',
        telefono: chofer.telefono || '',
        email: chofer.email || '',
        transportista_id: chofer.transportista_id || '',
      });
    } else {
      setEditingChofer(null);
      setFormData({
        nombre_completo: '',
        dni: '',
        telefono: '',
        email: '',
        transportista_id: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingChofer(null);
    setErrorMsg(null);
  };

  const handleOpenHistorial = async (chofer: Chofer) => {
    setHistorialChofer(chofer);
    setIsLoadingHistorial(true);
    setRemitosHistorial([]);
    setExpandedRemitoId(null);
    try {
      const { data, error } = await supabase
        .from('remitos')
        .select('id, remito_ref_externa, created_at, mision_estado, calificacion_score, calificacion_estrellas, calificacion_desglose, tiene_incidencias_carga, protocolo_control')
        .eq('chofer_id', chofer.id)
        .order('id', { ascending: false });

      if (error) throw error;
      setRemitosHistorial(data || []);
    } catch (err) {
      console.error('Error fetching historial remitos:', err);
    } finally {
      setIsLoadingHistorial(false);
    }
  };

  const handleCloseHistorial = () => {
    setHistorialChofer(null);
    setRemitosHistorial([]);
    setExpandedRemitoId(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este chofer? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const { error } = await supabase.from('choferes').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (err) {
      console.error('Error deleting chofer:', err);
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      alert('Error al eliminar el chofer. ' + errMsg);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);

    // DNI validation (only numbers and dots)
    const dniRegex = /^[0-9.]+$/;
    if (formData.dni && !dniRegex.test(formData.dni)) {
      setErrorMsg('El DNI solo debe contener números y puntos.');
      setIsSaving(false);
      return;
    }

    const normalizePhone = (phone: string | null) => {
      if (!phone) return null;
      const clean = phone.replace(/\D/g, '');
      if (!clean) return null;
      if (clean.startsWith('549')) return clean;
      return '549' + clean;
    };

    const payload = {
      nombre_completo: formData.nombre_completo,
      dni: formData.dni || null,
      telefono: normalizePhone(formData.telefono),
      email: formData.email || null,
      transportista_id: formData.transportista_id ? Number(formData.transportista_id) : null,
    };

    try {
      if (editingChofer) {
        const { error } = await supabase
          .from('choferes')
          .update(payload)
          .eq('id', editingChofer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('choferes')
          .insert([payload]);
        if (error) throw error;
      }
      
      await fetchData();
      handleCloseModal();
    } catch (err) {
      console.error('Error saving chofer:', err);
      // Detect uniqueness violation or other errors
      const isUniqueViolation = err && typeof err === 'object' && 'code' in err && err.code === '23505';
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      if (isUniqueViolation) {
        setErrorMsg('El DNI ya se encuentra registrado para otro chofer.');
      } else {
        setErrorMsg('Ocurrió un error al guardar: ' + errMsg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const filteredChoferes = choferes.filter(c => 
    c.nombre_completo.toLowerCase().includes(search.toLowerCase()) || 
    (c.dni && c.dni.includes(search))
  );

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Options */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Truck className="w-6 h-6 text-brand-600" />
              Gestión de Choferes
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Administra el listado de choferes y sus datos vinculados a empresas transportistas.
            </p>
          </div>
          
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition shadow-sm font-medium"
          >
            <Plus className="w-5 h-5" />
            Nuevo Chofer
          </button>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o DNI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-sm"
          />
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
              <p className="text-sm text-gray-500 mt-4">Cargando choferes...</p>
            </div>
          ) : filteredChoferes.length === 0 ? (
            <div className="text-center py-20 text-gray-500 text-sm">
              No se encontraron choferes que coincidan con la búsqueda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-700 uppercase font-semibold text-xs border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Nombre Completo</th>
                    <th className="px-6 py-4">DNI</th>
                    <th className="px-6 py-4">Teléfono</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Transportista</th>
                    <th className="px-6 py-4">Calificación</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredChoferes.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{c.nombre_completo}</td>
                      <td className="px-6 py-4 text-gray-600">{c.dni || '-'}</td>
                      <td className="px-6 py-4 text-gray-600">{c.telefono || '-'}</td>
                      <td className="px-6 py-4 text-gray-600">{c.email || '-'}</td>
                      <td className="px-6 py-4 text-gray-600">
                        {c.transportistas ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {c.transportistas.razon_social}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {c.calificacion_promedio_estrellas ? (
                          <button
                            type="button"
                            onClick={() => handleOpenHistorial(c)}
                            className="inline-flex items-center gap-2 group px-2.5 py-1 rounded-xl hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-all text-left cursor-pointer"
                            title="Ver historial de viajes y desglose"
                          >
                            <div className="flex items-center gap-1">
                              <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                              <span className="font-bold text-gray-900 text-sm">
                                {c.calificacion_promedio_estrellas}
                              </span>
                            </div>
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                              c.calificacion_nivel === 'EXCELENTE' && "bg-emerald-100 text-emerald-800",
                              c.calificacion_nivel === 'BUENO' && "bg-blue-100 text-blue-800",
                              c.calificacion_nivel === 'REGULAR' && "bg-amber-100 text-amber-800",
                              c.calificacion_nivel === 'CRITICO' && "bg-red-100 text-red-800",
                              c.calificacion_nivel === 'NUEVO' && "bg-gray-100 text-gray-700"
                            )}>
                              {c.calificacion_nivel || 'NUEVO'}
                            </span>
                            <span className="text-[11px] text-gray-400 group-hover:text-amber-700">
                              ({c.calificacion_total_viajes || 0} {c.calificacion_total_viajes === 1 ? 'viaje' : 'viajes'})
                            </span>
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs italic">Sin viajes</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenModal(c)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar Chofer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar Chofer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Slide-over Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/40 transition-opacity backdrop-blur-sm" 
            onClick={handleCloseModal}
          ></div>
          
          {/* Panel */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col pt-16 lg:pt-0 transform transition-transform">
            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                {editingChofer ? <Edit2 className="w-5 h-5 text-brand-600" /> : <Plus className="w-5 h-5 text-brand-600" />}
                {editingChofer ? 'Editar Chofer' : 'Nuevo Chofer'}
              </h2>
              
              {errorMsg && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                  {errorMsg}
                </div>
              )}

              <form id="chofer-form" onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    value={formData.nombre_completo}
                    onChange={(e) => setFormData({...formData, nombre_completo: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                    placeholder="Ej. Juan Pérez"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">DNI</label>
                  <input
                    type="text"
                    value={formData.dni}
                    onChange={(e) => setFormData({...formData, dni: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                    placeholder="Sin puntos ni espacios (Ej. 12345678)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={formData.telefono}
                    onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                    placeholder="Ej. 11 1234-5678"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                    placeholder="juan@ejemplo.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Empresa Transportista</label>
                  <select
                    value={formData.transportista_id}
                    onChange={(e) => setFormData({...formData, transportista_id: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                  >
                    <option value="">-- Seleccionar --</option>
                    {transportistas.map(t => (
                      <option key={t.id} value={t.id}>{t.razon_social}</option>
                    ))}
                  </select>
                </div>
              </form>
            </div>
            
            {/* Modal Footer */}
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="chofer-form"
                disabled={isSaving}
                className="px-4 py-2 flex items-center gap-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-sm disabled:opacity-70"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal / Drawer de Historial de Calificaciones */}
      {historialChofer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500 shadow-xs">
                  <Star className="w-5 h-5 fill-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    {historialChofer.nombre_completo}
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                      historialChofer.calificacion_nivel === 'EXCELENTE' && "bg-emerald-100 text-emerald-800",
                      historialChofer.calificacion_nivel === 'BUENO' && "bg-blue-100 text-blue-800",
                      historialChofer.calificacion_nivel === 'REGULAR' && "bg-amber-100 text-amber-800",
                      historialChofer.calificacion_nivel === 'CRITICO' && "bg-red-100 text-red-800",
                      historialChofer.calificacion_nivel === 'NUEVO' && "bg-gray-100 text-gray-700"
                    )}>
                      {historialChofer.calificacion_nivel || 'NUEVO'}
                    </span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {historialChofer.transportistas?.razon_social ? `Empresa: ${historialChofer.transportistas.razon_social}` : 'Sin transportista'}
                    {historialChofer.telefono ? ` • Tel: ${historialChofer.telefono}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                    <span className="text-lg font-black text-gray-900">
                      {historialChofer.calificacion_promedio_estrellas || '-'}
                    </span>
                    <span className="text-xs text-gray-400 font-semibold">/ 5.0</span>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {historialChofer.calificacion_promedio_score || 0} pts promedio ({historialChofer.calificacion_total_viajes || 0} viajes)
                  </p>
                </div>
                <button
                  onClick={handleCloseHistorial}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Tabla de Remitos Históricos */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {isLoadingHistorial ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="w-7 h-7 text-brand-600 animate-spin" />
                  <p className="text-xs text-gray-500 mt-3">Cargando viajes históricos...</p>
                </div>
              ) : remitosHistorial.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">
                  Este chofer no tiene viajes ni remitos registrados aún.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-600 uppercase font-semibold text-[10px] border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3">Remito / Ref</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3">Puntuación</th>
                        <th className="px-4 py-3">Desglose de Desempeño</th>
                        <th className="px-4 py-3 text-right">Ver</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {remitosHistorial.map((r) => {
                        const desglose = r.calificacion_desglose;
                        const isExpanded = expandedRemitoId === r.id;
                        return (
                          <React.Fragment key={r.id}>
                            <tr className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 font-bold text-gray-900">
                                <button
                                  type="button"
                                  onClick={() => setExpandedRemitoId(isExpanded ? null : r.id)}
                                  className="flex items-center gap-1.5 text-left hover:text-brand-600 cursor-pointer"
                                  title="Clic para ver detalle de tareas de este viaje"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-brand-600" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                  )}
                                  <span className="font-mono">#{r.id}</span>
                                  <span className="text-gray-500 font-normal">{r.remito_ref_externa}</span>
                                </button>
                              </td>
                              <td className="px-4 py-3 text-gray-500">
                                {r.created_at ? new Date(r.created_at).toLocaleDateString('es-AR') : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
                                  {r.mision_estado || 'EN_PROCESO'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {r.calificacion_estrellas ? (
                                  <div className="flex items-center gap-1.5">
                                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                                    <span className="font-bold text-gray-900">
                                      {r.calificacion_estrellas}
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                      ({r.calificacion_score} pts)
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">Pendiente</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {desglose ? (
                                  <div className="space-y-0.5 text-[10px]">
                                    <span className="inline-block mr-2">
                                      Tareas: <strong>{desglose.cumplimiento?.tareas_cumplidas || 0}/{desglose.cumplimiento?.tareas_totales || 0}</strong> ({desglose.cumplimiento?.score_pct || 0}%)
                                    </span>
                                    <span className="inline-block mr-2">
                                      Avisos: <strong>{desglose.autonomia?.recordatorios_count || 0}</strong>
                                    </span>
                                    <span className="inline-block">
                                      Escalado: <strong className={desglose.escalamiento?.escalado ? 'text-red-600' : 'text-emerald-600'}>
                                        {desglose.escalamiento?.escalado ? 'Sí' : 'No'}
                                      </strong>
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedRemitoId(isExpanded ? null : r.id)}
                                    className={`px-2 py-1 text-[11px] font-semibold rounded transition cursor-pointer ${
                                      isExpanded 
                                        ? 'bg-brand-100 text-brand-800' 
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                    }`}
                                  >
                                    {isExpanded ? 'Ocultar' : 'Ver Tareas'}
                                  </button>
                                  <button
                                    onClick={() => navigate(`/remitos/${r.id}`)}
                                    className="p-1 text-brand-600 hover:text-brand-800 hover:bg-brand-50 rounded transition"
                                    title="Abrir Remito"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Acordeón Detallado de Auditoría de Tareas */}
                            {isExpanded && (
                              <tr className="bg-slate-50/90 border-b border-gray-200 animate-fadeIn">
                                <td colSpan={6} className="p-4 space-y-3 whitespace-normal">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-2">
                                    <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                      <ShieldCheck className="w-4 h-4 text-brand-600" />
                                      Auditoría de Protocolo & Autonomía Digital (Remito #{r.id})
                                    </h4>
                                    <div className="flex items-center gap-3 text-[11px]">
                                      <span className="text-gray-600">
                                        Avisos/Recordatorios: <strong className={desglose?.autonomia?.recordatorios_count ? 'text-amber-600 font-bold' : 'text-gray-900'}>{desglose?.autonomia?.recordatorios_count || 0}</strong>
                                      </span>
                                      <span className="text-gray-600">
                                        Escalado a Operador: <strong className={desglose?.escalamiento?.escalado ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                                          {desglose?.escalamiento?.escalado ? 'Sí (Intervención humana)' : 'No (100% IA)'}
                                        </strong>
                                      </span>
                                    </div>
                                  </div>

                                  {/* Listado de tareas */}
                                  {r.protocolo_control && Array.isArray(r.protocolo_control) && r.protocolo_control.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {r.protocolo_control
                                        .filter((t: any) => t.asignada_a_chofer !== false && t.estado !== 'NO_REALIZABLE')
                                        .map((t: any, idx: number) => {
                                          const cumplida = t.estado === 'REPORTADO_CHOFER' || t.estado === 'COMPLETADO' || !!t.chofer_realizo;
                                          const isCritica = checkIfTaskIsCritical(t);

                                          return (
                                            <div 
                                              key={idx} 
                                              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                                                cumplida 
                                                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
                                                  : 'bg-rose-50/70 border-rose-200 text-rose-950'
                                              }`}
                                            >
                                              {cumplida ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                              ) : (
                                                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                              )}
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                  <span className="font-semibold truncate">{t.tarea || t.tarea_template}</span>
                                                  {isCritica && (
                                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-200 text-amber-900 border border-amber-300 shrink-0 flex items-center gap-0.5">
                                                      <Zap className="w-2.5 h-2.5" /> Crítica
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] mt-0.5 text-gray-500">
                                                  <span>
                                                    {cumplida ? '✅ Cumplida por chofer' : `❌ Omitida (${t.estado || 'PENDIENTE'})`}
                                                  </span>
                                                  {t.valor_reportado_chofer && (
                                                    <span className="font-mono text-gray-700 bg-white/80 px-1 rounded border border-gray-200">
                                                      Valor: {t.valor_reportado_chofer}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-400 italic">No hay tareas de protocolo registradas para este remito.</p>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={handleCloseHistorial}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
