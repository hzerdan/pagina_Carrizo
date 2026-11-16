import { useState, useMemo } from 'react';
import type { 
  OperacionItem, 
  MetricUnit, 
  StateDefinitionBasic, 
  DrillDownFilter, 
  CurrencyMode 
} from '../types';
import { 
  ChevronRight, 
  ArrowLeft, 
  ExternalLink, 
  Layers, 
  Filter 
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { formatDateDDMMYYYY } from '../../../../lib/dateUtils';

interface StackedBarChartProps {
  items: OperacionItem[];
  allStates: StateDefinitionBasic[];
  metricUnit: MetricUnit;
  tipoEntidad: 'OC' | 'PEDIDO';
  currencyMode: CurrencyMode;
  onSelectItem: (item: OperacionItem) => void;
  showOnlyActiveStates: boolean;
  drillDown: DrillDownFilter | null;
  onDrillDown: (filter: DrillDownFilter | null) => void;
}

interface SlaBlockData {
  color: 'VERDE' | 'AMARILLO' | 'ROJO';
  valor: number;
  count: number;
  items: OperacionItem[];
}

interface StateColumnData {
  state_code: string;
  state_name: string;
  totalValor: number;
  totalCount: number;
  blocks: SlaBlockData[];
  items: OperacionItem[];
}

interface EntityColumnData {
  entidad: string;
  totalValor: number;
  totalCount: number;
  blocks: SlaBlockData[];
  items: OperacionItem[];
}

interface TooltipInfo {
  title: string;
  subtitle: string;
  badgeLabel?: string;
  badgeColor?: 'VERDE' | 'AMARILLO' | 'ROJO';
  metricLabel: string;
  count: number;
  entitiesSummary?: { name: string; count: number; val: number }[];
  actionHint: string;
  x: number;
  y: number;
}

export function StackedBarChart({
  items,
  allStates,
  metricUnit,
  tipoEntidad,
  currencyMode,
  onSelectItem,
  showOnlyActiveStates,
  drillDown,
  onDrillDown,
}: StackedBarChartProps) {
  const [hoveredTooltip, setHoveredTooltip] = useState<TooltipInfo | null>(null);

  // Formateador de métrica
  const formatMetricValue = (val: number, unit: MetricUnit, curr: CurrencyMode): string => {
    if (unit === 'PESOS') {
      const prefix = curr === 'USD' ? 'US$' : '$';
      if (Math.abs(val) >= 1_000_000_000) return `${prefix}${(val / 1_000_000_000).toFixed(1)}B`;
      if (Math.abs(val) >= 1_000_000) return `${prefix}${(val / 1_000_000).toFixed(1)}M`;
      if (Math.abs(val) >= 1_000) return `${prefix}${(val / 1_000).toFixed(0)}K`;
      return `${prefix}${val.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
    }
    if (unit === 'TONELADAS') {
      return `${val.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Tn`;
    }
    return `${Math.round(val)} un.`;
  };

  const getItemValue = (item: OperacionItem, unit: MetricUnit, curr: CurrencyMode): number => {
    if (unit === 'PESOS') {
      return curr === 'USD' ? (item.dolares || 0) : (item.pesos || 0);
    }
    if (unit === 'TONELADAS') return item.toneladas || 0;
    return 1;
  };

  const getColorStyles = (color: 'VERDE' | 'AMARILLO' | 'ROJO') => {
    switch (color) {
      case 'VERDE':
        return {
          fill: '#10b981', // emerald-500
          hover: '#059669',
          border: '#047857',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'AMARILLO':
        return {
          fill: '#f59e0b', // amber-500
          hover: '#d97706',
          border: '#b45309',
          badge: 'bg-amber-50 text-amber-700 border-amber-200',
        };
      case 'ROJO':
        return {
          fill: '#ef4444', // rose-500
          hover: '#dc2626',
          border: '#b91c1c',
          badge: 'bg-rose-50 text-rose-700 border-rose-200',
        };
    }
  };

  // ==========================================
  // DATOS MODO 1: Vista General por Estados
  // ==========================================
  const statesColumns = useMemo<StateColumnData[]>(() => {
    if (drillDown) return [];

    const map = new Map<string, OperacionItem[]>();
    items.forEach(it => {
      const k = it.state_code;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });

    const statesList = showOnlyActiveStates
      ? allStates.filter(st => (map.get(st.state_code)?.length || 0) > 0)
      : allStates;

    return statesList.map(st => {
      const stateItems = map.get(st.state_code) || [];
      const verdeItems = stateItems.filter(it => it.color_alerta === 'VERDE');
      const amarilloItems = stateItems.filter(it => it.color_alerta === 'AMARILLO');
      const rojoItems = stateItems.filter(it => it.color_alerta === 'ROJO');

      const blocks: SlaBlockData[] = [
        {
          color: 'VERDE',
          valor: verdeItems.reduce((acc, it) => acc + getItemValue(it, metricUnit, currencyMode), 0),
          count: verdeItems.length,
          items: verdeItems,
        },
        {
          color: 'AMARILLO',
          valor: amarilloItems.reduce((acc, it) => acc + getItemValue(it, metricUnit, currencyMode), 0),
          count: amarilloItems.length,
          items: amarilloItems,
        },
        {
          color: 'ROJO',
          valor: rojoItems.reduce((acc, it) => acc + getItemValue(it, metricUnit, currencyMode), 0),
          count: rojoItems.length,
          items: rojoItems,
        },
      ];

      const totalValor = blocks.reduce((acc, b) => acc + b.valor, 0);

      return {
        state_code: st.state_code,
        state_name: st.name,
        totalValor,
        totalCount: stateItems.length,
        blocks,
        items: stateItems,
      };
    });
  }, [items, allStates, metricUnit, currencyMode, showOnlyActiveStates, drillDown]);

  // ==========================================
  // DATOS MODO 2: Vista Drill-Down por Entidad
  // ==========================================
  const entityColumns = useMemo<EntityColumnData[]>(() => {
    if (!drillDown) return [];

    // Filtrar items por estado y opcionalmente color
    const filtered = items.filter(it => {
      if (it.state_code !== drillDown.stateCode) return false;
      if (drillDown.colorAlerta && it.color_alerta !== drillDown.colorAlerta) return false;
      return true;
    });

    // Agrupar por Entidad
    const map = new Map<string, OperacionItem[]>();
    filtered.forEach(it => {
      const ent = it.entidad || 'Sin Asignar';
      if (!map.has(ent)) map.set(ent, []);
      map.get(ent)!.push(it);
    });

    const list: EntityColumnData[] = Array.from(map.entries()).map(([entidad, entItems]) => {
      // Ordenar items de la entidad: Verde primero, luego Amarillo, luego Rojo; y por valor descendente dentro del mismo color
      const sortedItems = [...entItems].sort((a, b) => {
        const colorOrder = { VERDE: 1, AMARILLO: 2, ROJO: 3 };
        if (colorOrder[a.color_alerta] !== colorOrder[b.color_alerta]) {
          return colorOrder[a.color_alerta] - colorOrder[b.color_alerta];
        }
        return getItemValue(b, metricUnit, currencyMode) - getItemValue(a, metricUnit, currencyMode);
      });

      const totalValor = sortedItems.reduce((acc, it) => acc + getItemValue(it, metricUnit, currencyMode), 0);

      return {
        entidad,
        totalValor,
        totalCount: sortedItems.length,
        blocks: [],
        items: sortedItems,
      };
    });

    // Ordenar entidades de mayor a menor totalValor, y por cantidad si empatan
    return list.sort((a, b) => {
      if (b.totalValor !== a.totalValor) return b.totalValor - a.totalValor;
      return b.totalCount - a.totalCount;
    });
  }, [items, drillDown, metricUnit, currencyMode]);

  // Dimensiones y escalas
  const chartHeight = 360;
  const colWidth = 68;
  const colGap = 32;

  const activeColumnsCount = drillDown ? entityColumns.length : statesColumns.length;
  const totalWidth = Math.max(activeColumnsCount * (colWidth + colGap) + 140, 860);

  const maxColumnValue = useMemo(() => {
    const list = drillDown ? entityColumns : statesColumns;
    const max = Math.max(...list.map(c => c.totalValor), 0);
    return max === 0 ? 10 : max * 1.15;
  }, [drillDown, entityColumns, statesColumns]);

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
    val: maxColumnValue * ratio,
    y: chartHeight - (chartHeight - 40) * ratio - 20,
  }));

  // Resumen de entidades para el tooltip de un bloque de estado
  const getEntitiesSummaryForBlock = (blockItems: OperacionItem[]) => {
    const counts = new Map<string, { count: number; val: number }>();
    blockItems.forEach(it => {
      const e = it.entidad || 'Sin asignar';
      const prev = counts.get(e) || { count: 0, val: 0 };
      counts.set(e, {
        count: prev.count + 1,
        val: prev.val + getItemValue(it, metricUnit, currencyMode),
      });
    });
    return Array.from(counts.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 4);
  };

  return (
    <div className="relative w-full bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 overflow-hidden">
      {/* Cabecera del Gráfico */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-100 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900">
              {drillDown ? (
                <span>
                  Desglose por {tipoEntidad === 'OC' ? 'Proveedores' : 'Clientes'} - Estado {drillDown.stateCode}
                </span>
              ) : (
                <span>Distribución de {tipoEntidad === 'OC' ? 'Órdenes de Compra' : 'Pedidos'} por Estado</span>
              )}
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 font-semibold text-slate-700">
              {drillDown
                ? `${entityColumns.reduce((acc, e) => acc + e.totalCount, 0)} ${tipoEntidad === 'OC' ? 'OCs' : 'Pedidos'}`
                : `${items.length} ${tipoEntidad === 'OC' ? 'OCs' : 'Pedidos'} en rango`}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {drillDown ? (
              <span>
                Visualizando las entidades que componen este estado. Cada segmento representa una orden individual. Hacé clic en cualquier rebanada para abrir su informe de trazabilidad.
              </span>
            ) : (
              <span>
                Barras agrupadas por SLA. Hacé clic en un color para filtrar por esa criticidad, o en la base del estado para ver todos los colores.
              </span>
            )}
          </p>
        </div>

        {/* Leyenda interactiva de SLA */}
        <div className="flex items-center gap-3 bg-gray-50/90 px-3.5 py-1.5 rounded-xl border border-gray-200 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm" />
            <span className="text-gray-700">&lt; 12h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-sm" />
            <span className="text-gray-700">12h - 24h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 inline-block shadow-sm" />
            <span className="text-gray-700">&gt; 24h</span>
          </div>
        </div>
      </div>

      {/* Barra de Breadcrumb si hay Drill-Down activo */}
      {drillDown && (
        <div className="flex items-center justify-between bg-slate-50 border border-slate-200/90 rounded-xl px-4 py-2.5 mb-5 shadow-inner">
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => onDrillDown(null)}
              className="text-brand-600 hover:text-brand-800 font-bold hover:underline flex items-center gap-1 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-brand-600" />
              <span>Vista de Estados</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-800 font-bold">
              Estado {drillDown.stateCode}: {drillDown.stateName}
            </span>
            {drillDown.colorAlerta && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className={cn(
                  "px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1.5",
                  getColorStyles(drillDown.colorAlerta).badge
                )}>
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    drillDown.colorAlerta === 'VERDE' && "bg-emerald-500",
                    drillDown.colorAlerta === 'AMARILLO' && "bg-amber-500",
                    drillDown.colorAlerta === 'ROJO' && "bg-rose-500"
                  )} />
                  SLA {drillDown.colorAlerta === 'VERDE' ? '< 12h' : drillDown.colorAlerta === 'AMARILLO' ? '12h - 24h' : '> 24h'}
                </span>
              </>
            )}
          </div>

          <button
            onClick={() => onDrillDown(null)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 hover:text-slate-900 transition-all shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            Volver a Estados
          </button>
        </div>
      )}

      {/* Contenedor del Gráfico SVG con Scroll Horizontal */}
      <div className="relative overflow-x-auto pb-4 custom-scrollbar">
        {activeColumnsCount === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center text-slate-400">
            <Filter className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-xs font-semibold">No se encontraron registros para los filtros seleccionados.</p>
            {drillDown && (
              <button
                onClick={() => onDrillDown(null)}
                className="mt-3 text-xs text-brand-600 hover:underline font-bold"
              >
                Volver a la vista general de estados
              </button>
            )}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${totalWidth} ${chartHeight + 110}`}
            className="w-full min-w-[850px] select-none"
            style={{ height: '470px' }}
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
                  className="text-[11px] font-medium fill-gray-500"
                >
                  {formatMetricValue(tick.val, metricUnit, currencyMode)}
                </text>
              </g>
            ))}

            {/* ============================================================== */}
            {/* RENDER MODO 1: VISTA GENERAL POR ESTADOS                      */}
            {/* ============================================================== */}
            {!drillDown &&
              statesColumns.map((col, colIdx) => {
                const colX = 100 + colIdx * (colWidth + colGap);
                let currentStackY = chartHeight - 20;

                return (
                  <g key={col.state_code}>
                    {/* Indicador de columna vacía */}
                    {col.totalCount === 0 && (
                      <rect
                        x={colX}
                        y={chartHeight - 24}
                        width={colWidth}
                        height={4}
                        rx={2}
                        fill="#e2e8f0"
                      />
                    )}

                    {/* 3 Bloques Consolidados de Color (Verde abajo, Amarillo medio, Rojo arriba) */}
                    {col.blocks.map(block => {
                      if (block.count === 0) return null;

                      const heightPx = block.valor > 0
                        ? Math.max(
                            (block.valor / maxColumnValue) * (chartHeight - 40),
                            metricUnit === 'CANTIDAD' ? 22 : 12
                          )
                        : 14;
                      const segmentY = currentStackY - heightPx;
                      currentStackY = segmentY;

                      const colorStyles = getColorStyles(block.color);

                      return (
                        <g
                          key={block.color}
                          className="cursor-pointer transition-transform duration-150"
                          onClick={() => {
                            onDrillDown({
                              stateCode: col.state_code,
                              stateName: col.state_name,
                              colorAlerta: block.color,
                            });
                          }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredTooltip({
                              title: `Estado ${col.state_code}: ${col.state_name}`,
                              subtitle: `Alerta: ${block.color === 'VERDE' ? '< 12h' : block.color === 'AMARILLO' ? '12h - 24h' : '> 24h'}`,
                              badgeLabel: block.color,
                              badgeColor: block.color,
                              metricLabel: formatMetricValue(block.valor, metricUnit, currencyMode),
                              count: block.count,
                              entitiesSummary: getEntitiesSummaryForBlock(block.items),
                              actionHint: `Hacé clic para desglosar por ${tipoEntidad === 'OC' ? 'Proveedores' : 'Clientes'} de este color`,
                              x: rect.x + rect.width / 2,
                              y: rect.y,
                            });
                          }}
                          onMouseLeave={() => setHoveredTooltip(null)}
                        >
                          <rect
                            x={colX}
                            y={segmentY}
                            width={colWidth}
                            height={heightPx - 1.5}
                            rx={3}
                            fill={colorStyles.fill}
                            stroke={colorStyles.border}
                            strokeWidth={0.8}
                            className="hover:brightness-110 hover:drop-shadow-md transition-all duration-150"
                          />

                          {/* Etiqueta interna en el bloque si cabe */}
                          {heightPx >= 22 && (
                            <text
                              x={colX + colWidth / 2}
                              y={segmentY + heightPx / 2 + 1}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#ffffff"
                              className="text-[10px] font-bold pointer-events-none drop-shadow-sm select-none"
                            >
                              {block.count} {block.count === 1 ? 'doc' : 'docs'}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Total numérico sobre la barra */}
                    {col.totalValor > 0 && (
                      <text
                        x={colX + colWidth / 2}
                        y={currentStackY - 8}
                        textAnchor="middle"
                        className="text-[10px] font-bold fill-gray-800 select-none"
                      >
                        {formatMetricValue(col.totalValor, metricUnit, currencyMode)}
                      </text>
                    )}

                    {/* Base interactiva de Estado (Eje X) */}
                    <g
                      transform={`translate(${colX + colWidth / 2}, ${chartHeight})`}
                      className="cursor-pointer group"
                      onClick={() => {
                        onDrillDown({
                          stateCode: col.state_code,
                          stateName: col.state_name,
                        });
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredTooltip({
                          title: `Estado ${col.state_code}: ${col.state_name}`,
                          subtitle: 'Todos los colores acumulados',
                          metricLabel: formatMetricValue(col.totalValor, metricUnit, currencyMode),
                          count: col.totalCount,
                          entitiesSummary: getEntitiesSummaryForBlock(col.items),
                          actionHint: `Hacé clic para desglosar por ${tipoEntidad === 'OC' ? 'Proveedores' : 'Clientes'} con todos los colores`,
                          x: rect.x + rect.width / 2,
                          y: rect.y,
                        });
                      }}
                      onMouseLeave={() => setHoveredTooltip(null)}
                    >
                      {/* Badge con Código de Estado */}
                      <rect
                        x={-20}
                        y={10}
                        width={40}
                        height={20}
                        rx={6}
                        fill={col.totalCount > 0 ? '#1e293b' : '#94a3b8'}
                        className="group-hover:fill-brand-600 transition-colors"
                      />
                      <text
                        x={0}
                        y={24}
                        textAnchor="middle"
                        className="text-[10px] font-bold fill-white select-none"
                      >
                        {col.state_code}
                      </text>

                      {/* Nombre del Estado */}
                      <text
                        x={0}
                        y={44}
                        textAnchor="middle"
                        className="text-[9.5px] font-medium fill-gray-600 group-hover:fill-brand-700 transition-colors select-none"
                      >
                        {col.state_name.length > 17
                          ? `${col.state_name.slice(0, 15)}...`
                          : col.state_name}
                      </text>

                      {/* Cantidad total de docs */}
                      <text
                        x={0}
                        y={58}
                        textAnchor="middle"
                        className={cn(
                          "text-[9px] font-bold select-none",
                          col.totalCount > 0 ? "fill-brand-600" : "fill-gray-400"
                        )}
                      >
                        {col.totalCount} {col.totalCount === 1 ? 'doc' : 'docs'}
                      </text>
                    </g>
                  </g>
                );
              })}

            {/* ============================================================== */}
            {/* RENDER MODO 2: VISTA DRILL-DOWN POR ENTIDAD (CLIENTE/PROVEEDOR) */}
            {/* ============================================================== */}
            {drillDown &&
              entityColumns.map((col, colIdx) => {
                const colX = 100 + colIdx * (colWidth + colGap);
                let currentStackY = chartHeight - 20;

                return (
                  <g key={col.entidad}>
                    {/* Segmentos individuales por cada Documento/OC/Pedido */}
                    {col.items.map((item, itemIdx) => {
                      const val = getItemValue(item, metricUnit, currencyMode);
                      const heightPx = val > 0
                        ? Math.max(
                            (val / maxColumnValue) * (chartHeight - 40),
                            metricUnit === 'CANTIDAD' ? 24 : 14
                          )
                        : 14;
                      const segmentY = currentStackY - heightPx;
                      currentStackY = segmentY;

                      const colorStyles = getColorStyles(item.color_alerta);
                      const isTopItem = itemIdx === col.items.length - 1;

                      return (
                        <g
                          key={item.instancia_id}
                          className="cursor-pointer transition-transform duration-150"
                          onClick={() => onSelectItem(item)}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredTooltip({
                              title: `${tipoEntidad === 'OC' ? 'OC' : 'Pedido'}: ${item.nro_documento}`,
                              subtitle: `${col.entidad} · Estado ${drillDown.stateCode} (${drillDown.stateName})`,
                              badgeLabel: `${item.color_alerta} (${item.horas_transcurridas.toFixed(1)}h)`,
                              badgeColor: item.color_alerta,
                              metricLabel: formatMetricValue(val, metricUnit, currencyMode),
                              count: 1,
                              entitiesSummary: [
                                { name: `Volumen: ${item.toneladas.toFixed(1)} Tn`, count: 1, val },
                                { 
                                  name: `Fecha: ${formatDateDDMMYYYY(item.fecha_documento)} · Mercado: ${item.tipo_mercado}`, 
                                  count: 1, 
                                  val 
                                },
                              ],
                              actionHint: `Hacé clic para ver el informe de trazabilidad de esta ${tipoEntidad === 'OC' ? 'OC' : 'orden'}`,
                              x: rect.x + rect.width / 2,
                              y: rect.y,
                            });
                          }}
                          onMouseLeave={() => setHoveredTooltip(null)}
                        >
                          <rect
                            x={colX}
                            y={segmentY}
                            width={colWidth}
                            height={heightPx - 1.5}
                            rx={isTopItem ? 4 : 2}
                            fill={colorStyles.fill}
                            stroke={colorStyles.border}
                            strokeWidth={0.8}
                            className="hover:brightness-110 hover:drop-shadow-md transition-all duration-150"
                          />

                          {/* Etiqueta interna con número de documento si cabe */}
                          {heightPx >= 16 && (
                            <text
                              x={colX + colWidth / 2}
                              y={segmentY + heightPx / 2 + 1}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#ffffff"
                              className="text-[9.5px] font-bold pointer-events-none drop-shadow-sm select-none"
                            >
                              {item.nro_documento.length > 7
                                ? item.nro_documento.slice(-5)
                                : item.nro_documento}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Total sobre la columna */}
                    {col.totalCount > 0 && (
                      <text
                        x={colX + colWidth / 2}
                        y={currentStackY - 8}
                        textAnchor="middle"
                        className="text-[10px] font-bold fill-gray-800 select-none"
                      >
                        {formatMetricValue(col.totalValor, metricUnit, currencyMode)}
                      </text>
                    )}

                    {/* Base de la Entidad (Eje X) */}
                    <g
                      transform={`translate(${colX + colWidth / 2}, ${chartHeight})`}
                      className="cursor-pointer group"
                      onClick={() => {
                        if (col.items.length > 0) {
                          onSelectItem(col.items[0]);
                        }
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredTooltip({
                          title: col.entidad,
                          subtitle: `Estado ${drillDown.stateCode}: ${drillDown.stateName}`,
                          metricLabel: formatMetricValue(col.totalValor, metricUnit, currencyMode),
                          count: col.totalCount,
                          entitiesSummary: col.items.slice(0, 4).map(it => ({
                            name: it.nro_documento,
                            count: 1,
                            val: getItemValue(it, metricUnit, currencyMode),
                          })),
                          actionHint: 'Hacé clic para ver el informe de trazabilidad',
                          x: rect.x + rect.width / 2,
                          y: rect.y,
                        });
                      }}
                      onMouseLeave={() => setHoveredTooltip(null)}
                    >
                      {/* Icono / Mini Badge */}
                      <rect
                        x={-14}
                        y={10}
                        width={28}
                        height={18}
                        rx={5}
                        fill="#334155"
                        className="group-hover:fill-brand-600 transition-colors"
                      />
                      <text
                        x={0}
                        y={22}
                        textAnchor="middle"
                        className="text-[9px] font-bold fill-white select-none"
                      >
                        #{colIdx + 1}
                      </text>

                      {/* Nombre recortado de la Entidad */}
                      <text
                        x={0}
                        y={42}
                        textAnchor="middle"
                        className="text-[9.5px] font-medium fill-gray-700 group-hover:fill-brand-700 transition-colors select-none"
                      >
                        {col.entidad.length > 14
                          ? `${col.entidad.slice(0, 12)}...`
                          : col.entidad}
                      </text>

                      {/* Total docs */}
                      <text
                        x={0}
                        y={56}
                        textAnchor="middle"
                        className="text-[9px] font-bold fill-brand-600 select-none"
                      >
                        {col.totalCount} {col.totalCount === 1 ? 'doc' : 'docs'}
                      </text>
                    </g>
                  </g>
                );
              })}
          </svg>
        )}
      </div>

      {/* Floating Tooltip Enriquecido */}
      {hoveredTooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700/70 text-xs w-76 animate-in fade-in-50 zoom-in-95 duration-100"
          style={{
            left: `${hoveredTooltip.x}px`,
            top: `${hoveredTooltip.y - 12}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-700/80 mb-2 gap-2">
            <span className="font-bold text-white text-xs truncate max-w-[180px]">
              {hoveredTooltip.title}
            </span>
            {hoveredTooltip.badgeLabel && hoveredTooltip.badgeColor && (
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border shrink-0",
                hoveredTooltip.badgeColor === 'VERDE' && "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
                hoveredTooltip.badgeColor === 'AMARILLO' && "bg-amber-500/20 text-amber-300 border-amber-500/40",
                hoveredTooltip.badgeColor === 'ROJO' && "bg-rose-500/20 text-rose-300 border-rose-500/40"
              )}>
                {hoveredTooltip.badgeLabel}
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400 mb-2">{hoveredTooltip.subtitle}</p>

          {/* Métricas Principales */}
          <div className="grid grid-cols-2 gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-700/50 mb-2.5">
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Volumen / Monto:</p>
              <p className="text-emerald-400 font-bold text-xs">{hoveredTooltip.metricLabel}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Documentos:</p>
              <p className="text-white font-bold text-xs">{hoveredTooltip.count} un.</p>
            </div>
          </div>

          {/* Desglose de Entidades o Documentos */}
          {hoveredTooltip.entitiesSummary && hoveredTooltip.entitiesSummary.length > 0 && (
            <div className="space-y-1 mb-2.5 pt-1 border-t border-slate-800">
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Composición principal:
              </p>
              <div className="space-y-1">
                {hoveredTooltip.entitiesSummary.map((ent, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300 truncate max-w-[160px]">{ent.name}</span>
                    <span className="text-slate-400 font-mono text-[10px]">
                      {ent.count > 1 ? `${ent.count} docs · ` : ''}
                      {formatMetricValue(ent.val, metricUnit, currencyMode)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Call to Action */}
          <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[10.5px] text-brand-300 font-medium">
            <span className="flex items-center gap-1">
              <ExternalLink className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <span>{hoveredTooltip.actionHint}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
