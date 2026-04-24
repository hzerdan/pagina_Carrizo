import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Search, X, Loader2, MapPin, ToggleLeft, ToggleRight, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';

export interface Deposito {
  id: number;
  nombre: string;
  tipo: string;
  calle: string | null;
  numero: string | null;
  localidad: string | null;
  provincia: string | null;
  codigo_postal: string | null;
  pais: string | null;
  latitude: number | null;
  longitude: number | null;
  estado: string;
}

interface FormData {
  id?: number;
  nombre: string;
  tipo: string;
  calle: string;
  numero: string;
  localidad: string;
  provincia: string;
  codigo_postal: string;
  pais: string;
  latitude: string;
  longitude: string;
}

const initialFormData: FormData = {
  nombre: '',
  tipo: '',
  calle: '',
  numero: '',
  localidad: '',
  provincia: '',
  codigo_postal: '',
  pais: '',
  latitude: '',
  longitude: '',
};

export function DepositosManager() {
  const [depositos, setDepositos] = useState<Deposito[]>([]);
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
        .from('depositos')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setDepositos(data || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      showToast('error', 'Error al cargar depósitos.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (deposito?: Deposito) => {
    if (deposito) {
      setFormData({
        id: deposito.id,
        nombre: deposito.nombre,
        tipo: deposito.tipo || '',
        calle: deposito.calle || '',
        numero: deposito.numero || '',
        localidad: deposito.localidad || '',
        provincia: deposito.provincia || '',
        codigo_postal: deposito.codigo_postal || '',
        pais: deposito.pais || '',
        latitude: deposito.latitude?.toString() || '',
        longitude: deposito.longitude?.toString() || '',
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
        nombre: formData.nombre,
        tipo: formData.tipo,
        calle: formData.calle || null,
        numero: formData.numero || null,
        localidad: formData.localidad || null,
        provincia: formData.provincia || null,
        codigo_postal: formData.codigo_postal || null,
        pais: formData.pais || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        estado: 'ACTIVO'
      };

      if (formData.id) {
        const { error } = await supabase
          .from('depositos')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('depositos')
          .insert([payload]);
        if (error) throw error;
      }

      showToast('success', 'Depósito guardado exitosamente.');
      handleCloseModal();
      fetchData();
    } catch (err: any) {
      console.error('Error saving data:', err);
      showToast('error', 'Error al guardar el depósito.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEstado = async (deposito: Deposito) => {
    const nuevoEstado = deposito.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    try {
      const { error } = await supabase
        .from('depositos')
        .update({ estado: nuevoEstado })
        .eq('id', deposito.id);
      if (error) throw error;
      showToast('success', `Depósito ${nuevoEstado === 'ACTIVO' ? 'activado' : 'desactivado'} exitosamente.`);
      fetchData();
    } catch (err: any) {
      console.error('Error toggling state:', err);
      showToast('error', 'Error al cambiar el estado del depósito.');
    }
  };

  const filteredDepositos = depositos.filter(d => {
    const matchesSearch = d.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.tipo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.localidad?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!showInactive && d.estado === 'INACTIVO') return false;
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
        <h1 className="text-2xl font-bold text-gray-800">Gestión de Depósitos</h1>
        <div className="flex w-full md:w-auto gap-4">
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Buscar por nombre, tipo o localidad..."
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
            <span>Nuevo Depósito</span>
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
                  <th className="p-4 font-semibold text-gray-600">Nombre</th>
                  <th className="p-4 font-semibold text-gray-600">Tipo</th>
                  <th className="p-4 font-semibold text-gray-600">Ubicación</th>
                  <th className="p-4 font-semibold text-gray-600">Coordenadas</th>
                  <th className="p-4 font-semibold text-gray-600">Estado</th>
                  <th className="p-4 font-semibold text-gray-600 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredDepositos.map((d) => (
                  <tr key={d.id} className="border-b hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-900">{d.nombre}</td>
                    <td className="p-4 text-gray-600">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium uppercase text-gray-600">
                            {d.tipo}
                        </span>
                    </td>
                    <td className="p-4 text-gray-600 text-sm">
                        {d.calle} {d.numero}, {d.localidad}, {d.provincia}
                    </td>
                    <td className="p-4 text-gray-500 text-xs font-mono">
                        {d.latitude && d.longitude ? `${d.latitude}, ${d.longitude}` : '-'}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handleToggleEstado(d)}
                        className="group flex items-center gap-2 cursor-pointer"
                        title={d.estado === 'ACTIVO' ? 'Clic para desactivar' : 'Clic para activar'}
                      >
                        {d.estado === 'ACTIVO' ? (
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
                          onClick={() => handleOpenModal(d)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Editar"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleToggleEstado(d)}
                          className={cn(
                            "p-2 rounded-lg transition",
                            d.estado === 'ACTIVO' ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"
                          )}
                          title={d.estado === 'ACTIVO' ? "Dar de baja" : "Dar de alta"}
                        >
                          {d.estado === 'ACTIVO' ? <Trash2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredDepositos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No se encontraron depósitos activos.
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
              <h2 className="text-xl font-bold text-gray-800">
                {formData.id ? 'Editar Depósito' : 'Nuevo Depósito'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <form id="depositoForm" onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                    <input
                        type="text"
                        required
                        placeholder="Ej: Deposito Central"
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.nombre}
                        onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                    />
                    </div>
                    <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                    <input
                        type="text"
                        required
                        placeholder="Ej: Logística, Almacén, etc."
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.tipo}
                        onChange={(e) => setFormData({...formData, tipo: e.target.value})}
                    />
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 border-b pb-1">Dirección</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Calle</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.calle}
                                onChange={(e) => setFormData({...formData, calle: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.numero}
                                onChange={(e) => setFormData({...formData, numero: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Localidad</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.localidad}
                                onChange={(e) => setFormData({...formData, localidad: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.provincia}
                                onChange={(e) => setFormData({...formData, provincia: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Código Postal</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.codigo_postal}
                                onChange={(e) => setFormData({...formData, codigo_postal: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.pais}
                                onChange={(e) => setFormData({...formData, pais: e.target.value})}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 border-b pb-1">
                        <MapPin className="w-4 h-4" />
                        <h3>Coordenadas Geográficas</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Latitud</label>
                            <input
                                type="number"
                                step="any"
                                placeholder="-34.6037"
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.latitude}
                                onChange={(e) => setFormData({...formData, latitude: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Longitud</label>
                            <input
                                type="number"
                                step="any"
                                placeholder="-58.3816"
                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.longitude}
                                onChange={(e) => setFormData({...formData, longitude: e.target.value})}
                            />
                        </div>
                    </div>
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
                form="depositoForm"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Guardar Depósito</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
