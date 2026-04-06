import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Scale, Package, AlertTriangle, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Plus, UserPlus, X } from 'lucide-react';

interface RemitoState {
  id: number | null;
  ref: string;
  pedido_id: number | null;
  pedido: string;
  estado: string;
  chofer_id: number | null;
  camion_id: number | null;
  acoplado_id: number | null;
  inspector_id: number | null;
  supervisor_id: number | null;
}

export function RemitoEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // State
  const [remito, setRemito] = useState<RemitoState>({
    id: null,
    ref: 'Cargando...',
    pedido_id: null,
    pedido: '...',
    estado: 'Datos Faltantes',
    chofer_id: null,
    camion_id: null,
    acoplado_id: null,
    inspector_id: null,
    supervisor_id: null,
  });

  const [catalogs, setCatalogs] = useState({
    camiones: [] as any[],
    choferes: [] as any[],
    personal: [] as any[],
  });

  const [inspectors, setInspectors] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  
  const [lugaresPesaje, setLugaresPesaje] = useState<any[]>([]);

  const [pesaje, setPesaje] = useState({
    tara: { momento: 'Antes de cargar', lugar_id: null as number | 0 | null }, // 0 = Nuevo
    bruto: { momento: 'Después de cargar', lugar_id: 'IGUAL' as number | 0 | 'IGUAL' | null }, // 0 = Nuevo, 'IGUAL' = Igual a tara
  });
  
  const [nuevoLugarTara, setNuevoLugarTara] = useState({ nombre: '', direccion: '' });
  const [nuevoLugarBruto, setNuevoLugarBruto] = useState({ nombre: '', direccion: '' });

  const [checklist, setChecklist] = useState<any[]>([]);

  // UI state for inputs
  const [searchChofer, setSearchChofer] = useState('');
  const [showChoferList, setShowChoferList] = useState(false);
  const [dniChoferNuevo, setDniChoferNuevo] = useState('');
  const [celularChoferNuevo, setCelularChoferNuevo] = useState('');

  const [searchCamion, setSearchCamion] = useState('');
  const [showCamionList, setShowCamionList] = useState(false);

  const [searchAcoplado, setSearchAcoplado] = useState('');
  const [showAcopladoList, setShowAcopladoList] = useState(false);

  const [observacionesExtras, setObservacionesExtras] = useState('');

  useEffect(() => {
    fetchContext();
  }, [id]);

  const fetchContext = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      const { data, error } = await supabase.rpc('get_full_context_by_remito', { p_remito_id: Number(id) });
      if (error) throw error;
      
      const ctx = Array.isArray(data) ? data[0].get_full_context_by_remito || data[0] : data;
      if (!ctx) throw new Error("No se encontraron datos para este remito.");

      setCatalogs(ctx.catalogos);
      
      setRemito({
        id: ctx.remito?.id || null,
        ref: ctx.remito?.remito_ref_externa || 'Sin ref',
        pedido_id: null,
        pedido: ctx.pedidos && ctx.pedidos.length > 0
          ? ctx.pedidos.map((p: any) => p.pedido_ref).join(', ')
          : 'Sin ref',
        estado: ctx.remito?.estado_asignacion || 'Datos Faltantes',
        chofer_id: ctx.remito?.chofer_id || null,
        camion_id: ctx.remito?.camion_id || null,
        acoplado_id: ctx.remito?.acoplado_id || null,
        inspector_id: ctx.remito?.inspector_id || null,
        supervisor_id: ctx.remito?.supervisor_id || null,
      });

      let rawList = (ctx.remito?.protocolo_control && ctx.remito.protocolo_control.length > 0)
        ? ctx.remito.protocolo_control
        : ctx.catalogos.tareas_control;

      if (rawList) {
        setChecklist(rawList.map((item: any) => ({
          ...item,
          tarea_template: item.tarea_template || item.tarea,
          done: item.estado === 'COMPLETADO',
          tarea: item.tarea || item.tarea_template
        })));
      }

      // Obtener lugares de pesaje para los dropdowns
      const { data: lugaresRes } = await supabase.from('lugares_pesaje').select('*');
      if (lugaresRes) {
        setLugaresPesaje(lugaresRes);
      }

      // Catalogos que el nuevo RPC resolverá de manera optimizada:
      setInspectors(ctx.catalogos.inspectores || []);
      setSupervisors(ctx.catalogos.supervisores || []);

      // Pre-fill pesaje si existe en base de datos
      const taraLugar = ctx.remito?.tara_pesaje_lugar_id || null;
      const brutoLugar = ctx.remito?.bruto_pesaje_lugar_id || null;
      
      setPesaje({
        tara: { 
          momento: ctx.remito?.tara_pesaje_momento || 'Antes de cargar', 
          lugar_id: taraLugar 
        },
        bruto: { 
          momento: ctx.remito?.bruto_pesaje_momento || 'Después de cargar', 
          lugar_id: (brutoLugar && brutoLugar !== taraLugar) ? brutoLugar : 'IGUAL' 
        },
      });

      // Extraer observaciones previas si existiesen (ahora agrupadas en instrucciones)
      const prevInstrucciones = ctx.remito?.instrucciones_texto || '';
      if (prevInstrucciones.includes('Observaciones Extra:')) {
        setObservacionesExtras(prevInstrucciones.split('Observaciones Extra:\n')[1]);
      }

      // Pre-fill chofer
      if (ctx.remito?.chofer_id) {
        const c = ctx.catalogos.choferes.find((x: any) => x.id === ctx.remito.chofer_id);
        if (c) setSearchChofer(c.nombre);
      }
      if (ctx.remito?.camion_id) {
        const c = ctx.catalogos.camiones.find((x: any) => x.id === ctx.remito.camion_id);
        if (c) setSearchCamion(c.patente);
      }
      if (ctx.remito?.acoplado_id) {
        const c = ctx.catalogos.camiones.find((x: any) => x.id === ctx.remito.acoplado_id);
        if (c) setSearchAcoplado(c.patente);
      }

    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar contexto.');
    } finally {
      setLoading(false);
    }
  };

  const displayedChecklist = useMemo(() => {
    return checklist.filter(item => item.tipo_tarea === "CONTROL_GENERAL");
  }, [checklist]);

  // Derived computations
  const dniExistenteError = useMemo(() => {
    if (!dniChoferNuevo) return null;
    const exists = catalogs.choferes.some(c => (c.dni || '').replace(/\D/g, '') === dniChoferNuevo.replace(/\D/g, ''));
    return exists ? "Este DNI ya está registrado en el sistema." : null;
  }, [dniChoferNuevo, catalogs.choferes]);

  const filteredChoferes = useMemo(() => {
    const q = searchChofer.toLowerCase().replace(/\s+/g, '');
    const qClean = q.replace(/\D/g, '');
    if (!q) return catalogs.choferes;
    return catalogs.choferes.filter(c => {
      const nameMatch = (c.nombre || '').toLowerCase().includes(q);
      const dniClean = (c.dni || '').replace(/\D/g, '');
      const dniMatch = qClean && dniClean.includes(qClean);
      return nameMatch || dniMatch;
    });
  }, [searchChofer, catalogs.choferes]);

  const hasExactDniMatch = useMemo(() => {
    const qClean = searchChofer.replace(/\D/g, '');
    if (qClean.length < 7) return false;
    return catalogs.choferes.some(c => (c.dni || '').replace(/\D/g, '') === qClean);
  }, [searchChofer, catalogs.choferes]);

  const filteredCamiones = useMemo(() => {
    const q = searchCamion.toLowerCase();
    const list = catalogs.camiones.filter(c => c.tipo === 'CHASIS');
    if (!q) return list;
    return list.filter(c => c.patente.toLowerCase().includes(q));
  }, [searchCamion, catalogs.camiones]);

  const filteredAcoplados = useMemo(() => {
    const q = searchAcoplado.toLowerCase();
    const list = catalogs.camiones.filter(c => c.tipo === 'ACOPLADO');
    if (!q) return list;
    return list.filter(c => c.patente.toLowerCase().includes(q));
  }, [searchAcoplado, catalogs.camiones]);

  const resolvedTaraStr = useMemo(() => {
    if (pesaje.tara.lugar_id === 0) return nuevoLugarTara.nombre || '...';
    if (pesaje.tara.lugar_id) return lugaresPesaje.find(l => l.id === pesaje.tara.lugar_id)?.nombre || '...';
    return '...';
  }, [pesaje.tara.lugar_id, nuevoLugarTara.nombre, lugaresPesaje]);

  const resolvedBrutoStr = useMemo(() => {
    if (pesaje.bruto.lugar_id === 'IGUAL') return resolvedTaraStr;
    if (pesaje.bruto.lugar_id === 0) return nuevoLugarBruto.nombre || '...';
    if (pesaje.bruto.lugar_id) return lugaresPesaje.find(l => l.id === pesaje.bruto.lugar_id)?.nombre || '...';
    return '...';
  }, [pesaje.bruto.lugar_id, nuevoLugarBruto.nombre, resolvedTaraStr, lugaresPesaje]);

  const instruccionesGeneradas = useMemo(() => {
    const checklistText = displayedChecklist.map(t => `   [${t.done ? 'X' : ' '}] ${t.tarea}`).join('\n');
    return `1. Hacer Tara (${pesaje.tara.momento}) en ${resolvedTaraStr}.\n` +
      `2. Proceder a la carga del material con el siguiente Checklist de Control (General):\n${checklistText}\n` +
      `3. Pesar Bruto (${pesaje.bruto.momento}) en ${resolvedBrutoStr}.`;
  }, [pesaje.tara.momento, resolvedTaraStr, pesaje.bruto.momento, resolvedBrutoStr, displayedChecklist]);

  const toggleChecklist = (index: number) => {
    const newList = [...checklist];
    const itemIndex = checklist.findIndex(c => c.tarea === displayedChecklist[index].tarea);
    if(itemIndex > -1) {
      newList[itemIndex].done = !newList[itemIndex].done;
      setChecklist(newList);
    }
  };

  const resolveCamionId = async (patenteStr: string, tipo: 'CHASIS' | 'ACOPLADO'): Promise<number | null> => {
    if (!patenteStr.trim()) return null;
    
    // Si ya existe en el catálogo
    const existing = catalogs.camiones.find(c => c.patente.toUpperCase() === patenteStr.toUpperCase() && c.tipo === tipo);
    if (existing) return existing.id;
    
    // Si no existe, lo insertamos
    const { data, error } = await supabase.from('camiones').insert({
      patente: patenteStr.toUpperCase(),
      tipo: tipo
    }).select('id').single();
    
    if (error) {
      throw new Error(`No se pudo crear la patente ${patenteStr} (${tipo}): ${error.message}`);
    }
    return data.id;
  };

  const resolveLugarPesaje = async (id: number | 0 | 'IGUAL' | null, nuevoObj: {nombre: string, direccion: string}): Promise<number | null> => {
    if (id === 'IGUAL') return null; // Será manejado en el caller
    if (id !== 0 && id !== null) return id;
    if (id === 0) {
      if (!nuevoObj.nombre) return null;
      const { data, error } = await supabase.from('lugares_pesaje').insert({
        nombre: nuevoObj.nombre.toUpperCase(),
        direccion: nuevoObj.direccion || null
      }).select('id').single();
      if (error) throw new Error(`No se pudo crear el lugar de pesaje ${nuevoObj.nombre}`);
      return data.id;
    }
    return null;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Resolver chofer nuevo o existente
      if (remito.chofer_id === 0) {
        if (!searchChofer || !dniChoferNuevo || !celularChoferNuevo) {
          alert("Por favor complete nombre, DNI y celular del nuevo chofer.");
          setIsSubmitting(false);
          return;
        }
        if (dniExistenteError) {
          alert(dniExistenteError);
          setIsSubmitting(false);
          return;
        }
      } else if (!remito.chofer_id) {
        alert("Por favor seleccione un chofer o cargue uno nuevo.");
        setIsSubmitting(false);
        return;
      }

      // Resolver creación automática de Camión y Acoplado
      const finalCamionId = await resolveCamionId(searchCamion, 'CHASIS');
      if (!finalCamionId) {
        alert("Debe ingresar la patente del camión (chasis).");
        setIsSubmitting(false);
        return;
      }
      
      const finalAcopladoId = await resolveCamionId(searchAcoplado, 'ACOPLADO');

      // Resolver Lugares de Pesaje
      const finalTaraId = await resolveLugarPesaje(pesaje.tara.lugar_id, nuevoLugarTara);
      let finalBrutoId = pesaje.bruto.lugar_id === 'IGUAL' ? finalTaraId : await resolveLugarPesaje(pesaje.bruto.lugar_id, nuevoLugarBruto);
      
      const taraLugarNombre = finalTaraId ? (lugaresPesaje.find(l=>l.id === finalTaraId)?.nombre || nuevoLugarTara.nombre) : '...';
      const brutoLugarNombre = finalBrutoId ? (lugaresPesaje.find(l=>l.id === finalBrutoId)?.nombre || (pesaje.bruto.lugar_id==='IGUAL'?taraLugarNombre:nuevoLugarBruto.nombre)) : '...';

      const processedChecklist = checklist.map(item => {
        let finalTarea = item.tarea;
        let finalEstado = item.done ? 'COMPLETADO' : 'PENDIENTE';

        if (item.tipo_tarea === 'PESAJE_TARA') {
          finalTarea = (item.tarea_template || item.tarea).replace('{lugar}', taraLugarNombre);
          finalEstado = finalTaraId ? 'COMPLETADO' : 'PENDIENTE';
        } else if (item.tipo_tarea === 'PESAJE_BRUTO') {
          finalTarea = (item.tarea_template || item.tarea).replace('{lugar}', brutoLugarNombre);
          finalEstado = finalBrutoId ? 'COMPLETADO' : 'PENDIENTE';
        }

        return {
          ...item,
          tarea: finalTarea,
          estado: finalEstado
        };
      });

      const textoFinal = observacionesExtras.trim() ? `${instruccionesGeneradas}\n\nObservaciones Extra:\n${observacionesExtras}` : instruccionesGeneradas;

      const p_updates = {
        chofer_id: Number(remito.chofer_id),
        nombre_chofer_nuevo: remito.chofer_id === 0 ? searchChofer : null,
        dni_chofer_nuevo: remito.chofer_id === 0 ? dniChoferNuevo : null,
        celular_chofer_nuevo: remito.chofer_id === 0 ? celularChoferNuevo : null,
        camion_id: finalCamionId,
        acoplado_id: finalAcopladoId,
        supervisor_id: Number(remito.supervisor_id),
        inspector_id: Number(remito.inspector_id),
        instrucciones_texto: textoFinal,
        protocolo_control: processedChecklist,
        tara_pesaje_momento: pesaje.tara.momento,
        tara_pesaje_lugar_id: finalTaraId,
        bruto_pesaje_momento: pesaje.bruto.momento,
        bruto_pesaje_lugar_id: finalBrutoId
      };

      const { error } = await supabase.rpc('save_remito_update_admin', {
        p_remito_id: Number(id),
        p_updates: p_updates,
        p_admin_email: user?.email || 'unknown_admin'
      });

      if (error) throw error;
      
      setShowSuccess(true);
      setRemito(r => ({...r, estado: 'Completo / Pendiente Salida'}));

    } catch (err: any) {
      alert("Hubo un problema al guardar los cambios: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center h-[calc(100vh-4rem)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mb-4"></div>
        <p className="text-gray-500">Cargando datos del remito...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center h-[calc(100vh-4rem)]">
        <AlertCircle className="w-20 h-20 text-red-500 mb-6" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Error</h2>
        <p className="text-red-600 bg-red-50 p-4 rounded-xl border border-red-100">{errorMsg}</p>
        <button onClick={() => navigate('/remitos')} className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
          Volver a la lista
        </button>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in h-[calc(100vh-4rem)]">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
          <CheckCircle className="w-14 h-14" />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-4">¡Tarea Finalizada!</h2>
        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100 mb-8 max-w-md">
          Los datos del remito <b>{remito.ref}</b> han sido guardados exitosamente en el sistema.
        </div>
        <button 
          onClick={() => navigate('/remitos')}
          className="px-6 py-3 bg-brand-600 text-white font-semibold rounded-lg shadow hover:bg-brand-700 transition"
        >
          Volver al Monitor
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto w-full relative" onClick={() => {
      setShowChoferList(false);
      setShowCamionList(false);
      setShowAcopladoList(false);
    }}>
      <div className="max-w-4xl mx-auto pb-24 flex flex-col pt-6 font-sans px-4 lg:px-0">
        
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md shadow-sm p-4 mb-4 border border-gray-200 rounded-xl">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate('/remitos')}
                className="text-gray-400 hover:text-gray-600 p-1"
                title="Volver"
              >
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-gray-800">Remito #{remito.ref}</h1>
            </div>
            <p className="text-sm text-gray-500 mt-1 ml-9">Pedido: {remito.pedido}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${remito.estado === 'Datos Faltantes' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {remito.estado}
          </span>
        </div>
        {remito.estado === 'Datos Faltantes' && (
          <div className="mt-4 text-xs bg-amber-50 text-amber-700 border border-amber-200 p-2 rounded flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Completar datos para autorizar salida.
          </div>
        )}
      </header>

      <main className="px-4 space-y-8">
        {/* Sección A: Datos del Viaje */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-2">A. Datos del Viaje</h2>

          {/* Chofer Autocomplete */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Chofer</label>
            <div className="relative">
              <input 
                value={searchChofer}
                onChange={e => {
                  setSearchChofer(e.target.value);
                  setShowChoferList(true);
                }}
                onFocus={() => setShowChoferList(true)}
                onClick={e => e.stopPropagation()}
                type="text"
                placeholder="Buscar chofer por nombre o DNI..."
                className="w-full p-3 pr-10 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none transition-all"
              />
              <button onClick={(e) => { e.stopPropagation(); setShowChoferList(!showChoferList); }} type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showChoferList ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
              </button>
              
              {showChoferList && (
                <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-b-lg shadow-xl max-h-[250px] overflow-y-auto">
                  {filteredChoferes.map(c => (
                    <div 
                      key={c.id} 
                      onClick={() => { setRemito({...remito, chofer_id: c.id}); setSearchChofer(c.nombre || ''); setShowChoferList(false); }}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 flex justify-between items-center"
                    >
                      <span className="font-medium text-gray-800">{c.nombre}</span>
                      <span className="text-gray-400 text-xs font-mono">DNI: {c.dni}</span>
                    </div>
                  ))}
                  {!hasExactDniMatch && (
                    <div 
                      onClick={() => { setRemito({...remito, chofer_id: 0}); setShowChoferList(false); }}
                      className="p-4 text-center hover:bg-brand-50 cursor-pointer text-brand-600 font-bold border-t border-gray-100 bg-brand-50/50 flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Cargar Nuevo
                    </div>
                  )}
                </div>
              )}
            </div>

            {remito.chofer_id === 0 && (
              <div className="mt-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-2">
                    <UserPlus className="w-4 h-4"/> Nuevo Chofer
                  </h3>
                  <button onClick={() => { setRemito({...remito, chofer_id: null}); setSearchChofer(''); }} type="button" className="text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4"/>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">DNI</label>
                    <input 
                      value={dniChoferNuevo} 
                      onChange={e => setDniChoferNuevo(e.target.value.replace(/\D/g, ''))} 
                      placeholder="Ej: 21366111"
                      className={`w-full p-2 text-sm bg-white border rounded outline-none focus:ring-2 ${dniExistenteError ? 'border-red-500 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-500'}`}
                    />
                    {dniExistenteError && <p className="text-xs text-red-500 mt-1">{dniExistenteError}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">CELULAR</label>
                    <input 
                      value={celularChoferNuevo} 
                      onChange={e => setCelularChoferNuevo(e.target.value.replace(/\D/g, ''))} 
                      placeholder="Ej: 3816554433"
                      className="w-full p-2 text-sm bg-white border border-gray-200 rounded outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Vehiculos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Camión (Chasis)</label>
              <input 
                value={searchCamion}
                onChange={e => { setSearchCamion(e.target.value.toUpperCase()); setShowCamionList(true); }}
                onFocus={() => setShowCamionList(true)}
                onClick={e => e.stopPropagation()}
                placeholder="Patente"
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none uppercase"
              />
              {showCamionList && filteredCamiones.length > 0 && (
                <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-b-lg shadow-xl max-h-[200px] overflow-y-auto">
                  {filteredCamiones.map(c => (
                    <div 
                      key={c.id} 
                      onClick={() => { setRemito({...remito, camion_id: c.id}); setSearchCamion(c.patente || ''); setShowCamionList(false); }}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                    >{c.patente}</div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Acoplado (Opcional)</label>
              <input 
                value={searchAcoplado}
                onChange={e => { setSearchAcoplado(e.target.value.toUpperCase()); setShowAcopladoList(true); }}
                onFocus={() => setShowAcopladoList(true)}
                onClick={e => e.stopPropagation()}
                placeholder="Patente"
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none uppercase"
              />
              {showAcopladoList && filteredAcoplados.length > 0 && (
                <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-b-lg shadow-xl max-h-[200px] overflow-y-auto">
                  {filteredAcoplados.map(c => (
                    <div 
                      key={c.id} 
                      onClick={() => { setRemito({...remito, acoplado_id: c.id}); setSearchAcoplado(c.patente || ''); setShowAcopladoList(false); }}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                    >{c.patente}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Personal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inspector</label>
              <select 
                value={remito.inspector_id || ''} 
                onChange={e => setRemito({...remito, inspector_id: e.target.value ? Number(e.target.value) : null})}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Seleccionar...</option>
                {inspectors.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor (Operador)</label>
              <select 
                value={remito.supervisor_id || ''} 
                onChange={e => setRemito({...remito, supervisor_id: e.target.value ? Number(e.target.value) : null})}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Seleccionar...</option>
                {supervisors.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
            </select>
            </div>
          </div>
        </section>

        {/* Sección B: Configuración de Pesaje */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-2">B. Configuración de Pesaje</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tara */}
            <div className="bg-blue-50/50 p-5 rounded-xl border-l-4 border-l-blue-500 border border-blue-100">
              <div className="flex items-center gap-2 mb-4">
                <Scale className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-gray-800">Pesaje Tara (Vacío)</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500">Momento</label>
                  <select 
                    value={pesaje.tara.momento} 
                    onChange={e => setPesaje({...pesaje, tara: {...pesaje.tara, momento: e.target.value}})}
                    className="w-full mt-1 p-2 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500"
                  >
                    <option value="Antes de cargar">Antes de cargar</option>
                    <option value="Después de descargar">Después de descargar</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Lugar</label>
                  <select 
                    value={pesaje.tara.lugar_id === null ? '' : pesaje.tara.lugar_id}
                    onChange={e => setPesaje({...pesaje, tara: {...pesaje.tara, lugar_id: e.target.value === '0' ? 0 : Number(e.target.value)}})}
                    className="w-full mt-1 p-2 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">Seleccionar balanza...</option>
                    {lugaresPesaje.map(b => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                    <option value="0" className="font-bold text-blue-600">+ Nuevo Lugar...</option>
                  </select>
                </div>
                {pesaje.tara.lugar_id === 0 && (
                  <div className="bg-white p-3 rounded border border-blue-200 shadow-inner mt-2 space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Nombre</label>
                      <input 
                        value={nuevoLugarTara.nombre} 
                        onChange={e=>setNuevoLugarTara({...nuevoLugarTara, nombre: e.target.value})} 
                        className="w-full p-2 text-sm border border-gray-200 rounded outline-none focus:border-blue-500" placeholder="Ej: Báscula Sur" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Dirección (Opcional)</label>
                      <input 
                        value={nuevoLugarTara.direccion} 
                        onChange={e=>setNuevoLugarTara({...nuevoLugarTara, direccion: e.target.value})} 
                        className="w-full p-2 text-sm border border-gray-200 rounded outline-none focus:border-blue-500" placeholder="Ruta 9 Km 120" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bruto */}
            <div className="bg-emerald-50/50 p-5 rounded-xl border-l-4 border-l-emerald-500 border border-emerald-100">
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-gray-800">Pesaje Bruto (Lleno)</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500">Momento</label>
                  <select 
                    value={pesaje.bruto.momento} 
                    onChange={e => setPesaje({...pesaje, bruto: {...pesaje.bruto, momento: e.target.value}})}
                    className="w-full mt-1 p-2 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="Después de cargar">Después de cargar</option>
                    <option value="Antes de descargar">Antes de descargar</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Lugar</label>
                  <select 
                    value={pesaje.bruto.lugar_id === null ? '' : pesaje.bruto.lugar_id}
                    onChange={e => setPesaje({...pesaje, bruto: {...pesaje.bruto, lugar_id: e.target.value === 'IGUAL' ? 'IGUAL' : (e.target.value === '0' ? 0 : Number(e.target.value))}})}
                    className="w-full mt-1 p-2 bg-white border border-gray-200 rounded-md text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="IGUAL">Igual a Tara</option>
                    {lugaresPesaje.map(b => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                    <option value="0" className="font-bold text-emerald-600">+ Nuevo Lugar...</option>
                  </select>
                </div>
                {pesaje.bruto.lugar_id === 0 && (
                  <div className="bg-white p-3 rounded border border-emerald-200 shadow-inner mt-2 space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Nombre</label>
                      <input 
                        value={nuevoLugarBruto.nombre} 
                        onChange={e=>setNuevoLugarBruto({...nuevoLugarBruto, nombre: e.target.value})} 
                        className="w-full p-2 text-sm border border-gray-200 rounded outline-none focus:border-emerald-500" placeholder="Ej: Báscula Sur" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Dirección (Opcional)</label>
                      <input 
                        value={nuevoLugarBruto.direccion} 
                        onChange={e=>setNuevoLugarBruto({...nuevoLugarBruto, direccion: e.target.value})} 
                        className="w-full p-2 text-sm border border-gray-200 rounded outline-none focus:border-emerald-500" placeholder="Ruta 9 Km 120" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Sección C: Checklist e Instrucciones */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-2">C. Instrucciones y Protocolo</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 flex flex-col">
              <label className="block text-sm font-bold text-gray-800 mb-2">Instrucciones Generadas</label>
              <textarea 
                readOnly
                value={instruccionesGeneradas}
                rows={4}
                className="w-full p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 outline-none select-none flex-1"
              />
            </div>
            
            <div className="bg-blue-50/30 p-5 rounded-xl border border-blue-100 flex flex-col">
              <label className="block text-sm font-bold text-blue-800 mb-2">Observaciones / Indicaciones Generales</label>
              <textarea 
                value={observacionesExtras}
                onChange={e => setObservacionesExtras(e.target.value)}
                rows={4}
                placeholder="Escribe aquí cualquier observación manual o indicación especial..."
                className="w-full p-3 bg-white border border-blue-200 rounded-lg text-sm text-gray-700 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all flex-1"
              />
            </div>
          </div>

          <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
            <h3 className="text-sm font-bold mb-4 text-gray-800">Checklist de Control (General)</h3>
            <div className="space-y-3">
              {displayedChecklist.map((task, index) => (
                <label key={index} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 hover:border-marca-200 cursor-pointer transition shadow-sm">
                  <input 
                    type="checkbox" 
                    checked={task.done} 
                    onChange={() => toggleChecklist(index)}
                    className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500" 
                  />
                  <span className="text-sm text-gray-700 select-none">{task.tarea}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* Floating Footer Toolbar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-gray-200 z-50">
        <div className="max-w-4xl mx-auto flex justify-end gap-4">
          <button 
            type="button" 
            onClick={() => navigate('/remitos')}
            className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="px-8 py-3 bg-gray-900 text-white font-bold rounded-xl shadow-xl hover:bg-black active:scale-[0.98] transition-all flex items-center justify-center gap-2 min-w-[200px]"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Guardando...
              </span>
            ) : (
              "Guardar y Confirmar Datos"
            )}
          </button>
        </div>
      </div>

      </div>
    </div>
  );
}
