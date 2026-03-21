import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { InstanceData, StateDefinition } from '../types';

interface TransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
  isLoading: boolean;
  instance: InstanceData | null;
  newStateCode: string | null;
  stateDefs: StateDefinition[];
}

export function TransitionModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  isLoading, 
  instance, 
  newStateCode,
  stateDefs
}: TransitionModalProps) {
  const [motivo, setMotivo] = useState('');

  // Reset motivo on open
  useEffect(() => {
    if (isOpen) {
      setMotivo('');
    }
  }, [isOpen]);

  if (!isOpen || !instance || !newStateCode) return null;

  const targetState = stateDefs.find(s => s.state_code === newStateCode);
  const targetStateName = targetState ? targetState.name : newStateCode;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (motivo.trim().length === 0) return;
    onConfirm(motivo);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-900">Confirmar Transición</h2>
          <button 
            onClick={onClose}
            disabled={isLoading}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <p className="text-sm text-gray-600">
              Estás a punto de mover la instancia <br/>
              <span className="font-semibold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded mr-1">
                {instance.referencia_humana}
              </span>
              <br/>hacia el estado:
            </p>
            <div className="mt-3 bg-brand-50 border border-brand-100 p-3 rounded-lg flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-brand-700 bg-brand-100 px-2 py-1 rounded">
                {newStateCode}
              </span>
              <span className="text-sm font-semibold text-brand-900">
                {targetStateName}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="motivo" className="block text-sm font-medium text-gray-700">
              Motivo del cambio manual <span className="text-red-500">*</span>
            </label>
            <textarea
              id="motivo"
              autoFocus
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={isLoading}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm disabled:bg-gray-50 disabled:text-gray-500 resize-none"
              placeholder="Indique brevemente la razón de este cambio forzado..."
            />
          </div>

          {/* Actions */}
          <div className="mt-8 flex gap-3 justify-end">
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
              className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-brand-600 border border-transparent rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-colors disabled:opacity-50 min-w-[100px]"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Confirmar'
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
