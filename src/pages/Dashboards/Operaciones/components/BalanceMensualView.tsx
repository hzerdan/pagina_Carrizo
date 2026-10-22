import { useState, useMemo } from 'react';
import type { MesBalance } from '../types';
import { 
  Scale, DollarSign, Package, 
  ArrowUpRight, ArrowDownRight, Layers, BarChart2 
} from 'lucide-react';
import { cn } from '../../../../lib/utils';

interface BalanceMensualViewProps {
  balances: MesBalance[];
}

export function BalanceMensualView({ balances }: BalanceMensualViewProps) {
  const [balanceUnit, setBalanceUnit] = useState<'TONELADAS' | 'PESOS'>('TONELADAS');
  const [hoveredMes, setHoveredMes] = useState<MesBalance | null>(null);

  // Totales acumulados en todo el período seleccionado
  const kpis = useMemo(() => {
    const totalPedidosTn = balances.reduce((acc, m) => acc + m.pedidosTn, 0);
    const totalPedidosPesos = balances.reduce((acc, m) => acc + m.pedidosPesos, 0);
    const totalPedidosCount = balances.reduce((acc, m) => acc + m.pedidosCount, 0);

    const totalOcTn = balances.reduce((acc, m) => acc + m.ocTn, 0);
    const totalOcPesos = balances.reduce((acc, m) => acc + m.ocPesos, 0);
    const totalOcCount = balances.reduce((acc, m) => acc + m.ocCount, 0);

    const saldoNetoTn = totalPedidosTn - totalOcTn;
    const saldoNetoPesos = totalPedidosPesos - totalOcPesos;

    return {
      totalPedidosTn,
      totalPedidosPesos,
      totalPedidosCount,
      totalOcTn,
      totalOcPesos,
      totalOcCount,
      saldoNetoTn,
      saldoNetoPesos
    };
  }, [balances]);

  // Formato de moneda
  const formatPesos = (val: number) => {
    if (Math.abs(val) >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
  };

  const formatTn = (val: number) => {
    return `${val.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Tn`;
  };

  // Cálculo para el gráfico SVG
  const chartHeight = 300;
  const maxBarValue = useMemo(() => {
    const values = balances.map(m => 
      balanceUnit === 'TONELADAS' 
        ? Math.max(m.pedidosTn, m.ocTn)
        : Math.max(m.pedidosPesos, m.ocPesos)
    );
    const max = Math.max(...values, 0);
    return max === 0 ? 10 : max * 1.2;
  }, [balances, balanceUnit]);

  const barWidth = 28;
  const groupGap = 44;
  const totalSvgWidth = Math.max(balances.length * (barWidth * 2 + groupGap) + 120, 600);

  // Líneas de grilla
  const gridTicks = [0, 0.33, 0.66, 1].map(r => ({
    val: maxBarValue * r,
    y: chartHeight - (chartHeight - 40) * r - 20
  }));

  return (
    <div className="space-y-6">
      {/* Tarjetas Superiores de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card Pedidos (Ventas) */}
        <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/60 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-4 h-4 text-blue-600" />
              Pedidos (Ventas)
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
              {kpis.totalPedidosCount} doc.
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-black text-gray-900 tracking-tight">
              {formatTn(kpis.totalPedidosTn)}
            </p>
            <p className="text-sm font-semibold text-blue-600">
              {formatPesos(kpis.totalPedidosPesos)}
            </p>
          </div>
        </div>

        {/* Card Órdenes de Compra */}
        <div className="bg-white rounded-2xl border border-amber-100 p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/60 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-600" />
              Órdenes de Compra
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
              {kpis.totalOcCount} doc.
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-black text-gray-900 tracking-tight">
              {formatTn(kpis.totalOcTn)}
            </p>
            <p className="text-sm font-semibold text-amber-600">
              {formatPesos(kpis.totalOcPesos)}
            </p>
          </div>
        </div>

        {/* Card Saldo Neto Toneladas */}
        <div className={cn(
          "rounded-2xl border p-5 shadow-sm relative overflow-hidden bg-white",
          kpis.saldoNetoTn >= 0 ? "border-emerald-100" : "border-rose-100"
        )}>
          <div className="flex items-center justify-between mb-3">
            <span className={cn(
              "text-xs font-bold uppercase tracking-wider flex items-center gap-1.5",
              kpis.saldoNetoTn >= 0 ? "text-emerald-700" : "text-rose-700"
            )}>
              <Scale className="w-4 h-4" />
              Balance Neto (Tn)
            </span>
            <span className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1",
              kpis.saldoNetoTn >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            )}>
              {kpis.saldoNetoTn >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {kpis.saldoNetoTn >= 0 ? 'Demanda neta' : 'Compras excedentes'}
            </span>
          </div>
          <div className="space-y-1">
            <p className={cn(
              "text-2xl font-black tracking-tight",
              kpis.saldoNetoTn >= 0 ? "text-emerald-700" : "text-rose-700"
            )}>
              {kpis.saldoNetoTn >= 0 ? '+' : ''}{formatTn(kpis.saldoNetoTn)}
            </p>
            <p className="text-xs text-gray-500">
              Diferencia Pedidos vs OCs en volumen
            </p>
          </div>
        </div>

        {/* Card Balance Neto Pesos */}
        <div className={cn(
          "rounded-2xl border p-5 shadow-sm relative overflow-hidden bg-white",
          kpis.saldoNetoPesos >= 0 ? "border-emerald-100" : "border-rose-100"
        )}>
          <div className="flex items-center justify-between mb-3">
            <span className={cn(
              "text-xs font-bold uppercase tracking-wider flex items-center gap-1.5",
              kpis.saldoNetoPesos >= 0 ? "text-emerald-700" : "text-rose-700"
            )}>
              <DollarSign className="w-4 h-4" />
              Margen / Balance ($)
            </span>
            <span className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded-full",
              kpis.saldoNetoPesos >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            )}>
              {kpis.totalOcPesos > 0 ? `${((kpis.totalPedidosPesos / kpis.totalOcPesos) * 100).toFixed(0)}% cobertura` : 'N/A'}
            </span>
          </div>
          <div className="space-y-1">
            <p className={cn(
              "text-2xl font-black tracking-tight",
              kpis.saldoNetoPesos >= 0 ? "text-emerald-700" : "text-rose-700"
            )}>
              {kpis.saldoNetoPesos >= 0 ? '+' : ''}{formatPesos(kpis.saldoNetoPesos)}
            </p>
            <p className="text-xs text-gray-500">
              Diferencia valorizada en pesos
            </p>
          </div>
        </div>
      </div>

      {/* Gráfico Comparativo Mensual */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-100 mb-6">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-brand-600" />
              Evolución Mensual Comparada (Pedidos vs OCs)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Comparación mes a mes para visualizar si las compras de granos cubren la demanda de pedidos de clientes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Selector de Unidad para el Balance */}
            <div className="inline-flex p-1 bg-gray-100 rounded-xl border border-gray-200 text-xs font-semibold">
              <button
                onClick={() => setBalanceUnit('TONELADAS')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all",
                  balanceUnit === 'TONELADAS'
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                )}
              >
                ⚖️ Toneladas (Tn)
              </button>
              <button
                onClick={() => setBalanceUnit('PESOS')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all",
                  balanceUnit === 'PESOS'
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                )}
              >
                💲 Pesos ($)
              </button>
            </div>

            {/* Leyenda */}
            <div className="flex items-center gap-3 text-xs font-medium bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-blue-500 inline-block" />
                <span className="text-gray-700">Pedidos (Venta)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-amber-500 inline-block" />
                <span className="text-gray-700">OC (Compra)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico SVG */}
        <div className="relative overflow-x-auto pb-4 custom-scrollbar">
          <svg
            viewBox={`0 0 ${totalSvgWidth} ${chartHeight + 60}`}
            className="w-full min-w-[600px] select-none"
            style={{ height: '360px' }}
          >
            {/* Grilla Eje Y */}
            {gridTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={80}
                  y1={tick.y}
                  x2={totalSvgWidth - 30}
                  y2={tick.y}
                  stroke={i === 0 ? '#cbd5e1' : '#f1f5f9'}
                  strokeWidth={i === 0 ? 1.5 : 1}
                  strokeDasharray={i === 0 ? undefined : '4 4'}
                />
                <text
                  x={70}
                  y={tick.y + 4}
                  textAnchor="end"
                  className="text-[11px] font-medium fill-gray-500"
                >
                  {balanceUnit === 'TONELADAS' ? formatTn(tick.val) : formatPesos(tick.val)}
                </text>
              </g>
            ))}

            {/* Columnas agrupadas por Mes */}
            {balances.map((mes, idx) => {
              const groupX = 100 + idx * (barWidth * 2 + groupGap);
              const pedidosVal = balanceUnit === 'TONELADAS' ? mes.pedidosTn : mes.pedidosPesos;
              const ocVal = balanceUnit === 'TONELADAS' ? mes.ocTn : mes.ocPesos;

              const pedidosHeight = Math.max((pedidosVal / maxBarValue) * (chartHeight - 40), 4);
              const ocHeight = Math.max((ocVal / maxBarValue) * (chartHeight - 40), 4);

              const pedidosY = (chartHeight - 20) - pedidosHeight;
              const ocY = (chartHeight - 20) - ocHeight;

              const isHovered = hoveredMes?.mesClave === mes.mesClave;

              return (
                <g
                  key={mes.mesClave}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredMes(mes)}
                  onMouseLeave={() => setHoveredMes(null)}
                >
                  {/* Barra Pedidos */}
                  <rect
                    x={groupX}
                    y={pedidosY}
                    width={barWidth}
                    height={pedidosHeight}
                    rx={4}
                    fill="#3b82f6"
                    className={cn(
                      "transition-all duration-150",
                      isHovered ? "brightness-110 filter drop-shadow-sm" : "opacity-90"
                    )}
                  />

                  {/* Barra OC */}
                  <rect
                    x={groupX + barWidth + 4}
                    y={ocY}
                    width={barWidth}
                    height={ocHeight}
                    rx={4}
                    fill="#f59e0b"
                    className={cn(
                      "transition-all duration-150",
                      isHovered ? "brightness-110 filter drop-shadow-sm" : "opacity-90"
                    )}
                  />

                  {/* Etiqueta del Mes en Eje X */}
                  <text
                    x={groupX + barWidth + 2}
                    y={chartHeight + 10}
                    textAnchor="middle"
                    className={cn(
                      "text-[11px] font-semibold transition-colors",
                      isHovered ? "fill-brand-600 font-bold" : "fill-gray-700"
                    )}
                  >
                    {mes.mesEtiqueta}
                  </text>

                  {/* Saldo Neto Mensual */}
                  <g transform={`translate(${groupX + barWidth + 2}, ${chartHeight + 30})`}>
                    <rect
                      x={-28}
                      y={-10}
                      width={56}
                      height={18}
                      rx={6}
                      fill={mes.saldoTn >= 0 ? '#ecfdf5' : '#fff1f2'}
                      stroke={mes.saldoTn >= 0 ? '#a7f3d0' : '#fecdd3'}
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      className={cn(
                        "text-[9px] font-bold",
                        mes.saldoTn >= 0 ? "fill-emerald-700" : "fill-rose-700"
                      )}
                    >
                      {mes.saldoTn >= 0 ? `+${mes.saldoTn.toFixed(0)}T` : `${mes.saldoTn.toFixed(0)}T`}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Tabla Desglosada por Mes */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        <div className="p-4 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between">
          <h4 className="text-sm font-bold text-gray-900">
            Detalle Numérico de Saldos Mensuales
          </h4>
          <span className="text-xs text-gray-500">
            {balances.length} meses analizados
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-100">
              <tr>
                <th className="py-3 px-4">Mes</th>
                <th className="py-3 px-4 text-center">Docs (Ped / OC)</th>
                <th className="py-3 px-4 text-right">Pedidos (Tn)</th>
                <th className="py-3 px-4 text-right">OCs (Tn)</th>
                <th className="py-3 px-4 text-right font-bold">Saldo (Tn)</th>
                <th className="py-3 px-4 text-right">Pedidos ($)</th>
                <th className="py-3 px-4 text-right">OCs ($)</th>
                <th className="py-3 px-4 text-right font-bold">Saldo ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {balances.map(mes => (
                <tr key={mes.mesClave} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-bold text-gray-900">
                    {mes.mesEtiqueta}
                  </td>
                  <td className="py-3 px-4 text-center text-gray-600">
                    <span className="text-blue-600 font-semibold">{mes.pedidosCount}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="text-amber-600 font-semibold">{mes.ocCount}</span>
                  </td>
                  <td className="py-3 px-4 text-right text-blue-700">
                    {formatTn(mes.pedidosTn)}
                  </td>
                  <td className="py-3 px-4 text-right text-amber-700">
                    {formatTn(mes.ocTn)}
                  </td>
                  <td className={cn(
                    "py-3 px-4 text-right font-bold",
                    mes.saldoTn >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {mes.saldoTn >= 0 ? '+' : ''}{formatTn(mes.saldoTn)}
                  </td>
                  <td className="py-3 px-4 text-right text-blue-700">
                    {formatPesos(mes.pedidosPesos)}
                  </td>
                  <td className="py-3 px-4 text-right text-amber-700">
                    {formatPesos(mes.ocPesos)}
                  </td>
                  <td className={cn(
                    "py-3 px-4 text-right font-bold",
                    mes.saldoPesos >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {mes.saldoPesos >= 0 ? '+' : ''}{formatPesos(mes.saldoPesos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
