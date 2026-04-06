import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { X, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { InspeccionKanban, StateDefinition } from '../types';

interface TransicionExcepcionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onForceTransition: (motivo: string) => void;
  isLoading: boolean;
  inspeccion: InspeccionKanban | null;
  newStateCode: string | null;
  stateDefs: StateDefinition[];
  errorMessage: string | null;
}

export function TransicionExcepcionModal({
  isOpen,
  onClose,
  onForceTransition,
  isLoading,
  inspeccion,
  newStateCode,
  stateDefs,
  errorMessage,
}: TransicionExcepcionModalProps) {
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (isOpen) setMotivo('');
  }, [isOpen]);

  if (!isOpen || !inspeccion || !newStateCode) return null;

  const targetState = stateDefs.find(s => s.state_code === newStateCode);
  const targetStateName = targetState ? targetState.name : newStateCode;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (motivo.trim().length === 0) return;
    onForceTransition(motivo);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header with warning accent */}
        <div className="px-6 py-4 border-b border-red-100 bg-gradient-to-r from-red-50 to-orange-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Excepción de Transición</h2>
              <p className="text-xs text-red-600 font-medium">Requiere justificación obligatoria</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Error from engine */}
          <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800 mb-1">Error del Motor de Transiciones</p>
              <p className="text-sm text-red-700">{errorMessage || 'La transición no pudo completarse automáticamente.'}</p>
            </div>
          </div>

          {/* Transition info */}
          <div className="mb-5">
            <p className="text-sm text-gray-600 mb-2">
              Se intentó mover la inspección
              <span className="font-bold text-gray-900 mx-1">#INS-{inspeccion.id}</span>
              hacia:
            </p>
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded">
                {newStateCode}
              </span>
              <span className="text-sm font-semibold text-amber-900">{targetStateName}</span>
            </div>
          </div>

          {/* Motivo field */}
          <div className="space-y-2">
            <label htmlFor="motivo-excepcion" className="block text-sm font-medium text-gray-700">
              Motivo de la Excepción <span className="text-red-500">*</span>
            </label>
            <textarea
              id="motivo-excepcion"
              autoFocus
              required
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              disabled={isLoading}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 text-sm disabled:bg-gray-50 disabled:text-gray-500 resize-none"
              placeholder="Explique detalladamente por qué se fuerza esta transición..."
            />
            <p className="text-[11px] text-gray-500">
              Este motivo quedará registrado en el historial de auditoría inmutable.
            </p>
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || motivo.trim().length === 0}
              className="flex items-center justify-center gap-2 px-5 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-50 min-w-[140px]"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4" />
                  Forzar Transición
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
