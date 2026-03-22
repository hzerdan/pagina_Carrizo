import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Search, X, Loader2 } from 'lucide-react';

export interface Articulo {
  id: number;
  codigo_articulo: string;
  nombre: string;
  tipo_mercado: 'MI' | 'ME';
  peso_standard_kg: number;
  estado: string;
}

interface FormData {
  id?: number;
  codigo_articulo: string;
  nombre: string;
  tipo_mercado: 'MI' | 'ME';
  peso_standard_kg: number;
}

const initialFormData: FormData = {
  codigo_articulo: '',
  nombre: '',
  tipo_mercado: 'MI',
  peso_standard_kg: 50.00,
};

export function ArticulosManager() {
  const [articulos, setArticulos] = useState<Articulo[]>([]);
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
        .from('articulos')
        .select('*')
        .eq('estado', 'ACTIVO');

      if (error) throw error;
      setArticulos(data || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      showToast('error', 'Error al cargar los artículos.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (articulo?: Articulo) => {
    if (articulo) {
      setFormData({
        id: articulo.id,
        codigo_articulo: articulo.codigo_articulo,
        nombre: articulo.nombre,
        tipo_mercado: articulo.tipo_mercado,
        peso_standard_kg: articulo.peso_standard_kg,
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
        codigo_articulo: formData.codigo_articulo,
        nombre: formData.nombre,
        tipo_mercado: formData.tipo_mercado,
        peso_standard_kg: formData.peso_standard_kg,
        estado: 'ACTIVO'
      };

      if (formData.id) {
        const { error } = await supabase
          .from('articulos')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('articulos')
          .insert([payload]);
        if (error) throw error;
      }

      showToast('success', 'Artículo guardado exitosamente.');
      handleCloseModal();
      fetchData();
    } catch (err: any) {
      console.error('Error saving data:', err);
      showToast('error', 'Error al guardar el artículo.\n(Revise si el código ya existe)');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Está seguro de que desea dar de baja este artículo?')) return;
    try {
      const { error } = await supabase
        .from('articulos')
        .update({ estado: 'INACTIVO' })
        .eq('id', id);
      if (error) throw error;
      showToast('success', 'Artículo dado de baja exitosamente.');
      fetchData();
    } catch (err: any) {
      console.error('Error deleting data:', err);
      showToast('error', 'Error al dar de baja el artículo.');
    }
  };

  const filteredArticulos = articulos.filter(a => 
    a.codigo_articulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-white ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMessage.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Catálogo de Artículos</h1>
        <div className="flex w-full md:w-auto gap-4">
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
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
            <span>Nuevo Artículo</span>
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
                  <th className="p-4 font-semibold text-gray-600">Código</th>
                  <th className="p-4 font-semibold text-gray-600">Nombre</th>
                  <th className="p-4 font-semibold text-gray-600">Mercado</th>
                  <th className="p-4 font-semibold text-gray-600">Peso Std. (Kg)</th>
                  <th className="p-4 font-semibold text-gray-600 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredArticulos.map((a) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-900">{a.codigo_articulo}</td>
                    <td className="p-4 text-gray-600">{a.nombre}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${a.tipo_mercado === 'MI' ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {a.tipo_mercado === 'MI' ? 'Mercado Interno' : 'Mercado Externo'}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600">{Number(a.peso_standard_kg).toFixed(2)} kg</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(a)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Editar"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Dar de baja"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredArticulos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No se encontraron artículos activos.
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
                {formData.id ? 'Editar Artículo' : 'Nuevo Artículo'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <form id="articuloForm" onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código de Artículo *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.codigo_articulo}
                    onChange={(e) => setFormData({...formData, codigo_articulo: e.target.value.toUpperCase()})}
                  />
                  <p className="text-xs text-gray-500 mt-1">Debe ser único en el sistema.</p>
                </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Mercado *</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="tipo_mercado"
                        value="MI"
                        checked={formData.tipo_mercado === 'MI'}
                        onChange={() => setFormData({...formData, tipo_mercado: 'MI'})}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Mercado Interno (MI)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="tipo_mercado"
                        value="ME"
                        checked={formData.tipo_mercado === 'ME'}
                        onChange={() => setFormData({...formData, tipo_mercado: 'ME'})}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Mercado Externo (ME)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Peso Standard (Kg) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.peso_standard_kg}
                    onChange={(e) => setFormData({...formData, peso_standard_kg: parseFloat(e.target.value) || 0})}
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
                form="articuloForm"
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
