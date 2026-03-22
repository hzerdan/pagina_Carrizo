import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Loader2, X } from 'lucide-react';

export interface Contacto {
  id: string;
  cliente_id?: string;
  proveedor_id?: string;
  transportista_id?: string;
  nombre: string;
  email: string;
  telefono: string;
  role_id?: string;
  estado: string;
}

interface ContactosTabProps {
  entidadTipo: 'cliente' | 'proveedor' | 'transportista';
  entidadId: string;
}

export function ContactosTab({ entidadTipo, entidadId }: ContactosTabProps) {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    role_id: ''
  });

  const fkColumn = `${entidadTipo}_id`;

  useEffect(() => {
    if (entidadId) {
      fetchContactos();
    }
  }, [entidadId, entidadTipo]);

  const fetchContactos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('contactos')
        .select('*')
        .eq(fkColumn, entidadId)
        .eq('estado', 'ACTIVO');

      if (error) throw error;
      setContactos(data || []);
    } catch (err) {
      console.error('Error fetching contactos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {
        ...formData,
        [fkColumn]: entidadId,
        estado: 'ACTIVO'
      };

      const { error } = await supabase
        .from('contactos')
        .insert([payload]);

      if (error) throw error;

      setFormData({ nombre: '', email: '', telefono: '', role_id: '' });
      setIsFormOpen(false);
      fetchContactos();
    } catch (err) {
      console.error('Error saving contacto:', err);
      alert('Error al guardar el contacto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este contacto?')) return;
    
    try {
      // Baja Lógica
      const { error } = await supabase
        .from('contactos')
        .update({ estado: 'INACTIVO' })
        .eq('id', id);

      if (error) throw error;
      fetchContactos();
    } catch (err) {
      console.error('Error deleting contacto:', err);
      alert('Error al eliminar');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Cargando contactos...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-800">Contactos Asociados</h3>
        {!isFormOpen && (
          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Agregar Contacto
          </button>
        )}
      </div>

      {isFormOpen && (
        <form onSubmit={handleSave} className="bg-gray-50 p-4 rounded-lg border space-y-3 relative">
          <button 
            type="button" 
            onClick={() => setIsFormOpen(false)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                required
                type="text"
                className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500"
                value={formData.nombre}
                onChange={e => setFormData({...formData, nombre: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500"
                value={formData.telefono}
                onChange={e => setFormData({...formData, telefono: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Rol (ID temporal)</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500"
                value={formData.role_id}
                onChange={e => setFormData({...formData, role_id: e.target.value})}
              />
            </div>
          </div>
          
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Contacto'}
            </button>
          </div>
        </form>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-2 font-medium text-gray-600">Nombre</th>
              <th className="px-4 py-2 font-medium text-gray-600">Email</th>
              <th className="px-4 py-2 font-medium text-gray-600">Teléfono</th>
              <th className="px-4 py-2 font-medium text-gray-600 w-16 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y text-gray-800">
            {contactos.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{c.nombre}</td>
                <td className="px-4 py-2">{c.email}</td>
                <td className="px-4 py-2">{c.telefono}</td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {contactos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  No hay contactos asociados a esta empresa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
