import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Plus, Loader2, Search, Check, ChevronDown, Package } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { TIPOS_CARGA } from '../types';
import type { PedidoElegible, InspeccionTemplate, Inspector, Deposito, TipoCarga } from '../types';

// ── Highlight helper (pure string, no regex) ────────────────────────
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!text) return null;
  const strText = String(text);
  const trimmed = query.trim();
  if (!trimmed) return <>{strText}</>;

  const lowerText = strText.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) return <>{strText}</>;

  const before = strText.slice(0, idx);
  const match = strText.slice(idx, idx + trimmed.length);
  const after = strText.slice(idx + trimmed.length);

  return (
    <>
      {before}
      <mark className="bg-amber-200/70 text-amber-900 rounded-sm px-0.5 font-semibold">{match}</mark>
      {after}
    </>
  );
}

const MAX_VISIBLE_RESULTS = 200;

interface NuevaInspeccionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  usuarioActor: string;
}

interface FormState {
  selectedPedidos: PedidoElegible[];
  inspectorId: number | null;
  templateId: number | null;
  tipoCarga: TipoCarga | '';
  fechaPactada: string;
  lugarId: number | null;
}

const initialFormState: FormState = {
  selectedPedidos: [],
  inspectorId: null,
  templateId: null,
  tipoCarga: '',
  fechaPactada: '',
  lugarId: null,
};

