/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, 
  Download, 
  Printer, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Truck, 
  Building2, 
  User, 
  Package, 
  Loader2, 
  RefreshCw,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { InstanceData, EntityType } from '../types';
import { cn } from '../../../lib/utils';

interface RemitoItem {
  remito_id: number;
  remito_ref_externa: string;
  fecha: string;
  cantidad_ton: number;
  camion_patente?: string;
  chofer?: string;
  estado?: string;
}

interface RamaItem {
  vinculacion_id: number;
  pedido_instance_id: number;
  oc_instance_id: number;
  referencia_contraparte: string;
  fecha_contraparte: string;
  entidad_contraparte: string;
  cantidad_vinculada_ton: number;
  estado_vinculacion: string;
  subtotal_remitos_ton: number;
  saldo_pendiente_remito_ton: number;
  coincide_remitos: boolean;
  remitos: RemitoItem[];
}

interface TraceabilityReportData {
  tipo: 'PEDIDO' | 'OC';
  id: number;
  referencia: string;
  fecha: string;
  cantidad_total_ton: number;
  bolsas_50kg: number;
  tipo_mercado: string;
  precio_neto_kg?: number;
  entidad_principal: string;
  entidad_cuit?: string | null;
  entidad_domicilio?: string | null;
  kpis: {
    total_original_ton: number;
    total_vinculado_ton: number;
    saldo_pendiente_vincular_ton: number;
    coincide_vinculacion_total: boolean;
    total_remitado_ton: number;
    saldo_pendiente_remitar_ton: number;
    saldo_disponible_madre_ton: number;
  };
  ramas: RamaItem[];
}

interface InformeTrazabilidadModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: InstanceData | null;
  entityType: EntityType;
}

