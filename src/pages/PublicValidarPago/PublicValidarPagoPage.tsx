import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  DollarSign, 
  FileText, 
  Building2, 
  Package, 
  ExternalLink,
  ShieldCheck,
  Check,
  Loader2
} from 'lucide-react';

interface PedidoContext {
  pedido_ref: string;
  cliente: string;
  cuit_cliente?: string;
  cantidad: number;
  tipo_mercado?: string;
  fecha_pedido?: string;
  precio_neto_kg?: number;
  cotizacion_archivo_url?: string;
  forma_pago?: string;
  productos?: Array<{
    nombre_producto?: string;
    cantidad?: number;
    unidad_cantidad?: string;
    peso_por_bolsa_kg?: number;
    precio_unitario_neto?: number;
  }>;
  incoterm?: string;
  calidad_azucar?: string;
}

interface ContextoValidacion {
  valido: boolean;
  estado_token: 'PENDIENTE' | 'USADO' | 'EXPIRADO';
  expires_at?: string;
  used_at?: string;
  usuario_email?: string;
  remito?: {
    id: number;
    ref: string;
    cantidad_total: number;
    gf_pago_aprobado: boolean;
    gf_pago_aprobado_at: string | null;
    gf_pago_aprobado_por: string | null;
    gf_pago_comprobante_ref: string | null;
  };
  pedidos?: PedidoContext[];
  error?: string;
}

