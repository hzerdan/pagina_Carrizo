import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Plus, 
  Search, 
  Edit2, 
  Loader2, 
  Settings, 
  ToggleLeft, 
  ToggleRight, 
  X,
  Clock,
  Zap,
  Info
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface LogisticaPolitica {
  id: number;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  espera_respuesta_minutos: number;
  umbral_carga_larga_minutos: number;
  intervalo_recordatorio_carga_corta_minutos: number;
  intervalo_recordatorio_carga_larga_minutos: number;
  max_recordatorios_sin_respuesta: number;
  pedir_confirmacion_fecha_carga: boolean;
  pedir_estimacion_demora_carga: boolean;
  enviar_recordatorios_carga: boolean;
  escalar_sin_respuesta: boolean;
  created_at: string;
  updated_at: string;
}

const initialFormData = {
  nombre: '',
  descripcion: '',
  activa: true,
  espera_respuesta_minutos: 5,
  umbral_carga_larga_minutos: 180,
  intervalo_recordatorio_carga_corta_minutos: 60,
  intervalo_recordatorio_carga_larga_minutos: 90,
  max_recordatorios_sin_respuesta: 2,
  pedir_confirmacion_fecha_carga: true,
  pedir_estimacion_demora_carga: true,
  enviar_recordatorios_carga: true,
  escalar_sin_respuesta: true
};

