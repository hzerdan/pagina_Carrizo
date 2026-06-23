import { useEffect, useState, useRef, useMemo } from 'react';
import type { Conversation } from './ChatLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { 
    ChevronLeft, Bot, User, ClipboardList, CheckSquare, Square, 
    AlertTriangle, Truck, Calendar, Scale, AlertCircle, 
    Loader2, X
} from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { differenceInCalendarDays, startOfDay, format } from 'date-fns';


function getMessageDateLabel(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const diffDays = differenceInCalendarDays(startOfDay(today), startOfDay(date));

    if (diffDays === 0) {
        return 'Hoy';
    } else if (diffDays === 1) {
        return 'Ayer';
    } else if (diffDays > 1 && diffDays <= 7) {
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        return dayNames[date.getDay()];
    } else {
        return format(date, 'dd-MM-yyyy');
    }
}

interface ChatWindowProps {
    conversation: Conversation;
    onBack: () => void;
}

export function ChatWindow({ conversation, onBack }: ChatWindowProps) {
    const { user, personalAcId } = useAuth();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [estadoAtencion, setEstadoAtencion] = useState(conversation.estado_atencion);
    const [updatingEstado, setUpdatingEstado] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const lastScrollTop = useRef(0);
    const [showFloatingBadge, setShowFloatingBadge] = useState(false);
    const [floatingBadgeText, setFloatingBadgeText] = useState('');
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isProgrammaticScroll = useRef(false);

    // States for logistics tracking
    const [activeRemito, setActiveRemito] = useState<any | null>(null);
    const [remitosList, setRemitosList] = useState<any[]>([]);
    const [selectedRemitoId, setSelectedRemitoId] = useState<number | null>(null);
    const [showSidebar, setShowSidebar] = useState(false);
    const [showAllMessages, setShowAllMessages] = useState(true);
    const [showEscalationModal, setShowEscalationModal] = useState(false);
    const [escalationText, setEscalationText] = useState('');
    const [isEscalating, setIsEscalating] = useState(false);
    const [lugaresPesaje, setLugaresPesaje] = useState<any[]>([]);
    const [catalogTasks, setCatalogTasks] = useState<any[]>([]);
    const [loadingRemito, setLoadingRemito] = useState(false);

    const selectedRemito = useMemo(() => {
        return remitosList.find(r => r.id === selectedRemitoId) || null;
    }, [remitosList, selectedRemitoId]);

    const mergedChecklist = useMemo(() => {
        if (!selectedRemito) return [];
        const savedProtocol = selectedRemito.protocolo_control || [];
        const merged = [...savedProtocol];
        
        catalogTasks.forEach((catTask: any) => {
            const taskName = catTask.tarea_template || catTask.tarea;
            const isPresent = merged.some(s => 
                (s.tarea_template === taskName) || (s.tarea === taskName)
            );
            if (!isPresent) {
                merged.push({
                    ...catTask,
                    estado: 'PENDIENTE',
                    tarea_template: catTask.tarea_template || catTask.tarea,
                });
            }
        });
        
        const hasInspector = !!selectedRemito.inspector_id;

        return merged.map((item: any) => {
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
                done: item.done !== undefined ? item.done : item.estado === 'COMPLETADO',
                tarea: item.tarea || item.tarea_template,
                asignada_a_chofer: isAsignadaChofer
            };
        });
    }, [selectedRemito, catalogTasks]);

    const displayedChecklist = useMemo(() => {
        return mergedChecklist.filter((item: any) => 
            (item.tipo_tarea === "CONTROL_GENERAL" || item.tipo_tarea === "PESAJE_TARA" || item.tipo_tarea === "PESAJE_BRUTO")
            && item.asignada_a_chofer
        );
    }, [mergedChecklist]);

    const taraTask = useMemo(() => mergedChecklist.find((t: any) => t.tipo_tarea === 'PESAJE_TARA'), [mergedChecklist]);
    const brutoTask = useMemo(() => mergedChecklist.find((t: any) => t.tipo_tarea === 'PESAJE_BRUTO'), [mergedChecklist]);

    const fetchLugares = async () => {
        const { data } = await supabase.from('lugares_pesaje').select('*');
        if (data) setLugaresPesaje(data);
    };

    const fetchCatalogTasks = async () => {
        const { data } = await supabase.from('catalogo_tareas_control').select('*');
        if (data) setCatalogTasks(data);
    };

    const fetchRemitoData = async () => {
        if (conversation.participant_role !== 'chofer' || !conversation.participant_id) {
            setActiveRemito(null);
            setRemitosList([]);
            return;
        }

        setLoadingRemito(true);
        try {
            const { data: list, error: listError } = await supabase
                .from('remitos')
                .select('*')
                .eq('chofer_id', conversation.participant_id)
                .order('created_at', { ascending: false });

            if (listError) {
                console.error('Error fetching remitos list:', listError);
                return;
            }

            setRemitosList(list || []);

            let active = null;
            if (conversation.remito_actual_id) {
                active = list?.find((r: any) => r.id === conversation.remito_actual_id);
            }
            if (!active && list && list.length > 0) {
                active = list[0];
            }

            setActiveRemito(active);
            if (active && selectedRemitoId === null) {
                setSelectedRemitoId(active.id);
            }
        } finally {
            setLoadingRemito(false);
        }
    };

    useEffect(() => {
        fetchLugares();
        fetchCatalogTasks();
    }, []);

    useEffect(() => {
        fetchRemitoData();

        if (conversation.participant_role === 'chofer' && conversation.participant_id) {
            const remitoChannel = supabase
                .channel(`public:remitos:${conversation.participant_id}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'remitos',
                    filter: `chofer_id=eq.${conversation.participant_id}`
                }, () => {
                    fetchRemitoData();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(remitoChannel);
            };
        }
    }, [conversation.id, conversation.participant_id, conversation.remito_actual_id]);


    const fetchMessages = async () => {
        try {
            const { data, error } = await supabase
                .from('conversation_messages')
                .select('*, personal_ac!conversation_messages_sender_id_fkey(nombre_completo)')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching messages:', error);
                setErrorMsg(`Error Supabase: ${error.message} \nDetalles: ${error.details || ''} \nHint: ${error.hint || ''}`);
            } else {
                setMessages(data as any || []);
                setErrorMsg(null);
            }
        } finally {
            setLoading(false);
            scrollToBottom();
        }
    };

    useEffect(() => {
        setLoading(true);
        setEstadoAtencion(conversation.estado_atencion);
        fetchMessages();

        const channel = supabase
            .channel(`public:conversation_messages:${conversation.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'conversation_messages',
                filter: `conversation_id=eq.${conversation.id}`
            }, (_payload) => {
                // Fetch specific message with relations if needed, or simply refetch all.
                // For simplicity and to get relations correctly, refetching all:
                fetchMessages();
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'conversations',
                filter: `id=eq.${conversation.id}`
            }, (payload) => {
                setEstadoAtencion(payload.new.estado_atencion);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [conversation.id]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        return () => {
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, []);

    const scrollToBottom = () => {
        isProgrammaticScroll.current = true;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
            isProgrammaticScroll.current = false;
        }, 800);
    };

    const handleScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const scrollTop = container.scrollTop;

        if (isProgrammaticScroll.current) {
            lastScrollTop.current = scrollTop;
            return;
        }

        const isScrollingDown = scrollTop > lastScrollTop.current;
        lastScrollTop.current = scrollTop;

        // Detect first visible message
        const children = container.querySelectorAll('.message-item');
        let firstVisibleDateLabel = '';

        for (let i = 0; i < children.length; i++) {
            const child = children[i] as HTMLElement;
            const rect = child.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            if (rect.bottom >= containerRect.top) {
                firstVisibleDateLabel = child.getAttribute('data-date') || '';
                break;
            }
        }

        if (firstVisibleDateLabel) {
            setFloatingBadgeText(firstVisibleDateLabel);
        }

        if (isScrollingDown) {
            setShowFloatingBadge(true);

            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
            scrollTimeoutRef.current = setTimeout(() => {
                setShowFloatingBadge(false);
            }, 1000);
        } else {
            setShowFloatingBadge(false);
        }
    };

    const toggleEstadoAtencion = async () => {
        setUpdatingEstado(true);
        const newEstado = estadoAtencion === 'bot_activo' ? 'intervencion_humana' : 'bot_activo';

        // Optistic update
        setEstadoAtencion(newEstado);

        // API Call
        const { error } = await supabase
            .from('conversations')
            .update({ estado_atencion: newEstado })
            .eq('id', conversation.id);

        if (error) {
            console.error("Error toggling bot status", error);
            // Revert if error
            setEstadoAtencion(estadoAtencion);
        }

        setUpdatingEstado(false);
    };

    const handleToggleChecklistItem = async (itemId: number, action?: 'approve' | 'reject') => {
        if (!selectedRemitoId || !selectedRemito) return;

        let taraMomentoUpdate = selectedRemito.tara_pesaje_momento;
        let brutoMomentoUpdate = selectedRemito.bruto_pesaje_momento;

        const updatedProtocolo = mergedChecklist.map((item: any) => {
            if (item.id === itemId) {
                let isDone = item.done;
                let finalEstado = item.estado;
                let finalChoferRealizo = item.chofer_realizo !== undefined ? !!item.chofer_realizo : false;

                if (action === 'approve') {
                    isDone = true;
                    finalEstado = 'COMPLETADO';
                    if (item.tipo_tarea === 'PESAJE_TARA' && item.valor_reportado_chofer) {
                        taraMomentoUpdate = item.valor_reportado_chofer;
                    } else if (item.tipo_tarea === 'PESAJE_BRUTO' && item.valor_reportado_chofer) {
                        brutoMomentoUpdate = item.valor_reportado_chofer;
                    }
                } else if (action === 'reject') {
                    isDone = false;
                    finalEstado = 'RECHAZADO';
                } else {
                    // Standard toggle
                    isDone = !item.done;
                    finalEstado = isDone ? 'COMPLETADO' : 'PENDIENTE';
                    if (isDone) {
                        finalChoferRealizo = true;
                    }
                }

                return {
                    ...item,
                    done: isDone,
                    estado: finalEstado,
                    chofer_realizo: finalChoferRealizo
                };
            }
            return item;
        });

        // Rebuild instrucciones_texto
        const driverTasks = updatedProtocolo.filter((t: any) => t.asignada_a_chofer && t.tipo_tarea === "CONTROL_GENERAL");
        const checklistText = driverTasks.map((t: any) => `   [${t.done ? 'X' : ' '}] ${t.tarea}`).join('\n');
        
        const taraLugar = lugaresPesaje.find(l => l.id === selectedRemito.tara_pesaje_lugar_id)?.nombre || '...';
        const brutoLugar = selectedRemito.bruto_pesaje_lugar_id === 'IGUAL' || selectedRemito.bruto_pesaje_lugar_id === selectedRemito.tara_pesaje_lugar_id
            ? taraLugar 
            : (lugaresPesaje.find(l => l.id === selectedRemito.bruto_pesaje_lugar_id)?.nombre || '...');

        const taraStr = selectedRemito.tara_pesaje_momento ? `1. Hacer Tara (${selectedRemito.tara_pesaje_momento}) en ${taraLugar}.\n` : '';
        const brutoStr = selectedRemito.bruto_pesaje_momento ? `2. Pesar Bruto (${selectedRemito.bruto_pesaje_momento}) en ${brutoLugar}.\n` : '';
        const pesajeText = (taraStr || brutoStr) ? `Pesaje:\n${taraStr}${brutoStr}\n` : '';
        const instruccionesTexto = `${pesajeText}Proceso de carga:\n${checklistText}`;

        // Optimistic UI update
        setRemitosList(prev => prev.map(r => r.id === selectedRemitoId ? { ...r, protocolo_control: updatedProtocolo, instrucciones_texto: instruccionesTexto, tara_pesaje_momento: taraMomentoUpdate, bruto_pesaje_momento: brutoMomentoUpdate } : r));
        if (activeRemito && activeRemito.id === selectedRemitoId) {
            setActiveRemito({ ...activeRemito, protocolo_control: updatedProtocolo, instrucciones_texto: instruccionesTexto, tara_pesaje_momento: taraMomentoUpdate, bruto_pesaje_momento: brutoMomentoUpdate });
        }

        const { error } = await supabase
            .from('remitos')
            .update({
                protocolo_control: updatedProtocolo,
                instrucciones_texto: instruccionesTexto,
                tara_pesaje_momento: taraMomentoUpdate,
                bruto_pesaje_momento: brutoMomentoUpdate
            })
            .eq('id', selectedRemitoId);

        if (error) {
            console.error('Error updating checklist:', error);
            fetchRemitoData();
        }
    };

    const handleEscalateTelegram = async () => {
        if (!escalationText.trim() || !selectedRemitoId) return;

        setIsEscalating(true);
        try {
            const remito = remitosList.find(r => r.id === selectedRemitoId);
            const refExterna = remito?.remito_ref_externa || selectedRemitoId.toString();

            // 1. Insert system message in conversation_messages first
            const { data: newMsg, error: msgError } = await supabase
                .from('conversation_messages')
                .insert({
                    conversation_id: conversation.id,
                    direction: 'out',
                    sender_role: 'sistema',
                    message_type: 'text',
                    body_text: `⚠️ Alerta de Escalamiento Manual: ${escalationText}`,
                    provider: 'sistema',
                    remito_id: selectedRemitoId
                })
                .select('id')
                .single();

            if (msgError) {
                console.error('Error inserting system message:', msgError);
                throw msgError;
            }

            const triggerMsgId = newMsg ? newMsg.id : null;

            // 2. Insert alert in table 'alertas_escalamiento' pointing to the new message ID
            const { error: alertError } = await supabase
                .from('alertas_escalamiento')
                .insert({
                    trigger_message_id: triggerMsgId,
                    personal_id: personalAcId || 2, // fallback
                    rol_notificado: 'supervisor'
                });

            if (alertError) console.error('Error inserting alert:', alertError);

            // 3. Call n8n escalation webhook
            const payload = {
                conversation_id: conversation.id,
                remito_id: selectedRemitoId,
                remito_ref: refExterna,
                chofer_nombre: conversation.participant_name || 'Chofer',
                chofer_telefono: conversation.conversation_key,
                escalation_reason: escalationText,
                operator_name: user?.email || 'Operador',
                action: 'escalate_supervisor'
            };

            const response = await fetch('https://hzerdan.app.n8n.cloud/webhook/whatsapp-salida-web', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                console.error('Error triggering n8n webhook for escalation');
            }

            setShowEscalationModal(false);
            setEscalationText('');
            fetchMessages();

        } catch (error) {
            console.error('Error escalating to Telegram:', error);
        } finally {
            setIsEscalating(false);
        }
    };

    const renderChecklistIcon = (item: any) => {
        switch (item.estado) {
            case 'COMPLETADO':
                return <CheckSquare className="w-4 h-4 text-emerald-600 fill-emerald-50" />;
            case 'REPORTADO_CHOFER':
                return <Scale className="w-4 h-4 text-amber-500 fill-amber-50 animate-pulse" />;
            case 'NO_REALIZABLE':
                return <AlertTriangle className="w-4 h-4 text-rose-500 fill-rose-50" />;
            case 'RECHAZADO':
                return <X className="w-4 h-4 text-rose-500" />;
            default:
                return <Square className="w-4 h-4 text-gray-300" />;
        }
    };

    const renderChecklistBadge = (item: any) => {
        switch (item.estado) {
            case 'COMPLETADO':
                return (
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800">
                        Aprobado
                    </span>
                );
            case 'REPORTADO_CHOFER':
                return (
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 animate-pulse">
                        Pendiente Operador
                    </span>
                );
            case 'NO_REALIZABLE':
                return (
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800">
                        No Realizable
                    </span>
                );
            case 'RECHAZADO':
                return (
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                        Rechazado
                    </span>
                );
            default:
                return (
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-600">
                        Pendiente
                    </span>
                );
        }
    };

    const filteredMessages = useMemo(() => {
        if (showAllMessages || !selectedRemitoId) return messages;
        return messages.filter(m => m.remito_id === selectedRemitoId);
    }, [messages, selectedRemitoId, showAllMessages]);

    return (

        <div className="flex flex-col h-full w-full">
            {/* Header */}
            <div className="h-16 flex items-center px-4 bg-gray-100 border-b border-gray-200 shadow-sm flex-shrink-0 z-10">
                <button
                    onClick={onBack}
                    className="sm:hidden p-2 mr-2 -ml-2 rounded-full hover:bg-gray-200 transition-colors"
                >
                    <ChevronLeft className="w-6 h-6 text-gray-600" />
                </button>

                <div className="w-10 h-10 rounded-full bg-gray-300 mr-3 flex-shrink-0 flex items-center justify-center font-semibold text-lg text-gray-600">
                    {(conversation.participant_name || conversation.conversation_key).charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate text-lg leading-tight">
                        {conversation.participant_name || conversation.conversation_key}
                    </h3>
                    {conversation.participant_name && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                            {conversation.channel === 'telegram' ? 'Telegram' : 'WhatsApp'} · {conversation.conversation_key}
                        </p>
                    )}
                </div>

                {/* Toggle Bot/Humano */}
                <div className="flex items-center gap-2 ml-4">
                    <span className="text-xs font-medium text-gray-500 hidden md:block">
                        {estadoAtencion === 'bot_activo' ? 'Bot Activo' : 'Humano'}
                    </span>
                    <button
                        onClick={toggleEstadoAtencion}
                        disabled={updatingEstado}
                        className={`
              relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
              ${estadoAtencion === 'intervencion_humana' ? 'bg-red-400' : 'bg-gray-300'}
              ${updatingEstado ? 'opacity-50' : ''}
            `}
                    >
                        <span
                            className={`
                pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                ${estadoAtencion === 'intervencion_humana' ? 'translate-x-5' : 'translate-x-0'}
              `}
                        >
                            {estadoAtencion === 'intervencion_humana' ? (
                                <User className="h-4 w-4 text-red-500 absolute top-0.5 left-0.5" />
                            ) : (
                                <Bot className="h-4 w-4 text-gray-400 absolute top-0.5 left-0.5" />
                            )}
                        </span>
                    </button>
                </div>

                {/* Toggle Sidebar Control */}
                {conversation.participant_role === 'chofer' && (
                    <button
                        onClick={() => setShowSidebar(!showSidebar)}
                        className={`p-2 rounded-full hover:bg-gray-200 transition-colors ml-2 border ${showSidebar ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-gray-500 border-transparent'}`}
                        title="Ver Control de Logística"
                    >
                        <ClipboardList className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Main Area row layout */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Chat Column */}
                <div className="flex-1 flex flex-col h-full min-w-0">
                    {/* Messages Area Wrapper */}
                    <div className="flex-1 min-h-0 relative">
                        {/* Floating Date Badge */}
                        <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 transition-all duration-300 pointer-events-none ${showFloatingBadge ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                            <div className="bg-white/90 backdrop-blur-xs text-gray-600 text-xs px-3 py-1.5 rounded-md shadow-md font-semibold uppercase tracking-wider border border-gray-200/50">
                                {floatingBadgeText}
                            </div>
                        </div>

                        {/* Messages Area - WhatsApp Background Pattern */}
                        <div 
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="h-full overflow-y-auto p-4 space-y-3 bg-[url('https://i.ibb.co/3s1f13b/wa-bg.png')] bg-repeat bg-opacity-50" 
                            style={{ backgroundSize: '400px', backgroundColor: '#efeae2', backgroundBlendMode: 'overlay' }}
                        >
                            {errorMsg ? (
                                <div className="flex justify-center p-8">
                                    <div className="bg-red-50 text-red-600 border border-red-200 p-4 rounded-lg shadow-sm text-sm whitespace-pre-wrap max-w-lg w-full">
                                        <strong>Ups, hubo un problema al obtener los mensajes:</strong>
                                        <br /><br />
                                        {errorMsg}
                                    </div>
                                </div>
                            ) : loading ? (
                                <div className="flex justify-center p-8">
                                    <div className="animate-pulse bg-white p-3 rounded-lg shadow-sm text-sm text-gray-500">
                                        Cargando mensajes...
                                    </div>
                                </div>
                            ) : filteredMessages.length === 0 ? (
                                <div className="flex justify-center p-8">
                                    <div className="bg-white px-4 py-2 rounded-lg shadow-sm text-sm text-gray-500">
                                        No hay mensajes para este remito aún.
                                    </div>
                                </div>
                            ) : (
                                filteredMessages.map((msg, index) => {
                                    const prevMsg = index > 0 ? filteredMessages[index - 1] : null;
                                    
                                    // Visual separator when date changes
                                    const showDateSeparator = !prevMsg || 
                                        differenceInCalendarDays(startOfDay(new Date(msg.created_at)), startOfDay(new Date(prevMsg.created_at))) > 0;
                                    
                                    // Visual divider when remito_id changes
                                    const showRemitoDivider = !!(prevMsg && prevMsg.remito_id !== msg.remito_id && (prevMsg.remito_id || msg.remito_id));
                                    
                                    const showTail = index === 0 || showDateSeparator || showRemitoDivider || filteredMessages[index - 1].sender_role !== msg.sender_role;
                                    const dateLabel = getMessageDateLabel(msg.created_at);
                                    
                                    const currentRemitoRef = msg.remito_id ? remitosList.find(r => r.id === msg.remito_id)?.remito_ref_externa : null;

                                    return (
                                        <div key={msg.id} data-date={dateLabel} className="w-full flex flex-col items-stretch message-item">
                                            {showRemitoDivider && (
                                                <div className="flex justify-center my-4 select-none animate-fade-in">
                                                    <div className="bg-emerald-50 text-emerald-800 text-[10px] sm:text-xs px-4 py-1.5 rounded-full shadow-xs border border-emerald-200/50 font-medium tracking-wide flex items-center gap-1.5">
                                                        <Truck className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                                        <span>
                                                            {msg.remito_id 
                                                                ? `Seguimiento iniciado · Remito #${currentRemitoRef}` 
                                                                : 'Conversación fuera de seguimiento de remito'}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {showDateSeparator && (
                                                <div className="flex justify-center my-3 select-none">
                                                    <div className="bg-white/90 backdrop-blur-xs text-gray-500 text-xs px-3 py-1.5 rounded-md shadow-sm uppercase font-semibold text-center border border-gray-200/30">
                                                        {dateLabel}
                                                    </div>
                                                </div>
                                            )}
                                            <div>
                                                <MessageBubble 
                                                    message={msg} 
                                                    showTail={showTail} 
                                                    participantName={conversation.participant_name}
                                                    participantRole={conversation.participant_role}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Input Footer */}
                    <ChatInput conversation={conversation} />
                </div>

                {/* Sidebar Logistics Panel (Only for chofer and when open) */}
                {conversation.participant_role === 'chofer' && showSidebar && (
                    <div className="w-80 border-l border-gray-200 bg-white flex flex-col h-full flex-shrink-0 shadow-lg z-10 animate-fade-in">
                        {/* Sidebar Header */}
                        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-2 font-bold text-gray-800">
                                <ClipboardList className="w-5 h-5 text-emerald-600" />
                                <span>Control de Logística</span>
                            </div>
                            <button
                                onClick={() => setShowSidebar(false)}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Remito Dropdown Selector */}
                        <div className="p-4 border-b border-gray-100 space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Remito Asociado</label>
                            {loadingRemito ? (
                                <div className="text-xs text-gray-500 animate-pulse py-1 flex items-center gap-1.5">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                                    <span>Cargando remitos...</span>
                                </div>
                            ) : remitosList.length === 0 ? (
                                <div className="text-xs text-gray-400 italic py-1">Sin remitos asignados</div>
                            ) : (
                                <select
                                    value={selectedRemitoId || ''}
                                    onChange={(e) => setSelectedRemitoId(Number(e.target.value))}
                                    className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white text-gray-700"
                                >
                                    {remitosList.map(r => (
                                        <option key={r.id} value={r.id}>
                                            #{r.remito_ref_externa} ({r.created_at ? format(new Date(r.created_at), 'dd/MM/yy') : ''})
                                        </option>
                                    ))}
                                </select>
                            )}

                            {/* Filter Checkbox */}
                            {selectedRemitoId && (
                                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={!showAllMessages}
                                        onChange={(e) => setShowAllMessages(!e.target.checked)}
                                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                    />
                                    <span className="text-xs font-semibold text-gray-600">Filtrar chat por este remito</span>
                                </label>
                            )}
                        </div>

                        {/* Selected Remito Content */}
                        {selectedRemito ? (
                            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                                {/* Remito Details Card */}
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2 text-[11px] text-gray-600">
                                    <div className="flex items-center gap-2">
                                        <Truck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                        <span><strong>Patente:</strong> {selectedRemito.camion_patente || 'No asignada'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                        <span>
                                            <strong>Carga estimada:</strong>{' '}
                                            {selectedRemito.fecha_hora_estimada_carga
                                                ? format(new Date(selectedRemito.fecha_hora_estimada_carga), 'dd/MM/yyyy HH:mm')
                                                : 'No informada'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Scale className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                        <span className="flex items-center flex-wrap gap-1">
                                            <strong>Pesaje Tara:</strong>{' '}
                                            {selectedRemito.tara_pesaje_momento || 'No pesada'} en{' '}
                                            {lugaresPesaje.find(l => l.id === selectedRemito.tara_pesaje_lugar_id)?.nombre || 'No asignada'}
                                            {taraTask?.valor_reportado_chofer && taraTask.estado === 'REPORTADO_CHOFER' && (
                                                <span className="ml-1 text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 animate-pulse">
                                                    Chofer: {taraTask.valor_reportado_chofer} (Por aprobar)
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    {selectedRemito.bruto_pesaje_lugar_id && (
                                        <div className="flex items-center gap-2">
                                            <Scale className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <span className="flex items-center flex-wrap gap-1">
                                                <strong>Pesaje Bruto:</strong>{' '}
                                                {selectedRemito.bruto_pesaje_momento || 'No pesada'} en{' '}
                                                {selectedRemito.bruto_pesaje_lugar_id === 'IGUAL' || selectedRemito.bruto_pesaje_lugar_id === selectedRemito.tara_pesaje_lugar_id
                                                    ? (lugaresPesaje.find(l => l.id === selectedRemito.tara_pesaje_lugar_id)?.nombre || 'No asignada')
                                                    : (lugaresPesaje.find(l => l.id === selectedRemito.bruto_pesaje_lugar_id)?.nombre || 'No asignada')
                                                }
                                                {brutoTask?.valor_reportado_chofer && brutoTask.estado === 'REPORTADO_CHOFER' && (
                                                    <span className="ml-1 text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 animate-pulse">
                                                        Chofer: {brutoTask.valor_reportado_chofer} (Por aprobar)
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Checklist Section */}
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Checklist de Control</h4>
                                    {(displayedChecklist.length === 0) ? (
                                        <p className="text-xs text-gray-400 italic">No hay tareas en el protocolo.</p>
                                    ) : (
                                        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                                            {displayedChecklist.map((item: any) => (
                                                <div
                                                    key={item.id}
                                                    onClick={() => {
                                                        if (item.estado !== 'REPORTADO_CHOFER') {
                                                            handleToggleChecklistItem(item.id);
                                                        }
                                                    }}
                                                    className={`flex items-start gap-2.5 p-2 rounded-lg border border-transparent hover:border-gray-100 transition-all duration-150 ${
                                                        item.estado === 'REPORTADO_CHOFER' 
                                                            ? 'bg-amber-50/50 hover:bg-amber-50 cursor-default' 
                                                            : 'hover:bg-gray-50 cursor-pointer'
                                                    }`}
                                                >
                                                    <div className="mt-0.5 shrink-0">
                                                        {renderChecklistIcon(item)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-xs font-semibold leading-tight ${item.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                                            {item.tarea}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 mt-1 select-none">
                                                            {renderChecklistBadge(item)}
                                                            {item.requiere_foto && (
                                                                <span className="text-[8px] text-gray-400 bg-gray-100 px-1 py-0.2 rounded border border-gray-200">Reclama Foto</span>
                                                            )}
                                                        </div>
                                                        {item.valor_reportado_chofer && (
                                                            <div className="mt-1">
                                                                {item.valor_reportado_chofer.startsWith('http') ? (
                                                                    <a 
                                                                        href={item.valor_reportado_chofer} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer" 
                                                                        className="text-[9px] text-blue-700 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded-md border border-blue-100 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                                                                    >
                                                                        📷 Ver Foto Adjunta
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100 font-medium inline-block">
                                                                        Valor: <strong>{item.valor_reportado_chofer}</strong>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {item.estado === 'REPORTADO_CHOFER' && (
                                                        <div className="flex gap-1 ml-2 shrink-0 self-center">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleChecklistItem(item.id, 'approve');
                                                                }}
                                                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                                                                title="Aprobar Tarea"
                                                            >
                                                                <CheckSquare className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleChecklistItem(item.id, 'reject');
                                                                }}
                                                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                                                                title="Rechazar Tarea"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Telegram Manual Escalation button */}
                                <div className="pt-4 border-t border-gray-100">
                                    <button
                                        onClick={() => setShowEscalationModal(true)}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-xl shadow-xs transition-all duration-150 active:scale-95 cursor-pointer"
                                    >
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        <span>Escalar a Supervisor</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-gray-400 italic">
                                Selecciona un remito para ver su checklist de control.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal de Escalamiento a Telegram */}
            {showEscalationModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
                        <div className="bg-amber-600 p-4 text-white flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5" />
                                <h2 className="font-bold">Escalar a Supervisor</h2>
                            </div>
                            <button onClick={() => setShowEscalationModal(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-xs text-gray-500 font-medium">
                                Se enviará una alerta inmediata vía Telegram a los supervisores de AC informando sobre el problema.
                            </p>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Motivo del Escalamiento</label>
                                <textarea
                                    value={escalationText}
                                    onChange={(e) => setEscalationText(e.target.value)}
                                    placeholder="Detalla brevemente el inconveniente (ej. El chofer reporta retrasos en la carga, pinchó rueda, no contesta hace horas, etc.)"
                                    className="w-full text-sm border border-gray-300 rounded-lg p-2 h-28 focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none text-gray-700 bg-white"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowEscalationModal(false)}
                                    disabled={isEscalating}
                                    className="flex-1 py-2.5 border border-gray-300 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 text-xs cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleEscalateTelegram}
                                    disabled={isEscalating || !escalationText.trim()}
                                    className="flex-[2] py-2.5 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:bg-gray-400 text-xs cursor-pointer"
                                >
                                    {isEscalating ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <AlertTriangle className="w-4 h-4" />
                                            <span>Enviar Alerta Telegram</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
