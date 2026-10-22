/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  X, 
  Link2, 
  AlertTriangle, 
  Scale, 
  Factory, 
  Loader2, 
  AlertCircle,
  FileCheck2,
  Building2
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface ModalAsignacionRemitoProps {
  isOpen: boolean;
  onClose: () => void;
  remitoId: number;
  remitoRef: string;
  cantidadTotal: number | null;
  onSuccess: () => void;
}

interface OpcionCandidata {
  letra: string;
  id: number;
  tipo: 'PEDIDO' | 'OC';
  ref: string;
  saldo: number;
  entidad: string;
  origen: string;
  esInsuficiente?: boolean;
}

interface OpcionSeleccionadaState {
  [key: string]: {
    checked: boolean;
    cantidad: string; // string para permitir tipeo decimal cómodo
  };
}

export function ModalAsignacionRemito({
  isOpen,
  onClose,
  remitoId,
  remitoRef,
  cantidadTotal,
  onSuccess
}: ModalAsignacionRemitoProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolvedCantidadTotal, setResolvedCantidadTotal] = useState<number>(cantidadTotal ? Number(cantidadTotal) : 0);
  const [opciones, setOpciones] = useState<OpcionCandidata[]>([]);
  const [gruposOrig, setGruposOrig] = useState<{ [origen: string]: OpcionCandidata[] }>({});
  const [seleccionados, setSeleccionados] = useState<OpcionSeleccionadaState>({});
  const [confirmarDiferencia, setConfirmarDiferencia] = useState(false);

  const fetchCandidatos = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setSeleccionados({});
      setConfirmarDiferencia(false);

      let cantRequerida = cantidadTotal !== null && cantidadTotal !== undefined ? Number(cantidadTotal) : null;
      if (cantRequerida === null || isNaN(cantRequerida)) {
        const { data: rData } = await supabase.from('remitos').select('cantidad_total').eq('id', remitoId).maybeSingle();
        cantRequerida = rData?.cantidad_total ? Number(rData.cantidad_total) : 0;
      }
      setResolvedCantidadTotal(cantRequerida);

      const { data, error } = await supabase.rpc('get_candidatos_para_remito', {
        p_cantidad_remito: cantRequerida
      });

      if (error) throw error;

      const raw = Array.isArray(data) ? data[0]?.get_candidatos_para_remito || data[0] : data;
      const validos = raw?.grupos_validos || [];
      const insuficientes = raw?.grupos_insuficientes || [];

      const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let letraIdx = 0;
      const listaPlana: OpcionCandidata[] = [];
      const mapaGrupos: { [origen: string]: OpcionCandidata[] } = {};

      const procesarGrupo = (g: any, esInsuficiente: boolean) => {
        const origenNombre = g.origen || 'Origen No Especificado';
        if (!mapaGrupos[origenNombre]) mapaGrupos[origenNombre] = [];

        (g.opciones || []).forEach((opt: any) => {
          const letra = letras[letraIdx] || `O${letraIdx + 1}`;
          letraIdx++;

          const opcionItem: OpcionCandidata = {
            letra,
            id: opt.id,
            tipo: opt.tipo,
            ref: opt.ref,
            saldo: Number(opt.saldo) || 0,
            entidad: opt.entidad || 'Entidad no especificada',
            origen: origenNombre,
            esInsuficiente
          };

          mapaGrupos[origenNombre].push(opcionItem);
          listaPlana.push(opcionItem);
        });
      };

      validos.forEach((g: any) => procesarGrupo(g, false));
      insuficientes.forEach((g: any) => procesarGrupo(g, true));

      setOpciones(listaPlana);
      setGruposOrig(mapaGrupos);
    } catch (err: any) {
      console.error('Error al cargar candidatos de asignación:', err);
      setErrorMsg(err.message || 'No se pudieron recuperar las opciones de asignación.');
    } finally {
      setLoading(false);
    }
  }, [cantidadTotal]);

  useEffect(() => {
    if (isOpen) {
      fetchCandidatos();
    }
  }, [isOpen, fetchCandidatos]);

  // Cálculos de suma y diferencia
  const sumaAsignada = useMemo(() => {
    return Object.values(seleccionados).reduce((acc, curr) => {
      if (!curr.checked) return acc;
      const val = parseFloat(curr.cantidad);
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [seleccionados]);

  const cantDeclarada = resolvedCantidadTotal;
  const diferencia = useMemo(() => {
    return parseFloat((sumaAsignada - cantDeclarada).toFixed(2));
  }, [sumaAsignada, cantDeclarada]);

  const tieneDiferencia = Math.abs(diferencia) > 0.01;
  const cantidadItemsSeleccionados = useMemo(() => {
    return Object.values(seleccionados).filter(s => s.checked).length;
  }, [seleccionados]);

  // Manejo de toggle checkbox
  const handleToggleOpcion = (item: OpcionCandidata) => {
    const key = `${item.tipo}_${item.id}`;
    setSeleccionados(prev => {
      const current = prev[key];
      const isNowChecked = !current?.checked;

      if (!isNowChecked) {
        return {
          ...prev,
          [key]: { checked: false, cantidad: '0' }
        };
      }

      // Si se acaba de tildar, calcular sugerencia de saldo
      const totalActualOtros = Object.entries(prev).reduce((acc, [k, v]) => {
        if (k !== key && v.checked) {
          const val = parseFloat(v.cantidad);
          return acc + (isNaN(val) ? 0 : val);
        }
        return acc;
      }, 0);

      const restante = Math.max(0, cantDeclarada - totalActualOtros);
      const sugerido = restante > 0 ? Math.min(item.saldo, restante) : item.saldo;

      return {
        ...prev,
        [key]: {
          checked: true,
          cantidad: String(sugerido)
        }
      };
    });
  };

  const handleCantidadChange = (key: string, valor: string) => {
    setSeleccionados(prev => ({
      ...prev,
      [key]: {
        checked: prev[key]?.checked ?? true,
        cantidad: valor
      }
    }));
  };

  const handleSubmit = async () => {
    if (cantidadItemsSeleccionados === 0) {
      alert('Por favor selecciona al menos una opción para asignar.');
      return;
    }

    if (sumaAsignada <= 0) {
      alert('La cantidad total asignada debe ser mayor a 0 Ton.');
      return;
    }

    if (tieneDiferencia && !confirmarDiferencia) {
      alert('Debes confirmar explícitamente la discrepancia de tonelaje para continuar.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);

      // Armar payload de asignaciones
      const payloadAsignaciones = opciones
        .filter(opt => {
          const st = seleccionados[`${opt.tipo}_${opt.id}`];
          return st?.checked && parseFloat(st.cantidad) > 0;
        })
        .map(opt => {
          const st = seleccionados[`${opt.tipo}_${opt.id}`];
          return {
            origen_type: opt.tipo,
            origen_instance_id: opt.id,
            cantidad: parseFloat(st.cantidad)
          };
        });

      if (payloadAsignaciones.length === 0) {
        alert('No hay opciones con cantidad válida mayor a 0.');
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase.rpc('ejecutar_asignacion_manual_remito', {
        p_remito_id: remitoId,
        p_asignaciones: payloadAsignaciones,
        p_usuario_email: user?.email || 'desconocido',
        p_forzar_diferencia: tieneDiferencia
      });

      if (error) throw error;

      if (data?.status === 'DIFERENCIA_DETECTADA') {
        alert(`Advertencia: ${data.message}`);
        setSubmitting(false);
        return;
      }

      if (data?.status !== 'SUCCESS') {
        throw new Error(data?.message || 'Error desconocido al procesar asignación.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error al ejecutar asignación manual:', err);
      setErrorMsg(err.message || 'Error al ejecutar la asignación en el servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold shadow-xs">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">
                  Asignar Pedido / OC a Remito
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
                  #{remitoRef}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Seleccione una o más opciones para vincular a este remito y dejarlo operativo.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Banner Tonnage Required */}
        <div className="px-6 py-3 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-blue-900 font-medium">
            <Scale className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Total declarado en Remito:</span>
            <span className="font-bold text-sm text-blue-950">
              {cantDeclarada > 0 ? `${cantDeclarada.toFixed(2)} Ton` : 'No informado'}
            </span>
          </div>

          <div className="text-xs text-blue-800">
            {opciones.length} {opciones.length === 1 ? 'opción disponible' : 'opciones disponibles'}
          </div>
        </div>

        {/* Modal Body / Candidates List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
              <p className="text-sm text-gray-500 font-medium">Buscando pedidos y órdenes de compra disponibles...</p>
            </div>
          ) : errorMsg ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <strong className="block font-semibold">Error al cargar opciones</strong>
                <span>{errorMsg}</span>
              </div>
              <button 
                onClick={fetchCandidatos} 
                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 font-medium rounded-lg text-xs transition"
              >
                Reintentar
              </button>
            </div>
          ) : opciones.length === 0 ? (
            <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 p-6">
              <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-700 font-semibold text-sm">No hay pedidos ni OCs disponibles con saldo.</p>
              <p className="text-gray-400 text-xs mt-1">
                Asegúrese de que existan pedidos en estado 3.1.1 o compras en estado 2 con saldo mayor a 0 Ton.
              </p>
            </div>
          ) : (
            Object.entries(gruposOrig).map(([origenNombre, items]) => {
              const totalOrigen = items.reduce((acc, it) => acc + it.saldo, 0);

              return (
                <div key={origenNombre} className="bg-slate-50/60 rounded-xl border border-gray-200 overflow-hidden shadow-2xs">
                  {/* Origin Header */}
                  <div className="px-4 py-2.5 bg-slate-100/90 border-b border-gray-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-bold text-gray-800">
                      <Factory className="w-4 h-4 text-slate-600" />
                      <span>{origenNombre}</span>
                    </div>
                    <div className="text-gray-600">
                      Saldo Total Origen: <span className="font-bold text-gray-900">{totalOrigen.toFixed(2)} Ton</span>
                    </div>
                  </div>

                  {/* Options Table */}
                  <div className="divide-y divide-gray-100 bg-white">
                    {items.map((opt) => {
                      const key = `${opt.tipo}_${opt.id}`;
                      const isChecked = !!seleccionados[key]?.checked;
                      const cantValue = seleccionados[key]?.cantidad ?? '';

                      return (
                        <div 
                          key={key}
                          onClick={() => handleToggleOpcion(opt)}
                          className={cn(
                            "px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors",
                            isChecked ? "bg-brand-50/30 hover:bg-brand-50/50" : "hover:bg-gray-50/80"
                          )}
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {/* Checkbox */}
                            <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleOpcion(opt)}
                                className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500 cursor-pointer"
                              />
                            </div>

                            {/* Letter Badge */}
                            <div className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0",
                              isChecked 
                                ? "bg-brand-600 text-white shadow-xs" 
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            )}>
                              {opt.letra}
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                  opt.tipo === 'PEDIDO' 
                                    ? "bg-blue-100 text-blue-800 border border-blue-200" 
                                    : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                )}>
                                  {opt.tipo}
                                </span>
                                <span className="font-bold text-gray-900 text-xs truncate max-w-[280px]" title={opt.ref}>
                                  {opt.ref}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 truncate" title={opt.entidad}>
                                {opt.tipo === 'PEDIDO' ? 'Cliente:' : 'Proveedor:'} <strong className="text-gray-700">{opt.entidad}</strong>
                              </p>
                            </div>
                          </div>

                          {/* Saldo & Amount Input */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <div className="text-right">
                              <span className="text-[10px] uppercase tracking-wider text-gray-400 block">Saldo Disp.</span>
                              <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                                {opt.saldo.toFixed(2)} Ton
                              </span>
                            </div>

                            {/* Asignar Ton Input */}
                            <div className="flex items-center gap-1.5">
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={opt.saldo}
                                  disabled={!isChecked}
                                  value={cantValue}
                                  onChange={(e) => handleCantidadChange(key, e.target.value)}
                                  placeholder="0.00"
                                  className={cn(
                                    "w-24 px-2.5 py-1 text-right text-xs font-bold rounded-lg border focus:outline-none focus:ring-2 focus:ring-brand-500",
                                    isChecked
                                      ? "bg-white border-brand-300 text-brand-900"
                                      : "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                                  )}
                                />
                                <span className="absolute right-7 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">
                                  {/* Ton suffix inside or outside */}
                                </span>
                              </div>
                              <span className="text-xs font-medium text-gray-500">Ton</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Discrepancy Alert */}
        {tieneDiferencia && cantidadItemsSeleccionados > 0 && (
          <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 shrink-0 space-y-2">
            <div className="flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Advertencia de Discrepancia de Tonelaje:</strong>
                <p className="mt-0.5">
                  El remito declara <strong className="font-bold">{cantDeclarada.toFixed(2)} Ton</strong> y se están asignando <strong className="font-bold">{sumaAsignada.toFixed(2)} Ton</strong> (Diferencia: <strong>{diferencia > 0 ? `+${diferencia.toFixed(2)}` : diferencia.toFixed(2)} Ton</strong>).
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-amber-950 font-medium cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={confirmarDiferencia}
                onChange={(e) => setConfirmarDiferencia(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
              />
              <span>Confirmo y autorizo la asignación con discrepancia de tonelaje (quedará registro en auditoría).</span>
            </label>
          </div>
        )}

        {/* Modal Footer / Balance Bar */}
        <div className="px-6 py-4 border-t border-gray-200 bg-slate-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shrink-0">
          {/* Summary Badges */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-2xs">
              <span className="text-gray-500">Declarado:</span>{' '}
              <strong className="text-gray-800">{cantDeclarada.toFixed(2)} Ton</strong>
            </div>

            <div className={cn(
              "border px-3 py-1.5 rounded-lg shadow-2xs",
              tieneDiferencia 
                ? "bg-amber-50 border-amber-200 text-amber-900" 
                : "bg-emerald-50 border-emerald-200 text-emerald-900"
            )}>
              <span>Asignado:</span>{' '}
              <strong className="font-bold">{sumaAsignada.toFixed(2)} Ton</strong>
            </div>

            <div className={cn(
              "px-3 py-1.5 rounded-lg font-bold border",
              tieneDiferencia
                ? "bg-amber-100 text-amber-900 border-amber-300"
                : "bg-emerald-100 text-emerald-800 border-emerald-300"
            )}>
              Dif: {diferencia > 0 ? `+${diferencia.toFixed(2)}` : diferencia.toFixed(2)} Ton
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold text-xs sm:text-sm rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || cantidadItemsSeleccionados === 0 || sumaAsignada <= 0 || (tieneDiferencia && !confirmarDiferencia)}
              className={cn(
                "flex items-center gap-2 px-5 py-2 font-bold text-xs sm:text-sm rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                tieneDiferencia
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-brand-600 hover:bg-brand-700 text-white"
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="w-4 h-4" />
                  <span>Confirmar Asignación</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
