import { useState, useMemo } from 'react';
import type { OperacionItem, MetricUnit, StateDefinitionBasic } from '../types';
import { ExternalLink } from 'lucide-react';
import { cn } from '../../../../lib/utils';

interface StackedBarChartProps {
  items: OperacionItem[];
  allStates: StateDefinitionBasic[];
  metricUnit: MetricUnit;
  tipoEntidad: 'OC' | 'PEDIDO';
  onSelectItem: (item: OperacionItem) => void;
  showOnlyActiveStates: boolean;
}

export function StackedBarChart({
  items,
  allStates,
  metricUnit,
  tipoEntidad,
  onSelectItem,
  showOnlyActiveStates
}: StackedBarChartProps) {
  const [hoveredItem, setHoveredItem] = useState<{
    item: OperacionItem;
    x: number;
    y: number;
  } | null>(null);

  // Formateadores según métrica
  const formatMetricValue = (val: number, unit: MetricUnit): string => {
    if (unit === 'PESOS') {
      if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
      if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
      if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
      return `$${val.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
    }
    if (unit === 'TONELADAS') {
      return `${val.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Tn`;
    }
    return `${Math.round(val)} un.`;
  };

  const getItemValue = (item: OperacionItem, unit: MetricUnit): number => {
    if (unit === 'PESOS') return item.pesos || 0;
    if (unit === 'TONELADAS') return item.toneladas || 0;
    return 1; // Para CANTIDAD cada item vale 1
  };

  // Agrupar items por estado
  const columnsData = useMemo(() => {
    const map = new Map<string, OperacionItem[]>();

    items.forEach(item => {
      const stateKey = item.state_code;
      if (!map.has(stateKey)) {
        map.set(stateKey, []);
      }
      map.get(stateKey)!.push(item);
    });

    // Determinar la lista de estados a mostrar
    const statesToShow = showOnlyActiveStates
      ? allStates.filter(st => (map.get(st.state_code)?.length || 0) > 0)
      : allStates;

    return statesToShow.map(st => {
      const stateItems = map.get(st.state_code) || [];
      const totalValor = stateItems.reduce((acc, it) => acc + getItemValue(it, metricUnit), 0);
      
      const counts = {
        verde: stateItems.filter(it => it.color_alerta === 'VERDE').length,
        amarillo: stateItems.filter(it => it.color_alerta === 'AMARILLO').length,
        rojo: stateItems.filter(it => it.color_alerta === 'ROJO').length,
      };

      return {
        state_code: st.state_code,
        state_name: st.name,
        items: stateItems,
        totalValor,
        counts,
      };
    });
  }, [items, allStates, metricUnit, showOnlyActiveStates]);

  // Altura máxima para normalización
  const maxColumnValue = useMemo(() => {
    const max = Math.max(...columnsData.map(c => c.totalValor), 0);
    return max === 0 ? 10 : max * 1.15; // 15% de margen superior
  }, [columnsData]);

  // Dimensiones del gráfico
  const chartHeight = 380;
  const colWidth = 64;
  const colGap = 28;
  const totalWidth = Math.max(columnsData.length * (colWidth + colGap) + 120, 850);

  // Líneas de grilla para el eje Y
  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
    val: maxColumnValue * ratio,
    y: chartHeight - (chartHeight - 40) * ratio - 20,
  }));

  const getColorClass = (color: 'VERDE' | 'AMARILLO' | 'ROJO') => {
    switch (color) {
      case 'VERDE':
        return {
          fill: '#10b981', // emerald-500
          hover: '#059669',
          border: '#047857',
          bgBadge: 'bg-emerald-100 text-emerald-800 border-emerald-300'
        };
      case 'AMARILLO':
        return {
          fill: '#f59e0b', // amber-500
          hover: '#d97706',
          border: '#b45309',
          bgBadge: 'bg-amber-100 text-amber-800 border-amber-300'
        };
      case 'ROJO':
        return {
          fill: '#ef4444', // rose-500
          hover: '#dc2626',
          border: '#b91c1c',
          bgBadge: 'bg-rose-100 text-rose-800 border-rose-300'
        };
    }
  };

  return (
    <div className="relative w-full bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 overflow-hidden">
      {/* Cabecera del gráfico con leyenda y totales */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-100 mb-6">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span>Distribución de {tipoEntidad === 'OC' ? 'Órdenes de Compra' : 'Pedidos'} por Estado</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 font-semibold text-slate-700">
              {items.length} {tipoEntidad === 'OC' ? 'OCs' : 'Pedidos'} en rango
            </span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Segmentos apilados coloreados por tiempo desde la creación de la instancia. Haz clic en cualquier barra para ver su informe de trazabilidad.
          </p>
        </div>

        {/* Leyenda interactiva de SLA */}
        <div className="flex items-center gap-3 bg-gray-50/80 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm" />
            <span className="text-gray-700">&lt; 24h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-sm" />
            <span className="text-gray-700">24h - 48h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 inline-block shadow-sm" />
            <span className="text-gray-700">&gt; 48h</span>
          </div>
        </div>
      </div>

      {/* Contenedor del Gráfico con Scroll Horizontal amigable */}
      <div className="relative overflow-x-auto pb-4 custom-scrollbar">
        <svg
          viewBox={`0 0 ${totalWidth} ${chartHeight + 110}`}
          className="w-full min-w-[850px] select-none"
          style={{ height: '480px' }}
        >
          {/* Fondo y líneas de grilla */}
          {gridTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={80}
                y1={tick.y}
                x2={totalWidth - 30}
                y2={tick.y}
                stroke={i === 0 ? '#cbd5e1' : '#f1f5f9'}
                strokeWidth={i === 0 ? 1.5 : 1}
                strokeDasharray={i === 0 ? undefined : '4 4'}
              />
              <text
                x={70}
                y={tick.y + 4}
                textAnchor="end"
                className="text-[11px] font-medium fill-gray-600"
              >
                {formatMetricValue(tick.val, metricUnit)}
              </text>
            </g>
          ))}

          {/* Renderizado de Columnas Apiladas */}
          {columnsData.map((col, colIdx) => {
            const colX = 100 + colIdx * (colWidth + colGap);
            let currentStackY = chartHeight - 20; // base y (línea cero)

            return (
              <g key={col.state_code}>
                {/* Indicador de columna vacía si no hay registros */}
                {col.items.length === 0 && (
                  <rect
                    x={colX}
                    y={chartHeight - 25}
                    width={colWidth}
                    height={5}
                    rx={2.5}
                    fill="#e2e8f0"
                  />
                )}

                {/* Segmentos apilados */}
                {col.items.map((item, itemIdx) => {
                  const val = getItemValue(item, metricUnit);
                  // Calcular altura en píxeles proporcional
                  const heightPx = Math.max(
                    (val / maxColumnValue) * (chartHeight - 40),
                    metricUnit === 'CANTIDAD' ? 24 : 8 // Altura mínima para visibilidad
                  );
                  const segmentY = currentStackY - heightPx;
                  currentStackY = segmentY;

                  const colorStyles = getColorClass(item.color_alerta);
                  const isHovered = hoveredItem?.item.instancia_id === item.instancia_id;

                  return (
                    <g
                      key={item.instancia_id}
                      className="cursor-pointer transition-transform duration-150"
                      onClick={() => onSelectItem(item)}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredItem({
                          item,
                          x: rect.x + rect.width / 2,
                          y: rect.y
                        });
                      }}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      {/* Rectángulo del segmento */}
                      <rect
                        x={colX}
                        y={segmentY}
                        width={colWidth}
                        height={heightPx - 1.5} // 1.5px gap entre segmentos
                        rx={itemIdx === col.items.length - 1 ? 6 : 2}
                        fill={colorStyles.fill}
                        stroke={isHovered ? '#0f172a' : colorStyles.border}
                        strokeWidth={isHovered ? 2.5 : 0.8}
                        className={cn(
                          "transition-all duration-150 filter",
                          isHovered && "brightness-110 drop-shadow-md"
                        )}
                      />

                      {/* Etiqueta abreviada en el segmento si hay espacio suficiente */}
                      {heightPx >= 20 && (
                        <text
                          x={colX + colWidth / 2}
                          y={segmentY + heightPx / 2 + 1}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#ffffff"
                          className="text-[9.5px] font-bold pointer-events-none drop-shadow-sm"
                        >
                          {item.nro_documento.slice(-5)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Total numérico superior sobre la barra */}
                {col.totalValor > 0 && (
                  <text
                    x={colX + colWidth / 2}
                    y={currentStackY - 8}
                    textAnchor="middle"
                    className="text-[10px] font-bold fill-gray-700"
                  >
                    {formatMetricValue(col.totalValor, metricUnit)}
                  </text>
                )}

                {/* Etiqueta del Eje X: Código y Nombre de Estado */}
                <g transform={`translate(${colX + colWidth / 2}, ${chartHeight})`}>
                  {/* Badge con Código de Estado */}
                  <rect
                    x={-20}
                    y={10}
                    width={40}
                    height={20}
                    rx={6}
                    fill={col.items.length > 0 ? '#1e293b' : '#94a3b8'}
                  />
                  <text
                    x={0}
                    y={24}
                    textAnchor="middle"
                    className="text-[10px] font-bold fill-white"
                  >
                    {col.state_code}
                  </text>

                  {/* Nombre del Estado recortado o en dos líneas */}
                  <text
                    x={0}
                    y={44}
                    textAnchor="middle"
                    className="text-[9px] font-medium fill-gray-600"
                    width={colWidth + 20}
                  >
                    {col.state_name.length > 18
                      ? `${col.state_name.slice(0, 16)}...`
                      : col.state_name}
                  </text>

                  {/* Contador de items en ese estado */}
                  <text
                    x={0}
                    y={58}
                    textAnchor="middle"
                    className={cn(
                      "text-[9px] font-semibold",
                      col.items.length > 0 ? "fill-brand-600" : "fill-gray-400"
                    )}
                  >
                    {col.items.length} {col.items.length === 1 ? 'doc' : 'docs'}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Floating Tooltip HTML enriquecido al hacer Hover */}
      {hoveredItem && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700/60 text-xs w-72 animate-in fade-in-50 zoom-in-95 duration-100"
          style={{
            left: `${hoveredItem.x}px`,
            top: `${hoveredItem.y - 10}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          {/* Cabecera del Tooltip */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-700/80 mb-2">
            <span className="font-mono font-bold text-emerald-400 text-sm">
              {tipoEntidad === 'OC' ? 'OC' : 'PEDIDO'}: {hoveredItem.item.nro_documento}
            </span>
            <span className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border",
              hoveredItem.item.color_alerta === 'VERDE' && "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
              hoveredItem.item.color_alerta === 'AMARILLO' && "bg-amber-500/20 text-amber-300 border-amber-500/40",
              hoveredItem.item.color_alerta === 'ROJO' && "bg-rose-500/20 text-rose-300 border-rose-500/40"
            )}>
              {hoveredItem.item.horas_transcurridas.toFixed(1)} hs en estado
            </span>
          </div>

          {/* Detalles */}
          <div className="space-y-1.5 text-slate-300">
            <div>
              <span className="text-slate-400 font-medium">Entidad: </span>
              <span className="text-white font-semibold">{hoveredItem.item.entidad}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Estado: </span>
              <span className="text-slate-200">
                {hoveredItem.item.state_code}: {hoveredItem.item.state_name}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-800">
              <div>
                <p className="text-[10px] text-slate-400">Volumen:</p>
                <p className="text-white font-bold text-xs">{hoveredItem.item.toneladas} Tn</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Total en Pesos:</p>
                <p className="text-emerald-400 font-bold text-xs">
                  ${hoveredItem.item.pesos.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </div>

          {/* Footer Call to Action */}
          <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-brand-300 font-medium">
            <span className="flex items-center gap-1">
              <ExternalLink className="w-3.5 h-3.5 text-brand-400" />
              Ver Informe de Trazabilidad
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Click</span>
          </div>
        </div>
      )}
    </div>
  );
}