export function PublicValidarPagoPage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ContextoValidacion | null>(null);
  const [errorStr, setErrorStr] = useState<string | null>(null);
  
  const [comprobanteRef, setComprobanteRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ fecha: string; validador: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorStr('El enlace no contiene un token válido.');
      setLoading(false);
      return;
    }

    const fetchContext = async () => {
      try {
        setLoading(true);
        setErrorStr(null);

        const { data: res, error: rpcError } = await supabase.rpc('get_pago_anticipado_context_by_token', {
          p_token: token
        });

        if (rpcError) throw rpcError;
        
        const ctx = res as ContextoValidacion;
        if (!ctx || !ctx.valido) {
          setErrorStr(ctx?.error || 'Enlace no válido o no encontrado.');
          return;
        }

        setData(ctx);

        if (ctx.remito?.gf_pago_aprobado || ctx.estado_token === 'USADO') {
          setSuccess(true);
          setSuccessData({
            fecha: ctx.remito?.gf_pago_aprobado_at || ctx.used_at || new Date().toISOString(),
            validador: ctx.remito?.gf_pago_aprobado_por || ctx.usuario_email || 'Gerencia Financiera'
          });
        }
      } catch (err: unknown) {
        console.error('Error fetching payment context:', err);
        const msg = err instanceof Error ? err.message : 'Error al verificar el enlace.';
        setErrorStr(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchContext();
  }, [token]);

  const handleValidarPago = async () => {
    if (!token) return;

    try {
      setSubmitting(true);
      setErrorStr(null);

      const { data: res, error: rpcError } = await supabase.rpc('validar_pago_anticipado_por_token', {
        p_token: token,
        p_comprobante_ref: comprobanteRef.trim() || null,
        p_validador_email: data?.usuario_email || null
      });

      if (rpcError) throw rpcError;

      if (!res?.success) {
        throw new Error(res?.error || 'No se pudo registrar la validación.');
      }

      setSuccess(true);
      setSuccessData({
        fecha: res.fecha_aprobacion || new Date().toISOString(),
        validador: res.validador || 'Gerencia Financiera'
      });
    } catch (err: unknown) {
      console.error('Error al validar pago:', err);
      const msg = err instanceof Error ? err.message : 'Error inesperado al validar.';
      setErrorStr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold text-gray-800">Cargando verificación de pago...</h2>
        <p className="text-sm text-gray-500">Por favor aguarde un instante.</p>
      </div>
    );
  }

  if (errorStr && !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center animate-in fade-in">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enlace no válido</h1>
          <p className="text-sm text-gray-600 mb-6">{errorStr}</p>
          <div className="text-xs text-gray-400 border-t border-gray-100 pt-4">
            Si considera que se trata de un error, por favor contacte al sector de Logística para generar un nuevo enlace.
          </div>
        </div>
      </div>
    );
  }

  const remito = data?.remito;
  const pedidos = data?.pedidos || [];
  const primerPedido = pedidos[0];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans antialiased">
      {/* Header institucional */}
      <header className="bg-white border-b border-gray-200 py-4 px-6 sticky top-0 z-10 shadow-xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              AC
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-base leading-tight">Arquímedes Carrizo</h1>
              <p className="text-xs text-gray-500 font-medium">Portal de Validación Financiera</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-semibold text-amber-800">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            Acceso Seguro GF
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {/* Banner de Estado de Validación */}
        {success ? (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 text-center shadow-sm animate-in zoom-in-95">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-emerald-950 mb-1">¡Pago Acreditado Exitosamente!</h2>
            <p className="text-sm text-emerald-800 max-w-lg mx-auto mb-4">
              La acreditación del pago para el Remito <strong>#{remito?.ref}</strong> fue registrada en el sistema. El remito ha quedado habilitado para su despacho y edición logística.
            </p>
            
            <div className="inline-flex flex-col sm:flex-row items-center gap-3 bg-white px-5 py-3 rounded-xl border border-emerald-200 text-xs text-gray-700 shadow-xs">
              <div>
                <span className="text-gray-400">Fecha y Hora: </span>
                <strong className="text-emerald-900">
                  {successData?.fecha ? new Date(successData.fecha).toLocaleString() : 'Recientemente'}
                </strong>
              </div>
              <span className="hidden sm:inline text-gray-300">•</span>
              <div>
                <span className="text-gray-400">Validado por: </span>
                <strong className="text-emerald-900">{successData?.validador}</strong>
              </div>
              {remito?.gf_pago_comprobante_ref && (
                <>
                  <span className="hidden sm:inline text-gray-300">•</span>
                  <div>
                    <span className="text-gray-400">Ref: </span>
                    <strong className="text-emerald-900">{remito.gf_pago_comprobante_ref}</strong>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : data?.estado_token === 'EXPIRADO' ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-2" />
            <h2 className="text-lg font-bold text-amber-900 mb-1">Este enlace ha expirado</h2>
            <p className="text-xs text-amber-700">
              El plazo de validez del enlace caducó el {data.expires_at ? new Date(data.expires_at).toLocaleString() : ''}. Por favor solicite a Logística el reenvío de un enlace actualizado.
            </p>
          </div>
        ) : (
          <div className="bg-amber-50/80 border border-amber-300 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-amber-950 text-sm">Validación de Pago Anticipado Requerida</h2>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Este remito está asociado a una orden comercial con condición de <strong>PAGO ANTICIPADO</strong>. Verifique haber recibido los fondos antes de confirmar.
                </p>
              </div>
            </div>
            {data?.expires_at && (
              <div className="text-[11px] text-amber-700 bg-amber-100/70 px-3 py-1.5 rounded-lg shrink-0 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Vence: {new Date(data.expires_at).toLocaleDateString()} {new Date(data.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        )}

        {/* Tarjeta de Resumen del Remito y Pedido */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
          
          {/* Header de la tarjeta */}
          <div className="p-5 bg-gradient-to-r from-slate-50 to-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Documento de Salida</span>
              <h3 className="text-lg font-black text-gray-900">Remito #{remito?.ref}</h3>
            </div>
            {remito?.cantidad_total && (
              <span className="px-3 py-1 bg-brand-50 text-brand-700 border border-brand-200 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                {remito.cantidad_total} Toneladas Totales
              </span>
            )}
          </div>

          {/* Información del Cliente y Pedido */}
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-gray-400" />
                  Cliente / Razón Social
                </div>
                <div className="font-bold text-gray-900 text-sm">
                  {primerPedido?.cliente || 'No especificado'}
                </div>
                {primerPedido?.cuit_cliente && (
                  <div className="text-xs text-gray-500">
                    CUIT: {primerPedido.cuit_cliente}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-gray-400" />
                  Pedido Comercial Vinculado
                </div>
                <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <span>Pedido #{primerPedido?.pedido_ref || 'Sin ref'}</span>
                  {primerPedido?.tipo_mercado && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-semibold">
                      {primerPedido.tipo_mercado}
                    </span>
                  )}
                </div>
                <div className="text-xs font-semibold text-amber-700">
                  Condición: {primerPedido?.forma_pago || 'ANTICIPADO'}
                </div>
              </div>
            </div>

            {primerPedido?.incoterm && (
              <div className="pt-2 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-600">
                <span className="font-semibold text-gray-500">Incoterm / Entrega:</span>
                <span className="font-medium text-gray-800">{primerPedido.incoterm}</span>
              </div>
            )}
          </div>

          {/* Detalle de Artículos / Productos */}
          {primerPedido?.productos && primerPedido.productos.length > 0 && (
            <div className="p-5 space-y-3 bg-slate-50/50">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-gray-400" />
                Artículos del Pedido
              </h4>
              <div className="space-y-2">
                {primerPedido.productos.map((prod, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-gray-200 text-xs flex justify-between items-center shadow-2xs">
                    <div>
                      <div className="font-bold text-gray-800">{prod.nombre_producto || 'Producto'}</div>
                      <div className="text-gray-500 text-[11px] mt-0.5">
                        {prod.cantidad} {prod.unidad_cantidad || 'bolsas'} 
                        {prod.peso_por_bolsa_kg ? ` (${prod.peso_por_bolsa_kg} kg/bolsa)` : ''}
                      </div>
                    </div>
                    {prod.precio_unitario_neto !== undefined && (
                      <div className="text-right">
                        <span className="text-gray-400 text-[10px] block">Precio Unitario</span>
                        <span className="font-bold text-gray-900">${prod.precio_unitario_neto}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Enlace al archivo de cotización si existe */}
          {primerPedido?.cotizacion_archivo_url && (
            <div className="p-4 bg-white flex items-center justify-between text-xs">
              <span className="text-gray-600 flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-600" />
                Comprobante original de cotización disponible:
              </span>
              <a 
                href={primerPedido.cotizacion_archivo_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-brand-600 font-bold hover:underline inline-flex items-center gap-1"
              >
                Ver Archivo <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Sección de Acción: Confirmar Pago */}
        {!success && data?.estado_token === 'PENDIENTE' && (
          <div className="bg-white rounded-2xl border border-amber-300 p-6 shadow-md space-y-4 animate-in fade-in">
            <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-600" />
              Confirmación de Cobranza
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Al confirmar, usted declara que los fondos correspondientes a esta operación han sido debidamente acreditados en las cuentas de Arquímedes Carrizo. Esta acción desbloqueará inmediatamente la edición y despacho del remito.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700">
                N° de Comprobante / Referencia Bancaria <span className="text-gray-400 font-normal">(Opcional)</span>
              </label>
              <input
                type="text"
                value={comprobanteRef}
                onChange={(e) => setComprobanteRef(e.target.value)}
                placeholder="Ej: Transf. Banco Galicia #482910 o Nota interna"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                disabled={submitting}
              />
            </div>

            {errorStr && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {errorStr}
              </div>
            )}

            <button
              type="button"
              onClick={handleValidarPago}
              disabled={submitting}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-base rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Registrando validación...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Confirmar Acreditación de Pago
                </>
              )}
            </button>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 mt-12">
        Arquímedes Carrizo &bull; Sistema de Gestión Logística y Control Financiero &bull; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default PublicValidarPagoPage;
