import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Loader2, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface Transportista {
  id: number;
  nombre_empresa: string;
}

export interface Chofer {
  id: number;
  transportista_id: number | null;
  nombre_completo: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  transportistas?: {
    nombre_empresa: string;
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

  // Form state
  const [formData, setFormData] = useState({
    nombre_completo: '',
    dni: '',
    telefono: '',
    email: '',
    transportista_id: '' as string | number,
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [choferesRes, transRes] = await Promise.all([
        supabase
          .from('choferes')
          .select('*, transportistas(nombre_empresa)')
          .order('id', { ascending: false }),
        supabase
          .from('transportistas')
          .select('id, nombre_empresa')
          .order('nombre_empresa')
      ]);

      if (choferesRes.error) throw choferesRes.error;
      if (transRes.error) throw transRes.error;

      setChoferes(choferesRes.data || []);
      setTransportistas(transRes.data || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      // Podrías manejar un estado global de error aquí si lo deseas
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este chofer? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const { error } = await supabase.from('choferes').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (err: any) {
      console.error('Error deleting chofer:', err);
      alert('Error al eliminar el chofer. ' + err.message);
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

    const payload = {
      nombre_completo: formData.nombre_completo,
      dni: formData.dni || null,
      telefono: formData.telefono || null,
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
    } catch (err: any) {
      console.error('Error saving chofer:', err);
      // Detect uniqueness violation or other errors
      if (err.code === '23505') {
        setErrorMsg('El DNI ya se encuentra registrado para otro chofer.');
      } else {
        setErrorMsg('Ocurrió un error al guardar: ' + err.message);
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
                            {c.transportistas.nombre_empresa}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Sin asignar</span>
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
                      <option key={t.id} value={t.id}>{t.nombre_empresa}</option>
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
    </div>
  );
}
