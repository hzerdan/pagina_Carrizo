import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Scale, 
  Package, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  UserPlus, 
  X, 
  MessageSquare, 
  Settings, 
  Clock, 
  Info, 
  Loader2,
  Zap,
  Truck,
  CheckSquare
} from 'lucide-react';
import { cn } from '../lib/utils';
import { WhatsAppModal } from '../components/WhatsAppModal';

interface RemitoState {
  id: number | null;
  ref: string;
  pedido_id: number | null;
  pedido: string;
  cliente: string;
  estado: string;
  chofer_id: number | null;
  camion_id: number | null;
  acoplado_id: number | null;
  inspector_id: number | null;
  supervisor_id: number | null;
  operador_id: number | null;
  fecha_hora_estimada_carga: string | null;
  debe_pasar_por_reembolse: boolean;
  es_flete_corto: boolean;
  cantidad_total: number | null;
}

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
}

export interface LogisticaOverride {
  id: number;
  remito_id: number;
  vigente: boolean;
  espera_respuesta_minutos: number | null;
  umbral_carga_larga_minutos: number | null;
  intervalo_recordatorio_carga_corta_minutos: number | null;
  intervalo_recordatorio_carga_larga_minutos: number | null;
  max_recordatorios_sin_respuesta: number | null;
  pedir_confirmacion_fecha_carga: boolean | null;
  pedir_estimacion_demora_carga: boolean | null;
  enviar_recordatorios_carga: boolean | null;
  escalar_sin_respuesta: boolean | null;
  omitir_notificaciones_chofer: boolean | null;
  omitir_confirmacion_fecha_carga: boolean | null;
  omitir_estimacion_demora_carga: boolean | null;
  omitir_recordatorios_carga: boolean | null;
  motivo: string | null;
  creado_por_id: number | null;
  creado_por_email: string | null;
  created_at: string;
}

