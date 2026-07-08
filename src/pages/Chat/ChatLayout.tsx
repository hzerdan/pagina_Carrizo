import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConversationList } from './ConversationList';
import { ChatWindow } from './ChatWindow';
import { supabase } from '../../lib/supabase';

export interface Conversation {
    id: string;
    conversation_key: string;
    estado_atencion: string;
    last_activity_at: string;
    channel: 'whatsapp' | 'telegram';
    participant_role: 'chofer' | 'operador' | 'interno' | 'desconocido';
    participant_id: number | null;
    participant_name?: string;
    remito_actual_id?: number | null;
}


export function ChatLayout() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchParams] = useSearchParams();
    const queryRemitoId = searchParams.get('remito_id');
    const queryConversationId = searchParams.get('conversation_id');

    // Fetch initial conversations
    const fetchConversations = async () => {
        try {
            const { data: convData, error: convError } = await supabase
                .from('conversations')
                .select('*')
                .order('last_activity_at', { ascending: false });

            if (convError) {
                console.error('Error fetching conversations:', convError);
                return;
            }

            // Fetch choferes and personal_ac to map names in memory
            const [choferesRes, personalRes] = await Promise.all([
                supabase.from('choferes').select('id, nombre_completo'),
                supabase.from('personal_ac').select('id, nombre_completo')
            ]);

            const choferesMap = new Map(choferesRes.data?.map(c => [c.id, c.nombre_completo]) || []);
            const personalMap = new Map(personalRes.data?.map(p => [p.id, p.nombre_completo]) || []);

            const mappedConversations = (convData as Conversation[] || []).map((chat) => {
                let participant_name = '';
                if (chat.participant_role === 'chofer' && chat.participant_id) {
                    participant_name = choferesMap.get(chat.participant_id) || '';
                } else if (chat.participant_role === 'interno' && chat.participant_id) {
                    participant_name = personalMap.get(chat.participant_id) || '';
                }
                return {
                    ...chat,
                    participant_name
                };
            });

            setConversations(mappedConversations);
        } catch (err) {
            console.error('Error in fetchConversations:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConversations();

        // Setup realtime subscription
        const channel = supabase
            .channel('public:conversations')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
                // Refresh conversations on changes
                fetchConversations();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        if (conversations.length > 0) {
            if (queryConversationId) {
                const found = conversations.find(c => c.id === queryConversationId);
                if (found) setSelectedChatId(found.id);
            } else if (queryRemitoId) {
                const found = conversations.find(c => String(c.remito_actual_id) === String(queryRemitoId));
                if (found) setSelectedChatId(found.id);
            }
        }
    }, [queryConversationId, queryRemitoId, conversations]);

    const selectedConversation = conversations.find(c => c.id === selectedChatId);

    return (
        <div className="flex h-full w-full bg-white relative">
            {/* List matches full width on mobile unless a chat is selected, then it's hidden. On desktop it's fixed 320px/384px */}
            <div
                className={`
          flex-shrink-0 border-r border-gray-200 bg-white
          w-full sm:w-80 md:w-96
          ${selectedChatId ? 'hidden sm:flex flex-col' : 'flex flex-col'}
        `}
            >
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-lg font-semibold text-gray-800">Mensajes</h2>
                    <p className="text-sm text-gray-400 font-medium">Bandeja de entrada logística</p>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <ConversationList
                        conversations={conversations}
                        selectedId={selectedChatId}
                        onSelect={setSelectedChatId}
                        loading={loading}
                    />
                </div>
            </div>

            {/* Chat Window matches full width on mobile if selected. Hidden otherwise. Flex-1 on desktop. */}
            <div
                className={`
          flex-1 flex-col bg-[#efeae2] relative
          ${selectedChatId ? 'flex' : 'hidden sm:flex'}
        `}
            >
                {selectedConversation ? (
                    <ChatWindow
                        conversation={selectedConversation}
                        onBack={() => setSelectedChatId(null)}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center bg-gray-50">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square opacity-50"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </div>
                        <p className="text-lg font-medium text-gray-600">Selecciona un chat</p>
                        <p className="text-sm mt-1">Elige una conversación para comenzar a responder.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
