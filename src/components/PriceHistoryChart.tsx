"use client";

import { useMemo, useState } from "react";
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react";
import {
  formatArabicDateTime,
  formatArabicShortDate,
  formatChangePct,
  formatSdg,
  formatUsd,
} from "@/lib/gold-math";
import type { GoldPriceRecord } from "@/lib/types";

interface PriceHistoryChartProps {
  history: GoldPriceRecord[];
}

type RangeDays = 7 | 30;
type ChartSeriesKey =
  | "karat_21_sdg"
  | "karat_24_sdg"
  | "karat_18_sdg"
  | "gold_pound_sdg"
  | "ounce_usd";

const SERIES_OPTIONS: Array<{
  key: ChartSeriesKey;
  label: string;
  isUsd?: boolean;
}> = [
  { key: "karat_21_sdg", label: "عيار 21 (ج.س)" },
  { key: "karat_24_sdg", label: "عيار 24 (ج.س)" },
  { key: "karat_18_sdg", label: "عيار 18 (ج.س)" },
  { key: "gold_pound_sdg", label: "الجنيه الذهب (ج.س)" },
  { key: "ounce_usd", label: "الأونصة ($)", isUsd: true },
];

export function PriceHistoryChart({ history }: PriceHistoryChartProps) {
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [series, setSeries] = useState<ChartSeriesKey>("karat_21_sdg");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const selectedMeta =
    SERIES_OPTIONS.find((item) => item.key === series) ?? SERIES_OPTIONS[0];

  const filteredData = useMemo(() => {
    if (history.length === 0) return [];
    const latestTs = new Date(history[history.length - 1].recorded_at).getTime();
    const cutoff = latestTs - rangeDays * 24 * 60 * 60 * 1000;
    const sliced = history.filter(
      (item) => new Date(item.recorded_at).getTime() >= cutoff
    );
    return sliced.length >= 2 ? sliced : history.slice(-Math.min(history.length, rangeDays));
  }, [history, rangeDays]);

  const chartStats = useMemo(() => {
    if (filteredData.length === 0) {
      return { min: 0, max: 0, first: 0, last: 0, changePct: 0 };
    }
    const values = filteredData.map((d) => Number(d[series]));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const first = values[0];
    const last = values[values.length - 1];
    const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
    return { min, max, first, last, changePct };
  }, [filteredData, series]);

  const svgWidth = 860;
  const svgHeight = 300;
  const padLeft = 18;
  const padRight = 18;
  const padTop = 24;
  const padBottom = 36;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const points = useMemo(() => {
    if (filteredData.length === 0) return [];
    const span = Math.max(chartStats.max - chartStats.min, 1);
    const yMin = chartStats.min - span * 0.12;
    const yMax = chartStats.max + span * 0.12;
    const yRange = Math.max(yMax - yMin, 1);

    return filteredData.map((record, idx) => {
      const x =
        filteredData.length === 1
          ? padLeft + plotWidth / 2
          : padLeft + (idx / (filteredData.length - 1)) * plotWidth;
      const value = Number(record[series]);
      const y = padTop + plotHeight - ((value - yMin) / yRange) * plotHeight;
      return { x, y, value, record };
    });
  }, [filteredData, chartStats, series, plotWidth, plotHeight]);

  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    const bottomY = padTop + plotHeight;
    return `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${bottomY} L ${points[0].x.toFixed(1)} ${bottomY} Z`;
  }, [linePath, points, plotHeight]);

  const inspectedIndex =
    activeIndex !== null && activeIndex >= 0 && activeIndex < points.length
      ? activeIndex
      : points.length - 1;
  const inspectedPoint = points[inspectedIndex];

  const formatMetric = (val: number) =>
    selectedMeta.isUsd ? `$${formatUsd(val)}` : `${formatSdg(val)} ج.س`;

  return (
    <section
      id="history"
      className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
    >
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-amber-300">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
              حركة أسعار الذهب في السودان (آخر {rangeDays} يوماً)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              مؤشر تفاعلي لمتابعة المسار اليومي لأسعار الجرام والأونصة عبر السوق
              الموازي.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {([7, 30] as RangeDays[]).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  setRangeDays(days);
                  setActiveIndex(null);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  rangeDays === days
                    ? "bg-slate-950 text-amber-300 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                آخر {days} أيام
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Series selector + period KPIs */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {SERIES_OPTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSeries(item.key)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                series === item.key
                  ? "border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-500/40"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-[11px] text-slate-500">أعلى سعر</span>
            <span className="font-mono text-xs font-bold text-slate-900 tabular-nums sm:text-sm">
              {formatMetric(chartStats.max)}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-[11px] text-slate-500">أدنى سعر</span>
            <span className="font-mono text-xs font-bold text-slate-900 tabular-nums sm:text-sm">
              {formatMetric(chartStats.min)}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-[11px] text-slate-500">تغير الفترة</span>
            <span
              dir="ltr"
              className={`inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums sm:text-sm ${
                chartStats.changePct >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {chartStats.changePct >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {formatChangePct(chartStats.changePct)}
            </span>
          </div>
        </div>
      </div>

      {/* Inspected Point Details Banner */}
      {inspectedPoint && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-xs sm:text-sm">
          <div>
            <span className="text-slate-500">القراءة المحددة: </span>
            <strong className="text-slate-900">
              {formatArabicDateTime(inspectedPoint.record.recorded_at)}
            </strong>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>
              {selectedMeta.label}:{" "}
              <strong className="font-mono text-amber-900 tabular-nums">
                {formatMetric(inspectedPoint.value)}
              </strong>
            </span>
            <span className="text-slate-600">
              الأونصة:{" "}
              <strong dir="ltr" className="font-mono text-slate-900 tabular-nums">
                ${formatUsd(inspectedPoint.record.ounce_usd)}
              </strong>
            </span>
            <span className="text-slate-600">
              الموازي:{" "}
              <strong className="font-mono text-slate-900 tabular-nums">
                {formatSdg(inspectedPoint.record.parallel_usd_sdg)} ج.س
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* Responsive Interactive SVG Chart */}
      <div className="relative w-full overflow-hidden rounded-2xl border border-slate-100 bg-slate-950 p-3 sm:p-4">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="h-64 w-full select-none sm:h-72"
          role="img"
          aria-label={`رسم بياني لحركة ${selectedMeta.label} خلال آخر ${rangeDays} يوماً`}
          onMouseLeave={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id="goldAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#facc15" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#facc15" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal reference gridlines */}
          {[0.2, 0.5, 0.8].map((ratio) => {
            const y = padTop + plotHeight * ratio;
            return (
              <line
                key={ratio}
                x1={padLeft}
                x2={svgWidth - padRight}
                y1={y}
                y2={y}
                stroke="rgba(148, 163, 184, 0.16)"
                strokeDasharray="4 4"
              />
            );
          })}

          {areaPath && <path d={areaPath} fill="url(#goldAreaGrad)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#facc15"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Crosshair for inspected point */}
          {inspectedPoint && (
            <line
              x1={inspectedPoint.x}
              x2={inspectedPoint.x}
              y1={padTop}
              y2={padTop + plotHeight}
              stroke="rgba(250, 204, 21, 0.4)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}

          {/* Interactive hit targets & dots */}
          {points.map((p, idx) => {
            const isSelected = idx === inspectedIndex;
            const showLabel =
              idx === 0 ||
              idx === points.length - 1 ||
              idx === Math.floor(points.length / 2);

            return (
              <g key={p.record.id || idx}>
                {showLabel && (
                  <text
                    x={p.x}
                    y={svgHeight - 10}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="11"
                  >
                    {formatArabicShortDate(p.record.recorded_at)}
                  </text>
                )}

                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? 6.5 : 3.5}
                  fill={isSelected ? "#fde047" : "#f59e0b"}
                  stroke="#0f172a"
                  strokeWidth="2"
                />

                <rect
                  x={p.x - plotWidth / Math.max(points.length * 2, 2)}
                  y={padTop}
                  width={Math.max(plotWidth / Math.max(points.length, 1), 16)}
                  height={plotHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => setActiveIndex(idx)}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