export function NuevaInspeccionModal({ isOpen, onClose, onCreated, usuarioActor }: NuevaInspeccionModalProps) {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [saving, setSaving] = useState(false);

  // Dropdown data
  const [pedidosElegibles, setPedidosElegibles] = useState<PedidoElegible[]>([]);
  const [inspectores, setInspectores] = useState<Inspector[]>([]);
  const [templates, setTemplates] = useState<InspeccionTemplate[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Pedido search
  const [pedidoSearch, setPedidoSearch] = useState('');
  const [pedidoDropdownOpen, setPedidoDropdownOpen] = useState(false);
  const pedidoDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Fetch dropdown data when opening
  const fetchDropdownData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [pedRes, inspRes, tplRes, depRes] = await Promise.all([
        supabase.from('v_pedidos_elegibles_inspeccion').select('*'),
        supabase
          .from('personal_ac_roles')
          .select('personal_ac_id, personal_ac!inner(id, nombre_completo)')
          .eq('role_id', 6),
        supabase
          .from('inspeccion_templates')
          .select('id, codigo, nombre')
          .eq('activo', true)
          .order('nombre'),
        supabase.from('depositos').select('id, nombre').order('nombre', { ascending: true }),
      ]);

      if (pedRes.data) {
        setPedidosElegibles(pedRes.data as PedidoElegible[]);
      } else if (pedRes.error) {
        console.error('Error fetched pedidos:', pedRes.error);
        setToast({ type: 'error', text: 'Error al cargar pedidos.'});
      }

      if (inspRes.data) {
        const mapped = (inspRes.data as any[]).map(r => ({
          id: r.personal_ac.id,
          nombre: r.personal_ac.nombre_completo,
        }));
        // Deduplicate by id
        const unique = Array.from(new Map(mapped.map(m => [m.id, m])).values());
        setInspectores(unique);
      } else if (inspRes.error) {
        console.error('Error fetched inspectores:', inspRes.error);
        setToast({ type: 'error', text: 'Error al cargar inspectores. (Consulte la consola)'});
      }

      if (tplRes.data) {
        setTemplates(tplRes.data as InspeccionTemplate[]);
      } else if (tplRes.error) {
        console.error('Error fetched templates:', tplRes.error);
        setToast({ type: 'error', text: 'Error al cargar plantillas.'});
      }

      if (depRes.data) {
        setDepositos(depRes.data as Deposito[]);
      } else if (depRes.error) {
        console.error('Error fetching depositos:', depRes.error);
        setToast({ type: 'error', text: 'Error al cargar depósitos. (Consulte la consola para detalles de RLS/red)'});
      }
    } catch (err) {
      console.error('Error fetching dropdown data:', err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setForm(initialFormState);
      setPedidoSearch('');
      setPedidoDropdownOpen(false);
      fetchDropdownData();
    }
  }, [isOpen, fetchDropdownData]);

  // Close pedido dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pedidoDropdownRef.current && !pedidoDropdownRef.current.contains(e.target as Node)) {
        setPedidoDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Memoized filtering (client-side, instant) ─────────────────────
  const selectedIds = useMemo(
    () => new Set(form.selectedPedidos.map(p => p.id)),
    [form.selectedPedidos]
  );

  const { filtered, totalMatches } = useMemo(() => {
    const query = pedidoSearch.trim().toLowerCase();
    
    // Función auxiliar para ordenar (más recientes primero)
    const sortRecentFirst = (a: PedidoElegible, b: PedidoElegible) => {
      // Asumimos que existe created_at, si no, caemos a id
      const dateA = (a as any).created_at ? new Date((a as any).created_at).getTime() : a.id;
      const dateB = (b as any).created_at ? new Date((b as any).created_at).getTime() : b.id;
      return dateB - dateA;
    };

    if (!query) {
      // No search → show all non-selected, sorted and capped
      const all = pedidosElegibles.filter(p => !selectedIds.has(p.id));
      all.sort(sortRecentFirst);
      return { filtered: all.slice(0, MAX_VISIBLE_RESULTS), totalMatches: all.length };
    }
    
    // Strict Case-Insensitive Substring Match
    const matches: PedidoElegible[] = [];
    for (const p of pedidosElegibles) {
      if (selectedIds.has(p.id)) continue;
      
      const idenStr = p.identificador ? String(p.identificador).toLowerCase() : '';
      const cliStr = p.cliente ? String(p.cliente).toLowerCase() : '';
      
      if (idenStr.includes(query) || cliStr.includes(query)) {
        matches.push(p);
      }
    }
    
    // Ordenamos coincidencia
    matches.sort(sortRecentFirst);
    
    return { filtered: matches.slice(0, MAX_VISIBLE_RESULTS), totalMatches: matches.length };
  }, [pedidosElegibles, pedidoSearch, selectedIds]);

  const togglePedido = (pedido: PedidoElegible) => {
    setForm(prev => {
      const exists = prev.selectedPedidos.some(p => p.id === pedido.id);
      return {
        ...prev,
        selectedPedidos: exists
          ? prev.selectedPedidos.filter(p => p.id !== pedido.id)
          : [...prev.selectedPedidos, pedido],
      };
    });
    // Keep focus on the search input for rapid multi-selection
    searchInputRef.current?.focus();
  };

  const removePedido = (id: number) => {
    setForm(prev => ({
      ...prev,
      selectedPedidos: prev.selectedPedidos.filter(p => p.id !== id),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.selectedPedidos.length === 0) {
      setToast({ type: 'error', text: 'Debe seleccionar al menos un pedido.' });
      return;
    }
    if (!form.inspectorId || !form.templateId || !form.tipoCarga || !form.fechaPactada || !form.lugarId) {
      setToast({ type: 'error', text: 'Todos los campos son obligatorios.' });
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.rpc('crear_nueva_inspeccion_v2', {
        p_pedido_instance_ids: form.selectedPedidos.map(p => p.id),
        p_inspector_id: form.inspectorId,
        p_template_id: form.templateId,
        p_tipo_carga: form.tipoCarga.toUpperCase(),
        p_fecha_pactada: new Date(form.fechaPactada).toISOString(),
        p_lugar_id: form.lugarId,
        p_usuario_actor: usuarioActor,
      });

      if (error) throw error;

      setToast({ type: 'success', text: 'Inspección creada exitosamente.' });
      onCreated();
      onClose();
    } catch (err: any) {
      console.error('Error creating inspection:', err);
      setToast({ type: 'error', text: `Error: ${err.message || 'Error desconocido'}` });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const searchQuery = pedidoSearch.trim();

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[110] px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Slide-in panel */}
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-50 animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-brand-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
              <Plus className="w-5 h-5 text-brand-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Nueva Inspección</h2>
              <p className="text-xs text-gray-500">Control Documental de Exportación</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loadingData ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mr-3" />
              Cargando datos...
            </div>
          ) : (
            <form id="nuevaInspeccionForm" onSubmit={handleSave} className="space-y-5">
              {/* ── Pedidos Searchable Multi-select ───────────────────── */}
              <div ref={pedidoDropdownRef}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">
                    Pedidos <span className="text-red-500">*</span>
                  </label>
                  {form.selectedPedidos.length > 0 && (
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {form.selectedPedidos.length} seleccionado{form.selectedPedidos.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Selected chips */}
                {form.selectedPedidos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5 p-2 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                    {form.selectedPedidos.map(p => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg shadow-sm hover:shadow transition-shadow"
                        title={`${p.identificador} — Cliente: ${p.cliente}`}
                      >
                        <Package className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                        <span className="truncate max-w-[160px]">{p.identificador}</span>
                        <button
                          type="button"
                          onClick={() => removePedido(p.id)}
                          className="text-indigo-300 hover:text-red-500 transition-colors ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Search input */}
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Escribí para buscar — ej: '325', 'Azucarera'..."
                    className="w-full pl-9 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm transition-shadow placeholder:text-gray-400"
                    value={pedidoSearch}
                    onChange={e => {
                      setPedidoSearch(e.target.value);
                      if (!pedidoDropdownOpen) setPedidoDropdownOpen(true);
                    }}
                    onFocus={() => setPedidoDropdownOpen(true)}
                  />
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <button
                    type="button"
                    onClick={() => setPedidoDropdownOpen(!pedidoDropdownOpen)}
                    className="absolute right-2 top-1.5 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${pedidoDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Dropdown results */}
                {pedidoDropdownOpen && (
                  <div className="mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50 ring-1 ring-black/5">
                    {/* Results header */}
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                        {searchQuery ? 'Resultados de búsqueda' : 'Pedidos elegibles'}
                      </span>
                      <span className="text-[11px] font-bold text-gray-400 bg-gray-200/70 px-1.5 py-0.5 rounded">
                        {totalMatches}
                        {totalMatches > MAX_VISIBLE_RESULTS && ` (mostrando ${MAX_VISIBLE_RESULTS})`}
                      </span>
                    </div>

                    {/* Scrollable list */}
                    <div className="max-h-64 overflow-y-auto overscroll-contain">
                      {filtered.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-500">Sin resultados</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Probá con otro identificador o nombre de cliente.
                          </p>
                        </div>
                      ) : (
                        filtered.map(p => {
                          const isSelected = selectedIds.has(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => togglePedido(p)}
                              className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors border-b border-gray-50 last:border-0 ${
                                isSelected
                                  ? 'bg-indigo-50/70 hover:bg-indigo-100/70'
                                  : 'hover:bg-brand-50/50'
                              }`}
                            >
                              {/* Checkbox */}
                              <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-brand-600 border-brand-600'
                                  : 'border-gray-300 hover:border-gray-400'
                              }`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                              {/* Label */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                                    <HighlightText text={p.identificador} query={searchQuery} />
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-gray-600 leading-relaxed">
                                  <span className="text-gray-400 mr-1">Cliente:</span>
                                  <span className="font-medium text-gray-700">
                                    <HighlightText text={p.cliente} query={searchQuery} />
                                  </span>
                                  <span className="mx-1.5 text-gray-300">·</span>
                                  <span className="text-gray-400 mr-1">Art:</span>
                                  <span className="text-gray-600">{p.articulo}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Hint footer */}
                    {totalMatches > 10 && searchQuery.length === 0 && (
                      <div className="px-3 py-2 bg-amber-50 border-t border-amber-100 text-[11px] text-amber-700 font-medium flex items-center gap-1.5">
                        <Search className="w-3 h-3 flex-shrink-0" />
                        Escribí en el buscador para filtrar rápidamente entre {totalMatches} pedidos.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Inspector ──────────────────────────────────────────── */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Inspector <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.inspectorId ?? ''}
                  onChange={e => setForm({ ...form, inspectorId: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
                >
                  <option value="">Seleccionar inspector...</option>
                  {inspectores.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Plantilla Documental ───────────────────────────────── */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Plantilla Documental <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.templateId ?? ''}
                  onChange={e => setForm({ ...form, templateId: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
                >
                  <option value="">Seleccionar plantilla...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} ({t.codigo})
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Tipo de Carga ──────────────────────────────────────── */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Tipo de Carga <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.tipoCarga}
                  onChange={e => setForm({ ...form, tipoCarga: e.target.value as TipoCarga })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
                >
                  <option value="">Seleccionar tipo...</option>
                  {TIPOS_CARGA.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Fecha/Hora Pactada ──────────────────────────────────── */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Fecha / Hora Pactada <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={form.fechaPactada}
                  onChange={e => setForm({ ...form, fechaPactada: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                />
              </div>

              {/* ── Lugar de Carga ──────────────────────────────────────── */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Lugar de Carga <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.lugarId ?? ''}
                  onChange={e => setForm({ ...form, lugarId: e.target.value ? Number(e.target.value) : null })}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
                >
                  <option value="">Seleccionar depósito...</option>
                  {depositos.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 transition text-sm"
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="nuevaInspeccionForm"
            className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition disabled:opacity-50 text-sm font-medium"
            disabled={saving || loadingData}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Crear Inspección
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