export function InformeTrazabilidadModal({ isOpen, onClose, instance, entityType }: InformeTrazabilidadModalProps) {
  const [data, setData] = useState<TraceabilityReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (!instance) return;
    setIsLoading(true);
    setError(null);
    try {
      const paramRef = instance.referencia_humana || instance.nro_pedido || String(instance.instancia_id);
      const { data: res, error: rpcErr } = await supabase.rpc('get_informe_trazabilidad', {
        p_tipo: entityType,
        p_id_o_ref: paramRef
      });

      if (rpcErr) throw rpcErr;
      if (res?.error) throw new Error(res.error);

      setData(res as TraceabilityReportData);
    } catch (err: any) {
      console.error('Error fetching informe trazabilidad:', err);
      setError(err.message || 'Error al obtener el informe de trazabilidad.');
    } finally {
      setIsLoading(false);
    }
  }, [instance, entityType]);

  useEffect(() => {
    if (isOpen && instance) {
      fetchReport();
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, instance, fetchReport]);

  // Generador de HTML Autónomo descargable
  const handleDownloadHtml = () => {
    if (!data) return;

    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe de Trazabilidad - ${data.tipo} ${data.referencia}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-main: #f8fafc;
      --bg-card: #ffffff;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
      --blue-50: #eff6ff;
      --blue-600: #2563eb;
      --blue-700: #1d4ed8;
      --emerald-50: #ecfdf5;
      --emerald-600: #059669;
      --emerald-700: #047857;
      --rose-50: #fff1f2;
      --rose-600: #e11d48;
      --rose-700: #be123c;
      --amber-50: #fffbeb;
      --amber-700: #b45309;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-main);
      color: var(--text-primary);
      line-height: 1.5;
      padding: 2.5rem 1.5rem;
    }
    .container { max-width: 1080px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #ffffff;
      border-radius: 1rem;
      padding: 2rem 2.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
    }
    .badge-report {
      background: rgba(255, 255, 255, 0.15);
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      display: inline-block;
    }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
    .header-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.25rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
    }
    .meta-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; display: block; margin-bottom: 0.25rem; }
    .meta-value { font-size: 1rem; font-weight: 600; color: #f8fafc; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }
    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 0.75rem;
      padding: 1.35rem;
      box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    }
    .kpi-title { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; }
    .kpi-value { font-size: 1.75rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .kpi-footer { font-size: 0.8rem; margin-top: 0.5rem; font-weight: 500; }
    .section-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 1rem;
      padding: 2rem;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      margin-bottom: 2rem;
    }
    .section-title { font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; gap: 0.6rem; }
    .tree-container { margin-top: 1.5rem; }
    .tree-node-root {
      background: #f8fafc;
      border: 2px solid #cbd5e1;
      border-radius: 0.75rem;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.5rem;
    }
    .branch-item {
      margin-left: 2rem;
      padding-left: 1.5rem;
      border-left: 3px solid #93c5fd;
      margin-bottom: 2rem;
      position: relative;
    }
    .tree-node-item {
      background: var(--blue-50);
      border: 1px solid #bfdbfe;
      border-radius: 0.75rem;
      padding: 1.1rem 1.35rem;
      margin-bottom: 1rem;
    }
    .branch-remitos {
      margin-left: 2rem;
      padding-left: 1.5rem;
      border-left: 3px dashed #cbd5e1;
      margin-bottom: 1rem;
    }
    .tree-node-remito {
      background: #ffffff;
      border: 1px solid var(--border-color);
      border-radius: 0.5rem;
      padding: 0.85rem 1.15rem;
      margin-bottom: 0.75rem;
      box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    }
    .node-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
    .node-title { font-weight: 700; font-family: 'JetBrains Mono', monospace; font-size: 1.1rem; }
    .node-subtext { display: flex; gap: 1.5rem; flex-wrap: wrap; font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem; }
    .subtotal-bar {
      border-radius: 0.5rem;
      padding: 0.85rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.95rem;
      font-weight: 600;
      margin-top: 0.75rem;
      margin-bottom: 1rem;
    }
    .subtotal-remitos { background: #f8fafc; border: 1.5px solid #e2e8f0; margin-left: 2rem; }
    .subtotal-global { background: #f0fdf4; border: 2px solid #86efac; padding: 1.15rem 1.5rem; border-radius: 0.75rem; margin-top: 2rem; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.825rem;
      font-weight: 600;
    }
    .status-match { background: var(--emerald-50); color: var(--emerald-700); border: 1px solid #a7f3d0; }
    .status-mismatch { background: var(--rose-50); color: var(--rose-700); border: 1px solid #fecdd3; }
    @media print {
      body { background: #fff; padding: 0; }
      .container { max-width: 100%; }
      .header { box-shadow: none; border: 1px solid #000; }
      .section-card { box-shadow: none; border: 1px solid #ccc; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="header-top">
        <div>
          <span class="badge-report">Reporte de Auditoría y Trazabilidad</span>
          <h1 style="margin-top: 0.5rem;">Auditoría de ${data.tipo === 'PEDIDO' ? 'Pedido' : 'Orden de Compra'}: ${data.referencia}</h1>
          <p>Trazabilidad integral de compras, asignaciones de órdenes y despachos en remitos.</p>
        </div>
        <div>
          <span style="font-size: 0.85rem; color: #94a3b8;">Generado: ${new Date().toLocaleDateString('es-AR')}</span>
        </div>
      </div>
      <div class="header-meta">
        <div>
          <span class="meta-label">${data.tipo === 'PEDIDO' ? 'Cliente' : 'Proveedor'}</span>
          <span class="meta-value">${data.entidad_principal}</span>
        </div>
        <div>
          <span class="meta-label">Fecha Emisión</span>
          <span class="meta-value">${data.fecha || '-'}</span>
        </div>
        <div>
          <span class="meta-label">Mercado / Operatoria</span>
          <span class="meta-value">${data.tipo_mercado || 'MI'}</span>
        </div>
        <div>
          <span class="meta-label">Cantidad Total Original</span>
          <span class="meta-value" style="color: #60a5fa;">${data.cantidad_total_ton.toFixed(3)} Ton (${data.bolsas_50kg} bolsas)</span>
        </div>
      </div>
    </header>

    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">${data.tipo} Original</div>
        <div class="kpi-value">${data.kpis.total_original_ton.toFixed(3)} <span style="font-size: 1rem; color: var(--text-muted);">Ton</span></div>
        <div class="kpi-footer" style="color: var(--blue-600);">● ${data.entidad_principal}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Total Vinculado</div>
        <div class="kpi-value" style="color: ${data.kpis.coincide_vinculacion_total ? 'var(--emerald-600)' : 'var(--amber-700)'};">
          ${data.kpis.total_vinculado_ton.toFixed(3)} <span style="font-size: 1rem; color: var(--text-muted);">Ton</span>
        </div>
        <div class="kpi-footer" style="color: ${data.kpis.coincide_vinculacion_total ? 'var(--emerald-700)' : 'var(--amber-700)'};">
          ${data.kpis.coincide_vinculacion_total ? '✔️ 100% Calzado' : `⏳ Faltan vincular ${data.kpis.saldo_pendiente_vincular_ton.toFixed(3)} Ton`}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Total Remitado</div>
        <div class="kpi-value" style="color: var(--text-primary);">${data.kpis.total_remitado_ton.toFixed(3)} <span style="font-size: 1rem; color: var(--text-muted);">Ton</span></div>
        <div class="kpi-footer" style="color: var(--text-secondary);">
          ● ${( (data.kpis.total_remitado_ton / (data.kpis.total_original_ton || 1)) * 100 ).toFixed(1)}% Despachado
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Pendiente de Remitir</div>
        <div class="kpi-value" style="color: ${data.kpis.saldo_pendiente_remitar_ton === 0 ? 'var(--emerald-600)' : 'var(--rose-600)'};">
          ${data.kpis.saldo_pendiente_remitar_ton.toFixed(3)} <span style="font-size: 1rem; color: var(--text-muted);">Ton</span>
        </div>
        <div class="kpi-footer" style="color: ${data.kpis.saldo_pendiente_remitar_ton === 0 ? 'var(--emerald-700)' : 'var(--rose-700)'};">
          ${data.kpis.saldo_pendiente_remitar_ton === 0 ? '✔️ Remisión completa' : `❌ ${Math.ceil(data.kpis.saldo_pendiente_remitar_ton / 28)} viajes aprox pendientes`}
        </div>
      </div>
    </section>

    <main class="section-card">
      <div class="section-title">
        <span>🌳</span> Estructura Jerárquica y Conciliación de Cantidades
      </div>
      <div class="tree-container">
        <div class="tree-node-root">
          <div class="node-header">
            <div>
              <span class="node-title">${data.tipo} ${data.referencia}</span>
              <span style="margin-left: 0.5rem; color: var(--text-muted); font-size: 0.85rem;">(Original)</span>
            </div>
            <div style="font-weight: 700; color: var(--blue-700); font-size: 1.1rem;">
              ${data.cantidad_total_ton.toFixed(3)} Ton
            </div>
          </div>
          <div class="node-subtext">
            <span>${data.tipo === 'PEDIDO' ? 'Cliente' : 'Proveedor'}: <strong>${data.entidad_principal}</strong></span>
            <span>Fecha: <strong>${data.fecha || '-'}</strong></span>
            <span>Bolsas 50kg: <strong>${data.bolsas_50kg}</strong></span>
          </div>
        </div>

        ${data.ramas.map(rama => `
          <div class="branch-item">
            <div class="tree-node-item">
              <div class="node-header">
                <div>
                  <span style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--blue-700);">Vinculado a ${data.tipo === 'PEDIDO' ? 'OC' : 'Pedido'}:</span>
                  <span class="node-title" style="margin-left: 0.5rem;">${rama.referencia_contraparte}</span>
                </div>
                <div style="font-weight: 700; color: var(--blue-700); font-size: 1.1rem;">
                  ${rama.cantidad_vinculada_ton.toFixed(3)} Ton
                </div>
              </div>
              <div class="node-subtext">
                <span>${data.tipo === 'PEDIDO' ? 'Proveedor' : 'Cliente'}: <strong>${rama.entidad_contraparte}</strong></span>
                <span>Fecha: <strong>${rama.fecha_contraparte || '-'}</strong></span>
                <span>Estado Vinculación: <strong>${rama.estado_vinculacion}</strong></span>
              </div>
            </div>

            <div class="branch-remitos">
              ${rama.remitos.length > 0 ? rama.remitos.map(r => `
                <div class="tree-node-remito">
                  <div class="node-header">
                    <div>
                      <span style="font-weight: 600; font-family: monospace;">Remito: ${r.remito_ref_externa}</span>
                      <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">(${r.fecha})</span>
                    </div>
                    <div style="font-weight: 700; color: var(--text-primary);">
                      ${r.cantidad_ton.toFixed(3)} Ton
                    </div>
                  </div>
                  <div class="node-subtext">
                    <span>Chofer: <strong>${r.chofer || 'Sin chofer'}</strong></span>
                    <span>Patente: <strong>${r.camion_patente || '-'}</strong></span>
                    <span>Estado: <strong>${r.estado || 'EMITIDO'}</strong></span>
                  </div>
                </div>
              `).join('') : `
                <div style="padding: 0.75rem 1rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 0.5rem; color: #64748b; font-style: italic; font-size: 0.85rem;">
                  ⏳ Sin remitos despachados aún para esta vinculación.
                </div>
              `}
            </div>

            <div class="subtotal-bar subtotal-remitos">
              <div>
                <span>Subtotal Remitos (${rama.referencia_contraparte}): </span>
                <strong style="font-family: monospace; font-size: 1.05rem;">${rama.subtotal_remitos_ton.toFixed(3)} Ton</strong>
              </div>
              <div>
                ${rama.coincide_remitos ? `
                  <span class="status-badge status-match">✔️ Coincide con Vinculación</span>
                ` : `
                  <span class="status-badge status-mismatch">❌ Faltan ${rama.saldo_pendiente_remito_ton.toFixed(3)} Ton por remitir</span>
                `}
              </div>
            </div>
          </div>
        `).join('')}

        ${data.kpis.saldo_disponible_madre_ton > 0 ? `
          <div style="margin-left: 2rem; padding: 1rem 1.25rem; background: #fffbeb; border: 1.5px dashed #f59e0b; border-radius: 0.75rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-weight: 700; color: #b45309;">⚠️ Saldo Disponible sin Vincular (Instancia Madre):</span>
              <p style="font-size: 0.85rem; color: #92400e; margin-top: 0.25rem;">Disponible para ser calzado con nuevas órdenes.</p>
            </div>
            <div style="font-size: 1.15rem; font-weight: 700; color: #b45309; font-family: monospace;">
              ${data.kpis.saldo_disponible_madre_ton.toFixed(3)} Ton
            </div>
          </div>
        ` : ''}

        <div class="subtotal-bar subtotal-global">
          <div>
            <span style="font-size: 1.05rem; font-weight: 700;">Subtotal General de Vinculaciones: </span>
            <strong style="font-family: monospace; font-size: 1.2rem; color: var(--text-primary); margin-left: 0.5rem;">
              ${data.kpis.total_vinculado_ton.toFixed(3)} Ton
            </strong>
          </div>
          <div>
            ${data.kpis.coincide_vinculacion_total ? `
              <span class="status-badge status-match" style="font-size: 0.9rem; padding: 0.4rem 0.9rem;">
                ✔️ Coincide 100% con ${data.tipo} (${data.cantidad_total_ton.toFixed(3)} Ton)
              </span>
            ` : `
              <span class="status-badge status-mismatch" style="font-size: 0.9rem; padding: 0.4rem 0.9rem;">
                ❌ No coincide: Faltan vincular ${data.kpis.saldo_pendiente_vincular_ton.toFixed(3)} Ton
              </span>
            `}
          </div>
        </div>

      </div>
    </main>

    <footer style="text-align: center; font-size: 0.8rem; color: var(--text-muted); margin-top: 2rem;">
      Sistema Logístico Arquímedes Carrizo • Generado automáticamente con conciliación de integridad en base de datos.
    </footer>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `informe_trazabilidad_${data.tipo.toLowerCase()}_${data.referencia}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex justify-center items-start p-4 sm:p-6 md:p-8 animate-fadeIn">
      <div 
        className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col my-auto max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="px-6 py-4 bg-gray-900 text-white flex justify-between items-center border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-600/30 text-brand-400 rounded-lg border border-brand-500/30">
              <FileText className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Informe de Trazabilidad y Conciliación
                {data && (
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                    {data.tipo}: {data.referencia}
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400">
                Historial completo de calces, asignaciones y remitos despachados
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {data && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadHtml}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors shadow-sm"
                  title="Descargar archivo HTML autónomo"
                >
                  <Download className="w-3.5 h-3.5 text-brand-400" />
                  Descargar HTML
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors shadow-sm"
                  title="Imprimir reporte en A4 o guardar en PDF"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-400" />
                  Imprimir / PDF
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
          {isLoading && (
            <div className="py-24 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
              <p className="text-sm font-medium text-gray-600">Consolidando historial y trazabilidad...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">No se pudo cargar el informe</h4>
                <p className="text-xs mt-1">{error}</p>
                <button
                  type="button"
                  onClick={fetchReport}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-red-800 underline"
                >
                  <RefreshCw className="w-3 h-3" /> Reintentar
                </button>
              </div>
            </div>
          )}

          {!isLoading && !error && data && (
            <>
              {/* Executive Header Box */}
              <div className="bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 text-white rounded-xl p-5 shadow-sm border border-gray-800">
                <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b border-gray-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                        {data.tipo === 'PEDIDO' ? 'Pedido de Venta' : 'Orden de Compra'}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                        Mercado: {data.tipo_mercado || 'MI'}
                      </span>
                    </div>
                    <h1 className="text-2xl font-extrabold text-white mt-1 font-mono">
                      {data.referencia}
                    </h1>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-gray-400 block">Total Compromiso</span>
                    <span className="text-2xl font-black text-brand-400 font-mono">
                      {data.cantidad_total_ton.toFixed(3)} <span className="text-sm font-sans font-normal text-gray-400">Ton</span>
                    </span>
                    <span className="text-xs text-gray-400 block">({data.bolsas_50kg} bolsas de 50kg)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 text-xs">
                  <div>
                    <span className="text-gray-400 block uppercase font-medium text-[10px]">
                      {data.tipo === 'PEDIDO' ? 'Cliente' : 'Proveedor'}
                    </span>
                    <span className="font-semibold text-gray-100 text-sm mt-0.5 flex items-center gap-1.5 truncate" title={data.entidad_principal}>
                      {data.tipo === 'PEDIDO' ? <Building2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" /> : <User className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />}
                      {data.entidad_principal}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-400 block uppercase font-medium text-[10px]">Fecha Emisión</span>
                    <span className="font-semibold text-gray-200 text-sm mt-0.5">
                      {data.fecha || '-'}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-400 block uppercase font-medium text-[10px]">Precio Unitario Neto</span>
                    <span className="font-semibold text-gray-200 text-sm mt-0.5 font-mono">
                      {data.precio_neto_kg ? `$${Number(data.precio_neto_kg).toFixed(2)} / kg` : '-'}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-400 block uppercase font-medium text-[10px]">Total Remitado</span>
                    <span className="font-semibold text-emerald-400 text-sm mt-0.5 font-mono">
                      {data.kpis.total_remitado_ton.toFixed(3)} Ton
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* KPI 1 */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    {data.tipo} Original
                  </span>
                  <div className="my-2">
                    <span className="text-2xl font-bold font-mono text-gray-900">
                      {data.kpis.total_original_ton.toFixed(3)}
                    </span>
                    <span className="text-xs text-gray-500 ml-1 font-sans">Ton</span>
                  </div>
                  <span className="text-xs font-medium text-blue-600 truncate">
                    ● {data.entidad_principal}
                  </span>
                </div>

                {/* KPI 2 */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Total Vinculado
                  </span>
                  <div className="my-2">
                    <span className={cn(
                      "text-2xl font-bold font-mono",
                      data.kpis.coincide_vinculacion_total ? "text-emerald-600" : "text-amber-600"
                    )}>
                      {data.kpis.total_vinculado_ton.toFixed(3)}
                    </span>
                    <span className="text-xs text-gray-500 ml-1 font-sans">Ton</span>
                  </div>
                  <span className={cn(
                    "text-xs font-semibold flex items-center gap-1",
                    data.kpis.coincide_vinculacion_total ? "text-emerald-700" : "text-amber-700"
                  )}>
                    {data.kpis.coincide_vinculacion_total ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> 100% Calzado
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5" /> Faltan {data.kpis.saldo_pendiente_vincular_ton.toFixed(3)} Tn vincular
                      </>
                    )}
                  </span>
                </div>

                {/* KPI 3 */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Total Remitado
                  </span>
                  <div className="my-2">
                    <span className="text-2xl font-bold font-mono text-gray-900">
                      {data.kpis.total_remitado_ton.toFixed(3)}
                    </span>
                    <span className="text-xs text-gray-500 ml-1 font-sans">Ton</span>
                  </div>
                  <span className="text-xs font-medium text-gray-600">
                    ● {( (data.kpis.total_remitado_ton / (data.kpis.total_original_ton || 1)) * 100 ).toFixed(1)}% Despachado
                  </span>
                </div>

                {/* KPI 4 */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Saldo Pendiente Remitir
                  </span>
                  <div className="my-2">
                    <span className={cn(
                      "text-2xl font-bold font-mono",
                      data.kpis.saldo_pendiente_remitar_ton === 0 ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {data.kpis.saldo_pendiente_remitar_ton.toFixed(3)}
                    </span>
                    <span className="text-xs text-gray-500 ml-1 font-sans">Ton</span>
                  </div>
                  <span className={cn(
                    "text-xs font-semibold flex items-center gap-1",
                    data.kpis.saldo_pendiente_remitar_ton === 0 ? "text-emerald-700" : "text-rose-700"
                  )}>
                    {data.kpis.saldo_pendiente_remitar_ton === 0 ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Entrega completa
                      </>
                    ) : (
                      <>
                        <Truck className="w-3.5 h-3.5" /> {Math.ceil(data.kpis.saldo_pendiente_remitar_ton / 28)} viajes aprox
                      </>
                    )}
                  </span>
                </div>
              </div>

              {/* Hierarchical Tree Section */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-6">
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>🌳</span> Estructura Jerárquica y Conciliación de Cantidades
                  </h3>
                  <span className="text-xs text-gray-500 font-medium">
                    Jerarquía: {data.tipo === 'PEDIDO' ? 'Pedido ➔ OC Vinculada ➔ Remitos' : 'OC ➔ Pedido Vinculado ➔ Remitos'}
                  </span>
                </div>

                {/* ROOT NODE */}
                <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-md">
                        {data.tipo} Original
                      </span>
                      <span className="text-base font-bold font-mono text-gray-900">
                        {data.referencia}
                      </span>
                      <span className="text-xs text-gray-500">
                        Fecha: {data.fecha || '-'}
                      </span>
                    </div>
                    <div className="text-base font-extrabold font-mono text-blue-700">
                      {data.cantidad_total_ton.toFixed(3)} Ton
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 mt-2 pt-2 border-t border-slate-200/60">
                    <span>{data.tipo === 'PEDIDO' ? 'Cliente' : 'Proveedor'}: <strong>{data.entidad_principal}</strong></span>
                    <span>Bolsas 50kg: <strong>{data.bolsas_50kg}</strong></span>
                    {data.precio_neto_kg && <span>Precio: <strong>${Number(data.precio_neto_kg).toFixed(2)}/kg</strong></span>}
                  </div>
                </div>

                {/* EMPTY STATE IF NO RAMAS */}
                {data.ramas.length === 0 && (
                  <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <Package className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <h4 className="text-sm font-semibold text-gray-700">Sin vinculaciones registradas</h4>
                    <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                      Este {data.tipo.toLowerCase()} aún no tiene órdenes de contraparte vinculadas. El total de {data.cantidad_total_ton.toFixed(3)} Ton está 100% disponible para ser calzado.
                    </p>
                  </div>
                )}

                {/* RAMAS VINCULADAS */}
                {data.ramas.map((rama, idx) => (
                  <div key={rama.vinculacion_id || idx} className="pl-6 border-l-2 border-brand-400 ml-4 space-y-3 relative">
                    {/* Branch Header Node */}
                    <div className="bg-brand-50/70 border border-brand-200 rounded-xl p-3.5">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-brand-800 uppercase">
                            Vinculado a {data.tipo === 'PEDIDO' ? 'OC' : 'Pedido'}:
                          </span>
                          <span className="text-sm font-bold font-mono text-brand-900">
                            {rama.referencia_contraparte}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200">
                            {rama.estado_vinculacion}
                          </span>
                        </div>
                        <div className="text-sm font-bold font-mono text-brand-900">
                          {rama.cantidad_vinculada_ton.toFixed(3)} Ton
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600 mt-2 pt-2 border-t border-brand-100">
                        <span>{data.tipo === 'PEDIDO' ? 'Proveedor' : 'Cliente'}: <strong>{rama.entidad_contraparte}</strong></span>
                        <span>Fecha: <strong>{rama.fecha_contraparte || '-'}</strong></span>
                      </div>
                    </div>

                    {/* NIETOS: REMITOS EMITIDOS */}
                    <div className="pl-6 border-l-2 border-dashed border-gray-300 ml-4 space-y-2">
                      {rama.remitos.length > 0 ? (
                        rama.remitos.map((r, rIdx) => (
                          <div 
                            key={r.remito_id || rIdx}
                            className="bg-white border border-gray-200 hover:border-gray-300 rounded-lg p-3 shadow-xs transition-colors"
                          >
                            <div className="flex justify-between items-center flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs font-mono text-gray-900">
                                  Remito: {r.remito_ref_externa}
                                </span>
                                <span className="text-[11px] text-gray-500">
                                  ({r.fecha})
                                </span>
                                <span className="text-[10px] px-2 py-0.2 bg-gray-100 text-gray-700 rounded font-medium">
                                  {r.estado || 'MISION_COMPLETADA'}
                                </span>
                              </div>
                              <div className="text-xs font-bold font-mono text-gray-900">
                                {r.cantidad_ton.toFixed(3)} Ton
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-x-4 text-[11px] text-gray-500 mt-1.5">
                              <span>Chofer: <strong className="text-gray-700">{r.chofer || 'Sin chofer'}</strong></span>
                              <span>Patente: <strong className="text-gray-700">{r.camion_patente || '-'}</strong></span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 italic">
                          ⏳ Sin remitos despachados aún para esta vinculación.
                        </div>
                      )}
                    </div>

                    {/* SUBTOTAL DE LA RAMA */}
                    <div className="ml-4 p-3 bg-gray-50 border border-gray-200 rounded-lg flex justify-between items-center flex-wrap gap-2 text-xs">
                      <div>
                        <span className="font-medium text-gray-600">Subtotal Remitos ({rama.referencia_contraparte}): </span>
                        <strong className="font-mono text-sm font-bold text-gray-900 ml-1">
                          {rama.subtotal_remitos_ton.toFixed(3)} Ton
                        </strong>
                      </div>
                      <div>
                        {rama.coincide_remitos ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Coincide con Vinculación ({rama.cantidad_vinculada_ton.toFixed(3)} Ton)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-semibold border border-rose-200">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                            Faltan {rama.saldo_pendiente_remito_ton.toFixed(3)} Ton por remitir
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* SALDO MADRE DISPONIBLE (REMANENTE SIN VINCULAR) */}
                {data.kpis.saldo_disponible_madre_ton > 0 && (
                  <div className="ml-4 p-3.5 bg-amber-50/80 border border-amber-300 rounded-xl flex justify-between items-center flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <div>
                        <span className="font-bold text-amber-900 block">
                          Saldo Disponible sin Vincular (Instancia Madre)
                        </span>
                        <span className="text-[11px] text-amber-700">
                          Cantidad libre disponible para calce con otras órdenes
                        </span>
                      </div>
                    </div>
                    <div className="font-bold font-mono text-sm text-amber-900">
                      {data.kpis.saldo_disponible_madre_ton.toFixed(3)} Ton
                    </div>
                  </div>
                )}

                {/* GLOBAL SUBTOTAL BAR */}
                <div className="mt-6 p-4 bg-emerald-50/60 border-2 border-emerald-300 rounded-xl flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <span className="text-xs font-bold text-gray-700 block uppercase">
                      Subtotal General de Vinculaciones:
                    </span>
                    <span className="text-lg font-black font-mono text-gray-900">
                      {data.kpis.total_vinculado_ton.toFixed(3)} <span className="text-xs font-sans font-medium text-gray-600">Ton</span>
                    </span>
                  </div>

                  <div>
                    {data.kpis.coincide_vinculacion_total ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300 shadow-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Coincide 100% con {data.tipo} ({data.cantidad_total_ton.toFixed(3)} Ton)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-100 text-rose-800 text-xs font-bold border border-rose-300 shadow-xs">
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        No coincide: Faltan vincular {data.kpis.saldo_pendiente_vincular_ton.toFixed(3)} Ton
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-gray-100 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500 flex-shrink-0">
          <span>Sistema Logístico Arquímedes Carrizo • Conciliación automática</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-medium text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg shadow-xs transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
