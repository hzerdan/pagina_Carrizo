import { useState, useEffect } from 'react';
import { ConversationList } from './ConversationList';
import { ChatWindow } from './ChatWindow';
import { supabase } from '../../lib/supabase';

export interface Conversation {
    id: string;
    conversation_key: string;
    estado_atencion: string;
    last_activity_at: string;
}

export function ChatLayout() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch initial conversations
    const fetchConversations = async () => {
        try {
            const { data, error } = await supabase
                .from('conversations')
                .select('*')
                .order('last_activity_at', { ascending: false });

            if (error) {
                console.error('Error fetching conversations:', error);
            } else {
                setConversations(data || []);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConversations();

        // Setup realtime subscription
        const channel = supabase
            .channel('public:conversations')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (_payload) => {
                // Refresh conversations on changes
                fetchConversations();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

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