export function LogisticaPoliticasManager() {
  const [politicas, setPoliticas] = useState<LogisticaPolitica[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolitica, setEditingPolitica] = useState<LogisticaPolitica | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState(initialFormData);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('logistica_politicas_notificacion')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      setPoliticas(data || []);
    } catch (err: any) {
      console.error('Error fetching politicas:', err);
      showToast('error', 'Error al cargar las políticas.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenModal = (politica?: LogisticaPolitica) => {
    setErrorMsg(null);
    if (politica) {
      setEditingPolitica(politica);
      setFormData({
        nombre: politica.nombre,
        descripcion: politica.descripcion || '',
        activa: politica.activa,
        espera_respuesta_minutos: politica.espera_respuesta_minutos,
        umbral_carga_larga_minutos: politica.umbral_carga_larga_minutos,
        intervalo_recordatorio_carga_corta_minutos: politica.intervalo_recordatorio_carga_corta_minutos,
        intervalo_recordatorio_carga_larga_minutos: politica.intervalo_recordatorio_carga_larga_minutos,
        max_recordatorios_sin_respuesta: politica.max_recordatorios_sin_respuesta,
        pedir_confirmacion_fecha_carga: politica.pedir_confirmacion_fecha_carga,
        pedir_estimacion_demora_carga: politica.pedir_estimacion_demora_carga,
        enviar_recordatorios_carga: politica.enviar_recordatorios_carga,
        escalar_sin_respuesta: politica.escalar_sin_respuesta,
      });
    } else {
      setEditingPolitica(null);
      setFormData(initialFormData);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPolitica(null);
    setErrorMsg(null);
  };

  const handleToggleActiva = async (politica: LogisticaPolitica) => {
    try {
      const { error } = await supabase
        .from('logistica_politicas_notificacion')
        .update({ activa: !politica.activa })
        .eq('id', politica.id);

      if (error) throw error;
      showToast('success', `Política ${!politica.activa ? 'activada' : 'desactivada'} correctamente.`);
      await fetchData();
    } catch (err: any) {
      console.error('Error toggling activa:', err);
      showToast('error', 'Error al cambiar el estado de la política.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);

    // Frontend Validations
    if (!formData.nombre.trim()) {
      setErrorMsg('El nombre de la política es requerido.');
      setIsSaving(false);
      return;
    }

    if (formData.espera_respuesta_minutos <= 0 || 
        formData.umbral_carga_larga_minutos <= 0 || 
        formData.intervalo_recordatorio_carga_corta_minutos <= 0 || 
        formData.intervalo_recordatorio_carga_larga_minutos <= 0) {
      setErrorMsg('Los tiempos y umbrales deben ser mayores a 0.');
      setIsSaving(false);
      return;
    }

    if (formData.max_recordatorios_sin_respuesta < 0) {
      setErrorMsg('El máximo de recordatorios no puede ser negativo.');
      setIsSaving(false);
      return;
    }

    const payload = {
      ...formData,
      nombre: formData.nombre.trim(),
      descripcion: formData.descripcion.trim() || null,
      espera_respuesta_minutos: Math.floor(formData.espera_respuesta_minutos),
      umbral_carga_larga_minutos: Math.floor(formData.umbral_carga_larga_minutos),
      intervalo_recordatorio_carga_corta_minutos: Math.floor(formData.intervalo_recordatorio_carga_corta_minutos),
      intervalo_recordatorio_carga_larga_minutos: Math.floor(formData.intervalo_recordatorio_carga_larga_minutos),
      max_recordatorios_sin_respuesta: Math.floor(formData.max_recordatorios_sin_respuesta),
    };

    try {
      if (editingPolitica) {
        const { error } = await supabase
          .from('logistica_politicas_notificacion')
          .update(payload)
          .eq('id', editingPolitica.id);
        if (error) throw error;
        showToast('success', 'Política actualizada correctamente.');
      } else {
        const { error } = await supabase
          .from('logistica_politicas_notificacion')
          .insert([payload]);
        if (error) throw error;
        showToast('success', 'Política creada correctamente.');
      }
      
      await fetchData();
      handleCloseModal();
    } catch (err: any) {
      console.error('Error saving politica:', err);
      if (err.code === '23505') {
        setErrorMsg('Ya existe una política con ese nombre.');
      } else {
        setErrorMsg('Error al guardar: ' + err.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPoliticas = politicas.filter(p => 
    p.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      {/* Toast Notification */}
      {toast && (
        <div className={cn(
          "fixed top-6 right-6 z-[100] px-6 py-3 rounded-xl shadow-2xl text-white font-medium flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300",
          toast.type === 'success' ? "bg-emerald-600" : "bg-red-600"
        )}>
          {toast.type === 'success' ? <Zap className="w-5 h-5 fill-white/20" /> : <Info className="w-5 h-5" />}
          {toast.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Options */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Settings className="w-6 h-6 text-brand-600" />
              Políticas de Notificación Logística
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Administra los tiempos, umbrales y automatizaciones de avisos por WhatsApp a choferes.
            </p>
          </div>
          
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition shadow-sm font-medium"
          >
            <Plus className="w-5 h-5" />
            Nueva Política
          </button>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre de política..."
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
              <p className="text-sm text-gray-500 mt-4">Cargando políticas...</p>
            </div>
          ) : filteredPoliticas.length === 0 ? (
            <div className="text-center py-20 text-gray-500 text-sm">
              No se encontraron políticas registradas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-700 uppercase font-semibold text-xs border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Nombre</th>
                    <th className="px-6 py-4">Activa</th>
                    <th className="px-6 py-4">Espera Rpta.</th>
                    <th className="px-6 py-4">Umbral Larga</th>
                    <th className="px-6 py-4">Int. Corta</th>
                    <th className="px-6 py-4">Int. Larga</th>
                    <th className="px-6 py-4">Máx. Record.</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPoliticas.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{p.nombre}</div>
                        <div className="text-xs text-gray-400 truncate max-w-[200px]">{p.descripcion}</div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleActiva(p)}
                          className="flex items-center gap-2 group"
                        >
                          {p.activa ? (
                            <ToggleRight className="w-6 h-6 text-emerald-500 group-hover:text-emerald-600 transition" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-gray-300 group-hover:text-gray-400 transition" />
                          )}
                          <span className={cn(
                            "text-xs font-semibold px-2 py-0.5 rounded-full",
                            p.activa ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                          )}>
                            {p.activa ? 'Activa' : 'Inactiva'}
                          </span>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-mono">{p.espera_respuesta_minutos}m</td>
                      <td className="px-6 py-4 text-gray-600 font-mono">{p.umbral_carga_larga_minutos}m</td>
                      <td className="px-6 py-4 text-gray-600 font-mono">{p.intervalo_recordatorio_carga_corta_minutos}m</td>
                      <td className="px-6 py-4 text-gray-600 font-mono">{p.intervalo_recordatorio_carga_larga_minutos}m</td>
                      <td className="px-6 py-4 text-gray-600 font-mono">{p.max_recordatorios_sin_respuesta}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleOpenModal(p)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar Política"
                        >
                          <Edit2 className="w-4 h-4" />
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
          <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col pt-16 lg:pt-0 transform transition-transform animate-in slide-in-from-right duration-300">
            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  {editingPolitica ? <Edit2 className="w-5 h-5 text-brand-600" /> : <Plus className="w-5 h-5 text-brand-600" />}
                  {editingPolitica ? 'Editar Política' : 'Nueva Política'}
                </h2>
                <button onClick={handleCloseModal} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              
              {errorMsg && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 flex items-start gap-3">
                  <Info className="w-5 h-5 flex-shrink-0" />
                  {errorMsg}
                </div>
              )}

              <form id="politica-form" onSubmit={handleSubmit} className="space-y-8">
                
                {/* Sección 1: Identificación */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <Info className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Sección 1: Identificación</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la política *</label>
                      <input
                        type="text"
                        required
                        value={formData.nombre}
                        onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                        placeholder="Ej. Estricto, Flexible, Fin de semana..."
                      />
                      <p className="mt-1 text-[11px] text-gray-400">Nombre interno identificable.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                      <textarea
                        value={formData.descripcion}
                        onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm min-h-[80px]"
                        placeholder="Explica brevemente el uso de esta política..."
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div>
                        <span className="block text-sm font-semibold text-gray-700">Política activa</span>
                        <span className="text-[11px] text-gray-500">Permite habilitar o deshabilitar esta política sin eliminarla.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, activa: !formData.activa})}
                        className="group flex items-center gap-2"
                      >
                        {formData.activa ? (
                          <ToggleRight className="w-8 h-8 text-emerald-500 transition-colors" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-gray-300 transition-colors" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sección 2: Tiempos y umbrales */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <Clock className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Sección 2: Tiempos y umbrales</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Espera de respuesta (minutos)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={formData.espera_respuesta_minutos}
                        onChange={(e) => setFormData({...formData, espera_respuesta_minutos: parseInt(e.target.value) || 0})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Umbral de carga larga (minutos)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={formData.umbral_carga_larga_minutos}
                        onChange={(e) => setFormData({...formData, umbral_carga_larga_minutos: parseInt(e.target.value) || 0})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Int. recordatorio carga corta (minutos)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={formData.intervalo_recordatorio_carga_corta_minutos}
                        onChange={(e) => setFormData({...formData, intervalo_recordatorio_carga_corta_minutos: parseInt(e.target.value) || 0})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Int. recordatorio carga larga (minutos)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={formData.intervalo_recordatorio_carga_larga_minutos}
                        onChange={(e) => setFormData({...formData, intervalo_recordatorio_carga_larga_minutos: parseInt(e.target.value) || 0})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Máximo de recordatorios sin respuesta</label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={formData.max_recordatorios_sin_respuesta}
                        onChange={(e) => setFormData({...formData, max_recordatorios_sin_respuesta: parseInt(e.target.value) || 0})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Sección 3: Automatizaciones */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <Zap className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Sección 3: Automatizaciones</h3>
                  </div>
                  
                  <div className="space-y-3">
                    {[
                      { key: 'pedir_confirmacion_fecha_carga', label: 'Pedir confirmación de fecha/hora de carga', desc: 'El sistema solicita confirmar o actualizar la fecha y hora probable de carga.' },
                      { key: 'pedir_estimacion_demora_carga', label: 'Pedir estimación de demora de carga', desc: 'Al llegar a carga el sistema solicita indicar cuánto tiempo estima que demorará.' },
                      { key: 'enviar_recordatorios_carga', label: 'Enviar recordatorios durante la carga', desc: 'El sistema envía recordatorios periódicos durante el proceso de carga.' },
                      { key: 'escalar_sin_respuesta', label: 'Escalar si no responde', desc: 'Se notificará al responsable cuando el chofer no responda después del máximo definido.' },
                    ].map((item) => (
                      <label key={item.key} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <div>
                          <span className="block text-sm font-semibold text-gray-700">{item.label}</span>
                          <span className="text-[11px] text-gray-500">{item.desc}</span>
                        </div>
                        <div className="relative">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={formData[item.key as keyof typeof formData] as boolean}
                            onChange={(e) => setFormData({...formData, [item.key]: e.target.checked})}
                          />
                          <div className={cn(
                            "w-10 h-6 rounded-full transition-colors",
                            formData[item.key as keyof typeof formData] ? "bg-brand-600" : "bg-gray-300"
                          )}>
                            <div className={cn(
                              "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform",
                              formData[item.key as keyof typeof formData] ? "translate-x-4" : "translate-x-0"
                            )} />
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

              </form>
            </div>
            
            {/* Modal Footer */}
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSaving}
                className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="politica-form"
                disabled={isSaving}
                className="px-6 py-2 flex items-center gap-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-sm disabled:opacity-70"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSaving ? 'Guardando...' : 'Guardar Política'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
