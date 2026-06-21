"use client";

import { useMemo } from "react";

/**
 * Minimal 7-point sparkline. Pure SVG, no library. Scales to its container.
 * Renders a faint baseline + a saffron line with a soft area fill.
 */
export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = "var(--primary)",
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  const { line, area, last } = useMemo(() => {
    if (!data.length) return { line: "", area: "", last: { x: 0, y: 0 } };
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const pad = 2;
    const stepX = (width - pad * 2) / Math.max(1, data.length - 1);
    const pts = data.map((v, i) => ({
      x: pad + i * stepX,
      y: pad + (height - pad * 2) * (1 - (v - min) / range),
    }));
    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    const area =
      `M${pts[0].x.toFixed(1)},${(height - pad).toFixed(1)} ` +
      pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
      ` L${pts[pts.length - 1].x.toFixed(1)},${(height - pad).toFixed(1)} Z`;
    return { line, area, last: pts[pts.length - 1] };
  }, [data, width, height]);

  if (!data.length) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={`spark-${color.replace(/[^a-z]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${color.replace(/[^a-z]/gi, "")})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={1.5} fill={color} />
    </svg>
  );
}
