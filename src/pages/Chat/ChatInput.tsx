import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import type { Conversation } from './ChatLayout';
import { useAuth } from '../../contexts/AuthContext';

interface ChatInputProps {
    conversation: Conversation;
}

export function ChatInput({ conversation }: ChatInputProps) {
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const { user, personalAcId } = useAuth();

    const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL;

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim() || sending) return;

        setSending(true);

        try {
            if (!webhookUrl) {
                console.warn("VITE_N8N_WEBHOOK_URL no configurada en las variables de entorno.");
                // We'll mimic sending a webhook for demonstration or in cases without n8n
            } else {
                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        conversation_id: conversation.id,
                        conversation_key: conversation.conversation_key,
                        message: text.trim(),
                        sender_email: user?.email,
                        sender_id: personalAcId,
                        action: 'send_message'
                    }),
                });
            }

            // Clear input on success
            setText('');

        } catch (err) {
            console.error("Error sending message to webhook", err);
            alert("Error enviando el mensaje.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="bg-[#f0f2f5] px-4 py-3 sticky bottom-0 z-10 w-full flex-shrink-0">
            <form
                onSubmit={handleSend}
                className="flex items-end gap-2 max-w-4xl mx-auto"
            >
                <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden flex items-end min-h-[44px]">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={sending}
                        placeholder="Escribe un mensaje..."
                        className="w-full max-h-32 min-h-[44px] py-3 px-4 resize-none outline-none text-sm text-gray-800 bg-transparent placeholder-gray-500"
                        rows={1}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend(e);
                            }
                        }}
                    />
                </div>

                <button
                    type="submit"
                    disabled={!text.trim() || sending}
                    className="flex-shrink-0 w-11 h-11 rounded-full bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center transition-all disabled:opacity-50 disabled:scale-95 disabled:hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500"
                >
                    {sending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <Send className="w-5 h-5 ml-1" />
                    )}
                </button>
            </form>
        </div>
    );
}
