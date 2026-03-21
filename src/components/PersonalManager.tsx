import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Search, X, Loader2 } from 'lucide-react';

export interface Role {
  id: string;
  nombre: string;
  codigo: string;
}

export interface PersonalACRole {
  role_id: string;
  roles: Role;
}

export interface PersonalAC {
  id: string;
  nombre_completo: string;
  email: string;
  dni: string;
  celular: string;
  tipo_contratacion: 'INTERNO' | 'EXTERNO';
  personal_ac_roles?: PersonalACRole[];
}

interface FormData {
  id?: string;
  nombre_completo: string;
  email: string;
  dni: string;
  celular: string;
  tipo_contratacion: 'INTERNO' | 'EXTERNO';
  selectedRoles: string[];
}

const initialFormData: FormData = {
  nombre_completo: '',
  email: '',
  dni: '',
  celular: '',
  tipo_contratacion: 'INTERNO',
  selectedRoles: [],
};

export default function PersonalManager() {
  const [personal, setPersonal] = useState<PersonalAC[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchData();
    
    // Auto-hide toast after 3 seconds
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
      // Fetch Roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*');
        
      if (rolesError) throw rolesError;
      setRoles(rolesData || []);

      // Fetch Personal AC
      const { data: personalData, error: personalError } = await supabase
        .from('personal_ac')
        .select(`
          *,
          personal_ac_roles(
            role_id,
            roles(id, nombre, codigo)
          )
        `);

      if (personalError) throw personalError;
      setPersonal(personalData || []);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      showToast('error', 'Error al cargar los datos.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (empleado?: PersonalAC) => {
    if (empleado) {
      setFormData({
        id: empleado.id,
        nombre_completo: empleado.nombre_completo,
        email: empleado.email,
        dni: empleado.dni || '',
        celular: empleado.celular || '',
        tipo_contratacion: empleado.tipo_contratacion,
        selectedRoles: empleado.personal_ac_roles?.map((pr) => pr.role_id) || [],
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

  const handleRoleToggle = (roleId: string) => {
    setFormData(prev => {
      const isSelected = prev.selectedRoles.includes(roleId);
      if (isSelected) {
        return { ...prev, selectedRoles: prev.selectedRoles.filter(id => id !== roleId) };
      } else {
        return { ...prev, selectedRoles: [...prev.selectedRoles, roleId] };
      }
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);

      const payload = {
        nombre_completo: formData.nombre_completo,
        email: formData.email,
        dni: formData.dni,
        celular: formData.celular,
        tipo_contratacion: formData.tipo_contratacion,
      };

      let empleadoId = formData.id;

      // Paso 1: Upsert personal_ac
      if (empleadoId) {
        const { error: updateError } = await supabase
          .from('personal_ac')
          .update(payload)
          .eq('id', empleadoId);
          
        if (updateError) throw updateError;
      } else {
        const { data: insertData, error: insertError } = await supabase
          .from('personal_ac')
          .insert([payload])
          .select()
          .single();
          
        if (insertError) throw insertError;
        empleadoId = insertData.id;
      }

      if (!empleadoId) throw new Error('No se pudo obtener el ID del empleado.');

      // Paso 2: Gestionar roles en personal_ac_roles
      if (formData.id) {
        // Eliminar roles anteriores si es una actualización
        const { error: deleteRolesError } = await supabase
          .from('personal_ac_roles')
          .delete()
          .eq('personal_ac_id', empleadoId);
          
        if (deleteRolesError) throw deleteRolesError;
      }

      // Insertar nuevos roles
      if (formData.selectedRoles.length > 0) {
        const rolesToInsert = formData.selectedRoles.map(roleId => ({
          personal_ac_id: empleadoId,
          role_id: roleId,
        }));
        
        const { error: insertRolesError } = await supabase
          .from('personal_ac_roles')
          .insert(rolesToInsert);
          
        if (insertRolesError) throw insertRolesError;
      }

      showToast('success', 'Empleado guardado exitosamente.');
      handleCloseModal();
      fetchData();
    } catch (err: any) {
      console.error('Error saving data:', err);
      showToast('error', err.message || 'Error al guardar el empleado.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (empleadoId: string) => {
    if (!window.confirm('¿Está seguro de que desea eliminar este empleado?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('personal_ac')
        .delete()
        .eq('id', empleadoId);
        
      if (error) throw error;
      
      showToast('success', 'Empleado eliminado exitosamente.');
      fetchData();
    } catch (err: any) {
      console.error('Error deleting data:', err);
      showToast('error', 'Error al eliminar el empleado.');
    }
  };

  const filteredPersonal = personal.filter(p => 
    p.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.dni?.includes(searchTerm)
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-white ${toastMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMessage.text}
        </div>
      )}

      {/* Header & Search */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Gestión de Personal</h1>
        
        <div className="flex w-full md:w-auto gap-4">
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Buscar por nombre, email, DNI..."
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
            <span>Nuevo Empleado</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center items-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mr-2" />
            Cargando...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="p-4 font-semibold text-gray-600">Nombre</th>
                  <th className="p-4 font-semibold text-gray-600">Contacto</th>
                  <th className="p-4 font-semibold text-gray-600">Tipo</th>
                  <th className="p-4 font-semibold text-gray-600">Roles</th>
                  <th className="p-4 font-semibold text-gray-600 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredPersonal.map((empleado) => (
                  <tr key={empleado.id} className="border-b hover:bg-gray-50">
                    <td className="p-4">
                      <div className="font-medium text-gray-900">{empleado.nombre_completo}</div>
                      <div className="text-sm text-gray-500">DNI: {empleado.dni || '-'}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-gray-900">{empleado.email}</div>
                      <div className="text-sm text-gray-500">{empleado.celular || '-'}</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${empleado.tipo_contratacion === 'INTERNO' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                        {empleado.tipo_contratacion}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {empleado.personal_ac_roles && empleado.personal_ac_roles.length > 0 ? (
                          empleado.personal_ac_roles.map((pr) => (
                            <span key={pr.role_id} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full border border-gray-200" title={pr.roles.nombre}>
                              {pr.roles.codigo}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400 italic">Sin roles</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(empleado)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Editar"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(empleado.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Eliminar"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPersonal.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No se encontraron empleados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal / Slide-over */}
      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="fixed inset-0 bg-black/50" onClick={handleCloseModal}></div>
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-50 animate-in slide-in-from-right">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">
                {formData.id ? 'Editar Empleado' : 'Nuevo Empleado'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <form id="empleadoForm" onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.nombre_completo}
                    onChange={(e) => setFormData({...formData, nombre_completo: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">DNI</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.dni}
                      onChange={(e) => setFormData({...formData, dni: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Celular</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.celular}
                      onChange={(e) => setFormData({...formData, celular: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Contratación *</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="tipo_contratacion"
                        value="INTERNO"
                        checked={formData.tipo_contratacion === 'INTERNO'}
                        onChange={() => setFormData({...formData, tipo_contratacion: 'INTERNO'})}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Interno</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="tipo_contratacion"
                        value="EXTERNO"
                        checked={formData.tipo_contratacion === 'EXTERNO'}
                        onChange={() => setFormData({...formData, tipo_contratacion: 'EXTERNO'})}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">Externo</span>
                    </label>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Roles Asignados</label>
                  <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                    {roles.map(role => (
                      <label key={role.id} className="flex items-start gap-3 p-2 hover:bg-gray-100 rounded-lg cursor-pointer transition">
                        <input
                          type="checkbox"
                          className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={formData.selectedRoles.includes(role.id)}
                          onChange={() => handleRoleToggle(role.id)}
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{role.nombre}</p>
                          <p className="text-xs text-gray-500">Cod: {role.codigo}</p>
                        </div>
                      </label>
                    ))}
                    {roles.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-2">No se encontraron roles disponibles.</p>
                    )}
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
                form="empleadoForm"
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
