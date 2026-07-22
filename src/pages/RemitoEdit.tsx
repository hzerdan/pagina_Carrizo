/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useMemo, useCallback } from 'react';
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
  UserPlus, 
  X, 
  MessageSquare, 
  Settings, 
  Clock, 
  Info, 
  Loader2,
  Zap,
  Truck,
  CheckSquare,
  XCircle,
  Send,
  Eye,
  Sliders,
  ArrowUp,
  ArrowDown,
  Trash2,
  Search,
  Check
} from 'lucide-react';
import { cn } from '../lib/utils';
import { WhatsAppModal } from '../components/WhatsAppModal';
import { DateTimePicker } from '../components/DateTimePicker';

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
  fecha_probable_entrega: string | null;
  mi_sobre_proveedor_preparado: boolean;
  mi_sobre_cliente_preparado: boolean;
  me_planillas_t48_emitidas: boolean;
  me_checklist_enviado_operario: boolean;
  tipo_mercado: string | null;
  mision_estado?: string | null;
  tiene_incidencias_carga?: boolean;
  ultimo_mensaje_chofer_at?: string | null;
  mensajes_sin_respuesta_count?: number;
  deposito_carga_id?: number | null;
  deposito_descarga_id?: number | null;
  retry_count?: number;
  tipo_mision_id?: number | null;
  mision_estados_secuencia?: any[] | null;
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
  anticipacion_monitoreo_horas: number;
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
  anticipacion_monitoreo_horas: number | null;
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
    fecha_probable_entrega: null,
    mi_sobre_proveedor_preparado: false,
    mi_sobre_cliente_preparado: false,
    me_planillas_t48_emitidas: false,
    me_checklist_enviado_operario: false,
    tipo_mercado: null,
    mision_estado: 'OPERACION_PENDIENTE',
    tiene_incidencias_carga: false,
    ultimo_mensaje_chofer_at: null,
    mensajes_sin_respuesta_count: 0,
    deposito_carga_id: null,
    deposito_descarga_id: null,
    retry_count: 0,
    tipo_mision_id: null,
    mision_estados_secuencia: [],
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
  const [depositos, setDepositos] = useState<any[]>([]);
  const [showNewDepositoModal, setShowNewDepositoModal] = useState(false);
  const [newDeposito, setNewDeposito] = useState({
    nombre: '',
    tipo: 'DEPOSITO_PROPIO', // o 'CLIENTE', etc.
    funcion: 'AMBAS',
    google_maps_link: '',
    targetSelector: 'carga' as 'carga' | 'descarga'
  });

  const [pesaje, setPesaje] = useState({
    tara: { momento: 'Antes de cargar', lugar_id: null as number | 0 | null }, // 0 = Nuevo
    bruto: { momento: 'Después de cargar', lugar_id: 'IGUAL' as number | 0 | 'IGUAL' | null }, // 0 = Nuevo, 'IGUAL' = Igual a tara
  });
  
  const [nuevoLugarTara, setNuevoLugarTara] = useState({ nombre: '', direccion: '' });
  const [nuevoLugarBruto, setNuevoLugarBruto] = useState({ nombre: '', direccion: '' });

  const [checklist, setChecklist] = useState<any[]>([]);

  // UI state for inputs
  const [nombreChoferNuevo, setNombreChoferNuevo] = useState('');
  const [dniChoferNuevo, setDniChoferNuevo] = useState('');
  const [celularChoferNuevo, setCelularChoferNuevo] = useState('');

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
    anticipacion_monitoreo_horas: '' as string | number,
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

  const [misionTipos, setMisionTipos] = useState<any[]>([]);
  const [mTypeSearch, setMTypeSearch] = useState('');
  const [mTypeDropdownOpen, setMTypeDropdownOpen] = useState(false);
  const [misionEstados, setMisionEstados] = useState<any[]>([]);
  const [selectedEstadoToAdd, setSelectedEstadoToAdd] = useState<string>('');
  const [showPersonalizarModal, setShowPersonalizarModal] = useState(false);
  const [tempSequence, setTempSequence] = useState<any[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<any>(null);
  const [openMsgTaskId, setOpenMsgTaskId] = useState<any>(null);
  const [msgText, setMsgText] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [msgSentSuccess, setMsgSentSuccess] = useState(false);
  const [openConfigTaskId, setOpenConfigTaskId] = useState<any>(null);



  const fetchContext = useCallback(async () => {
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
        fecha_probable_entrega: ctx.remito?.fecha_probable_entrega || null,
        mi_sobre_proveedor_preparado: ctx.remito?.mi_sobre_proveedor_preparado || false,
        mi_sobre_cliente_preparado: ctx.remito?.mi_sobre_cliente_preparado || false,
        me_planillas_t48_emitidas: ctx.remito?.me_planillas_t48_emitidas || false,
        me_checklist_enviado_operario: ctx.remito?.me_checklist_enviado_operario || false,
        tipo_mercado: ctx.pedidos && ctx.pedidos.length > 0 ? ctx.pedidos[0].tipo_mercado : null,
        mision_estado: ctx.remito?.mision_estado || 'OPERACION_PENDIENTE',
        tiene_incidencias_carga: !!ctx.remito?.tiene_incidencias_carga,
        ultimo_mensaje_chofer_at: ctx.remito?.ultimo_mensaje_chofer_at || null,
        mensajes_sin_respuesta_count: ctx.remito?.mensajes_sin_respuesta_count || 0,
        deposito_carga_id: ctx.remito?.deposito_carga_id || null,
        deposito_descarga_id: ctx.remito?.deposito_descarga_id || null,
        retry_count: ctx.remito?.retry_count || 0,
        tipo_mision_id: ctx.remito?.tipo_mision_id || null,
        mision_estados_secuencia: ctx.remito?.mision_estados_secuencia || [],
      });

      const { data: mtData } = await supabase.from('mision_tipos').select('*').eq('estado', 'ACTIVO');
      if (mtData) setMisionTipos(mtData);

      const { data: meData } = await supabase.from('mision_estados_definicion').select('*').eq('estado', 'ACTIVO').order('orden_logistico_default');
      if (meData) setMisionEstados(meData);

      const savedProtocol = ctx.remito?.protocolo_control || [];
      const catalogTasks = ctx.catalogos.tareas_control || [];
      
      // Unificamos el protocolo guardado con el catálogo para asegurar que 
      // si se guardó solo pesaje (por inspector), las tareas de carga sigan apareciendo en la UI.
      const mergedList = [...savedProtocol];
      catalogTasks.forEach((catTask: any) => {
        const taskName = catTask.tarea_template || catTask.tarea;
        const isPresent = mergedList.some(s => 
          (s.id !== undefined && catTask.id !== undefined && Number(s.id) === Number(catTask.id)) ||
          (s.tarea_template === taskName) || 
          (s.tarea === taskName)
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

          // Resolver el código de estado (string) a partir de estado_id
          let resolvedEstadoCode = item.estado_id;
          if (typeof item.estado_id === 'number') {
            const matchedState = meData?.find(s => s.id === item.estado_id);
            if (matchedState) {
              resolvedEstadoCode = matchedState.codigo;
            }
          } else if (!item.estado_id) {
            // Si no tiene estado_id (por ser del protocolo antiguo), buscar en el catálogo
            const catTask = catalogTasks.find((c: any) => c.id === item.id || c.tarea_template === item.tarea_template || c.tarea === item.tarea);
            if (catTask && typeof catTask.estado_id === 'number') {
              const matchedState = meData?.find(s => s.id === catTask.estado_id);
              if (matchedState) {
                resolvedEstadoCode = matchedState.codigo;
              }
            }
          }

          return {
            ...item,
            tarea_template: item.tarea_template || item.tarea,
            done: item.estado === 'COMPLETADO',
            tarea: item.tarea || item.tarea_template,
            asignada_a_chofer: isAsignadaChofer,
            estado_id: resolvedEstadoCode
          };
        }));
      }

      // Obtener lugares de pesaje para los dropdowns
      const { data: lugaresRes } = await supabase.from('lugares_pesaje').select('*');
      if (lugaresRes) {
        setLugaresPesaje(lugaresRes);
      }

      const { data: depositosRes } = await supabase.from('depositos').select('*').eq('estado', 'ACTIVO').order('nombre');
      if (depositosRes) {
        setDepositos(depositosRes);
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
          anticipacion_monitoreo_horas: overrideRes.data.anticipacion_monitoreo_horas ?? '',
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
          anticipacion_monitoreo_horas: policyRes.data.anticipacion_monitoreo_horas,
          pedir_confirmacion_fecha_carga: policyRes.data.pedir_confirmacion_fecha_carga,
          pedir_estimacion_demora_carga: policyRes.data.pedir_estimacion_demora_carga,
          enviar_recordatorios_carga: policyRes.data.enviar_recordatorios_carga,
          escalar_sin_respuesta: policyRes.data.escalar_sin_respuesta,
        }));
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(errMsg || 'Error al cargar contexto.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const displayedChecklist = useMemo(() => {
    return checklist.filter(item => !!item.tarea);
  }, [checklist]);

  // Derived computations
  const dniExistenteError = useMemo(() => {
    if (!dniChoferNuevo) return null;
    const exists = catalogs.choferes.some(c => (c.dni || '').replace(/\D/g, '') === dniChoferNuevo.replace(/\D/g, ''));
    return exists ? "Este DNI ya está registrado en el sistema." : null;
  }, [dniChoferNuevo, catalogs.choferes]);

  const resolvedChoferNombre = useMemo(() => {
    if (remito.chofer_id === 0) return nombreChoferNuevo;
    if (remito.chofer_id) {
      const c = catalogs.choferes.find(x => x.id === remito.chofer_id);
      return c ? c.nombre : '';
    }
    return '';
  }, [remito.chofer_id, nombreChoferNuevo, catalogs.choferes]);

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

  const generateWhatsAppDraft = useCallback(() => {
    const choferName = resolvedChoferNombre || 'Chofer';
    const currentMisionEstado = remito.mision_estado || 'OPERACION_PENDIENTE';
    
    const nextTask = checklist.find(t => 
      t.estado_id === currentMisionEstado && 
      !t.done && 
      t.estado !== 'COMPLETADO' && 
      t.asignada_a_chofer !== false
    );

    let formattedFechaHora = 'No establecida';
    if (remito.fecha_hora_estimada_carga) {
      try {
        const dt = new Date(remito.fecha_hora_estimada_carga);
        const day = String(dt.getDate()).padStart(2, '0');
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const year = dt.getFullYear();
        const hours = String(dt.getHours()).padStart(2, '0');
        const minutes = String(dt.getMinutes()).padStart(2, '0');
        formattedFechaHora = `${day}/${month}/${year} ${hours}:${minutes}`;
      } catch (e) {
        formattedFechaHora = remito.fecha_hora_estimada_carga;
      }
    }

    if (nextTask) {
      if (nextTask.mensaje_template) {
        return nextTask.mensaje_template
          .replace(/\[chofer\]/gi, choferName)
          .replace(/\{chofer\}/gi, choferName)
          .replace(/\[chofer_nombre\]/gi, choferName)
          .replace(/\{chofer_nombre\}/gi, choferName)
          .replace(/\{fecha_hora_estimada_carga\}/gi, formattedFechaHora)
          .replace(/\[fecha_hora_estimada_carga\]/gi, formattedFechaHora);
      }
      return `Hola ${choferName}, según tu hoja de ruta ahora corresponde: ${nextTask.tarea_template || nextTask.tarea}. Por favor confirmame cuando la inicies.`;
    }
    
    return `Hola ${choferName}, por favor confírmanos tu estado actual en el viaje correspondiente al remito #${remito.ref || ''}.`;
  }, [resolvedChoferNombre, remito.mision_estado, remito.ref, remito.fecha_hora_estimada_carga, checklist]);

  const handleApproveTask = (itemIndex: number) => {
    const newList = [...checklist];
    if (itemIndex > -1 && itemIndex < newList.length) {
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

  const handleSendDirectMsg = async (_taskId: any) => {
    if (!msgText.trim()) return;
    setMsgSending(true);
    setMsgSentSuccess(false);
    try {
      const { data, error } = await supabase.rpc('enviar_mensaje_directo_chofer', {
        p_remito_id: Number(id),
        p_mensaje: msgText
      });
      if (error) throw error;
      
      const res = Array.isArray(data) ? data[0] : data;
      if (res && res.success === false) {
        throw new Error(res.error || "Error al enviar mensaje");
      }

      setMsgSentSuccess(true);
      setMsgText('');
      setTimeout(() => {
        setMsgSentSuccess(false);
        setOpenMsgTaskId(null);
      }, 3000);
    } catch (err: any) {
      alert("Error al enviar mensaje directo: " + err.message);
    } finally {
      setMsgSending(false);
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

  const handleSaveNewDeposito = async () => {
    if (!newDeposito.nombre.trim()) {
      alert("Por favor ingrese el nombre del depósito.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from('depositos')
        .insert({
          nombre: newDeposito.nombre.toUpperCase().trim(),
          tipo: newDeposito.tipo,
          funcion: newDeposito.funcion,
          google_maps_link: newDeposito.google_maps_link.trim() || null,
          estado: 'ACTIVO'
        })
        .select('*')
        .single();

      if (error) throw error;

      setDepositos(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));

      if (newDeposito.targetSelector === 'carga') {
        setRemito(prev => ({ ...prev, deposito_carga_id: data.id }));
      } else {
        setRemito(prev => ({ ...prev, deposito_descarga_id: data.id }));
      }

      setShowNewDepositoModal(false);
    } catch (err: any) {
      console.error(err);
      alert("Error al crear el depósito: " + err.message);
    }
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
    if (!nombre) return null;
    
    const cleanDni = dni ? dni.replace(/\D/g, '') : '';
    let existing = null;
    
    if (cleanDni) {
      // Primero intentamos buscarlo por DNI para evitar duplicados
      const { data: existingDni, error: searchError } = await supabase
        .from('choferes')
        .select('id')
        .eq('dni', cleanDni)
        .maybeSingle();
        
      if (searchError) throw new Error(`Error al buscar chofer por DNI: ${searchError.message}`);
      existing = existingDni;
    } else {
      // Intentar buscar por nombre completo para evitar duplicar nombres idénticos si no hay DNI
      const { data: existingName, error: searchError } = await supabase
        .from('choferes')
        .select('id')
        .eq('nombre_completo', nombre.toUpperCase())
        .maybeSingle();
        
      if (searchError) throw new Error(`Error al buscar chofer por nombre: ${searchError.message}`);
      existing = existingName;
    }
    
    const normalizePhone = (phone: string) => {
      const clean = phone.replace(/\D/g, '');
      if (!clean) return '';
      if (clean.startsWith('549')) return clean;
      return '549' + clean;
    };

    const normalizedCelular = normalizePhone(celular);
    
    if (existing) {
      // Si ya existe, lo actualizamos con los nuevos datos
      const { error: updateError } = await supabase
        .from('choferes')
        .update({
          nombre_completo: nombre.toUpperCase(),
          telefono: normalizedCelular || null,
          ...(cleanDni ? { dni: cleanDni } : {})
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
        dni: cleanDni || null,
        telefono: normalizedCelular || null
      })
      .select('id')
      .single();
    
    if (insertError) {
      throw new Error(`No se pudo crear el chofer ${nombre}: ${insertError.message}`);
    }

    // Actualizar catálogo local
    setCatalogs(prev => ({
      ...prev,
      choferes: [...prev.choferes, { id: newData.id, nombre: nombre.toUpperCase(), dni: cleanDni || null, telefono: normalizedCelular || null }]
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
    if (Number(overrideForm.anticipacion_monitoreo_horas) < 0) {
      alert("La anticipación de monitoreo no puede ser negativa.");
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
        anticipacion_monitoreo_horas: Number(overrideForm.anticipacion_monitoreo_horas),
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
          anticipacion_monitoreo_horas: defaultPolicy.anticipacion_monitoreo_horas,
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
        if (!nombreChoferNuevo || !celularChoferNuevo) {
          alert("Por favor complete el nombre y celular/teléfono del nuevo chofer.");
          setIsSubmitting(false);
          return;
        }
        if (dniExistenteError) {
          alert(dniExistenteError);
          setIsSubmitting(false);
          return;
        }
        finalChoferId = await resolveChoferId(nombreChoferNuevo, dniChoferNuevo, celularChoferNuevo);
        if (!finalChoferId) {
          setIsSubmitting(false);
          return;
        }
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
      const finalBrutoId = pesaje.bruto.lugar_id === 'IGUAL' ? finalTaraId : await resolveLugarPesaje(pesaje.bruto.lugar_id, nuevoLugarBruto);
      
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
        chofer_id: finalChoferId ? Number(finalChoferId) : null,
        nombre_chofer_nuevo: remito.chofer_id === 0 ? nombreChoferNuevo : null,
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
        es_flete_corto: remito.es_flete_corto,
        fecha_probable_entrega: remito.fecha_probable_entrega,
        mi_sobre_proveedor_preparado: remito.mi_sobre_proveedor_preparado,
        mi_sobre_cliente_preparado: remito.mi_sobre_cliente_preparado,
        me_planillas_t48_emitidas: remito.me_planillas_t48_emitidas,
        me_checklist_enviado_operario: remito.me_checklist_enviado_operario,
        mision_estado: remito.mision_estado,
        tiene_incidencias_carga: remito.tiene_incidencias_carga,
        ultimo_mensaje_chofer_at: remito.ultimo_mensaje_chofer_at,
        deposito_carga_id: remito.deposito_carga_id,
        deposito_descarga_id: remito.deposito_descarga_id,
        retry_count: remito.retry_count,
        tipo_mision_id: remito.tipo_mision_id,
        mision_estados_secuencia: remito.mision_estados_secuencia,
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

  const getLatencyInfo = () => {
    if (!remito.ultimo_mensaje_chofer_at) return 'Sin contacto';
    const lastContact = new Date(remito.ultimo_mensaje_chofer_at);
    const now = new Date();
    const diffMs = now.getTime() - lastContact.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    
    // Buscar la tarea activa correspondiente al estado actual para obtener su tiempo de gracia
    let activeTask = null;
    if (remito.mision_estado === 'ESPERANDO_PAPELES') {
      activeTask = checklist.find(c => c.id === 1);
    } else if (remito.mision_estado === 'PESAJE_TARA_ORIGEN' || remito.mision_estado === 'PESAJE_TARA_DESTINO') {
      activeTask = checklist.find(c => c.tipo_tarea === 'PESAJE_TARA');
    } else if (remito.mision_estado === 'PESAJE_BRUTO_ORIGEN' || remito.mision_estado === 'PESAJE_BRUTO_DESTINO') {
      activeTask = checklist.find(c => c.tipo_tarea === 'PESAJE_BRUTO');
    } else if (remito.mision_estado === 'EN_CARGA') {
      activeTask = checklist.find(c => c.tipo_tarea === 'CONTROL_GENERAL' && c.estado === 'PENDIENTE' && c.id !== 1);
    }

    const graciaMin = activeTask?.minutos_gracia !== undefined 
      ? activeTask.minutos_gracia 
      : (remito.mision_estado === 'CONTROL_ENTREGA' ? 30 : 60);

    const reintentosMax = activeTask?.reintentos_max !== undefined 
      ? activeTask.reintentos_max 
      : 2;

    const graceText = `(Gracia: ${graciaMin}m, Reintentos: ${remito.retry_count || 0}/${reintentosMax})`;

    if (diffMin < 1) return `Hace instantes ${graceText}`;
    if (diffMin < 60) return `Hace ${diffMin} min ${graceText}`;
    const diffHours = Math.floor(diffMin / 60);
    const remainingMin = diffMin % 60;
    return `Hace ${diffHours}h ${remainingMin}m ${graceText}`;
  };




  const activePath = useMemo(() => {
    if (!remito.mision_estados_secuencia) return [];
    return remito.mision_estados_secuencia
      .filter((s: any) => s.activo !== false)
      .map((s: any) => s.code);
  }, [remito.mision_estados_secuencia]);

  const fsmSteps = useMemo(() => {
    if (!remito.mision_estados_secuencia || remito.mision_estados_secuencia.length === 0) {
      // Fallback a secuencia por defecto si está vacía
      return [
        { code: 'OPERACION_PENDIENTE', label: 'Pendiente', desc: 'Faltan datos o inicio', orden: 10, isNA: false },
        { code: 'ESPERANDO_PAPELES', label: 'Papeles', desc: 'Confirmación de papeles', orden: 20, isNA: false },
        { code: 'PESAJE_TARA_ORIGEN', label: 'Tara Origen', desc: 'Pesaje inicial vacío', orden: 30, isNA: false },
        { code: 'EN_CARGA', label: 'Carga', desc: 'Carga y checklist', orden: 40, isNA: false },
        { code: 'PESAJE_BRUTO_ORIGEN', label: 'Bruto Origen', desc: 'Pesaje cargado', orden: 50, isNA: false },
        { code: 'EN_TRANSITO', label: 'Tránsito', desc: 'Viaje a destino', orden: 60, isNA: false },
        { code: 'CONTROL_ENTREGA', label: 'Entrega', desc: 'Remito Firmado', orden: 70, isNA: false },
        { code: 'MISION_COMPLETADA', label: 'Completada', desc: 'Fin de la misión', orden: 80, isNA: false },
      ];
    }
    return remito.mision_estados_secuencia.map((s: any, idx: number) => ({
      code: s.code,
      label: s.label,
      desc: s.desc,
      orden: s.orden_logistico_default || (idx + 1) * 10,
      isNA: s.activo === false,
    }));
  }, [remito.mision_estados_secuencia]);

  const handleForceTransition = async (targetState: string) => {
    const confirmText = `¿Estás seguro de que quieres FORZAR la misión al estado "${targetState}"? Esto registrará un evento de transición forzada en el historial.`;
    if (!window.confirm(confirmText)) return;
    
    try {
      setIsSubmitting(true);
      const { error } = await supabase.rpc('transicionar_mision_remito', {
        p_remito_id: Number(id),
        p_nuevo_estado: targetState,
        p_usuario_actor: user?.email || 'admin',
        p_comentarios: 'Transición forzada manualmente por el operador.',
        p_forced: true
      });
      if (error) throw error;
      alert(`Misión transicionada exitosamente a ${targetState}`);
      await fetchContext();
    } catch (err: any) {
      alert("Error al forzar transición: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMisionTipoChange = async (val: number | null) => {
    if (!val) {
      setRemito(prev => ({ ...prev, tipo_mision_id: null }));
      return;
    }

    if (window.confirm("⚠️ ADVERTENCIA: Esta acción sobrescribirá y eliminará el protocolo de control y tareas existentes para este remito. ¿Deseas re-inicializar el Road Map y el Checklist de acuerdo al Tipo de Misión seleccionado?")) {
      try {
        setIsSubmitting(true);
        // Fetch default steps for this mission type
        const { data: stepsData, error: stepsErr } = await supabase
          .from('mision_tipo_pasos')
          .select('mision_estados_definicion(codigo, nombre, descripcion)')
          .eq('tipo_mision_id', val)
          .order('orden_especifico', { ascending: true });
        
        if (stepsErr) throw stepsErr;
        
        const newSequence = stepsData.map((s: any) => ({
          code: s.mision_estados_definicion.codigo,
          label: s.mision_estados_definicion.nombre,
          desc: s.mision_estados_definicion.descripcion,
          activo: true
        }));

        // Fetch default active tasks for these states
        const stateCodes = newSequence.map((s: any) => s.code);
        const { data: tasksData, error: tasksErr } = await supabase
          .from('catalogo_tareas_control')
          .select('id, tarea_template, tipo_tarea, requiere_foto, requiere_aviso, orden_sugerido, tipo_dato_esperado, mensaje_template, mision_estados_definicion!inner(codigo)')
          .eq('estado', 'ACTIVO')
          .in('mision_estados_definicion.codigo', stateCodes);
        
        if (tasksErr) throw tasksErr;

        const newChecklist = tasksData.map((c: any) => ({
          id: c.id,
          tarea: c.tarea_template,
          tarea_template: c.tarea_template,
          tipo_tarea: c.tipo_tarea,
          requiere_foto: c.requiere_foto,
          requiere_aviso: c.requiere_aviso,
          orden_sugerido: c.orden_sugerido,
          asignada_a_chofer: true,
          done: false,
          estado: 'PENDIENTE',
          minutos_gracia: c.tipo_tarea === 'PESAJE_TARA' || c.tipo_tarea === 'PESAJE_BRUTO' ? 60 : 30,
          reintentos_max: 2,
          estado_id: c.mision_estados_definicion.codigo,
          tipo_dato_esperado: c.tipo_dato_esperado || 'check',
          valor_reportado: null,
          calificacion: 0
        }));

        setRemito(prev => ({
          ...prev,
          tipo_mision_id: val,
          mision_estados_secuencia: newSequence
        }));
        setChecklist(newChecklist);
      } catch (err: any) {
        alert("Error al cargar la secuencia del tipo de misión: " + err.message);
      } finally {
        setIsSubmitting(false);
      }
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
        {/* FSM Máquina de Estados de la Misión de Transporte */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-brand-600 animate-pulse" />
                <h2 className="text-lg font-bold text-gray-800">Misión de Transporte (FSM)</h2>
                {remito.tiene_incidencias_carga && (
                  <span className="px-2.5 py-0.5 bg-red-100 text-red-800 border border-red-200 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Incidencia Activa
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Monitoreo físico del remito en tiempo real. Estado actual: <strong className="text-brand-700">{remito.mision_estado || 'OPERACION_PENDIENTE'}</strong>
              </p>
            </div>
            
            <div className="flex flex-wrap gap-3 items-center text-xs">
              {/* Searchable Select Tipo de Misión */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMTypeDropdownOpen(!mTypeDropdownOpen)}
                  className="px-3 py-2.5 rounded-lg border text-[11px] font-bold shadow-xs cursor-pointer transition-all bg-white text-gray-700 border-gray-200 hover:bg-gray-50 flex items-center gap-1.5 min-w-[170px]"
                >
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">
                    {misionTipos.find(mt => mt.id === remito.tipo_mision_id)?.nombre || "Seleccionar Misión Tipo..."}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto" />
                </button>

                {mTypeDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMTypeDropdownOpen(false)}></div>
                    <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100 p-2 space-y-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Buscar tipo de misión..."
                          value={mTypeSearch}
                          onChange={(e) => setMTypeSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand-500 outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {misionTipos
                          .filter(mt => mt.nombre.toLowerCase().includes(mTypeSearch.toLowerCase()))
                          .map(mt => (
                            <button
                              key={`mt-select-${mt.id}`}
                              type="button"
                              onClick={() => {
                                handleMisionTipoChange(mt.id);
                                setMTypeDropdownOpen(false);
                                setMTypeSearch('');
                              }}
                              className={cn(
                                "w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all hover:bg-brand-50 cursor-pointer block",
                                mt.id === remito.tipo_mision_id 
                                  ? "bg-brand-50 text-brand-700 font-bold" 
                                  : "text-gray-700"
                              )}
                            >
                              {mt.nombre}
                            </button>
                          ))}
                        {misionTipos.filter(mt => mt.nombre.toLowerCase().includes(mTypeSearch.toLowerCase())).length === 0 && (
                          <div className="text-center py-4 text-xs text-gray-400 font-medium">No se encontraron tipos.</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 flex items-center gap-2 shadow-xs">
                <MessageSquare className="w-4 h-4 text-brand-500" />
                <div>
                  <div className="font-semibold text-gray-700">Solicitudes sin respuesta</div>
                  <div className="text-[10px] text-gray-500">
                    {remito.mensajes_sin_respuesta_count || 0} sin rpta.
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 flex items-center gap-2 shadow-xs">
                <Clock className="w-4 h-4 text-brand-500" />
                <div>
                  <div className="font-semibold text-gray-700">Último contacto</div>
                  <div className="text-[10px] text-gray-500">
                    {getLatencyInfo()}
                  </div>
                </div>
              </div>

              {/* Toggle Incidencia */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    setIsSubmitting(true);
                    const nuevoIncidencia = !remito.tiene_incidencias_carga;
                    const { error } = await supabase.rpc('save_remito_update_admin', {
                      p_remito_id: Number(id),
                      p_updates: { tiene_incidencias_carga: nuevoIncidencia },
                      p_admin_email: user?.email || 'admin'
                    });
                    if (error) throw error;
                    setRemito(r => ({ ...r, tiene_incidencias_carga: nuevoIncidencia }));
                    alert(`Incidencia ${nuevoIncidencia ? 'activada' : 'desactivada'} correctamente.`);
                  } catch (err: any) {
                    alert("Error: " + err.message);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className={cn(
                  "px-3 py-2.5 rounded-lg border text-[11px] font-bold shadow-xs cursor-pointer transition-all",
                  remito.tiene_incidencias_carga 
                    ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" 
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                )}
              >
                {remito.tiene_incidencias_carga ? "Resolver Incidencia" : "Reportar Incidencia"}
              </button>
              
              <button
                type="button"
                onClick={() => {
                  if (remito.mision_estados_secuencia) {
                    setTempSequence(JSON.parse(JSON.stringify(remito.mision_estados_secuencia)));
                  }
                  setShowPersonalizarModal(true);
                }}
                className="px-3 py-2.5 rounded-lg border text-[11px] font-bold shadow-xs cursor-pointer transition-all bg-white text-brand-700 border-brand-200 hover:bg-brand-50"
              >
                Personalizar Misión
              </button>
              
            </div>
          </div>

          {/* Stepper visual horizontal scrollable */}
          <div className="overflow-x-auto pb-4 -mx-6 px-6">
            <div className="flex items-center min-w-[800px] justify-between relative py-2">
              {fsmSteps.map((step, idx) => {
                const isNA = step.isNA;
                const stateTasks = checklist.filter((t: any) => t.estado_id === step.code && t.asignada_a_chofer !== false);
                const hasTasks = stateTasks.length > 0;
                const hasNonRealizableOrAlert = stateTasks.some((t: any) => t.estado === 'NO_REALIZABLE' || t.estado === 'RECHAZADO');
                const allTasksDone = hasTasks && stateTasks.every((t: any) => t.done || ['COMPLETADO', 'REPORTADO_CHOFER', 'NO_REALIZABLE', 'OMITIDO', 'NO_APLICA', 'RECHAZADO'].includes(t.estado));
                const isPast = activePath.indexOf(step.code) < activePath.indexOf(remito.mision_estado || 'OPERACION_PENDIENTE');

                const status = isNA 
                  ? 'NA' 
                  : step.code === remito.mision_estado
                    ? 'ACTIVE'
                    : (hasTasks ? allTasksDone : isPast)
                      ? 'COMPLETED'
                      : 'PENDING';
                
                // Determinar estado de la línea hacia la tarea previa
                const prevStep = idx > 0 ? fsmSteps[idx - 1] : null;
                const prevIsNA = prevStep ? prevStep.isNA : false;

                const prevTasks = prevStep ? checklist.filter((t: any) => t.estado_id === prevStep.code && t.asignada_a_chofer !== false) : [];
                const prevHasTasks = prevTasks.length > 0;
                const prevAllTasksDone = prevHasTasks && prevTasks.every((t: any) => t.done || ['COMPLETADO', 'REPORTADO_CHOFER', 'NO_REALIZABLE', 'OMITIDO', 'NO_APLICA', 'RECHAZADO'].includes(t.estado));
                const prevIsPast = prevStep ? activePath.indexOf(prevStep.code) < activePath.indexOf(remito.mision_estado || 'OPERACION_PENDIENTE') : false;

                const prevStatus = prevStep
                  ? prevIsNA
                    ? 'NA'
                    : prevStep.code === remito.mision_estado
                      ? 'ACTIVE'
                      : (prevHasTasks ? prevAllTasksDone : prevIsPast)
                        ? 'COMPLETED'
                        : 'PENDING'
                  : null;

                const isSegmentCompleted = prevStatus === 'COMPLETED' && (status === 'COMPLETED' || status === 'ACTIVE');
                const isSegmentActive = prevStatus === 'COMPLETED' && status === 'ACTIVE';

                return (
                  <div key={step.code} className="flex flex-1 items-center justify-center relative">
                    {/* Línea de segmento dinámica al paso anterior */}
                    {idx > 0 && (
                      <div 
                        className={cn(
                          "absolute left-0 right-1/2 top-4 h-0.5 -translate-y-1/2 -translate-x-1/2 w-full -z-10 transition-all duration-500",
                          isSegmentCompleted 
                            ? "bg-emerald-500" 
                            : isSegmentActive 
                              ? "bg-brand-500" 
                              : status === 'NA' || prevStatus === 'NA' 
                                ? "bg-gray-100 border-t border-dashed" 
                                : "bg-gray-200"
                        )}
                      />
                    )}

                    <div className="flex flex-col items-center text-center relative px-2">
                      {/* Indicador de Estado */}
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-sm transition-all duration-300 z-10",
                        status === 'COMPLETED' && (hasNonRealizableOrAlert ? "bg-amber-100 text-amber-800 border-2 border-amber-400 ring-4 ring-amber-50" : "bg-emerald-500 text-white ring-4 ring-emerald-100"),
                        status === 'ACTIVE' && "bg-brand-600 text-white ring-4 ring-brand-100",
                        status === 'PENDING' && "bg-white text-gray-400 border-2 border-gray-200",
                        status === 'NA' && "bg-gray-50 text-gray-300 border border-gray-200 border-dashed"
                      )}>
                        {status === 'COMPLETED' ? (
                          hasNonRealizableOrAlert ? (
                            <span title="Etapa superada con observaciones / tareas no realizables">
                              <AlertTriangle className="w-4 h-4 text-amber-700" />
                            </span>
                          ) : (
                            <CheckCircle className="w-5 h-5 text-white" />
                          )
                        ) : status === 'NA' ? (
                          <span className="text-[9px]">N/A</span>
                        ) : (
                          <span className="text-[10px]">{step.orden || idx + 1}</span>
                        )}
                      </div>
                      
                      {/* Textos */}
                      <span className={cn(
                        "text-[11px] font-bold mt-2",
                        status === 'ACTIVE' ? "text-brand-700" : status === 'NA' ? "text-gray-300" : "text-gray-700"
                      )}>
                        {step.label}
                      </span>
                      <span className="text-[9px] text-gray-400 max-w-[100px] mt-0.5">
                        {isNA ? 'Omitido según config.' : step.desc}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selector de Transición Forzada */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-sm">
            <div className="space-y-1">
              <h3 className="font-bold text-gray-800 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-gray-500" />
                Transición Forzada (Contingencia)
              </h3>
              <p className="text-xs text-gray-500">
                Fuerza el avance o retroceso del viaje si ocurre alguna eventualidad o pesaje omitido.
              </p>
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto items-center">
              <select
                id="select-forced-state"
                defaultValue={remito.mision_estado || 'OPERACION_PENDIENTE'}
                className="p-2 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:border-brand-500 flex-1 sm:flex-none"
              >
                {fsmSteps.filter(s => !s.isNA).map(s => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </select>
              
              <button
                type="button"
                onClick={async () => {
                  const selEl = document.getElementById('select-forced-state') as HTMLSelectElement;
                  if (selEl) {
                    await handleForceTransition(selEl.value);
                  }
                }}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                Forzar
              </button>
            </div>
          </div>
        </section>

        {/* Sección A: Datos del Viaje */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100 pb-2">A. Datos del Viaje</h2>

          {/* Chofer Select */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Chofer</label>
            <select 
              value={remito.chofer_id === null ? '' : remito.chofer_id}
              onChange={e => {
                const val = e.target.value;
                setRemito({
                  ...remito,
                  chofer_id: val === '' ? null : (val === '0' ? 0 : Number(val))
                });
              }}
              className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none transition-all text-sm"
            >
              <option value="">Seleccionar chofer...</option>
              {catalogs.choferes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} {c.dni ? `(DNI: ${c.dni})` : ''}
                </option>
              ))}
              <option value="0" className="font-bold text-brand-600">+ Nuevo Chofer...</option>
            </select>

            {remito.chofer_id === 0 && (
              <div className="mt-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-2">
                    <UserPlus className="w-4 h-4"/> Nuevo Chofer
                  </h3>
                  <button onClick={() => { setRemito({...remito, chofer_id: null}); }} type="button" className="text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4"/>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Nombre Completo</label>
                    <input 
                      value={nombreChoferNuevo} 
                      onChange={e => setNombreChoferNuevo(e.target.value)} 
                      placeholder="Ej: JUAN PEREZ"
                      className="w-full p-2 text-sm bg-white border border-gray-200 rounded outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">DNI (Opcional)</label>
                    <input 
                      value={dniChoferNuevo} 
                      onChange={e => setDniChoferNuevo(e.target.value.replace(/\D/g, ''))} 
                      placeholder="Ej: 21366111"
                      className={`w-full p-2 text-sm bg-white border rounded outline-none focus:ring-2 ${dniExistenteError ? 'border-red-500 focus:ring-red-200' : 'border-gray-200 focus:ring-brand-500'}`}
                    />
                    {dniExistenteError && <p className="text-xs text-red-500 mt-1">{dniExistenteError}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Celular / Teléfono</label>
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

          {/* Ubicaciones Físicas (Depósitos) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-50">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex justify-between items-center">
                <span>Depósito de Carga</span>
                <button
                  type="button"
                  onClick={() => {
                    setNewDeposito({
                      nombre: '',
                      tipo: 'DEPOSITO_PROPIO',
                      funcion: 'CARGA',
                      google_maps_link: '',
                      targetSelector: 'carga'
                    });
                    setShowNewDepositoModal(true);
                  }}
                  className="text-xs text-brand-600 hover:text-brand-700 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span>+ Crear nuevo</span>
                </button>
              </label>
              <select
                value={remito.deposito_carga_id || ''}
                onChange={e => setRemito({...remito, deposito_carga_id: e.target.value ? Number(e.target.value) : null})}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Seleccionar depósito...</option>
                {depositos.filter(d => d.funcion === 'CARGA' || d.funcion === 'AMBAS').map(d => (
                  <option key={`dep-c-${d.id}`} value={d.id}>{d.nombre} ({d.tipo})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex justify-between items-center">
                <span>Depósito de Descarga</span>
                <button
                  type="button"
                  onClick={() => {
                    setNewDeposito({
                      nombre: '',
                      tipo: 'DEPOSITO_PROPIO',
                      funcion: 'DESCARGA',
                      google_maps_link: '',
                      targetSelector: 'descarga'
                    });
                    setShowNewDepositoModal(true);
                  }}
                  className="text-xs text-brand-600 hover:text-brand-700 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span>+ Crear nuevo</span>
                </button>
              </label>
              <select
                value={remito.deposito_descarga_id || ''}
                onChange={e => setRemito({...remito, deposito_descarga_id: e.target.value ? Number(e.target.value) : null})}
                className="w-full p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Seleccionar depósito...</option>
                {depositos.filter(d => d.funcion === 'DESCARGA' || d.funcion === 'AMBAS').map(d => (
                  <option key={`dep-d-${d.id}`} value={d.id}>{d.nombre} ({d.tipo})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Logística Adicional */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-50">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y Hora Estimada de Carga</label>
              <div className="relative">
                <DateTimePicker 
                  value={remito.fecha_hora_estimada_carga}
                  onChange={val => setRemito({...remito, fecha_hora_estimada_carga: val})}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y Hora Probable de Entrega</label>
              <div className="relative">
                <DateTimePicker 
                  value={remito.fecha_probable_entrega}
                  onChange={val => setRemito({...remito, fecha_probable_entrega: val})}
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

            {/* Checklists de Estado 4 de Documentación */}
            {remito.tipo_mercado && (
              <div className="col-span-1 md:col-span-2 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-brand-600" />
                  Control de Documentación (Estado 4 - Mercado: {remito.tipo_mercado === 'MI' ? 'Interno' : 'Externo'})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {remito.tipo_mercado === 'MI' ? (
                    <>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          id="toggle-sobre-proveedor"
                          onClick={() => setRemito({...remito, mi_sobre_proveedor_preparado: !remito.mi_sobre_proveedor_preparado})}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${remito.mi_sobre_proveedor_preparado ? 'bg-emerald-500' : 'bg-gray-200'}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${remito.mi_sobre_proveedor_preparado ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-sm font-medium text-gray-700">Sobre Proveedor Preparado</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          id="toggle-sobre-cliente"
                          onClick={() => setRemito({...remito, mi_sobre_cliente_preparado: !remito.mi_sobre_cliente_preparado})}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${remito.mi_sobre_cliente_preparado ? 'bg-emerald-500' : 'bg-gray-200'}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${remito.mi_sobre_cliente_preparado ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-sm font-medium text-gray-700">Sobre Cliente Preparado</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          id="toggle-planillas-t48"
                          onClick={() => setRemito({...remito, me_planillas_t48_emitidas: !remito.me_planillas_t48_emitidas})}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${remito.me_planillas_t48_emitidas ? 'bg-emerald-500' : 'bg-gray-200'}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${remito.me_planillas_t48_emitidas ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-sm font-medium text-gray-700">Planillas T-48 Emitidas</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          id="toggle-checklist-operario"
                          onClick={() => setRemito({...remito, me_checklist_enviado_operario: !remito.me_checklist_enviado_operario})}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${remito.me_checklist_enviado_operario ? 'bg-emerald-500' : 'bg-gray-200'}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${remito.me_checklist_enviado_operario ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-sm font-medium text-gray-700">Checklist Enviado al Operario</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
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
          <div className="flex justify-between items-center border-b border-gray-100 pb-3">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-800">Protocolo de Control de la Misión</h2>
              <p className="text-xs text-gray-500">Gestión de tareas, pesajes y auditoría operativa por cada hito de la hoja de ruta.</p>
            </div>
            <button 
              type="button" 
              onClick={() => setShowWpModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors shadow-sm cursor-pointer animate-none"
            >
              <MessageSquare className="w-4 h-4" />
              Enviar por WhatsApp
            </button>
          </div>
          
          {/* Observaciones Generales en la parte superior del protocolo de control */}
          <div className="bg-blue-50/30 p-4 rounded-xl border border-blue-100">
            <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">Observaciones / Indicaciones Generales</label>
            <textarea 
              value={observacionesExtras}
              onChange={e => setObservacionesExtras(e.target.value)}
              rows={2}
              placeholder="Escribe aquí cualquier observación manual o indicación especial..."
              className="w-full p-3 bg-white border border-blue-200 rounded-lg text-sm text-gray-700 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-6">
            {activePath.map(stateCode => {
              const stateDef = remito.mision_estados_secuencia?.find((s: any) => s.code === stateCode);
              const stateTasks = checklist.filter((t: any) => t.estado_id === stateCode);

              const isActivePhase = stateCode === (remito.mision_estado || 'OPERACION_PENDIENTE');
              const stepOrder = stateDef?.orden_logistico_default;

              return (
                <div 
                  key={stateCode} 
                  className={cn(
                    "p-4 rounded-xl border shadow-xs transition-all bg-white",
                    isActivePhase 
                      ? "border-brand-500 ring-2 ring-brand-100/50 shadow-md" 
                      : "border-gray-200"
                  )}
                >
                  <div className="flex items-center gap-2 mb-3 border-b border-gray-100 pb-2">
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full shadow-xs",
                      isActivePhase ? "bg-brand-600 animate-pulse" : "bg-gray-400"
                    )} />
                    <span className="font-bold text-gray-800 text-xs uppercase tracking-wider">
                      {stepOrder ? `${stepOrder} - ` : ''}{stateDef?.label || stateCode}
                    </span>
                    {isActivePhase && (
                      <span className="text-[9px] bg-brand-50 text-brand-700 font-bold px-2 py-0.5 rounded-full border border-brand-100 uppercase ml-2">Fase Activa</span>
                    )}
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {stateDef?.desc ? `${stateDef.desc}` : ''}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {stateTasks.length === 0 ? (
                      <div className="text-gray-400 text-xs italic py-2 px-1">
                        No hay tareas de control registradas para esta fase.
                      </div>
                    ) : (
                      stateTasks.map((task) => {
                        const isTaskCompleted = task.done || task.estado === 'COMPLETADO';
                        return (
                          <div 
                            key={task.id || task.tarea} 
                            className={cn(
                              "flex flex-col p-3 rounded-lg border transition hover:border-brand-200 shadow-xs",
                              task.estado === 'RECHAZADO'
                                ? "bg-red-50/70 border-red-200 text-red-900"
                                : "bg-gray-50/50 border-gray-150 text-gray-800"
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              {/* Check de Realizado */}
                              <label className="flex items-center gap-3 flex-1 cursor-pointer min-w-0">
                                <input 
                                  type="checkbox" 
                                  checked={isTaskCompleted} 
                                  onChange={() => {
                                    const idx = checklist.findIndex(c => c.id === task.id || c.tarea === task.tarea);
                                    if (idx > -1) {
                                      const newList = [...checklist];
                                      const newDone = !newList[idx].done;
                                      newList[idx].done = newDone;
                                      newList[idx].estado = newDone ? 'COMPLETADO' : 'PENDIENTE';
                                      
                                      // Copiar reporte de peso si aplica
                                      if (newDone) {
                                        if (newList[idx].tipo_tarea === 'PESAJE_TARA' && newList[idx].valor_reportado_chofer) {
                                          setPesaje(prev => ({
                                            ...prev,
                                            tara: { ...prev.tara, momento: newList[idx].valor_reportado_chofer }
                                          }));
                                        } else if (newList[idx].tipo_tarea === 'PESAJE_BRUTO' && newList[idx].valor_reportado_chofer) {
                                          setPesaje(prev => ({
                                            ...prev,
                                            bruto: { ...prev.bruto, momento: newList[idx].valor_reportado_chofer }
                                          }));
                                        }
                                      }
                                      setChecklist(newList);
                                    }
                                  }}
                                  className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500" 
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center flex-wrap gap-1.5">
                                    <span className={cn(
                                      "text-sm font-semibold text-gray-800",
                                      isTaskCompleted && "line-through text-gray-400"
                                    )}>
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

                                  {/* Indicadores de tipo de dato */}
                                  <div className="flex items-center gap-2 mt-1">
                                    {/* Indicador 'Imagen' */}
                                    {task.tipo_dato_esperado === 'imagen' && (
                                      <div className="flex items-center gap-1">
                                        {task.valor_reportado_chofer && task.valor_reportado_chofer.startsWith('http') ? (
                                          <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-medium">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            📷 Evidencia Recibida
                                          </span>
                                        ) : (
                                          <span className="flex items-center gap-1 text-[10px] bg-gray-100 text-gray-400 border border-gray-150 px-2 py-0.5 rounded-full">
                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                                            📷 Pendiente
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* Valores Reportados (Edición Inline) */}
                                    {task.tipo_dato_esperado === 'numero' && (
                                      <div className="flex items-center">
                                        {editingTaskId === task.id ? (
                                          <input
                                            type="text"
                                            defaultValue={task.valor_reportado_chofer || ''}
                                            onBlur={(e) => {
                                              setEditingTaskId(null);
                                              const val = e.target.value;
                                              const idx = checklist.findIndex(c => c.id === task.id || c.tarea === task.tarea);
                                              if (idx > -1) {
                                                const newList = [...checklist];
                                                newList[idx].valor_reportado_chofer = val;
                                                newList[idx].valor_reportado = val;
                                                setChecklist(newList);
                                              }
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.currentTarget.blur();
                                              }
                                            }}
                                            className="p-1 text-xs border border-amber-300 rounded bg-white w-24 text-center font-bold"
                                            autoFocus
                                          />
                                        ) : (
                                          <span 
                                            onClick={() => setEditingTaskId(task.id)}
                                            className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 font-bold cursor-pointer hover:bg-amber-100/50 transition-colors"
                                            title="Click para editar"
                                          >
                                            Valor: {task.valor_reportado_chofer || '---'} ✏️
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </label>

                              {/* Barra de Herramientas de la Tarea */}
                              <div className="flex items-center gap-2 pl-3 border-l border-gray-150">
                                {/* Selector de Performance (Semáforo de estrellas) */}
                                <div className="flex items-center gap-1 border-r border-gray-150 pr-2">
                                  {[1, 2, 3, 4, 5].map(star => (
                                    <button
                                      key={star}
                                      type="button"
                                      disabled={!task.asignada_a_chofer}
                                      onClick={() => {
                                        const idx = checklist.findIndex(c => c.id === task.id || c.tarea === task.tarea);
                                        if (idx > -1) {
                                          const newList = [...checklist];
                                          newList[idx].calificacion = star;
                                          setChecklist(newList);
                                        }
                                      }}
                                      className={cn(
                                        "focus:outline-none text-base transition-colors",
                                        !task.asignada_a_chofer ? "opacity-30 cursor-not-allowed" : "cursor-pointer",
                                        (task.calificacion || 0) >= star ? "text-amber-400" : "text-gray-200 hover:text-amber-300"
                                      )}
                                      title={`Calificar con ${star} estrellas`}
                                    >
                                      ★
                                    </button>
                                  ))}

                                  <button
                                    type="button"
                                    disabled={!task.asignada_a_chofer}
                                    onClick={() => {
                                      const idx = checklist.findIndex(c => c.id === task.id || c.tarea === task.tarea);
                                      if (idx > -1) {
                                        const newList = [...checklist];
                                        newList[idx].done = false;
                                        newList[idx].estado = 'RECHAZADO';
                                        setChecklist(newList);
                                      }
                                    }}
                                    className={cn(
                                      "p-1 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors ml-1",
                                      !task.asignada_a_chofer ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                    )}
                                    title="Rechazar Tarea (Marcar Incumplida)"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* Botón de Mensajería Directa */}
                                <button
                                  type="button"
                                  disabled={!task.asignada_a_chofer}
                                  onClick={() => {
                                    setOpenMsgTaskId(openMsgTaskId === task.id ? null : task.id);
                                    setMsgText('');
                                    setMsgSentSuccess(false);
                                  }}
                                  className={cn(
                                    "p-1.5 rounded-lg border hover:bg-gray-100 transition-colors",
                                    openMsgTaskId === task.id ? "border-brand-500 bg-brand-50 text-brand-600 font-bold" : "border-gray-200 text-gray-500",
                                    !task.asignada_a_chofer ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                  )}
                                  title="Enviar mensaje directo sobre esta tarea"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>

                                {/* Evidencia (Ver Adjunto) */}
                                {task.valor_reportado_chofer && task.valor_reportado_chofer.startsWith('http') && (
                                  <a 
                                    href={task.valor_reportado_chofer} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="p-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
                                    title="Ver Evidencia Adjunta"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </a>
                                )}

                                {/* Configuración individual (minutos_gracia y reintentos) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenConfigTaskId(openConfigTaskId === task.id ? null : task.id);
                                  }}
                                  className={cn(
                                    "p-1.5 rounded-lg border transition-colors text-gray-500 hover:bg-gray-100 cursor-pointer",
                                    openConfigTaskId === task.id ? "border-amber-500 bg-amber-50" : "border-gray-200"
                                  )}
                                  title="Configurar Gracia y Reintentos"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                </button>

                                {/* Truck Icon (Asignación al chofer) */}
                                <button
                                  type="button"
                                  title="Asignar / Desasignar chofer"
                                  onClick={() => {
                                    const idx = checklist.findIndex(c => c.id === task.id || c.tarea === task.tarea);
                                    if (idx > -1) {
                                      const newList = [...checklist];
                                      newList[idx].asignada_a_chofer = !newList[idx].asignada_a_chofer;
                                      setChecklist(newList);
                                    }
                                  }}
                                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Truck 
                                    className={cn(
                                      "w-4 h-4 transition-colors",
                                      task.asignada_a_chofer ? "text-blue-600" : "text-gray-300"
                                    )}
                                  />
                                </button>
                              </div>
                            </div>

                            {/* Campo flotante de envío de WhatsApp directo */}
                            {openMsgTaskId === task.id && (
                              <div className="mt-2.5 p-3 bg-gray-100 border border-gray-150 rounded-lg flex flex-col gap-2 w-full animate-fadeIn">
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Mensaje de WhatsApp al Chofer:</span>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Escribe un mensaje para enviárselo directamente al chofer..."
                                    value={msgText}
                                    onChange={e => setMsgText(e.target.value)}
                                    className="flex-1 p-2 bg-white border border-gray-200 rounded text-xs focus:ring-1 focus:ring-brand-500 outline-none"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSendDirectMsg(task.id);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={msgSending || !msgText.trim()}
                                    onClick={() => handleSendDirectMsg(task.id)}
                                    className="px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    {msgSending ? (
                                      <>
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        <span>Enviando...</span>
                                      </>
                                    ) : msgSentSuccess ? (
                                      <>
                                        <Check className="w-3 h-3 text-white" />
                                        <span>✓ ¡Enviado!</span>
                                      </>
                                    ) : (
                                      <span>Enviar</span>
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Panel de configuración de minutos de gracia y reintentos */}
                            {openConfigTaskId === task.id && (
                              <div className="mt-2.5 p-3 bg-amber-50/40 border border-amber-100 rounded-lg flex items-center justify-between gap-4 w-full animate-fadeIn">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">Minutos Gracia:</span>
                                  <input
                                    type="number"
                                    value={task.minutos_gracia !== undefined ? task.minutos_gracia : 30}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      const idx = checklist.findIndex(c => c.id === task.id || c.tarea === task.tarea);
                                      if (idx > -1) {
                                        const newList = [...checklist];
                                        newList[idx].minutos_gracia = isNaN(val) ? 0 : val;
                                        setChecklist(newList);
                                      }
                                    }}
                                    min={0}
                                    className="w-16 p-1 border border-gray-200 rounded text-xs text-center focus:ring-brand-500 font-bold bg-white"
                                  />
                                  <span className="text-[10px] text-gray-400 font-medium">min</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider">Reintentos Máximos:</span>
                                  <input
                                    type="number"
                                    value={task.reintentos_max !== undefined ? task.reintentos_max : 2}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      const idx = checklist.findIndex(c => c.id === task.id || c.tarea === task.tarea);
                                      if (idx > -1) {
                                        const newList = [...checklist];
                                        newList[idx].reintentos_max = isNaN(val) ? 0 : val;
                                        setChecklist(newList);
                                      }
                                    }}
                                    min={0}
                                    className="w-16 p-1 border border-gray-200 rounded text-xs text-center focus:ring-brand-500 font-bold bg-white"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                );
              })}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Espera Rpta. (min)', key: 'espera_respuesta_minutos', tooltip: 'Minutos que el bot espera respuesta antes de marcar un fallo.' },
                  { label: 'Umbral Retraso (min)', key: 'umbral_carga_larga_minutos', tooltip: 'Si el retraso supera estos minutos, el bot espacia los mensajes (Intervalo Largo).' },
                  { label: 'Frecuencia Normal (min)', key: 'intervalo_recordatorio_carga_corta_minutos', tooltip: 'Minutos entre cada recordatorio durante la carga normal.' },
                  { label: 'Frecuencia en Retrasos (min)', key: 'intervalo_recordatorio_carga_larga_minutos', tooltip: 'Minutos entre recordatorios cuando hay un retraso largo.' },
                  { label: 'Intentos para Escalar', key: 'max_recordatorios_sin_respuesta', tooltip: 'Número de veces que el chofer puede no responder antes de avisar a un humano.' },
                  { label: 'Anticipación Carga (horas)', key: 'anticipacion_monitoreo_horas', tooltip: 'Horas antes de la fecha estimada de carga para empezar a gestionar la misión.' },
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
            chofer_nombre: resolvedChoferNombre,
            chofer_telefono: catalogs.choferes.find(c => c.id === remito.chofer_id)?.telefono || celularChoferNuevo || '',
            inspector_nombre: inspectors.find(i => i.id === remito.inspector_id)?.nombre || 'Sin inspector',
            balanza_nombre: resolvedTaraStr,
            destino_nombre: resolvedBrutoStr,
            cliente_nombre: remito.cliente,
            tareas: `${instruccionesData.savedText}${observacionesExtras ? '\n\nObservaciones Extra:\n' + observacionesExtras : ''}`,
            sugeridoDraft: generateWhatsAppDraft()
          }}
        />
      )}

      {/* New Deposito Modal */}
      {showNewDepositoModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNewDepositoModal(false)}></div>
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>Crear Depósito en Caliente</span>
              </h3>
              <button onClick={() => setShowNewDepositoModal(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  value={newDeposito.nombre}
                  onChange={(e) => setNewDeposito({ ...newDeposito, nombre: e.target.value })}
                  placeholder="Ej. DEPOSITO CENTRAL CARRIZO"
                  className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none uppercase"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={newDeposito.tipo}
                  onChange={(e) => setNewDeposito({ ...newDeposito, tipo: e.target.value })}
                  className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="DEPOSITO_PROPIO">Depósito Propio</option>
                  <option value="CLIENTE">Depósito de Cliente</option>
                  <option value="PROVEEDOR">Depósito de Proveedor</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Función</label>
                <select
                  value={newDeposito.funcion}
                  onChange={(e) => setNewDeposito({ ...newDeposito, funcion: e.target.value })}
                  className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="CARGA">Carga</option>
                  <option value="DESCARGA">Descarga</option>
                  <option value="AMBAS">Ambas</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link de Google Maps</label>
                <input
                  type="text"
                  value={newDeposito.google_maps_link}
                  onChange={(e) => setNewDeposito({ ...newDeposito, google_maps_link: e.target.value })}
                  placeholder="https://goo.gl/maps/..."
                  className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNewDepositoModal(false)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNewDeposito}
                className="px-4 py-2 bg-emerald-600 rounded-lg text-sm font-bold text-white hover:bg-emerald-700 shadow-sm transition-all"
              >
                Crear Depósito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Personalizar Viaje */}
      {showPersonalizarModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPersonalizarModal(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span>Personalizar Secuencia de Misión</span>
              </h3>
              <button onClick={() => setShowPersonalizarModal(false)} className="p-2 hover:bg-white rounded-full transition-colors cursor-pointer">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 max-h-[450px] overflow-y-auto space-y-4">
              <p className="text-xs text-gray-500 mb-4 font-medium leading-relaxed">
                Tilda o destilda los hitos para activarlos o desactivarlos. Usa las flechas para reordenar, o la papelera para eliminarlos físicamente del Road Map de este remito.
              </p>
              
              <div className="space-y-2.5">
                {tempSequence.map((step, idx) => {
                  const isBoundary = step.code === 'OPERACION_PENDIENTE' || step.code === 'MISION_COMPLETADA';
                  
                  return (
                    <div 
                      key={`${step.code}-${idx}`} 
                      className={cn(
                        "flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl transition-all shadow-xs",
                        step.activo === false && "opacity-60 bg-gray-100"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkbox Activo */}
                        <input 
                          type="checkbox" 
                          checked={step.activo !== false}
                          disabled={isBoundary}
                          onChange={() => {
                            const updated = [...tempSequence];
                            updated[idx].activo = step.activo === false ? true : false;
                            setTempSequence(updated);
                          }}
                          className="w-4.5 h-4.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                          title={isBoundary ? "No se puede desactivar este estado" : "Activar/Desactivar"}
                        />
                        
                        <div>
                          <div className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                            {step.label}
                            {isBoundary && (
                              <span className="text-[8px] bg-gray-200 text-gray-500 font-bold px-1.5 py-0.5 rounded">FIJO</span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400">{step.desc}</div>
                        </div>
                      </div>

                      {/* Reordenación y eliminación */}
                      {!isBoundary && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={idx <= 1}
                            onClick={() => {
                              const updated = [...tempSequence];
                              const temp = updated[idx];
                              updated[idx] = updated[idx - 1];
                              updated[idx - 1] = temp;
                              setTempSequence(updated);
                            }}
                            className="p-1 hover:bg-gray-200 rounded text-gray-500 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                            title="Subir orden"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx >= tempSequence.length - 2}
                            onClick={() => {
                              const updated = [...tempSequence];
                              const temp = updated[idx];
                              updated[idx] = updated[idx + 1];
                              updated[idx + 1] = temp;
                              setTempSequence(updated);
                            }}
                            className="p-1 hover:bg-gray-200 rounded text-gray-500 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                            title="Bajar orden"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`¿Estás seguro de que quieres eliminar el hito "${step.label}" del viaje? Se borrarán sus tareas asociadas.`)) {
                                const updated = tempSequence.filter((_, i) => i !== idx);
                                setTempSequence(updated);
                              }
                            }}
                            className="p-1 hover:bg-red-50 text-red-600 rounded cursor-pointer"
                            title="Eliminar hito"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Agregar estado extra */}
              <div className="border-t pt-4 mt-4 space-y-2">
                <span className="font-bold text-gray-700 text-xs uppercase tracking-wider block">Agregar Hito Extra</span>
                <div className="flex gap-2">
                  <select
                    value={selectedEstadoToAdd}
                    onChange={(e) => setSelectedEstadoToAdd(e.target.value)}
                    className="flex-1 p-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-brand-500"
                  >
                    <option value="">Seleccionar estado para agregar...</option>
                    {misionEstados
                      .filter(me => !tempSequence.some(ts => ts.code === me.codigo))
                      .map(me => (
                        <option key={me.id} value={me.id}>{me.nombre} ({me.codigo})</option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedEstadoToAdd}
                    onClick={() => {
                      const stateDef = misionEstados.find(e => e.id === Number(selectedEstadoToAdd));
                      if (stateDef) {
                        const updated = [...tempSequence];
                        const lastItem = updated.pop();
                        updated.push({
                          code: stateDef.codigo,
                          label: stateDef.nombre,
                          desc: stateDef.descripcion || '',
                          activo: true
                        });
                        if (lastItem) updated.push(lastItem);
                        setTempSequence(updated);
                        setSelectedEstadoToAdd('');
                      }
                    }}
                    className="px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    Agregar
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPersonalizarModal(false)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer animate-none shadow-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setIsSubmitting(true);
                    
                    // Identificamos códigos que fueron agregados para traer sus tareas por defecto del catálogo
                    const originalCodes = remito.mision_estados_secuencia?.map((s: any) => s.code) || [];
                    const addedCodes = tempSequence
                      .map((s: any) => s.code)
                      .filter((code: string) => !originalCodes.includes(code));
                    
                    let newTasksToAdd: any[] = [];
                    if (addedCodes.length > 0) {
                      const { data: fetchedTasks } = await supabase
                        .from('catalogo_tareas_control')
                        .select('id, tarea_template, tipo_tarea, requiere_foto, requiere_aviso, orden_sugerido, tipo_dato_esperado, mensaje_template, mision_estados_definicion!inner(codigo)')
                        .eq('estado', 'ACTIVO')
                        .in('mision_estados_definicion.codigo', addedCodes);
                      
                      if (fetchedTasks) {
                        newTasksToAdd = fetchedTasks.map((c: any) => ({
                          id: c.id,
                          tarea: c.tarea_template,
                          tarea_template: c.tarea_template,
                          tipo_tarea: c.tipo_tarea,
                          requiere_foto: c.requiere_foto,
                          requiere_aviso: c.requiere_aviso,
                          orden_sugerido: c.orden_sugerido,
                          asignada_a_chofer: true,
                          estado: 'PENDIENTE',
                          minutos_gracia: c.tipo_tarea === 'PESAJE_TARA' || c.tipo_tarea === 'PESAJE_BRUTO' ? 60 : 30,
                          reintentos_max: 2,
                          estado_id: c.mision_estados_definicion.codigo,
                          tipo_dato_esperado: c.tipo_dato_esperado || 'check',
                          valor_reportado: null,
                          calificacion: 0
                        }));
                      }
                    }

                    // Modificar el protocolo_control para marcar como asignada_a_chofer = false las tareas de estados desactivados
                    const mergedProtocol = [...checklist, ...newTasksToAdd].map((task: any) => {
                      const isStateActive = tempSequence.find(s => s.code === task.estado_id)?.activo !== false;
                      return {
                        ...task,
                        asignada_a_chofer: isStateActive ? task.asignada_a_chofer : false
                      };
                    });

                    // Si se borraron estados físicamente, quitamos sus tareas asociadas
                    const currentTempCodes = tempSequence.map(s => s.code);
                    const finalProtocol = mergedProtocol.filter(t => currentTempCodes.includes(t.estado_id));

                    // Guardar en la base de datos
                    const { error } = await supabase.rpc('save_remito_update_admin', {
                      p_remito_id: Number(id),
                      p_updates: {
                        mision_estados_secuencia: tempSequence,
                        protocolo_control: finalProtocol
                      },
                      p_admin_email: user?.email || 'admin'
                    });

                    if (error) throw error;
                    
                    setRemito(prev => ({
                      ...prev,
                      mision_estados_secuencia: tempSequence
                    }));
                    setChecklist(finalProtocol);
                    setShowPersonalizarModal(false);
                    alert("Hoja de ruta personalizada exitosamente.");
                  } catch (err: any) {
                    alert("Error al guardar la secuencia: " + err.message);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 rounded-lg text-sm font-bold text-white shadow-sm transition-all cursor-pointer font-semibold"
              >
                Guardar Personalización
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
