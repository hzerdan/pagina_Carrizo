import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { Download } from 'lucide-react';

export interface ChatMessage {
    id: string;
    conversation_id: string;
    body_text: string | null;
    sender_role: 'chofer' | 'sistema' | 'operador' | 'desconocido';
    direction: 'inbound' | 'outbound';
    created_at: string;
    media_urls?: string[] | null;
    personal_ac?: {
        nombre_completo: string;
    };
}

interface MessageBubbleProps {
    message: ChatMessage;
    showTail?: boolean;
}

export function MessageBubble({ message, showTail = true }: MessageBubbleProps) {
    const isIncoming = message.sender_role === 'chofer' || message.sender_role === 'desconocido';

    // Custom bubble shapes for WhatsApp look
    const borderRadiusClass = isIncoming
        ? `rounded-lg rounded-tr-xl rounded-br-xl ${showTail ? 'rounded-tl-none' : 'rounded-tl-xl'}`
        : `rounded-lg rounded-tl-xl rounded-bl-xl ${showTail ? 'rounded-tr-none' : 'rounded-tr-xl'}`;

    const bgColorClass = isIncoming
        ? 'bg-white'
        : message.sender_role === 'sistema'
            ? 'bg-chat-bot'
            : 'bg-chat-human';

    const timeString = message.created_at ? format(new Date(message.created_at), 'HH:mm') : '';

    const renderMedia = () => {
        if (!message.media_urls || message.media_urls.length === 0) return null;

        return (
            <div className="flex flex-col gap-2 mb-2 mt-1 w-full max-w-sm">
                {message.media_urls.map((url, index) => {
                    const lowerUrl = url.toLowerCase();
                    const isImage = lowerUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/) != null;
                    const isVideo = lowerUrl.match(/\.(mp4|webm|ogg)(\?.*)?$/) != null;

                    if (isImage) {
                        return (
                            <div key={index} className="relative rounded-lg overflow-hidden bg-gray-100 max-w-sm w-full">
                                <img src={url} alt="Media adjunta" className="w-full h-auto max-h-64 object-cover" loading="lazy" />
                                <a
                                    href={url}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute bottom-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                title="Descargar imagen"
                                >
                                    <Download className="w-4 h-4" />
                                </a>
                            </div>
                        );
                    }

                    if (isVideo) {
                        return (
                            <div key={index} className="relative rounded-lg overflow-hidden bg-black max-w-sm w-full">
                                <video controls preload="metadata" className="w-full max-h-64">
                                    <source src={url} />
                                    Tu navegador no soporta el video.
                                </video>
                            </div>
                        );
                    }

                    // Generic file
                    return (
                        <a
                            key={index}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-3 bg-black/5 rounded-lg hover:bg-black/10 transition-colors w-full max-w-sm"
                        >
                            <div className="p-2 bg-white rounded-full flex-shrink-0">
                                <Download className="w-4 h-4 text-gray-600" />
                            </div>
                            <span className="text-sm font-medium underline text-blue-600 truncate">Ver documento adjunto</span>
                        </a>
                    );
                })}
            </div>
        );
    };

    return (
        <div className={cn(
            "flex w-full",
            isIncoming ? "justify-start pr-12" : "justify-end pl-12"
        )}>
            <div
                className={cn(
                    "relative max-w-[85%] sm:max-w-[75%] px-3 py-2 shadow-sm break-words",
                    borderRadiusClass,
                    bgColorClass
                )}
            >
                {/* Operator info if operator sent it */}
                {!isIncoming && message.sender_role === 'operador' && (
                    <div className="text-[10px] sm:text-xs font-semibold text-emerald-700/70 mb-0.5 tracking-tight">
                        ~ {message.personal_ac?.nombre_completo || 'Operador'}
                    </div>
                )}

                {/* Media Rendering */}
                {renderMedia()}

                {/* Text Area */}
                {message.body_text && (
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {message.body_text}
                    </div>
                )}

                {/* Timestamp */}
                <div className="text-[10px] text-gray-400 text-right mt-1 -mb-1 select-none flex justify-end items-center gap-1">
                    {timeString}
                </div>

                {/* Tail Element (SVG) */}
                {showTail && isIncoming && (
                    <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -left-[8px] text-white fill-current">
                        <path d="M1.533,3.568L8,12.193V1H2.812C1.042,1,0.474,2.156,1.533,3.568z"></path>
                    </svg>
                )}
                {showTail && !isIncoming && (
                    <svg viewBox="0 0 8 13" width="8" height="13" className={cn("absolute top-0 -right-[8px] fill-current", message.sender_role === 'operador' ? 'text-chat-human' : 'text-chat-bot')}>
                        <path d="M5.188,1H0v11.193l6.467-8.625C7.526,2.156,6.958,1,5.188,1z"></path>
                    </svg>
                )}
            </div>
        </div>
    );
}
