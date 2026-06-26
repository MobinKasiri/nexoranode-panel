"use client";

import { useMemo, useState } from "react";
import { cn, formatToman, toPersianDigits } from "@/lib/utils";

export type TrendPoint = {
  label: string;
  primary: number;
  secondary?: number;
};

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return toPersianDigits(
    d.toLocaleDateString("fa-IR", { month: "short", day: "numeric" })
  );
}

function formatAxisValue(n: number): string {
  if (n >= 1_000_000) return toPersianDigits(`${(n / 1_000_000).toFixed(1)}M`);
  if (n >= 1_000) return toPersianDigits(`${Math.round(n / 1_000)}K`);
  return toPersianDigits(n);
}

export function TrendAreaChart({
  data,
  primaryLabel = "درآمد",
  secondaryLabel,
  height = 280,
  className,
}: {
  data: TrendPoint[];
  primaryLabel?: string;
  secondaryLabel?: string;
  height?: number;
  className?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const layout = useMemo(() => {
    const pad = { top: 16, right: 12, bottom: 32, left: 48 };
    const width = 800;
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;

    const maxPrimary = Math.max(...data.map((d) => d.primary), 1);
    const maxSecondary = Math.max(...data.map((d) => d.secondary ?? 0), 1);

    const xAt = (i: number) =>
      pad.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const yPrimary = (v: number) => pad.top + innerH - (v / maxPrimary) * innerH;
    const ySecondary = (v: number) => pad.top + innerH - (v / maxSecondary) * innerH;

    const primaryPoints = data.map((d, i) => ({ x: xAt(i), y: yPrimary(d.primary), ...d, i }));
    const areaPath =
      primaryPoints.length === 0
        ? ""
        : `M ${primaryPoints[0].x} ${pad.top + innerH} ` +
          primaryPoints.map((p) => `L ${p.x} ${p.y}`).join(" ") +
          ` L ${primaryPoints[primaryPoints.length - 1].x} ${pad.top + innerH} Z`;

    const linePath = primaryPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    const secondaryPath =
      secondaryLabel && data.some((d) => d.secondary != null)
        ? data
            .map((d, i) => {
              const x = xAt(i);
              const y = ySecondary(d.secondary ?? 0);
              return `${i === 0 ? "M" : "L"} ${x} ${y}`;
            })
            .join(" ")
        : "";

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      y: pad.top + innerH * (1 - t),
      value: Math.round(maxPrimary * t),
    }));

    const xLabelStep = Math.max(1, Math.ceil(data.length / 6));

    return {
      width,
      pad,
      innerH,
      areaPath,
      linePath,
      secondaryPath,
      primaryPoints,
      yTicks,
      xLabelStep,
      xAt,
    };
  }, [data, height, secondaryLabel]);

  const hover = hoverIdx != null ? data[hoverIdx] : null;

  if (!data.length) {
    return (
      <div
        className={cn("flex items-center justify-center text-text-muted text-sm", className)}
        style={{ height }}
      >
        داده‌ای برای نمایش وجود ندارد
      </div>
    );
  }

  return (
    <div className={cn("relative select-none", className)}>
      <svg
        viewBox={`0 0 ${layout.width} ${height}`}
        className="w-full h-auto"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="trendAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(99 102 241 / 0.35)" />
            <stop offset="100%" stopColor="rgb(99 102 241 / 0.02)" />
          </linearGradient>
        </defs>

        {layout.yTicks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={layout.pad.left}
              x2={layout.width - layout.pad.right}
              y1={tick.y}
              y2={tick.y}
              stroke="rgb(42 45 62 / 0.8)"
              strokeDasharray="4 4"
            />
            <text
              x={layout.pad.left - 8}
              y={tick.y + 4}
              textAnchor="end"
              fill="#64748b"
              fontSize="10"
            >
              {formatAxisValue(tick.value)}
            </text>
          </g>
        ))}

        {layout.areaPath && <path d={layout.areaPath} fill="url(#trendAreaFill)" />}
        {layout.linePath && (
          <path d={layout.linePath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" />
        )}
        {layout.secondaryPath && (
          <path
            d={layout.secondaryPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeDasharray="6 4"
            strokeLinejoin="round"
          />
        )}

        {data.map((d, i) => {
          if (i % layout.xLabelStep !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={d.label}
              x={layout.xAt(i)}
              y={height - 8}
              textAnchor="middle"
              fill="#64748b"
              fontSize="10"
            >
              {formatShortDate(d.label)}
            </text>
          );
        })}

        {layout.primaryPoints.map((p) => (
          <rect
            key={p.i}
            x={p.x - 8}
            y={layout.pad.top}
            width={16}
            height={layout.innerH}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(p.i)}
          />
        ))}

        {hoverIdx != null && layout.primaryPoints[hoverIdx] && (
          <>
            <line
              x1={layout.primaryPoints[hoverIdx].x}
              x2={layout.primaryPoints[hoverIdx].x}
              y1={layout.pad.top}
              y2={layout.pad.top + layout.innerH}
              stroke="#6366f1"
              strokeOpacity={0.4}
            />
            <circle
              cx={layout.primaryPoints[hoverIdx].x}
              cy={layout.primaryPoints[hoverIdx].y}
              r={5}
              fill="#6366f1"
              stroke="#1a1d27"
              strokeWidth={2}
            />
          </>
        )}
      </svg>

      {hover && (
        <div className="absolute top-2 left-2 rounded-lg border border-border bg-surface/95 backdrop-blur px-3 py-2 text-xs shadow-lg pointer-events-none">
          <p className="text-text-muted mb-1">{formatShortDate(hover.label)}</p>
          <p className="text-text-primary font-medium">
            {primaryLabel}: {formatToman(hover.primary)}
          </p>
          {secondaryLabel && hover.secondary != null && (
            <p className="text-success mt-0.5">
              {secondaryLabel}: {toPersianDigits(hover.secondary)}
            </p>
          )}
        </div>
      )}

      {(secondaryLabel || primaryLabel) && (
        <div className="flex flex-wrap gap-4 mt-2 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-primary rounded" />
            {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-success rounded border-dashed" style={{ borderTop: "2px dashed #10b981" }} />
              {secondaryLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
