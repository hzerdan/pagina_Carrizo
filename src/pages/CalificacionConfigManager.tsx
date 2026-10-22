import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Star, 
  Sliders, 
  Save, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ShieldCheck,
  Zap,
  Info,
  History
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface CalificacionConfig {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  peso_cumplimiento_tareas: number;
  peso_autonomia_recordatorios: number;
  peso_sin_escalamiento: number;
  factor_tarea_critica: number;
  penalizacion_por_recordatorio: number;
  penalizacion_reintentos_agotados: number;
  ventana_viajes_promedio: number;
  minimo_viajes_consolidado: number;
  created_at?: string;
  updated_at?: string;
}

export function CalificacionConfigManager() {
  const [, setConfigs] = useState<CalificacionConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<CalificacionConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReevaluating, setIsReevaluating] = useState(false);
  const [reevalResult, setReevalResult] = useState<any | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form editable state
  const [form, setForm] = useState({
    nombre: 'Configuración Estándar',
    descripcion: '',
    peso_cumplimiento_tareas: 55,
    peso_autonomia_recordatorios: 30,
    peso_sin_escalamiento: 15,
    factor_tarea_critica: 2.0,
    penalizacion_por_recordatorio: 15,
    penalizacion_reintentos_agotados: 40,
    ventana_viajes_promedio: 15,
    minimo_viajes_consolidado: 5,
  });

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchConfigs = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('calificacion_config')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setConfigs(data);
        const active = data.find(c => c.activo) || data[0];
        setActiveConfig(active);
        setForm({
          nombre: active.nombre,
          descripcion: active.descripcion || '',
          peso_cumplimiento_tareas: Number(active.peso_cumplimiento_tareas),
          peso_autonomia_recordatorios: Number(active.peso_autonomia_recordatorios),
          peso_sin_escalamiento: Number(active.peso_sin_escalamiento),
          factor_tarea_critica: Number(active.factor_tarea_critica),
          penalizacion_por_recordatorio: Number(active.penalizacion_por_recordatorio),
          penalizacion_reintentos_agotados: Number(active.penalizacion_reintentos_agotados),
          ventana_viajes_promedio: Number(active.ventana_viajes_promedio),
          minimo_viajes_consolidado: Number(active.minimo_viajes_consolidado),
        });
      }
    } catch (err: any) {
      console.error('Error fetching calificacion_config:', err);
      showToast('error', 'No se pudo cargar la configuración de calificaciones.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const sumaPesos = Number(
    (
      Number(form.peso_cumplimiento_tareas) +
      Number(form.peso_autonomia_recordatorios) +
      Number(form.peso_sin_escalamiento)
    ).toFixed(2)
  );

  const esValido100 = Math.abs(sumaPesos - 100) < 0.01;

  const autoEquilibrar = () => {
    const diff = 100 - (Number(form.peso_cumplimiento_tareas) + Number(form.peso_autonomia_recordatorios));
    setForm(prev => ({
      ...prev,
      peso_sin_escalamiento: Math.max(0, Math.min(100, Math.round(diff * 10) / 10))
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!esValido100) {
      showToast('error', `Los 3 pesos principales deben sumar exactamente 100% (actual: ${sumaPesos}%).`);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        activo: true,
        peso_cumplimiento_tareas: form.peso_cumplimiento_tareas,
        peso_autonomia_recordatorios: form.peso_autonomia_recordatorios,
        peso_sin_escalamiento: form.peso_sin_escalamiento,
        factor_tarea_critica: form.factor_tarea_critica,
        penalizacion_por_recordatorio: form.penalizacion_por_recordatorio,
        penalizacion_reintentos_agotados: form.penalizacion_reintentos_agotados,
        ventana_viajes_promedio: form.ventana_viajes_promedio,
        minimo_viajes_consolidado: form.minimo_viajes_consolidado,
        updated_at: new Date().toISOString(),
      };

      if (activeConfig?.id) {
        const { error } = await supabase
          .from('calificacion_config')
          .update(payload)
          .eq('id', activeConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('calificacion_config')
          .insert([payload]);
        if (error) throw error;
      }

      showToast('success', 'Configuración de calificaciones guardada exitosamente.');
      await fetchConfigs();
    } catch (err: any) {
      console.error('Error saving config:', err);
      showToast('error', err.message || 'Error al guardar la configuración.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReevaluar = async () => {
    if (!window.confirm('¿Deseas ejecutar la reevaluación histórica con los pesos guardados? Esto actualizará todos los remitos, choferes y transportistas.')) {
      return;
    }

    setIsReevaluating(true);
    setReevalResult(null);
    try {
      const { data, error } = await supabase.rpc('reevaluar_calificaciones');
      if (error) throw error;

      setReevalResult(data);
      showToast('success', `Reevaluación completada: ${data?.remitos_procesados || 0} remitos procesados.`);
    } catch (err: any) {
      console.error('Error en reevaluación:', err);
      showToast('error', err.message || 'Error al ejecutar la reevaluación histórica.');
    } finally {
      setIsReevaluating(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Toast Alert */}
        {toast && (
          <div className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in fade-in slide-in-from-bottom-5",
            toast.type === 'success' 
              ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
              : "bg-red-50 border-red-200 text-red-800"
          )}>
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <Star className="w-7 h-7 text-amber-500 fill-amber-400" />
              Políticas y Pesos de Calificación
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Modela y ajusta la fórmula matemática de evaluación de 1 a 5 estrellas para choferes, remitos y transportistas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReevaluar}
              disabled={isReevaluating || isLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-xl transition font-medium text-sm disabled:opacity-50 cursor-pointer shadow-xs"
            >
              <RefreshCw className={cn("w-4 h-4", isReevaluating && "animate-spin")} />
              {isReevaluating ? 'Reevaluando...' : 'Reevaluar Histórico'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !esValido100 || isLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition font-medium text-sm disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Guardando...' : 'Guardar Pesos'}
            </button>
          </div>
        </div>

        {/* Feedback de Reevaluación Reciente */}
        {reevalResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between text-sm text-emerald-900">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-bold">Reevaluación Histórica Finalizada con Éxito</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Se actualizaron <strong>{reevalResult.remitos_procesados}</strong> remitos, <strong>{reevalResult.choferes_procesados}</strong> choferes y <strong>{reevalResult.transportistas_procesados}</strong> transportistas con la fórmula activa.
                </p>
              </div>
            </div>
            <button
              onClick={() => setReevalResult(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold px-2 py-1 rounded"
            >
              Cerrar
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="bg-white rounded-2xl p-16 flex flex-col items-center justify-center border border-gray-100 shadow-sm">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
            <p className="text-sm text-gray-500 mt-3">Cargando parámetros de calificación...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">

            {/* SECCIÓN 1: LOS 3 PESOS PRINCIPALES CON SLIDERS Y BARRA INTERACTIVA */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-5 h-5 text-brand-600" />
                  <h2 className="text-base font-bold text-gray-900">1. Dimensiones Ponderadas del Viaje</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">Suma Total:</span>
                  <span className={cn(
                    "text-xs font-bold px-2.5 py-1 rounded-full border",
                    esValido100
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  )}>
                    {sumaPesos}% {esValido100 ? '✓ Equilibrado' : '(Debe sumar 100%)'}
                  </span>
                  {!esValido100 && (
                    <button
                      type="button"
                      onClick={autoEquilibrar}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-md transition font-medium"
                    >
                      Ajustar al 100%
                    </button>
                  )}
                </div>
              </div>

              {/* Barra de Distribución Visual */}
              <div className="space-y-2">
                <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
                  <div 
                    style={{ width: `${Math.min(100, Math.max(0, form.peso_cumplimiento_tareas))}%` }} 
                    className="bg-brand-600 transition-all duration-200"
                    title={`Cumplimiento de Tareas: ${form.peso_cumplimiento_tareas}%`}
                  />
                  <div 
                    style={{ width: `${Math.min(100, Math.max(0, form.peso_autonomia_recordatorios))}%` }} 
                    className="bg-indigo-500 transition-all duration-200"
                    title={`Autonomía y Recordatorios: ${form.peso_autonomia_recordatorios}%`}
                  />
                  <div 
                    style={{ width: `${Math.min(100, Math.max(0, form.peso_sin_escalamiento))}%` }} 
                    className="bg-emerald-500 transition-all duration-200"
                    title={`Ausencia de Escalamiento: ${form.peso_sin_escalamiento}%`}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-gray-500 font-medium">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-600"></span> Tareas ({form.peso_cumplimiento_tareas}%)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Autonomía ({form.peso_autonomia_recordatorios}%)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Sin Escalamiento ({form.peso_sin_escalamiento}%)</span>
                </div>
              </div>

              {/* Sliders Interactivos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                
                {/* Slider A: Tareas */}
                <div className="bg-brand-50/50 p-4 rounded-xl border border-brand-100 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-brand-600" />
                      Cumplimiento de Tareas
                    </label>
                    <span className="text-sm font-black text-brand-700 bg-white px-2 py-0.5 rounded-lg border border-brand-200">
                      {form.peso_cumplimiento_tareas}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={form.peso_cumplimiento_tareas}
                    onChange={(e) => setForm({ ...form, peso_cumplimiento_tareas: Number(e.target.value) })}
                    className="w-full accent-brand-600 cursor-pointer"
                  />
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Premia el reporte de fotos, comprobantes y controles del protocolo. Las tareas no realizadas restan.
                  </p>
                </div>

                {/* Slider B: Autonomía */}
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-indigo-600" />
                      Autonomía / Sin Avisos
                    </label>
                    <span className="text-sm font-black text-indigo-700 bg-white px-2 py-0.5 rounded-lg border border-indigo-200">
                      {form.peso_autonomia_recordatorios}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={form.peso_autonomia_recordatorios}
                    onChange={(e) => setForm({ ...form, peso_autonomia_recordatorios: Number(e.target.value) })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Premia a los choferes que responden al primer aviso o reportan espontáneamente sin recordatorios.
                  </p>
                </div>

                {/* Slider C: Escalamiento */}
                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Sin Escalamiento Humano
                    </label>
                    <span className="text-sm font-black text-emerald-700 bg-white px-2 py-0.5 rounded-lg border border-emerald-200">
                      {form.peso_sin_escalamiento}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={form.peso_sin_escalamiento}
                    onChange={(e) => setForm({ ...form, peso_sin_escalamiento: Number(e.target.value) })}
                    className="w-full accent-emerald-600 cursor-pointer"
                  />
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Premia que el viaje se resuelva 100% por bot sin requerir llamada telefónica ni intervención del operador.
                  </p>
                </div>

              </div>
            </div>

            {/* SECCIÓN 2: FACTORES, SEVERIDAD Y AGREGACIÓN */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Factores y Penalizaciones */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  <h3 className="text-sm font-bold text-gray-900">Multiplicadores y Penalizaciones</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-gray-700">Multiplicador Tarea Crítica</label>
                      <span className="text-xs font-bold text-gray-900">{form.factor_tarea_critica}x</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="3.0"
                      step="0.1"
                      value={form.factor_tarea_critica}
                      onChange={(e) => setForm({ ...form, factor_tarea_critica: Number(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Fotos de remito firmado y pesajes valen el doble o triple que avisos de texto estándar.
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-gray-700">Penalización por Recordatorio</label>
                      <span className="text-xs font-bold text-red-600">-{form.penalizacion_por_recordatorio}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      step="1"
                      value={form.penalizacion_por_recordatorio}
                      onChange={(e) => setForm({ ...form, penalizacion_por_recordatorio: Number(e.target.value) })}
                      className="w-full accent-red-500 cursor-pointer"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Porcentaje que se descuenta del bloque de autonomía por cada mensaje de insistencia enviado.
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-gray-700">Penalización Reintentos Agotados</label>
                      <span className="text-xs font-bold text-red-600">-{form.penalizacion_reintentos_agotados}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="60"
                      step="5"
                      value={form.penalizacion_reintentos_agotados}
                      onChange={(e) => setForm({ ...form, penalizacion_reintentos_agotados: Number(e.target.value) })}
                      className="w-full accent-red-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Castigo adicional si el chofer agota todos los reintentos automáticos sin responder.
                    </p>
                  </div>
                </div>
              </div>

              {/* Criterios de Agregación Histórica */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <History className="w-5 h-5 text-brand-600" />
                  <h3 className="text-sm font-bold text-gray-900">Agregación del Chofer y Transportista</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-gray-700">Ventana de Viajes para el Promedio</label>
                      <span className="text-xs font-bold text-gray-900">Últimos {form.ventana_viajes_promedio} viajes</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      step="1"
                      value={form.ventana_viajes_promedio}
                      onChange={(e) => setForm({ ...form, ventana_viajes_promedio: Number(e.target.value) })}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Calcula el promedio móvil sobre los últimos N viajes. Permite que un chofer que mejoró recupere su calificación.
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-gray-700">Mínimo de Viajes para Chofer Consolidado</label>
                      <span className="text-xs font-bold text-gray-900">{form.minimo_viajes_consolidado} viajes</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={form.minimo_viajes_consolidado}
                      onChange={(e) => setForm({ ...form, minimo_viajes_consolidado: Number(e.target.value) })}
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Choferes con menos viajes se marcan con la insignia "Nuevo" para indicar muestra estadística reducida.
                    </p>
                  </div>

                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 text-[11px] text-gray-600 space-y-1">
                    <span className="font-bold text-gray-800 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-brand-600" />
                      Escala de Niveles del Chofer:
                    </span>
                    <ul className="list-disc pl-4 space-y-0.5 text-gray-500">
                      <li><strong className="text-emerald-700">Excelente:</strong> ⭐ 4.5 o más</li>
                      <li><strong className="text-blue-700">Bueno:</strong> ⭐ 3.5 a 4.4</li>
                      <li><strong className="text-amber-700">Regular:</strong> ⭐ 2.5 a 3.4</li>
                      <li><strong className="text-red-700">Crítico:</strong> Menos de ⭐ 2.5</li>
                    </ul>
                  </div>
                </div>
              </div>

            </div>

          </form>
        )}

      </div>
    </div>
  );
}
export default CalificacionConfigManager;
