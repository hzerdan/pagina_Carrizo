import { useEffect, useState, useRef } from 'react';
import type { Conversation } from './ChatLayout';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, Bot, User } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from './MessageBubble';
import { ChatInput } from './ChatInput';

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

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
                    {conversation.conversation_key.charAt(0)}
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate text-lg leading-tight">
                        {conversation.conversation_key}
                    </h3>
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

            {/* Messages Area - WhatsApp Background Pattern */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('https://i.ibb.co/3s1f13b/wa-bg.png')] bg-repeat bg-opacity-50" style={{ backgroundSize: '400px', backgroundColor: '#efeae2', backgroundBlendMode: 'overlay' }}>
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
                        const showTail = index === 0 || messages[index - 1].sender_role !== msg.sender_role;
                        return <MessageBubble key={msg.id} message={msg} showTail={showTail} />;
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Footer */}
            <ChatInput conversation={conversation} />
        </div>
    );
}
