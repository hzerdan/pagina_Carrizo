import { useState, useEffect } from 'react';
import { X, AlertTriangle, Loader2, Ban } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { InstanceData } from '../types';

interface AnularParaCorreccionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  instance: InstanceData | null;
  entityType?: 'PEDIDO' | 'OC';
}

export function AnularParaCorreccionModal({
  isOpen,
  onClose,
  onSuccess,
  instance,
  entityType = 'PEDIDO',
}: AnularParaCorreccionModalProps) {
  const { user } = useAuth();
  const [motivo, setMotivo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMotivo('');
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen || !instance) return null;

  const entidadLabel = entityType === 'PEDIDO' ? 'el Pedido' : 'la Orden de Compra';
  const refLabel = instance.nro_pedido || instance.referencia_humana;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!motivo.trim()) {
      setErrorMessage('Debe especificar un motivo para registrar en la auditoría y trazabilidad.');
      return;
    }

    try {
      setIsSubmitting(true);

      const { data, error } = await supabase.rpc('anular_instancia_para_correccion', {
        p_instancia_id: instance.instancia_id,
        p_tipo: entityType,
        p_motivo: motivo.trim(),
        p_usuario_email: user?.email || 'operador_web',
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data && data.success === false) {
        throw new Error(data.message || 'Error al anular la instancia.');
      }

      onSuccess(data?.message || `Instancia anulada con éxito.`);
      onClose();
    } catch (err: unknown) {
      console.error('Error al anular instancia para corrección:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado al anular la instancia.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
        {/* Encabezado */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-red-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shadow-2xs">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Anular {entityType === 'PEDIDO' ? 'Pedido' : 'OC'} para Corrección
              </h2>
              <p className="text-xs text-gray-500 font-mono">
                {refLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Advertencia / Explicación */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-semibold">
                Esta acción liberará el número oficial para recibir una nueva versión corregida.
              </p>
              <p className="text-amber-800">
                El registro actual de {entidadLabel} pasará a estado <strong>99 (ANULADA)</strong> con sufijo histórico para preservar la trazabilidad y auditoría.
              </p>
            </div>
          </div>

          {/* Campo de Motivo */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              Motivo de la corrección / anulación <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={isSubmitting}
              placeholder="Ej: Error en precio acordado del producto. Se enviará archivo corregido por correo."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all placeholder:text-gray-400"
              required
            />
          </div>

          {/* Mensaje de Error */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !motivo.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all duration-150 cursor-pointer disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Anulando...</span>
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4" />
                  <span>Confirmar Anulación</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
