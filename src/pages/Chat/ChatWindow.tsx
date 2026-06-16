import { useEffect, useState, useRef } from 'react';
import type { Conversation } from './ChatLayout';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, Bot, User } from 'lucide-react';
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
            </div>

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
                    ) : messages.length === 0 ? (
                        <div className="flex justify-center p-8">
                            <div className="bg-white px-4 py-2 rounded-lg shadow-sm text-sm text-gray-500">
                                No hay mensajes aún. Comienza la conversación.
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, index) => {
                            const prevMsg = index > 0 ? messages[index - 1] : null;
                            const showDateSeparator = !prevMsg || 
                                differenceInCalendarDays(startOfDay(new Date(msg.created_at)), startOfDay(new Date(prevMsg.created_at))) > 0;
                            const showTail = index === 0 || showDateSeparator || messages[index - 1].sender_role !== msg.sender_role;
                            const dateLabel = getMessageDateLabel(msg.created_at);

                            return (
                                <div key={msg.id} data-date={dateLabel} className="w-full flex flex-col items-stretch message-item">
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
    );
}
