import type { Conversation } from './ChatLayout';
import { cn } from '../../lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bot, User } from 'lucide-react';

interface ConversationListProps {
    conversations: Conversation[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    loading: boolean;
}

export function ConversationList({ conversations, selectedId, onSelect, loading }: ConversationListProps) {
    if (loading) {
        return (
            <div className="p-4 space-y-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="animate-pulse flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                        <div className="flex-1 space-y-2">
                            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                            <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (conversations.length === 0) {
        return (
            <div className="p-8 text-center text-gray-500">
                <p>No hay conversaciones activas.</p>
            </div>
        );
    }

    return (
        <ul className="divide-y divide-gray-100">
            {conversations.map((chat) => (
                <li key={chat.id}>
                    <button
                        onClick={() => onSelect(chat.id)}
                        className={cn(
                            "w-full flex items-start p-4 transition-colors text-left border-l-4",
                            selectedId === chat.id
                                ? "bg-brand-50 border-brand-500"
                                : chat.estado_atencion === 'intervencion_humana'
                                    ? "bg-red-50/50 border-red-400 hover:bg-red-50"
                                    : "bg-white border-transparent hover:bg-gray-50"
                        )}
                    >
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-xl font-medium text-gray-600 mr-3">
                            {chat.conversation_key.charAt(0)}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-1">
                                <h3 className="font-semibold text-gray-900 truncate pr-2">
                                    {chat.conversation_key}
                                </h3>
                                <span className="text-xs text-gray-500 flex-shrink-0">
                                    {chat.last_activity_at ? formatDistanceToNow(new Date(chat.last_activity_at), { addSuffix: true, locale: es }) : ''}
                                </span>
                            </div>

                            <div className="flex items-center text-sm text-gray-500">
                                <div className="truncate mr-2 flex-1">
                                    ...
                                </div>
                                {chat.estado_atencion === 'bot_activo' ? (
                                    <Bot className="w-4 h-4 text-brand-500 flex-shrink-0" />
                                ) : (
                                    <User className="w-4 h-4 text-red-500 flex-shrink-0" />
                                )}
                            </div>
                        </div>
                    </button>
                </li>
            ))}
        </ul>
    );
}
