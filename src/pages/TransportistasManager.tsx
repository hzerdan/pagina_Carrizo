import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Search, X, Loader2 } from 'lucide-react';
import { ContactosTab } from '../components/ContactosTab';

export interface TransportistaCompany {
  id: string;
  razon_social: string;
  cuit: string;
  telefono_general: string;
  email_general: string;
  contacto_principal_id: string | null;
  estado: string;
}

interface FormData {
  id?: string;
  razon_social: string;
  cuit: string;
  telefono_general: string;
  email_general: string;
  contacto_principal_id: string;
}

const initialFormData: FormData = {
  razon_social: '',
  cuit: '',
  telefono_general: '',
  email_general: '',
  contacto_principal_id: '',
};

export function TransportistasManager() {
  const [transportistas, setTransportistas] = useState<TransportistaCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'generales' | 'contactos'>('generales');
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  const [contactosDisponibles, setContactosDisponibles] = useState<{id: string, nombre: string}[]>([]);
  
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
        .from('transportistas')
        .select('*')
        .eq('estado', 'ACTIVO');

      if (error) throw error;
      setTransportistas(data || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      showToast('error', 'Error al cargar los transportistas.');
    } finally {
      setLoading(false);
    }
  };

  const fetchContactosParaSelect = async (transportistaId: string) => {
    try {
      const { data, error } = await supabase
        .from('contactos')
        .select('id, nombre')
        .eq('transportista_id', transportistaId)
        .eq('estado', 'ACTIVO');
      if (error) throw error;
      setContactosDisponibles(data || []);
    } catch (err) {
      console.error('Error fetching contactos para select:', err);
    }
  };

  const handleOpenModal = async (transportista?: TransportistaCompany) => {
    if (transportista) {
      setFormData({
        id: transportista.id,
        razon_social: transportista.razon_social,
        cuit: transportista.cuit || '',
        telefono_general: transportista.telefono_general || '',
        email_general: transportista.email_general || '',
        contacto_principal_id: transportista.contacto_principal_id || '',
      });
      await fetchContactosParaSelect(transportista.id);
    } else {
      setFormData(initialFormData);
      setContactosDisponibles([]);
    }
    setActiveTab('generales');
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
        razon_social: formData.razon_social,
        cuit: formData.cuit,
        telefono_general: formData.telefono_general,
        email_general: formData.email_general,
        contacto_principal_id: formData.contacto_principal_id || null,
        estado: 'ACTIVO'
      };

      if (formData.id) {
        const { error } = await supabase
          .from('transportistas')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('transportistas')
          .insert([payload]);
        if (error) throw error;
      }

      showToast('success', 'Transportista guardado exitosamente.');
      handleCloseModal();
      fetchData();
    } catch (err: any) {
      console.error('Error saving data:', err);
      showToast('error', 'Error al guardar el transportista.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Está seguro de que desea dar de baja este transportista?')) return;
    try {
      const { error } = await supabase
        .from('transportistas')
        .update({ estado: 'INACTIVO' })
        .eq('id', id);
      if (error) throw error;
      showToast('success', 'Transportista dado de baja exitosamente.');
      fetchData();
    } catch (err: any) {
      console.error('Error deleting data:', err);
      showToast('error', 'Error al dar de baja el transportista.');
    }
  };

  const filteredTransportistas = transportistas.filter(t => 
    t.razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.cuit?.includes(searchTerm)
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-white ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMessage.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Gestión de Empresas Transportistas</h1>
        <div className="flex w-full md:w-auto gap-4">
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Buscar por Razón Social o CUIT..."
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
            <span>Nuevo Transportista</span>
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
                  <th className="p-4 font-semibold text-gray-600">Razón Social</th>
                  <th className="p-4 font-semibold text-gray-600">CUIT</th>
                  <th className="p-4 font-semibold text-gray-600">Email General</th>
                  <th className="p-4 font-semibold text-gray-600">Teléfono General</th>
                  <th className="p-4 font-semibold text-gray-600 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransportistas.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-900">{t.razon_social}</td>
                    <td className="p-4 text-gray-600">{t.cuit || '-'}</td>
                    <td className="p-4 text-gray-600">{t.email_general || '-'}</td>
                    <td className="p-4 text-gray-600">{t.telefono_general || '-'}</td>
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
                          onClick={() => handleDelete(t.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Dar de baja"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredTransportistas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No se encontraron transportistas activos.
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
                {formData.id ? 'Editar Transportista' : 'Nuevo Transportista'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex border-b px-6 pt-2">
              <button
                className={`px-4 py-2 border-b-2 font-medium text-sm focus:outline-none transition-colors ${
                  activeTab === 'generales' 
                    ? 'border-blue-600 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab('generales')}
              >
                Datos Generales
              </button>
              <button
                className={`px-4 py-2 border-b-2 font-medium text-sm focus:outline-none transition-colors ${
                  activeTab === 'contactos' 
                    ? 'border-blue-600 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } ${!formData.id && 'opacity-50 cursor-not-allowed'}`}
                onClick={() => formData.id && setActiveTab('contactos')}
                disabled={!formData.id}
                title={!formData.id ? 'Guarda primero para agregar contactos' : ''}
              >
                Contactos
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {activeTab === 'generales' ? (
                <form id="transportistaForm" onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social *</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.razon_social}
                      onChange={(e) => setFormData({...formData, razon_social: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CUIT</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.cuit}
                      onChange={(e) => setFormData({...formData, cuit: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email General</label>
                      <input
                        type="email"
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.email_general}
                        onChange={(e) => setFormData({...formData, email_general: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono General</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.telefono_general}
                        onChange={(e) => setFormData({...formData, telefono_general: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  {formData.id && (
                    <div className="pt-2">
                       <label className="block text-sm font-medium text-gray-700 mb-1">Contacto Principal</label>
                       <select
                         className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                         value={formData.contacto_principal_id}
                         onChange={(e) => setFormData({...formData, contacto_principal_id: e.target.value})}
                         onClick={() => fetchContactosParaSelect(formData.id!)}
                       >
                         <option value="">Seleccionar un contacto principal...</option>
                         {contactosDisponibles.map(c => (
                           <option key={c.id} value={c.id}>{c.nombre}</option>
                         ))}
                       </select>
                       <p className="text-xs text-gray-500 mt-1">Los contactos se agregan en la pestaña "Contactos".</p>
                    </div>
                  )}

                </form>
              ) : (
                <div className="h-full">
                  {formData.id && <ContactosTab entidadTipo="transportista" entidadId={formData.id} />}
                </div>
              )}
            </div>
            
            {activeTab === 'generales' && (
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
                  form="transportistaForm"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Guardar Datos Generales</span>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