export function RemitoEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, personalAcId } = useAuth();

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
    cliente: '...',
    estado: 'Datos Faltantes',
    chofer_id: null,
    camion_id: null,
    acoplado_id: null,
    inspector_id: null,
    supervisor_id: null,
    operador_id: null,
    fecha_hora_estimada_carga: null,
    debe_pasar_por_reembolse: false,
    es_flete_corto: false,
    cantidad_total: null,
  });

  const [catalogs, setCatalogs] = useState({
    camiones: [] as any[],
    choferes: [] as any[],
    personal: [] as any[],
  });

  const [inspectors, setInspectors] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [operadores, setOperadores] = useState<any[]>([]);
  
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
  const [isConfirmingChofer, setIsConfirmingChofer] = useState(false);

  const [searchCamion, setSearchCamion] = useState('');
  const [showCamionList, setShowCamionList] = useState(false);

  const [searchAcoplado, setSearchAcoplado] = useState('');
  const [showAcopladoList, setShowAcopladoList] = useState(false);

  const [observacionesExtras, setObservacionesExtras] = useState('');
  const [showWpModal, setShowWpModal] = useState(false);

  // Logistics Config / Override State
  const [defaultPolicy, setDefaultPolicy] = useState<LogisticaPolitica | null>(null);
  const [currentOverride, setCurrentOverride] = useState<LogisticaOverride | null>(null);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [overrideHistory, setOverrideHistory] = useState<LogisticaOverride[]>([]);
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  const [overrideForm, setOverrideForm] = useState({
    espera_respuesta_minutos: '' as string | number,
    umbral_carga_larga_minutos: '' as string | number,
    intervalo_recordatorio_carga_corta_minutos: '' as string | number,
    intervalo_recordatorio_carga_larga_minutos: '' as string | number,
    max_recordatorios_sin_respuesta: '' as string | number,
    pedir_confirmacion_fecha_carga: null as boolean | null,
    pedir_estimacion_demora_carga: null as boolean | null,
    enviar_recordatorios_carga: null as boolean | null,
    escalar_sin_respuesta: null as boolean | null,
    omitir_notificaciones_chofer: false,
    omitir_confirmacion_fecha_carga: false,
    omitir_estimacion_demora_carga: false,
    omitir_recordatorios_carga: false,
    motivo: '',
  });

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
        cliente: ctx.pedidos && ctx.pedidos.length > 0 ? ctx.pedidos[0].cliente : 'No informado',
        estado: ctx.remito?.estado_asignacion || 'Datos Faltantes',
        chofer_id: ctx.remito?.chofer_id || null,
        camion_id: ctx.remito?.camion_id || null,
        acoplado_id: ctx.remito?.acoplado_id || null,
        inspector_id: ctx.remito?.inspector_id || null,
        supervisor_id: ctx.remito?.supervisor_id || null,
        operador_id: ctx.remito?.operador_id || null,
        fecha_hora_estimada_carga: ctx.remito?.fecha_hora_estimada_carga || null,
        debe_pasar_por_reembolse: ctx.remito?.debe_pasar_por_reembolse || false,
        es_flete_corto: ctx.remito?.es_flete_corto || false,
        cantidad_total: ctx.remito?.cantidad_total !== undefined ? ctx.remito?.cantidad_total : null,
      });

      const savedProtocol = ctx.remito?.protocolo_control || [];
      const catalogTasks = ctx.catalogos.tareas_control || [];
      
      // Unificamos el protocolo guardado con el catálogo para asegurar que 
      // si se guardó solo pesaje (por inspector), las tareas de carga sigan apareciendo en la UI.
      const mergedList = [...savedProtocol];
      catalogTasks.forEach((catTask: any) => {
        const taskName = catTask.tarea_template || catTask.tarea;
        const isPresent = mergedList.some(s => 
          (s.tarea_template === taskName) || (s.tarea === taskName)
        );
        if (!isPresent) {
          mergedList.push({
            ...catTask,
            estado: 'PENDIENTE'
          });
        }
      });

      if (mergedList.length > 0) {
        const hasInspector = !!ctx.remito?.inspector_id;
        setChecklist(mergedList.map((item: any) => {
          let isAsignadaChofer = true;
          if (item.asignada_a_chofer !== undefined) {
            isAsignadaChofer = !!item.asignada_a_chofer;
          } else {
            if (item.tipo_tarea === 'CONTROL_GENERAL') {
              isAsignadaChofer = !hasInspector;
            } else {
              isAsignadaChofer = true;
            }
          }
          return {
            ...item,
            tarea_template: item.tarea_template || item.tarea,
            done: item.estado === 'COMPLETADO',
            tarea: item.tarea || item.tarea_template,
            asignada_a_chofer: isAsignadaChofer
          };
        }));
      }

      // Obtener lugares de pesaje para los dropdowns
      const { data: lugaresRes } = await supabase.from('lugares_pesaje').select('*');
      if (lugaresRes) {
        setLugaresPesaje(lugaresRes);
      }

      // Catalogos que el nuevo RPC resolverá de manera optimizada:
      setInspectors(ctx.catalogos.inspectores || []);
      setSupervisors(ctx.catalogos.supervisores || []);
      setOperadores(ctx.catalogos.operadores || []);

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

      // 4. Cargar Políticas Logísticas y Overrides
      const [policyRes, overrideRes] = await Promise.all([
        supabase
          .from('logistica_politicas_notificacion')
          .select('*')
          .eq('nombre', 'default')
          .eq('activa', true)
          .maybeSingle(),
        supabase
          .from('logistica_politicas_notificacion_override')
          .select('*')
          .eq('remito_id', Number(id))
          .eq('vigente', true)
          .maybeSingle()
      ]);

      if (policyRes.data) setDefaultPolicy(policyRes.data);
      if (overrideRes.data) {
        setCurrentOverride(overrideRes.data);
        // Inicializar form con valores del override
        setOverrideForm({
          espera_respuesta_minutos: overrideRes.data.espera_respuesta_minutos ?? '',
          umbral_carga_larga_minutos: overrideRes.data.umbral_carga_larga_minutos ?? '',
          intervalo_recordatorio_carga_corta_minutos: overrideRes.data.intervalo_recordatorio_carga_corta_minutos ?? '',
          intervalo_recordatorio_carga_larga_minutos: overrideRes.data.intervalo_recordatorio_carga_larga_minutos ?? '',
          max_recordatorios_sin_respuesta: overrideRes.data.max_recordatorios_sin_respuesta ?? '',
          pedir_confirmacion_fecha_carga: overrideRes.data.pedir_confirmacion_fecha_carga,
          pedir_estimacion_demora_carga: overrideRes.data.pedir_estimacion_demora_carga,
          enviar_recordatorios_carga: overrideRes.data.enviar_recordatorios_carga,
          escalar_sin_respuesta: overrideRes.data.escalar_sin_respuesta,
          omitir_notificaciones_chofer: !!overrideRes.data.omitir_notificaciones_chofer,
          omitir_confirmacion_fecha_carga: !!overrideRes.data.omitir_confirmacion_fecha_carga,
          omitir_estimacion_demora_carga: !!overrideRes.data.omitir_estimacion_demora_carga,
          omitir_recordatorios_carga: !!overrideRes.data.omitir_recordatorios_carga,
          motivo: '',
        });
      } else if (policyRes.data) {
        // Inicializar form con valores de la política default si no hay override
        setOverrideForm(prev => ({
          ...prev,
          espera_respuesta_minutos: policyRes.data.espera_respuesta_minutos,
          umbral_carga_larga_minutos: policyRes.data.umbral_carga_larga_minutos,
          intervalo_recordatorio_carga_corta_minutos: policyRes.data.intervalo_recordatorio_carga_corta_minutos,
          intervalo_recordatorio_carga_larga_minutos: policyRes.data.intervalo_recordatorio_carga_larga_minutos,
          max_recordatorios_sin_respuesta: policyRes.data.max_recordatorios_sin_respuesta,
          pedir_confirmacion_fecha_carga: policyRes.data.pedir_confirmacion_fecha_carga,
          pedir_estimacion_demora_carga: policyRes.data.pedir_estimacion_demora_carga,
          enviar_recordatorios_carga: policyRes.data.enviar_recordatorios_carga,
          escalar_sin_respuesta: policyRes.data.escalar_sin_respuesta,
        }));
      }

    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar contexto.');
    } finally {
      setLoading(false);
    }
  };

  const displayedChecklist = useMemo(() => {
    return checklist.filter(item => item.tipo_tarea === "CONTROL_GENERAL" || item.tipo_tarea === "PESAJE_TARA" || item.tipo_tarea === "PESAJE_BRUTO");
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

  const instruccionesData = useMemo(() => {
    const pesajeText = `Pesaje:\n1. Hacer Tara (${pesaje.tara.momento}) en ${resolvedTaraStr}.\n2. Pesar Bruto (${pesaje.bruto.momento}) en ${resolvedBrutoStr}.`;
    
    const driverTasks = displayedChecklist.filter(t => t.asignada_a_chofer);
    const checklistText = driverTasks.map(t => `   [${t.done ? 'X' : ' '}] ${t.tarea}`).join('\n');
    const cargaText = driverTasks.length > 0 ? `Proceso de carga:\n${checklistText}` : '';

    const savedText = cargaText ? `${pesajeText}\n\n${cargaText}` : pesajeText;

    return { pesajeText, cargaText, savedText, hasInspector: !!remito.inspector_id };
  }, [pesaje.tara.momento, resolvedTaraStr, pesaje.bruto.momento, resolvedBrutoStr, displayedChecklist, remito.inspector_id]);

  const instruccionesGeneradas = instruccionesData.savedText;

  const toggleChecklist = (index: number) => {
    const newList = [...checklist];
    const itemIndex = checklist.findIndex(c => c.tarea === displayedChecklist[index].tarea);
    if(itemIndex > -1) {
      const newDone = !newList[itemIndex].done;
      newList[itemIndex].done = newDone;
      newList[itemIndex].estado = newDone ? 'COMPLETADO' : 'PENDIENTE';
      setChecklist(newList);
    }
  };

  const toggleAsignadaChofer = (index: number) => {
    const newList = [...checklist];
    const itemIndex = checklist.findIndex(c => c.tarea === displayedChecklist[index].tarea);
    if(itemIndex > -1) {
      newList[itemIndex].asignada_a_chofer = !newList[itemIndex].asignada_a_chofer;
      setChecklist(newList);
    }
  };

  const handleApproveTask = (index: number) => {
    const newList = [...checklist];
    const itemIndex = checklist.findIndex(c => c.tarea === displayedChecklist[index].tarea);
    if (itemIndex > -1) {
      newList[itemIndex].done = true;
      newList[itemIndex].estado = 'COMPLETADO';
      
      // Copiar el peso reportado por el chofer al estado local de pesaje
      if (newList[itemIndex].tipo_tarea === 'PESAJE_TARA' && newList[itemIndex].valor_reportado_chofer) {
        setPesaje(prev => ({
          ...prev,
          tara: { ...prev.tara, momento: newList[itemIndex].valor_reportado_chofer }
        }));
      } else if (newList[itemIndex].tipo_tarea === 'PESAJE_BRUTO' && newList[itemIndex].valor_reportado_chofer) {
        setPesaje(prev => ({
          ...prev,
          bruto: { ...prev.bruto, momento: newList[itemIndex].valor_reportado_chofer }
        }));
      }
      
      setChecklist(newList);
    }
  };

  const handleRejectTask = (index: number) => {
    const newList = [...checklist];
    const itemIndex = checklist.findIndex(c => c.tarea === displayedChecklist[index].tarea);
    if (itemIndex > -1) {
      newList[itemIndex].done = false;
      newList[itemIndex].estado = 'RECHAZADO';
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

  const resolveChoferId = async (nombre: string, dni: string, celular: string): Promise<number | null> => {
    if (!nombre || !dni) return null;
    
    const cleanDni = dni.replace(/\D/g, '');
    
    // Primero intentamos buscarlo por DNI para evitar duplicados
    const { data: existing, error: searchError } = await supabase
      .from('choferes')
      .select('id')
      .eq('dni', cleanDni)
      .maybeSingle();
      
    if (searchError) throw new Error(`Error al buscar chofer: ${searchError.message}`);
    
    const normalizePhone = (phone: string) => {
      const clean = phone.replace(/\D/g, '');
      if (!clean) return '';
      if (clean.startsWith('549')) return clean;
      return '549' + clean;
    };

    const normalizedCelular = normalizePhone(celular);
    
    if (existing) {
      // Si ya existe, lo actualizamos con los nuevos datos (opcional, pero recomendado)
      const { error: updateError } = await supabase
        .from('choferes')
        .update({
          nombre_completo: nombre.toUpperCase(),
          telefono: normalizedCelular
        })
        .eq('id', existing.id);
        
      if (updateError) throw new Error(`Error al actualizar chofer: ${updateError.message}`);
      return existing.id;
    }
    
    // Si no existe, lo insertamos
    const { data: newData, error: insertError } = await supabase
      .from('choferes')
      .insert({
        nombre_completo: nombre.toUpperCase(),
        dni: cleanDni,
        telefono: normalizedCelular
      })
      .select('id')
      .single();
    
    if (insertError) {
      throw new Error(`No se pudo crear el chofer ${nombre}: ${insertError.message}`);
    }

    // Actualizar catálogo local
    setCatalogs(prev => ({
      ...prev,
      choferes: [...prev.choferes, { id: newData.id, nombre: nombre.toUpperCase(), dni: cleanDni, telefono: normalizedCelular }]
    }));

    return newData.id;
  };

  const fetchOverrideHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('logistica_politicas_notificacion_override')
        .select('*')
        .eq('remito_id', Number(id))
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOverrideHistory(data || []);
      setIsHistoryModalOpen(true);
    } catch (err: any) {
      alert("Error al cargar historial: " + err.message);
    }
  };

  const handleSaveOverride = async () => {
    if (!overrideForm.motivo.trim()) {
      alert("El motivo del cambio es obligatorio.");
      return;
    }

    // Validaciones numéricas
    const numFields = ['espera_respuesta_minutos', 'umbral_carga_larga_minutos', 'intervalo_recordatorio_carga_corta_minutos', 'intervalo_recordatorio_carga_larga_minutos'];
    for (const f of numFields) {
      if (Number(overrideForm[f as keyof typeof overrideForm]) <= 0) {
        alert(`El campo ${f.replace(/_/g, ' ')} debe ser mayor a 0.`);
        return;
      }
    }
    if (Number(overrideForm.max_recordatorios_sin_respuesta) < 0) {
      alert("El máximo de recordatorios no puede ser negativo.");
      return;
    }

    setIsSavingOverride(true);
    try {
      // 1. Desactivar cualquier override vigente previo para este remito
      // Esto asegura que el índice único logistica_politicas_notificacion_override_one_active no bloquee el insert
      const { error: updateError } = await supabase
        .from('logistica_politicas_notificacion_override')
        .update({ vigente: false })
        .eq('remito_id', Number(id))
        .eq('vigente', true);

      if (updateError) {
        console.error("Error desactivando override previo:", updateError);
        // No lanzamos error aquí por si no existía ninguno previo, pero lo logueamos
      }

      // 2. Insertar nuevo
      const payload = {
        remito_id: Number(id),
        vigente: true,
        espera_respuesta_minutos: Number(overrideForm.espera_respuesta_minutos),
        umbral_carga_larga_minutos: Number(overrideForm.umbral_carga_larga_minutos),
        intervalo_recordatorio_carga_corta_minutos: Number(overrideForm.intervalo_recordatorio_carga_corta_minutos),
        intervalo_recordatorio_carga_larga_minutos: Number(overrideForm.intervalo_recordatorio_carga_larga_minutos),
        max_recordatorios_sin_respuesta: Number(overrideForm.max_recordatorios_sin_respuesta),
        pedir_confirmacion_fecha_carga: overrideForm.pedir_confirmacion_fecha_carga,
        pedir_estimacion_demora_carga: overrideForm.pedir_estimacion_demora_carga,
        enviar_recordatorios_carga: overrideForm.enviar_recordatorios_carga,
        escalar_sin_respuesta: overrideForm.escalar_sin_respuesta,
        omitir_notificaciones_chofer: overrideForm.omitir_notificaciones_chofer,
        omitir_confirmacion_fecha_carga: overrideForm.omitir_confirmacion_fecha_carga,
        omitir_estimacion_demora_carga: overrideForm.omitir_estimacion_demora_carga,
        omitir_recordatorios_carga: overrideForm.omitir_recordatorios_carga,
        motivo: overrideForm.motivo.trim(),
        creado_por_id: personalAcId,
        creado_por_email: user?.email || 'admin'
      };

      const { data, error } = await supabase
        .from('logistica_politicas_notificacion_override')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error("Error al insertar override en DB:", error);
        throw error;
      }
      
      setCurrentOverride(data);
      setOverrideForm(prev => ({ ...prev, motivo: '' }));
      alert("Configuración personalizada guardada correctamente.");
    } catch (err: any) {
      console.error("Error completo handleSaveOverride:", err);
      alert("Error al guardar override: " + (err.message || "Error desconocido"));
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!currentOverride) return;
    if (!window.confirm("¿Estás seguro de volver a la configuración estándar? Se desactivará el override actual.")) return;

    setIsSavingOverride(true);
    try {
      const { error } = await supabase
        .from('logistica_politicas_notificacion_override')
        .update({ vigente: false })
        .eq('id', currentOverride.id);
      
      if (error) throw error;
      
      setCurrentOverride(null);
      // Reset form a default values
      if (defaultPolicy) {
        setOverrideForm({
          espera_respuesta_minutos: defaultPolicy.espera_respuesta_minutos,
          umbral_carga_larga_minutos: defaultPolicy.umbral_carga_larga_minutos,
          intervalo_recordatorio_carga_corta_minutos: defaultPolicy.intervalo_recordatorio_carga_corta_minutos,
          intervalo_recordatorio_carga_larga_minutos: defaultPolicy.intervalo_recordatorio_carga_larga_minutos,
          max_recordatorios_sin_respuesta: defaultPolicy.max_recordatorios_sin_respuesta,
          pedir_confirmacion_fecha_carga: defaultPolicy.pedir_confirmacion_fecha_carga,
          pedir_estimacion_demora_carga: defaultPolicy.pedir_estimacion_demora_carga,
          enviar_recordatorios_carga: defaultPolicy.enviar_recordatorios_carga,
          escalar_sin_respuesta: defaultPolicy.escalar_sin_respuesta,
          omitir_notificaciones_chofer: false,
          omitir_confirmacion_fecha_carga: false,
          omitir_estimacion_demora_carga: false,
          omitir_recordatorios_carga: false,
          motivo: '',
        });
      }
      alert("Se ha vuelto a la configuración estándar.");
    } catch (err: any) {
      alert("Error al resetear: " + err.message);
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Resolver chofer nuevo o existente
      let finalChoferId = remito.chofer_id;
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
        finalChoferId = await resolveChoferId(searchChofer, dniChoferNuevo, celularChoferNuevo);
        if (!finalChoferId) {
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

      const processedChecklist = checklist
        .map(item => {
          let finalTarea = item.tarea;
          let finalEstado = item.estado || 'PENDIENTE';

          if (item.done) {
            finalEstado = 'COMPLETADO';
          } else if (item.estado === 'COMPLETADO') {
            finalEstado = 'PENDIENTE';
          }

          if (item.tipo_tarea === 'PESAJE_TARA') {
            finalTarea = (item.tarea_template || item.tarea).replace('{lugar}', taraLugarNombre);
            if (item.done) {
              finalEstado = 'COMPLETADO';
            } else if (item.estado === 'REPORTADO_CHOFER' || item.estado === 'RECHAZADO') {
              finalEstado = item.estado;
            } else {
              finalEstado = 'PENDIENTE';
            }
          } else if (item.tipo_tarea === 'PESAJE_BRUTO') {
            finalTarea = (item.tarea_template || item.tarea).replace('{lugar}', brutoLugarNombre);
            if (item.done) {
              finalEstado = 'COMPLETADO';
            } else if (item.estado === 'REPORTADO_CHOFER' || item.estado === 'RECHAZADO') {
              finalEstado = item.estado;
            } else {
              finalEstado = 'PENDIENTE';
            }
          }

          return {
            ...item,
            tarea: finalTarea,
            estado: finalEstado,
            asignada_a_chofer: item.asignada_a_chofer !== undefined ? !!item.asignada_a_chofer : true
          };
        });

      const textoFinal = observacionesExtras.trim() ? `${instruccionesGeneradas}\n\nObservaciones Extra:\n${observacionesExtras}` : instruccionesGeneradas;

      const p_updates = {
        chofer_id: Number(finalChoferId),
        nombre_chofer_nuevo: remito.chofer_id === 0 ? searchChofer : null,
        dni_chofer_nuevo: remito.chofer_id === 0 ? dniChoferNuevo : null,
        celular_chofer_nuevo: remito.chofer_id === 0 ? celularChoferNuevo : null,
        camion_id: finalCamionId,
        acoplado_id: finalAcopladoId,
        supervisor_id: remito.supervisor_id ? Number(remito.supervisor_id) : null,
        operador_id: remito.operador_id ? Number(remito.operador_id) : null,
        inspector_id: remito.inspector_id ? Number(remito.inspector_id) : null,
        instrucciones_texto: textoFinal,
        protocolo_control: processedChecklist,
        tara_pesaje_momento: pesaje.tara.momento,
        tara_pesaje_lugar_id: finalTaraId,
        bruto_pesaje_momento: pesaje.bruto.momento,
        bruto_pesaje_lugar_id: finalBrutoId,
        fecha_hora_estimada_carga: remito.fecha_hora_estimada_carga,
        debe_pasar_por_reembolse: remito.debe_pasar_por_reembolse,
        es_flete_corto: remito.es_flete_corto
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
          <div className="flex flex-col items-end gap-1.5">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${remito.estado === 'Datos Faltantes' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {remito.estado}
            </span>
            {remito.cantidad_total !== null && remito.cantidad_total !== undefined && (
              <span className="text-[11px] font-semibold text-gray-500 bg-gray-50 border border-gray-200/80 px-2 py-0.5 rounded-md flex items-center gap-1 mt-1 shadow-sm">
                <Scale className="w-3 h-3 text-gray-400" />
                Cantidad Total: <span className="text-gray-700 font-bold">{remito.cantidad_total} Ton</span>
              </span>
            )}
          </div>
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
                      key={`ch-${c.id}`} 
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
                <div className="flex justify-end pt-2 border-t border-blue-100/50">
                  <button 
                    type="button"
                    disabled={isConfirmingChofer || !!dniExistenteError || !dniChoferNuevo || !celularChoferNuevo}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setIsConfirmingChofer(true);
                      try {
                        const id = await resolveChoferId(searchChofer, dniChoferNuevo, celularChoferNuevo);
                        if (id) {
                          setRemito(prev => ({ ...prev, chofer_id: id }));
                          setSearchChofer(searchChofer.toUpperCase());
                          setShowChoferList(false);
                        }
                      } catch (err: any) {
                        alert("Error: " + err.message);
                      } finally {
                        setIsConfirmingChofer(false);
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {isConfirmingChofer ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                    ) : (
                      <CheckCircle className="w-3 h-3" />
                    )}
                    Confirmar Chofer
                  </button>
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
                      key={`ca-${c.id}`} 
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
                      key={`ac-${c.id}`} 
                      onClick={() => { setRemito({...remito, acoplado_id: c.id}); setSearchAcoplado(c.patente || ''); setShowAcopladoList(false); }}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                    >{c.patente}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Personal */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inspector</label>
              <select 
                value={remito.inspector_id || ''} 
                onChange={e => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  const prevVal = remito.inspector_id;
                  setRemito({...remito, inspector_id: val});
                  if (val && prevVal === null) {
                    const confirmChange = window.confirm(
                      "Se ha asignado un Inspector. ¿Desea desasignar todas las tareas del chofer para seleccionarlas manualmente?"
                    );
                    if (confirmChange) {
                      setChecklist(prev =>
                        prev.map(item =>
                          item.tipo_tarea === 'CONTROL_GENERAL'
                            ? { ...item, asignada_a_chofer: false }
                            : item
                        )
                      );
                    }
                  }
                }}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Seleccionar...</option>
                {inspectors.map(p => (
                  <option key={`insp-${p.id}`} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Operador</label>
              <select 
                value={remito.operador_id || ''} 
                onChange={e => setRemito({...remito, operador_id: e.target.value ? Number(e.target.value) : null})}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Seleccionar...</option>
                {operadores.map(p => (
                  <option key={`op-${p.id}`} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
              <select 
                value={remito.supervisor_id || ''} 
                onChange={e => setRemito({...remito, supervisor_id: e.target.value ? Number(e.target.value) : null})}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Seleccionar...</option>
                {supervisors.map(p => (
                  <option key={`sup-${p.id}`} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Logística Adicional */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-50">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y Hora Estimada de Carga</label>
              <div className="relative">
                <input 
                  type="text"
                  onFocus={(e) => {
                    e.target.type = 'datetime-local';
                    if (remito.fecha_hora_estimada_carga) {
                      e.target.value = remito.fecha_hora_estimada_carga.substring(0, 16);
                    }
                  }}
                  onBlur={(e) => {
                    e.target.type = 'text';
                    if (remito.fecha_hora_estimada_carga) {
                      const d = new Date(remito.fecha_hora_estimada_carga);
                      if (!isNaN(d.getTime())) {
                        e.target.value = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                      }
                    } else {
                      e.target.value = '';
                    }
                  }}
                  defaultValue={remito.fecha_hora_estimada_carga 
                    ? (() => {
                        const d = new Date(remito.fecha_hora_estimada_carga);
                        return isNaN(d.getTime()) ? '' : `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                      })()
                    : ''}
                  onChange={e => {
                    if (e.target.type === 'datetime-local') {
                      setRemito({...remito, fecha_hora_estimada_carga: e.target.value});
                    }
                  }}
                  placeholder="DD/MM/YYYY HH:mm"
                  className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                />
              </div>
            </div>
            <div className="flex flex-col gap-4 pt-4 justify-center">
              <div className="flex items-center gap-4">
                <button 
                  type="button"
                  id="toggle-reembolse"
                  onClick={() => setRemito({...remito, debe_pasar_por_reembolse: !remito.debe_pasar_por_reembolse})}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${remito.debe_pasar_por_reembolse ? 'bg-emerald-500' : 'bg-gray-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${remito.debe_pasar_por_reembolse ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <span className="text-sm font-bold text-gray-700">¿Debe pasar por Reembolse?</span>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  type="button"
                  id="toggle-flete-corto"
                  onClick={() => setRemito({...remito, es_flete_corto: !remito.es_flete_corto})}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${remito.es_flete_corto ? 'bg-emerald-500' : 'bg-gray-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${remito.es_flete_corto ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <span className="text-sm font-bold text-gray-700">¿Es flete corto?</span>
              </div>
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
              {/* Alerta de peso de tara reportado por el chofer */}
              {(() => {
                const taraTask = checklist.find(t => t.tipo_tarea === 'PESAJE_TARA');
                if (taraTask?.valor_reportado_chofer && taraTask.estado === 'REPORTADO_CHOFER') {
                  return (
                    <div className="mb-4 bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-2">
                      <p className="font-semibold flex items-center gap-1.5">
                        <Scale className="w-4 h-4 animate-pulse text-amber-600" />
                        Chofer reportó peso: <span className="underline font-bold text-sm">{taraTask.valor_reportado_chofer}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const idx = checklist.findIndex(t => t.tipo_tarea === 'PESAJE_TARA');
                          if (idx > -1) handleApproveTask(idx);
                        }}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        Aprobar y usar este valor
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
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
              {/* Alerta de peso bruto reportado por el chofer */}
              {(() => {
                const brutoTask = checklist.find(t => t.tipo_tarea === 'PESAJE_BRUTO');
                if (brutoTask?.valor_reportado_chofer && brutoTask.estado === 'REPORTADO_CHOFER') {
                  return (
                    <div className="mb-4 bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-2">
                      <p className="font-semibold flex items-center gap-1.5">
                        <Scale className="w-4 h-4 animate-pulse text-amber-600" />
                        Chofer reportó peso: <span className="underline font-bold text-sm">{brutoTask.valor_reportado_chofer}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const idx = checklist.findIndex(t => t.tipo_tarea === 'PESAJE_BRUTO');
                          if (idx > -1) handleApproveTask(idx);
                        }}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        Aprobar y usar este valor
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
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
          <div className="flex justify-between items-center border-b border-gray-100 pb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">C. Instrucciones y Protocolo</h2>
            <button 
              type="button" 
              onClick={() => setShowWpModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors shadow-sm"
            >
              <MessageSquare className="w-4 h-4" />
              Enviar por WhatsApp
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 flex flex-col">
              <label className="block text-sm font-bold text-gray-800 mb-2">Instrucciones Generadas</label>
              <div className="w-full p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 outline-none select-none flex-1 overflow-y-auto whitespace-pre-wrap min-h-[120px]">
                <div className="font-sans leading-relaxed">
                  <div className="font-bold text-gray-400 mb-1 text-[10px] uppercase tracking-wider">Sección Pesaje</div>
                  {instruccionesData.pesajeText}
                  
                  <div className="mt-4">
                    <div className="font-bold text-gray-400 mb-1 text-[10px] uppercase tracking-wider">Sección Carga</div>
                    <div>
                      {instruccionesData.cargaText || <span className="text-gray-400 italic">Sin tareas de carga asignadas al chofer</span>}
                    </div>
                  </div>
                </div>
              </div>
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
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 transition shadow-sm hover:border-brand-200"
                >
                  <label 
                    className={`flex items-center gap-3 flex-1 ${
                      !!remito.inspector_id && !task.asignada_a_chofer 
                        ? 'opacity-60 cursor-not-allowed bg-gray-50/50' 
                        : 'cursor-pointer'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={task.done} 
                      onChange={() => !(!!remito.inspector_id && !task.asignada_a_chofer) && toggleChecklist(index)}
                      disabled={!!remito.inspector_id && !task.asignada_a_chofer}
                      className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50" 
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-1.5 select-none">
                        <span className={`text-sm ${!!remito.inspector_id && !task.asignada_a_chofer ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {task.tarea}
                        </span>
                        {task.estado && task.estado !== 'PENDIENTE' && task.estado !== 'COMPLETADO' && (
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                            task.estado === 'REPORTADO_CHOFER' 
                              ? 'bg-amber-100 text-amber-800 animate-pulse' 
                              : task.estado === 'NO_REALIZABLE'
                              ? 'bg-red-100 text-red-800'
                              : task.estado === 'RECHAZADO'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : ''
                          }`}>
                            {task.estado === 'REPORTADO_CHOFER' ? 'Pendiente Operador' : task.estado === 'NO_REALIZABLE' ? 'No Realizable' : 'Rechazado'}
                          </span>
                        )}
                      </div>
                      {task.valor_reportado_chofer && (
                        <div className="mt-1">
                          {task.valor_reportado_chofer.startsWith('http') ? (
                            <a 
                              href={task.valor_reportado_chofer} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-[9px] text-blue-700 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded-md border border-blue-100 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              📷 Ver Foto Adjunta
                            </a>
                          ) : (
                            <span className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100 font-medium inline-block">
                              Valor: <strong>{task.valor_reportado_chofer}</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                  
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {task.estado === 'REPORTADO_CHOFER' && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApproveTask(index);
                          }}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                          title="Aprobar Tarea"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRejectTask(index);
                          }}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                          title="Rechazar Tarea"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      title="Solicitar cumplimiento al chofer vía Bot"
                      onClick={() => toggleAsignadaChofer(index)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Truck 
                        className={`w-5 h-5 transition-colors cursor-pointer ${
                          task.asignada_a_chofer ? 'text-blue-600' : 'text-gray-300'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sección D: Configuración de Seguimiento */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex justify-between items-center border-b border-gray-100 pb-2">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">D. Configuración de Seguimiento</h2>
              {currentOverride ? (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold">
                  <AlertTriangle className="w-3 h-3" />
                  PERSONALIZADO
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-brand-50 text-brand-700 border border-brand-200 rounded-full text-[10px] font-bold">
                  <Settings className="w-3 h-3" />
                  DEFAULT
                </span>
              )}
            </div>
            <button 
              type="button" 
              onClick={() => setIsConfigExpanded(!isConfigExpanded)}
              className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-400"
            >
              {isConfigExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>

          {!isConfigExpanded ? (
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "p-3 rounded-full",
                  currentOverride ? "bg-amber-100 text-amber-600" : "bg-brand-100 text-brand-600"
                )}>
                  {currentOverride ? <AlertCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                </div>
                <div>
                  <h4 className="font-bold text-gray-800">
                    {currentOverride ? "Seguimiento personalizado" : "Seguimiento estándar (Default)"}
                  </h4>
                  <p className="text-xs text-gray-500">Configura tiempos de espera y automatizaciones para este remito.</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsConfigExpanded(true)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 shadow-sm transition-all"
              >
                Configurar
              </button>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-300">
              {/* Master Switch & Info Base */}
              <div className="bg-brand-50/30 p-4 rounded-xl border border-brand-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-2 text-brand-700 text-sm font-medium">
                  <Info className="w-4 h-4" />
                  Política base vinculada: <strong>{defaultPolicy?.nombre || 'Default'}</strong>
                </div>
                
                <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end">
                  <button 
                    type="button"
                    onClick={fetchOverrideHistory}
                    className="text-xs font-bold text-brand-600 hover:underline whitespace-nowrap"
                  >
                    Ver historial
                  </button>

                  <label className="flex items-center gap-3 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-brand-200 shadow-sm">
                    <span className="text-sm font-bold text-gray-800">Monitoreo por Bot Activo</span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={!overrideForm.omitir_notificaciones_chofer}
                        onChange={(e) => setOverrideForm({...overrideForm, omitir_notificaciones_chofer: !e.target.checked})}
                      />
                      <div className={cn(
                        "w-10 h-6 rounded-full transition-colors shadow-inner",
                        !overrideForm.omitir_notificaciones_chofer ? "bg-emerald-500" : "bg-gray-300"
                      )}>
                        <div className={cn(
                          "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                          !overrideForm.omitir_notificaciones_chofer ? "translate-x-4" : "translate-x-0"
                        )} />
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Tiempos con Tooltips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Espera Rpta. (min)', key: 'espera_respuesta_minutos', tooltip: 'Minutos que el bot espera respuesta antes de marcar un fallo.' },
                  { label: 'Umbral Retraso (min)', key: 'umbral_carga_larga_minutos', tooltip: 'Si el retraso supera estos minutos, el bot espacia los mensajes (Intervalo Largo).' },
                  { label: 'Frecuencia Normal (min)', key: 'intervalo_recordatorio_carga_corta_minutos', tooltip: 'Minutos entre cada recordatorio durante la carga normal.' },
                  { label: 'Frecuencia en Retrasos (min)', key: 'intervalo_recordatorio_carga_larga_minutos', tooltip: 'Minutos entre recordatorios cuando hay un retraso largo.' },
                  { label: 'Intentos para Escalar', key: 'max_recordatorios_sin_respuesta', tooltip: 'Número de veces que el chofer puede no responder antes de avisar a un humano.' },
                ].map((field) => (
                  <div key={field.key} className="relative group">
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      {field.label}
                      <span title={field.tooltip} className="flex items-center">
                        <Info className="w-3.5 h-3.5 cursor-help text-gray-300 hover:text-brand-500 transition-colors" />
                      </span>
                    </label>
                    <input 
                      type="number"
                      disabled={overrideForm.omitir_notificaciones_chofer}
                      value={overrideForm[field.key as keyof typeof overrideForm] as string | number}
                      onChange={e => setOverrideForm({...overrideForm, [field.key]: e.target.value})}
                      className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:opacity-60 disabled:bg-gray-50"
                    />
                  </div>
                ))}
              </div>

              {/* Automatizaciones Activas */}
              <div className="space-y-3 max-w-2xl">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4 text-brand-500" />
                  Automatizaciones Activas
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: 'pedir_confirmacion_fecha_carga', label: 'Pedir confirmación de llegada (Pre-carga)' },
                    { key: 'pedir_estimacion_demora_carga', label: 'Reclamar tareas del checklist (Durante la carga)' },
                    { key: 'enviar_recordatorios_carga', label: 'Enviar recordatorios periódicos' },
                    { key: 'escalar_sin_respuesta', label: 'Escalar a supervisor por silencio' },
                  ].map((item) => (
                    <label key={item.key} className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-colors shadow-sm",
                      overrideForm.omitir_notificaciones_chofer ? "bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed" : "bg-white border-gray-200 cursor-pointer hover:border-brand-200 hover:bg-gray-50"
                    )}>
                      <span className="text-sm font-medium text-gray-700">{item.label}</span>
                      <div className="relative">
                        <input
                          type="checkbox"
                          className="sr-only"
                          disabled={overrideForm.omitir_notificaciones_chofer}
                          checked={overrideForm[item.key as keyof typeof overrideForm] as boolean}
                          onChange={(e) => setOverrideForm({...overrideForm, [item.key]: e.target.checked})}
                        />
                        <div className={cn(
                          "w-10 h-6 rounded-full transition-colors shadow-inner",
                          overrideForm[item.key as keyof typeof overrideForm] ? "bg-brand-500" : "bg-gray-300",
                          overrideForm.omitir_notificaciones_chofer && "opacity-50"
                        )}>
                          <div className={cn(
                            "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                            overrideForm[item.key as keyof typeof overrideForm] ? "translate-x-4" : "translate-x-0"
                          )} />
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Motivo */}
              <div className="bg-amber-50 p-5 rounded-xl border border-amber-200">
                <label className="block text-sm font-bold text-amber-800 mb-2">Motivo del cambio *</label>
                <textarea 
                  value={overrideForm.motivo}
                  onChange={e => setOverrideForm({...overrideForm, motivo: e.target.value})}
                  rows={2}
                  placeholder="Explica por qué se realiza este ajuste personalizado..."
                  className="w-full p-3 bg-white border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                />
              </div>

              {/* Acciones Config */}
              <div className="flex flex-col sm:flex-row justify-between gap-4 pt-4 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={handleResetToDefault}
                  disabled={!currentOverride || isSavingOverride}
                  className="px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
                >
                  Volver a configuración estándar
                </button>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsConfigExpanded(false)}
                    className="px-6 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Cerrar panel
                  </button>
                  <button 
                    type="button"
                    onClick={handleSaveOverride}
                    disabled={isSavingOverride}
                    className="px-8 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg shadow-lg hover:bg-black transition-all flex items-center gap-2"
                  >
                    {isSavingOverride && <Loader2 className="w-4 h-4 animate-spin" />}
                    Guardar configuración
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

      </main>

      {/* Floating Footer Toolbar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-gray-200 z-50">
        <div className="max-w-4xl mx-auto flex justify-between gap-4">
          <div className="flex gap-4">
            {/* Espacio reservado para acciones secundarias si fuera necesario */}
          </div>

          <div className="flex gap-4">
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

      {/* History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsHistoryModalOpen(false)}></div>
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-brand-600" />
                Historial de Cambios Logísticos
              </h3>
              <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {overrideHistory.length === 0 ? (
                <p className="text-center py-8 text-gray-500">No hay historial registrado.</p>
              ) : (
                <div className="space-y-6">
                  {overrideHistory.map((h) => (
                    <div key={h.id} className="relative pl-6 pb-6 border-l-2 border-gray-100 last:pb-0">
                      <div className={cn(
                        "absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm",
                        h.vigente ? "bg-emerald-500" : "bg-gray-300"
                      )}></div>
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-bold text-gray-900">
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                        {h.vigente && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-bold">VIGENTE</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 font-medium mb-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                        "{h.motivo}"
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span className="font-bold text-gray-500 uppercase tracking-wider">Autor:</span>
                        {h.creado_por_email}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button onClick={() => setIsHistoryModalOpen(false)} className="px-6 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Modal */}
      {showWpModal && (
        <WhatsAppModal
          isOpen={showWpModal}
          onClose={() => setShowWpModal(false)}
          remitoData={{
            id: Number(id),
            ref: remito.ref,
            chofer_id: Number(remito.chofer_id),
            chofer_nombre: searchChofer,
            chofer_telefono: catalogs.choferes.find(c => c.id === remito.chofer_id)?.telefono || celularChoferNuevo || '',
            inspector_nombre: inspectors.find(i => i.id === remito.inspector_id)?.nombre || 'Sin inspector',
            balanza_nombre: resolvedTaraStr,
            destino_nombre: resolvedBrutoStr,
            cliente_nombre: remito.cliente,
            tareas: `${instruccionesData.savedText}${observacionesExtras ? '\n\nObservaciones Extra:\n' + observacionesExtras : ''}`
          }}
        />
      )}

      </div>
    </div>
  );
}
