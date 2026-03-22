import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Search, X, Loader2 } from 'lucide-react';

export interface LugarPesaje {
  id: string;
  nombre: string;
  direccion: string | null;
  google_maps_link: string | null;
  estado: string;
}

interface FormData {
  id?: string;
  nombre: string;
  direccion: string;
  google_maps_link: string;
}

const initialFormData: FormData = {
  nombre: '',
  direccion: '',
  google_maps_link: '',
};

export function LugaresPesajeManager() {
  const [lugares, setLugares] = useState<LugarPesaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
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
        .from('lugares_pesaje')
        .select('*')
        .eq('estado', 'ACTIVO');

      if (error) throw error;
      setLugares(data || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      showToast('error', 'Error al cargar lugares de pesaje.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (lugar?: LugarPesaje) => {
    if (lugar) {
      setFormData({
        id: lugar.id,
        nombre: lugar.nombre,
        direccion: lugar.direccion || '',
        google_maps_link: lugar.google_maps_link || '',
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
        direccion: formData.direccion,
        google_maps_link: formData.google_maps_link,
        estado: 'ACTIVO'
      };

      if (formData.id) {
        const { error } = await supabase
          .from('lugares_pesaje')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('lugares_pesaje')
          .insert([payload]);
        if (error) throw error;
      }

      showToast('success', 'Lugar de pesaje guardado exitosamente.');
      handleCloseModal();
      fetchData();
    } catch (err: any) {
      console.error('Error saving data:', err);
      showToast('error', 'Error al guardar el lugar de pesaje.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Está seguro de que desea dar de baja este lugar de pesaje?')) return;
    try {
      const { error } = await supabase
        .from('lugares_pesaje')
        .update({ estado: 'INACTIVO' })
        .eq('id', id);
      if (error) throw error;
      showToast('success', 'Lugar de pesaje dado de baja exitosamente.');
      fetchData();
    } catch (err: any) {
      console.error('Error deleting data:', err);
      showToast('error', 'Error al dar de baja el lugar de pesaje.');
    }
  };

  const filteredLugares = lugares.filter(l => 
    l.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-white ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMessage.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Lugares de Pesaje</h1>
        <div className="flex w-full md:w-auto gap-4">
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Buscar por nombre..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-5 h-5" />
            <span>Nuevo Lugar</span>
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
                  <th className="p-4 font-semibold text-gray-600">Dirección</th>
                  <th className="p-4 font-semibold text-gray-600">Ubicación Mapeada</th>
                  <th className="p-4 font-semibold text-gray-600 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredLugares.map((l) => (
                  <tr key={l.id} className="border-b hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-900">{l.nombre}</td>
                    <td className="p-4 text-gray-600">{l.direccion || '-'}</td>
                    <td className="p-4 text-gray-600">
                      {l.google_maps_link ? (
                        <a href={l.google_maps_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Ver en Maps
                        </a>
                      ) : '-'}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(l)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Editar"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(l.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Dar de baja"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredLugares.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">
                      No se encontraron lugares de pesaje activos.
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
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-50 animate-in slide-in-from-right">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">
                {formData.id ? 'Editar Lugar de Pesaje' : 'Nuevo Lugar'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <form id="lugarPesajeForm" onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.nombre}
                    onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.direccion}
                    onChange={(e) => setFormData({...formData, direccion: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Enlace de Google Maps</label>
                  <input
                    type="url"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.google_maps_link}
                    onChange={(e) => setFormData({...formData, google_maps_link: e.target.value})}
                  />
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
                form="lugarPesajeForm"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Guardar</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
