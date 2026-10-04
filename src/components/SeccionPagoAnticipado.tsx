import { useState } from 'react';
import { 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  Clock, 
  ShieldCheck, 
  DollarSign
} from 'lucide-react';
import { ModalSolicitudPagoGF } from './ModalSolicitudPagoGF';

interface SeccionPagoAnticipadoProps {
  remitoId: number;
  remitoRef: string;
  pedidoRef: string;
  cliente: string;
  cantidadTotal: number | null;
  formaPago?: string | null;
  requierePagoAnticipado: boolean;
  pagoAprobado: boolean;
  pagoAprobadoAt: string | null;
  pagoAprobadoPor: string | null;
  pagoComprobanteRef: string | null;
  pagoSolicitadoAt: string | null;
  gfContact?: {
    id?: number;
    nombre: string;
    email: string;
    celular: string;
  } | null;
  onSolicitudEnviada: () => void;
}

export function SeccionPagoAnticipado({
  remitoId,
  remitoRef,
  pedidoRef,
  cliente,
  cantidadTotal,
  formaPago,
  requierePagoAnticipado,
  pagoAprobado,
  pagoAprobadoAt,
  pagoAprobadoPor,
  pagoComprobanteRef,
  pagoSolicitadoAt,
  gfContact,
  onSolicitudEnviada,
}: SeccionPagoAnticipadoProps) {
  const [showModal, setShowModal] = useState(false);

  if (!requierePagoAnticipado) {
    return null;
  }

  const defaultGf = {
    nombre: gfContact?.nombre || 'Jorgelina Carrizo',
    email: gfContact?.email || 'jorgelinacarrizo@arquimedescarrizo.com.ar',
    celular: gfContact?.celular || '5493816740404'
  };

  return (
    <>
      <section className="animate-in fade-in duration-200">
        {pagoAprobado ? (
          /* Estado: Pago validado y aprobado */
          <div className="bg-emerald-50/90 border border-emerald-300 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl shrink-0 mt-0.5 shadow-2xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-black text-emerald-950">
                    Pago Anticipado Aprobado por Gerencia Financiera
                  </h3>
                  <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-900 font-bold rounded-full text-[10px] uppercase tracking-wider">
                    Cobranza Verificada
                  </span>
                </div>
                <p className="text-xs text-emerald-800 mt-1">
                  Validado el{' '}
                  <strong>
                    {pagoAprobadoAt ? new Date(pagoAprobadoAt).toLocaleString() : 'Fecha registrada'}
                  </strong>{' '}
                  por <strong>{pagoAprobadoPor || 'Gerencia Financiera'}</strong>.
                  {pagoComprobanteRef && (
                    <span> &bull; Comprobante / Ref: <em>"{pagoComprobanteRef}"</em></span>
                  )}
                </p>
                <div className="text-[11px] text-emerald-700 font-medium mt-1">
                  ✓ El remito se encuentra totalmente habilitado para su edición y programación logística.
                </div>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 text-xs font-bold text-emerald-800 bg-white/80 px-3.5 py-2 rounded-xl border border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Habilitado para Despacho
            </div>
          </div>
        ) : (
          /* Estado: Pago pendiente de validación (BLOQUEO ACTIVO) */
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-amber-200/60 pb-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-amber-500 text-white rounded-xl shrink-0 mt-0.5 shadow-md shadow-amber-500/20">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-black text-amber-950">
                      Pedido con Pago Anticipado &bull; Edición Logística Bloqueada
                    </h3>
                    <span className="px-2.5 py-0.5 bg-amber-200 text-amber-900 font-bold rounded-full text-[10px] uppercase tracking-wider flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-800" />
                      Requiere Aprobación GF
                    </span>
                  </div>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed max-w-2xl">
                    Este remito está asociado al <strong>Pedido #{pedidoRef} ({cliente})</strong> con condición comercial de <strong>{formaPago || 'PAGO ANTICIPADO'}</strong>. Toda modificación logística, asignación de chofer/camión y despacho permanecerán bloqueados hasta que Gerencia Financiera confirme la recepción del pago.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="px-5 py-3 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white rounded-xl text-xs font-black shadow-md shadow-amber-600/20 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Solicitar Validación a GF
              </button>
            </div>

            {/* Metadatos y último estado de solicitud */}
            <div className="flex flex-wrap items-center justify-between text-xs text-amber-900 gap-3">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5 font-medium">
                  <DollarSign className="w-3.5 h-3.5 text-amber-700" />
                  Condición: <strong className="font-bold">{formaPago || 'ANTICIPADO'}</strong>
                </span>
                <span className="text-amber-300">•</span>
                <span className="font-medium">
                  Responsable GF: <strong className="font-bold">{defaultGf.nombre}</strong>
                </span>
              </div>

              {pagoSolicitadoAt && (
                <div className="text-[11px] text-amber-700 font-medium flex items-center gap-1.5 bg-amber-100/60 px-2.5 py-1 rounded-lg">
                  <Clock className="w-3 h-3 text-amber-600" />
                  Última solicitud enviada el {new Date(pagoSolicitadoAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Modal para disparar Email / WhatsApp con Magic Link */}
      {showModal && (
        <ModalSolicitudPagoGF
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            onSolicitudEnviada();
          }}
          remitoData={{
            id: remitoId,
            ref: remitoRef,
            pedidoRef,
            cliente,
            cantidadTotal,
            formaPago
          }}
          gfContact={defaultGf}
        />
      )}
    </>
  );
}
