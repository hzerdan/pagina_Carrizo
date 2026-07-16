import { useState, useEffect } from 'react';
import { X, Send, MessageSquare, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  remitoData: {
    id: number;
    ref: string;
    chofer_id: number;
    chofer_nombre: string;
    chofer_telefono: string;
    inspector_nombre: string;
    balanza_nombre: string;
    destino_nombre?: string;
    cliente_nombre?: string;
    tareas: string;
    sugeridoDraft?: string;
  };
}

// Helpers
const safeSenderId = (id: unknown) => {
  if (typeof id === 'number') return id;
  if (typeof id === 'string') {
    const parsed = parseInt(id);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
};

export function WhatsAppModal({ isOpen, onClose, remitoData }: WhatsAppModalProps) {
  const { user, personalAcId } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [draftText, setDraftText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraftText(remitoData.sugeridoDraft || remitoData.tareas || '');
    }
  }, [isOpen, remitoData.sugeridoDraft, remitoData.tareas]);

  if (!isOpen) return null;

  const handleSend = async () => {
    const cleanPhone = remitoData.chofer_telefono.replace(/\D/g, '');
    
    if (!cleanPhone) {
      setResult({ success: false, message: 'El número de teléfono no es válido o está vacío.' });
      return;
    }

    setIsSending(true);
    setResult(null);

    try {
      // 1. Obtener o crear la conversación en la base de datos
      const { data: conversationId, error: rpcError } = await supabase.rpc(
        'get_or_create_conversation_for_remito',
        {
          p_chofer_id: remitoData.chofer_id,
          p_phone: remitoData.chofer_telefono,
          p_remito_id: remitoData.id
        }
      );

      if (rpcError) throw new Error('Error al sincronizar conversación: ' + rpcError.message);

      // 2. Disparar el webhook de n8n como send_message con el texto editado libremente
      const payload = {
        conversation_id: conversationId,
        conversation_key: cleanPhone,
        sender_id: safeSenderId(personalAcId),
        sender_email: user?.email || 'admin@sistema.com',
        action: 'send_message',
        message: draftText.trim(),
        metadata: {
          remito_id: remitoData.id
        }
      };

      console.log('DEBUG - Enviando a n8n:', JSON.stringify(payload, null, 2));

      const response = await fetch('https://hzerdan.app.n8n.cloud/webhook/whatsapp-salida-web', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Error en el servidor de envíos (n8n)');

      setResult({ success: true, message: '¡Mensaje enviado correctamente!' });
      setTimeout(() => {
        onClose();
        setResult(null);
      }, 2000);

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Error desconocido';
      setResult({ success: false, message: errMsg });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="bg-emerald-600 p-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            <h2 className="font-bold">Enviar Mensaje WhatsApp</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Info Destinatario */}
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Destinatario</p>
            <p className="text-lg font-bold text-gray-800">{remitoData.chofer_nombre}</p>
            <p className="text-emerald-600 font-mono text-sm">{remitoData.chofer_telefono}</p>
          </div>

          {/* Editor del Mensaje */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Contenido del Mensaje (Editable)</p>
            <div className="bg-gray-50 rounded-xl p-2 border border-gray-200 text-sm">
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={8}
                className="w-full p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-y font-sans leading-relaxed shadow-inner"
                placeholder="Escribe el mensaje a enviar..."
              />
            </div>
          </div>

          {/* Feedback de Estado */}
          {result && (
            <div className={`p-4 rounded-xl flex items-center gap-3 animate-fade-in ${result.success ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
              {result.success ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
              <span className="text-sm font-medium">{result.message}</span>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={isSending}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={isSending || !!result?.success || !remitoData.chofer_telefono}
              className="flex-[2] px-4 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:bg-gray-400 disabled:shadow-none"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  {remitoData.chofer_telefono ? 'Enviar Mensaje Final' : 'Falta Teléfono'}
                </>
              )}
            </button>
          </div>
          {!remitoData.chofer_telefono && !isSending && (
            <p className="text-center text-red-500 text-xs font-bold animate-pulse">
              ⚠️ No se puede enviar: El chofer no tiene teléfono registrado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
