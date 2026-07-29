import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Lock, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { InstanceData } from '../types';

interface ProductItem {
  codigo_producto: string;
  nombre_producto: string;
  cantidad_bolsas: number;
  peso_bolsa_kg: number;
}

interface ArticuloItem {
  id: number;
  codigo_articulo: string;
  nombre: string;
  peso_standard_kg: number;
}

interface EditorItemsPedidoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  instance: InstanceData | null;
  dbData: any;
}

export function EditorItemsPedidoModal({
  isOpen,
  onClose,
  onSuccess,
  instance,
  dbData,
}: EditorItemsPedidoModalProps) {
  const [productos, setProductos] = useState<ProductItem[]>([]);
  const [motivo, setMotivo] = useState('');
  const [catalogoArticulos, setCatalogoArticulos] = useState<ArticuloItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Toneladas y bolsas calzadas vinculadas
  const vinculos = dbData?.vinculaciones_pedido_oc || dbData?.vinculaciones || [];
  const toneladasCalzadas = vinculos.reduce((acc: number, v: any) => {
    if (v.estado_vinculacion === 'APROBADA' || v.estado_vinculacion === 'PENDIENTE_VALIDACION') {
      return acc + (Number(v.cantidad_vinculada || v.cantidad_asignada) || 0);
    }
    return acc;
  }, 0);

  const bolsasCalzadas = Math.round((toneladasCalzadas * 1000) / 50);

  // Cargar catálogo de artículos y productos iniciales al abrir
  useEffect(() => {
    if (isOpen) {
      setMotivo('');
      setErrorMessage(null);
      fetchCatalogoArticulos();

      // Cargar productos del current_data existente
      const existingProds = dbData?.current_data?.productos;
      if (Array.isArray(existingProds) && existingProds.length > 0) {
        setProductos(
          existingProds.map((p: any) => ({
            codigo_producto: p.codigo_producto || p.codigo || 'AZ-STANDARD',
            nombre_producto: p.nombre_producto || p.nombre || 'Azúcar Estándar',
            cantidad_bolsas: Number(p.cantidad_bolsas || p.cantidad || 0),
            peso_bolsa_kg: Number(p.peso_bolsa_kg || p.peso_por_bolsa_kg || 50),
          }))
        );
      } else {
        // Si no hay array de productos en current_data, construir uno inicial basado en toneladas de la instancia
        const tonOrig = Number(instance?.toneladas_originales || 0);
        const bolsasOrig = Math.round((tonOrig * 1000) / 50);
        setProductos([
          {
            codigo_producto: 'AZ-STANDARD',
            nombre_producto: 'Azúcar Calidad Estándar',
            cantidad_bolsas: bolsasOrig,
            peso_bolsa_kg: 50,
          },
        ]);
      }
    }
  }, [isOpen, dbData, instance]);

  const fetchCatalogoArticulos = async () => {
    try {
      const { data, error } = await supabase
        .from('articulos')
        .select('id, codigo_articulo, nombre, peso_standard_kg')
        .eq('estado', 'ACTIVO')
        .order('nombre');

      if (!error && data) {
        setCatalogoArticulos(data);
      }
    } catch (e) {
      console.error('Error al cargar catálogo de artículos:', e);
    }
  };

  if (!isOpen || !instance) return null;

  // Cálculos dinámicos
  const totalBolsasNuevas = productos.reduce((acc, p) => acc + (Number(p.cantidad_bolsas) || 0), 0);
  const totalToneladasNuevas = (totalBolsasNuevas * 50) / 1000;
  const esCantidadInvalida = totalBolsasNuevas < bolsasCalzadas;
  const nuevoSaldoBolsas = Math.max(0, totalBolsasNuevas - bolsasCalzadas);
  const nuevoSaldoToneladas = Math.max(0, totalToneladasNuevas - toneladasCalzadas);

  const handleAddProducto = () => {
    const defaultArt = catalogoArticulos[0];
    setProductos([
      ...productos,
      {
        codigo_producto: defaultArt ? defaultArt.codigo_articulo : 'AZ-NUEVA',
        nombre_producto: defaultArt ? defaultArt.nombre : 'Azúcar Calidad Nueva',
        cantidad_bolsas: 100,
        peso_bolsa_kg: defaultArt ? Number(defaultArt.peso_standard_kg) || 50 : 50,
      },
    ]);
  };

  const handleRemoveProducto = (index: number) => {
    if (productos.length <= 1) {
      setErrorMessage('El pedido debe tener al menos una línea de producto.');
      return;
    }
    setErrorMessage(null);
    setProductos(productos.filter((_, i) => i !== index));
  };

  const handleSelectArticulo = (index: number, selectedCode: string) => {
    setErrorMessage(null);
    const artFound = catalogoArticulos.find((a) => a.codigo_articulo === selectedCode);
    if (artFound) {
      const updated = [...productos];
      updated[index] = {
        ...updated[index],
        codigo_producto: artFound.codigo_articulo,
        nombre_producto: artFound.nombre,
        peso_bolsa_kg: Number(artFound.peso_standard_kg) || 50,
      };
      setProductos(updated);
    }
  };

  const handleUpdateCantidad = (index: number, cantidad: number) => {
    setErrorMessage(null);
    const updated = [...productos];
    updated[index] = {
      ...updated[index],
      cantidad_bolsas: cantidad,
    };
    setProductos(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (motivo.trim().length === 0) {
      setErrorMessage('Debe indicar un motivo obligatorio para el cambio.');
      return;
    }
    if (esCantidadInvalida) {
      setErrorMessage(
        `La cantidad total (${totalBolsasNuevas} bolsas) no puede ser menor a lo ya calzado (${bolsasCalzadas} bolsas).`
      );
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const { data: userData } = await supabase.auth.getUser();
      const userEmail = userData?.user?.email || 'SISTEMA';

      const { data, error } = await supabase.rpc('editar_items_pedido', {
        p_instancia_id: instance.instancia_id,
        p_productos_nuevos: productos,
        p_motivo: motivo.trim(),
        p_usuario_email: userEmail,
      });

      if (error) throw error;

      if (data && data.success === false) {
        setErrorMessage(data.message || 'Error al actualizar el pedido.');
        setIsLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error editando items pedido:', err);
      setErrorMessage(err.message || 'Ocurrió un error inesperado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-bold text-gray-900">
              Editar Calidades y Cantidades de Pedido
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Tarjeta de Referencia de la Instancia */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-wrap gap-4 items-center justify-between text-sm">
            <div>
              <span className="text-gray-500 block text-xs font-medium uppercase">Pedido</span>
              <span className="font-mono font-bold text-gray-900">{instance.referencia_humana}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium uppercase">Cliente</span>
              <span className="font-semibold text-gray-800">{instance.cliente}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium uppercase">Piso Mínimo Calzado</span>
              <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {bolsasCalzadas} bolsas ({toneladasCalzadas.toFixed(2)} Tn)
              </span>
            </div>
          </div>

          {/* Bloque 1: Resumen de Calzados Existentes (Bloqueados) */}
          {vinculos.length > 0 && (
            <div className="border border-blue-100 bg-blue-50/40 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-900 font-semibold text-sm">
                <Lock className="w-4 h-4 text-blue-600" />
                <span>Órdenes de Compra Calzadas (Compromiso Inviolable)</span>
              </div>
              <div className="divide-y divide-blue-100 text-xs text-blue-800">
                {vinculos.map((v: any, idx: number) => (
                  <div key={idx} className="py-1.5 flex justify-between items-center">
                    <span>
                      OC: <strong className="font-mono">{v.oc_ref || v.oc_instancias?.identificador_compuesto}</strong> ({v.proveedor || 'Proveedor'})
                    </span>
                    <span className="font-semibold bg-white px-2 py-0.5 rounded border border-blue-200">
                      {Math.round(((v.cantidad_vinculada || v.cantidad_asignada || 0) * 1000) / 50)} bolsas ({Number(v.cantidad_vinculada || v.cantidad_asignada || 0).toFixed(2)} Tn)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Bloque 2: Tabla de Calidades e Ítems del Pedido (Selección desde Catálogo Artículos) */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-semibold text-gray-800">
                Líneas de Productos / Calidades del Pedido (Catálogo de Artículos)
              </label>
              <button
                type="button"
                onClick={handleAddProducto}
                disabled={isLoading}
                className="flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Calidad</span>
              </button>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Calidad (Artículo del Catálogo)</th>
                    <th className="px-4 py-3 w-36">Cant. Bolsas (50kg)</th>
                    <th className="px-4 py-3 w-28">Toneladas</th>
                    <th className="px-4 py-3 w-12 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {productos.map((prod, idx) => {
                    const ton = ((Number(prod.cantidad_bolsas) || 0) * (prod.peso_bolsa_kg || 50)) / 1000;
                    return (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5">
                          <select
                            value={prod.codigo_producto}
                            onChange={(e) => handleSelectArticulo(idx, e.target.value)}
                            disabled={isLoading}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white text-gray-800"
                          >
                            {/* Opción fallback si el ítem actual no está en la lista de catálogo */}
                            {!catalogoArticulos.some((a) => a.codigo_articulo === prod.codigo_producto) && (
                              <option value={prod.codigo_producto}>
                                {prod.nombre_producto} ({prod.codigo_producto})
                              </option>
                            )}
                            {catalogoArticulos.map((art) => (
                              <option key={art.id || art.codigo_articulo} value={art.codigo_articulo}>
                                {art.nombre} ({art.codigo_articulo})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            min="1"
                            value={prod.cantidad_bolsas || ''}
                            onChange={(e) =>
                              handleUpdateCantidad(idx, parseInt(e.target.value) || 0)
                            }
                            disabled={isLoading}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm font-semibold focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                          />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-gray-700">
                          {ton.toFixed(2)} Tn
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveProducto(idx)}
                            disabled={isLoading}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                            title="Eliminar línea"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bloque 3: Resumen de Saldos Recalculados */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <span className="text-xs text-emerald-800 font-medium block">Nuevo Total Pedido</span>
              <span className="text-base font-bold text-emerald-950 font-mono">
                {totalBolsasNuevas} bolsas ({totalToneladasNuevas.toFixed(2)} Tn)
              </span>
            </div>
            <div>
              <span className="text-xs text-emerald-800 font-medium block">Total Ya Calzado</span>
              <span className="text-base font-bold text-amber-700 font-mono">
                {bolsasCalzadas} bolsas ({toneladasCalzadas.toFixed(2)} Tn)
              </span>
            </div>
            <div>
              <span className="text-xs text-emerald-800 font-medium block">Nuevo Saldo Pendiente</span>
              <span className="text-base font-bold text-brand-700 font-mono">
                {nuevoSaldoBolsas} bolsas ({nuevoSaldoToneladas.toFixed(2)} Tn)
              </span>
            </div>
          </div>

          {/* Campo Obligatorio: Motivo */}
          <div className="space-y-1.5">
            <label htmlFor="motivo-edit" className="block text-sm font-medium text-gray-700">
              Motivo de la Modificación <span className="text-red-500">*</span>
            </label>
            <textarea
              id="motivo-edit"
              required
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none disabled:bg-gray-50"
              placeholder="Describa la razón del cambio de calidades o ajuste de saldo (ej. Selección de artículos Providencia y Concepción por disponibilidad de stock)..."
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || esCantidadInvalida || motivo.trim().length === 0}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-brand-600 border border-transparent rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Guardar Cambios</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
