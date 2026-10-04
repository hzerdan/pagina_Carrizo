import { useState } from 'react';
import { 
  X, 
  Send, 
  Mail, 
  MessageSquare, 
  Clock, 
  ShieldCheck, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Copy
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ModalSolicitudPagoGFProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedData: { token: string; expires_at: string }) => void;
  remitoData: {
    id: number;
    ref: string;
    pedidoRef: string;
    cliente: string;
    cantidadTotal?: number | null;
    formaPago?: string | null;
  };
  gfContact: {
    nombre: string;
    email: string;
    celular: string;
  };
}

export function ModalSolicitudPagoGF({
  isOpen,
  onClose,
  onSuccess,
  remitoData,
  gfContact,
}: ModalSolicitudPagoGFProps) {
  const [canalEmail, setCanalEmail] = useState(true);
  const [canalWhatsApp, setCanalWhatsApp] = useState(true);
  const [validezHoras, setValidezHoras] = useState<number>(72);
  
  const [isSending, setIsSending] = useState(false);
  const [errorStr, setErrorStr] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    token: string;
    magicLink: string;
    emailSent: boolean;
    wpPrepared: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const gfNombre = gfContact?.nombre || 'Jorgelina Carrizo';
  const gfEmail = gfContact?.email || 'jorgelinacarrizo@arquimedescarrizo.com.ar';
  const gfCelular = (gfContact?.celular || '5493816740404').replace(/\D/g, '');

  const buildMessageText = (link: string) => {
    return (
`Hola ${gfNombre}, te enviamos la solicitud de validación de cobranza para el Remito #${remitoData.ref} (Pedido #${remitoData.pedidoRef} - ${remitoData.cliente}).

Condición comercial: ${remitoData.formaPago || 'PAGO ANTICIPADO'}.
Cantidad a despachar: ${remitoData.cantidadTotal || '—'} Ton.

Para verificar los detalles del pedido y confirmar la acreditación del pago para habilitar la logística, por favor accede al siguiente enlace seguro:
${link}

Muchas gracias.`
    );
  };

  const handleEnviar = async () => {
    if (!canalEmail && !canalWhatsApp) {
      setErrorStr('Seleccione al menos un canal de envío (Email o WhatsApp).');
      return;
    }

    try {
      setIsSending(true);
      setErrorStr(null);

      // 1. Crear el Magic Link en la base de datos
      const { data: linkRes, error: linkErr } = await supabase.rpc('crear_magic_link_pago_anticipado', {
        p_remito_id: remitoData.id,
        p_usuario_email: gfEmail,
        p_horas_validez: validezHoras
      });

      if (linkErr) throw linkErr;
      if (!linkRes || !linkRes.token) throw new Error('No se pudo generar el token de validación.');

      const token = linkRes.token;
      const portalUrl = `${window.location.origin}/validar-pago/${token}`;
      const plainMessage = buildMessageText(portalUrl);

      let emailSentSuccess = false;
      let wpPreparedSuccess = false;

      // 2. Envío por Email (mediante n8n webhook envia-email-desde-frontend)
      if (canalEmail) {
        try {
          const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
              <div style="background-color: #d97706; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Validación de Pago Anticipado Requerida</h1>
                <p style="color: #fef3c7; margin: 6px 0 0 0; font-size: 14px;">Remito #${remitoData.ref} &bull; Pedido #${remitoData.pedidoRef}</p>
              </div>
              <div style="background-color: #ffffff; padding: 32px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
                <p style="font-size: 16px; color: #374151; margin-top: 0;">Hola <strong>${gfNombre}</strong>,</p>
                <p style="font-size: 15px; color: #374151;">
                  Se ha generado un remito vinculado a una orden comercial con condición de <strong>PAGO ANTICIPADO</strong>.
                  La edición y el despacho logístico se encuentran pausados a la espera de tu validación de acreditación de fondos.
                </p>
                
                <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 4px;">
                  <p style="margin: 0 0 8px 0; font-size: 14px; color: #92400e;"><strong>Cliente:</strong> ${remitoData.cliente}</p>
                  <p style="margin: 0 0 8px 0; font-size: 14px; color: #92400e;"><strong>Pedido Comercial:</strong> #${remitoData.pedidoRef}</p>
                  <p style="margin: 0 0 8px 0; font-size: 14px; color: #92400e;"><strong>Cantidad:</strong> ${remitoData.cantidadTotal ? `${remitoData.cantidadTotal} Ton` : 'No informada'}</p>
                  <p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Condición de Pago:</strong> ${remitoData.formaPago || 'ANTICIPADO'}</p>
                </div>

                <p style="font-size: 15px; color: #374151; margin-bottom: 24px;">
                  Por favor, haz clic en el siguiente botón para revisar el pedido y confirmar haber recibido el pago:
                </p>
                
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${portalUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #d97706; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
                    Validar Acreditación de Pago
                  </a>
                </div>

                <p style="font-size: 12px; color: #6b7280; text-align: center; margin-top: 24px; margin-bottom: 0;">
                  Este enlace es exclusivo y tiene una validez de ${validezHoras} horas.<br/>
                  Si el botón no responde, puedes copiar y pegar este enlace en tu navegador:<br/>
                  <a href="${portalUrl}" style="color: #d97706;">${portalUrl}</a>
                </p>
              </div>
            </div>
          `;

          const emailRes = await fetch('https://hzerdan.app.n8n.cloud/webhook/envia-email-desde-frontend', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer 753159*Arquimedes'
            },
            body: JSON.stringify({
              inspectorEmail: gfEmail,
              subject: `Validación de Pago Anticipado - Remito #${remitoData.ref} (${remitoData.cliente})`,
              htmlBody: emailHtml
            })
          });

          if (emailRes.ok) {
            emailSentSuccess = true;
          } else {
            console.warn('Webhook de email devolvió código no-200');
          }
        } catch (e) {
          console.error('Error al enviar email vía n8n:', e);
        }
      }

      // 3. Envío por WhatsApp
      if (canalWhatsApp) {
        wpPreparedSuccess = true;
        const encoded = encodeURIComponent(plainMessage);
        const waUrl = `https://wa.me/${gfCelular}?text=${encoded}`;
        window.open(waUrl, '_blank');
      }

      setSuccessInfo({
        token,
        magicLink: portalUrl,
        emailSent: emailSentSuccess,
        wpPrepared: wpPreparedSuccess,
      });

      onSuccess({
        token,
        expires_at: linkRes.expires_at
      });

    } catch (err: unknown) {
      console.error('Error al solicitar aprobación:', err);
      const msg = err instanceof Error ? err.message : 'Error al procesar la solicitud.';
      setErrorStr(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyLink = () => {
    if (!successInfo?.magicLink) return;
    navigator.clipboard.writeText(successInfo.magicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 leading-tight">
                Solicitud de Validación a Gerencia Financiera
              </h3>
              <p className="text-xs text-amber-800 font-medium">Remito #{remitoData.ref} &bull; Pago Anticipado</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/80 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-6 overflow-y-auto space-y-5">
          
          {successInfo ? (
            <div className="space-y-5 text-center py-2 animate-in fade-in">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-900">¡Notificación procesada con éxito!</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  Se ha generado el enlace de validación para Gerencia Financiera.
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl text-left space-y-2">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Enlace Mágico Generado
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={successInfo.magicLink}
                    className="flex-1 p-2 bg-white border border-gray-200 rounded-lg text-xs font-mono select-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-2 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition flex items-center gap-1.5 shrink-0"
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-left">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Email a GF:</span>
                  <span className="font-semibold text-gray-700">
                    {successInfo.emailSent ? '✓ Enviado a ' + gfEmail : 'No seleccionado / En espera'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">WhatsApp:</span>
                  <span className="font-semibold text-gray-700">
                    {successInfo.wpPrepared ? '✓ Pestaña abierta / Listo' : 'No seleccionado'}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 bg-gray-900 text-white font-bold rounded-xl text-sm hover:bg-black transition-all"
                >
                  Entendido y Cerrar
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Destinatario GF */}
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Destinatario Gerencia Financiera</div>
                  <div className="font-bold text-gray-900 text-sm">{gfNombre}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{gfEmail} &bull; +{gfCelular}</div>
                </div>
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
                  Rol GF
                </span>
              </div>

              {/* Canales de Notificación */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700">Canales de Notificación</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={canalEmail}
                      onChange={(e) => setCanalEmail(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                    />
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                      <Mail className="w-4 h-4 text-brand-600" />
                      Enviar por Email
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={canalWhatsApp}
                      onChange={(e) => setCanalWhatsApp(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      Enviar WhatsApp
                    </div>
                  </label>
                </div>
              </div>

              {/* Vigencia del Enlace */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  Vigencia del Enlace Mágico
                </label>
                <select
                  value={validezHoras}
                  onChange={(e) => setValidezHoras(Number(e.target.value))}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 outline-none focus:border-brand-500 focus:bg-white transition-all"
                >
                  <option value={24}>24 Horas (1 día)</option>
                  <option value={48}>48 Horas (2 días)</option>
                  <option value={72}>72 Horas (3 días - Recomendado)</option>
                  <option value={168}>7 Días (1 semana)</option>
                </select>
                <p className="text-[11px] text-gray-400">
                  Transcurrido este plazo, el enlace quedará inactivo y requerirá ser reenviado.
                </p>
              </div>

              {/* Previsualización del Texto */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-gray-700">Previsualización del Mensaje</span>
                  <span className="text-[10px] text-gray-400 font-medium">Incluye Magic Link dinámico</span>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 font-mono leading-relaxed whitespace-pre-wrap">
                  {buildMessageText(`${window.location.origin}/validar-pago/[TOKEN_SEGURO]`)}
                </div>
              </div>

              {errorStr && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorStr}
                </div>
              )}

              {/* Botón de Enviar */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
                  disabled={isSending}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleEnviar}
                  disabled={isSending || (!canalEmail && !canalWhatsApp)}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generando y Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Confirmar y Notificar a GF
                    </>
                  )}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
