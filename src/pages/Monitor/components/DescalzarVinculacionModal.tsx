import { useState, useEffect } from 'react';
import { X, Unlink, AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

export interface VinculacionInfo {
  tiene_vinculacion: boolean;
  vinculacion_id?: number;
  pedido_ref?: string;
  cliente?: string;
  oc_ref?: string;
  proveedor?: string;
  cantidad_vinculada?: number;
  toneladas_remitidas?: number;
  saldo_descalzable?: number;
  puede_descalzar?: boolean;
  estado_vinculacion?: string;
  pedido_instance_id?: number;
  oc_instance_id?: number;
}

interface DescalzarVinculacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vinculacionInfo: VinculacionInfo | null;
  entityType?: 'PEDIDO' | 'OC';
}

export function DescalzarVinculacionModal({
  isOpen,
  onClose,
  onSuccess,
  vinculacionInfo,
}: DescalzarVinculacionModalProps) {
  const { user } = useAuth();
  const [cantidadTon, setCantidadTon] = useState<number>(0);
  const [motivo, setMotivo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const saldoMaximo = vinculacionInfo?.saldo_descalzable ?? 0;

  useEffect(() => {
    if (isOpen && vinculacionInfo) {
      setCantidadTon(Number(saldoMaximo) || 0);
      setMotivo('');
      setErrorMessage(null);
    }
  }, [isOpen, vinculacionInfo, saldoMaximo]);

  if (!isOpen || !vinculacionInfo || !vinculacionInfo.tiene_vinculacion) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cantidad = Number(cantidadTon);
    if (!cantidad || cantidad <= 0) {
      setErrorMessage('La cantidad a descalzar debe ser mayor a 0 Toneladas.');
      return;
    }

    if (cantidad > saldoMaximo) {
      setErrorMessage(
        `La cantidad a descalzar (${cantidad} Ton) no puede superar el saldo pendiente descalzable (${saldoMaximo} Ton).`
      );
      return;
    }

    if (!motivo.trim()) {
      setErrorMessage('Debe indicar un motivo para registrar en la trazabilidad y auditoría.');
      return;
    }

    try {
      setIsSubmitting(true);

      const { data, error } = await supabase.rpc('descalzar_vinculacion_pedido_oc', {
        p_vinculacion_id: vinculacionInfo.vinculacion_id,
        p_cantidad_ton: cantidad,
        p_motivo: motivo.trim(),
        p_usuario_email: user?.email || 'usuario_web'
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data && data.success === false) {
        throw new Error(data.message || 'Error al procesar el descalce.');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Error al descalzar:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado al ejecutar el descalce.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-linear-to-r from-amber-500/10 via-amber-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Unlink className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Descalzar Vinculación Pedido - OC</h3>
              <p className="text-xs text-gray-500">Libera toneladas pendientes para asignarlas a otra orden o pedido</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Card Resumen de la Vinculación */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200/80 space-y-3">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-gray-200">
              <span className="text-gray-500 font-medium">Vinculación #{vinculacionInfo.vinculacion_id}</span>
              <span className="font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
                {vinculacionInfo.estado_vinculacion || 'APROBADA'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-400 font-normal">Pedido de Venta</p>
                <p className="font-bold text-gray-900 font-mono">{vinculacionInfo.pedido_ref}</p>
                <p className="text-gray-500 truncate" title={vinculacionInfo.cliente}>{vinculacionInfo.cliente}</p>
              </div>
              <div>
                <p className="text-gray-400 font-normal">Orden de Compra (OC)</p>
                <p className="font-bold text-blue-700 font-mono">{vinculacionInfo.oc_ref}</p>
                <p className="text-gray-500 truncate" title={vinculacionInfo.proveedor}>{vinculacionInfo.proveedor}</p>
              </div>
            </div>

            {/* Métricas de Cantidades */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-200 text-center">
              <div className="bg-white p-2 rounded-lg border border-gray-100">
                <p className="text-[10px] text-gray-400 font-medium">Calzado Total</p>
                <p className="text-xs font-bold text-gray-800 font-mono">{vinculacionInfo.cantidad_vinculada} Tn</p>
              </div>
              <div className="bg-white p-2 rounded-lg border border-gray-100">
                <p className="text-[10px] text-emerald-600 font-medium">Remitado (Fijo)</p>
                <p className="text-xs font-bold text-emerald-700 font-mono">{vinculacionInfo.toneladas_remitidas} Tn</p>
              </div>
              <div className="bg-amber-50 p-2 rounded-lg border border-amber-200">
                <p className="text-[10px] text-amber-700 font-bold">Saldo Descalzable</p>
                <p className="text-xs font-bold text-amber-800 font-mono">{saldoMaximo} Tn</p>
              </div>
            </div>
          </div>

          {/* Destino de la Reversión */}
          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
              Destino del tonelaje liberado:
            </p>
            <p className="text-blue-700 pl-5">
              • <strong>Pedido {vinculacionInfo.pedido_ref}</strong>: Vuelve a Estado 1.2 (Listo para vinculación).<br />
              • <strong>OC {vinculacionInfo.oc_ref}</strong>: Vuelve a Estado 2 (OC Disponible con saldo libre).
            </p>
          </div>

          {/* Form Inputs */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-gray-700">
                  Cantidad a Descalzar (Toneladas) *
                </label>
                <button
                  type="button"
                  onClick={() => setCantidadTon(Number(saldoMaximo))}
                  className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 hover:underline"
                >
                  Descalzar todo ({saldoMaximo} Tn)
                </button>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max={saldoMaximo}
                  value={cantidadTon || ''}
                  onChange={(e) => setCantidadTon(parseFloat(e.target.value) || 0)}
                  disabled={isSubmitting}
                  placeholder={`Hasta ${saldoMaximo} Tn`}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono font-semibold"
                  required
                />
                <span className="absolute right-3.5 top-2.5 text-xs text-gray-400 font-medium">
                  Toneladas
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Motivo del Descalce (Auditoría) *
              </label>
              <textarea
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={isSubmitting}
                placeholder="Ej: Cambio de proveedor, cancelación parcial de cupo, reasignación a otro ingenio..."
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-xs placeholder:text-gray-400"
                required
              />
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || cantidadTon <= 0 || cantidadTon > saldoMaximo || !motivo.trim()}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Procesando Descalce...</span>
                </>
              ) : (
                <>
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Confirmar Descalce</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
