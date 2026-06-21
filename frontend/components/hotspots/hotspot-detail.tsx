"use client";

import { ArrowLeft, Sparkles, MapPin, Clock } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  SEVERITY_BADGE_CLASS,
  type Severity,
} from "@/lib/severity";
import { formatCause, formatRelative } from "@/lib/format";
import { isRising } from "./hotspot-map-inner";
import type { HotspotDetail } from "@/lib/types";

export function HotspotDetail({
  hotspot,
  onBack,
}: {
  hotspot: HotspotDetail;
  onBack: () => void;
}) {
  const sev = hotspot.severity as Severity;
  const trend = hotspot.incidents_7d.map((d) => ({
    day: new Date(d.day).toLocaleDateString("en-IN", { weekday: "short" }).charAt(0),
    count: d.count,
    full: new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
  }));
  const rising = isRising(hotspot);

  const causes = Object.entries(hotspot.cause_breakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCause = Math.max(...causes.map((c) => c[1]), 1);

  return (
    <div className="flex h-full animate-feed-in flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2} />
          <span className="text-[11px] tracking-wide uppercase">Back to list</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Title block */}
        <div className={cn("border-b border-border/60 px-4 py-4")}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 label-meta">
                <MapPin className="size-3" strokeWidth={2} />
                {formatCause(hotspot.dominant_cause)} hotspot
              </span>
              <h2 className="text-[17px] font-semibold leading-tight tracking-tight text-foreground">
                {hotspot.junction}
              </h2>
            </div>
            <span className={cn("sev", SEVERITY_BADGE_CLASS[sev])}>{hotspot.severity}</span>
          </div>
        </div>

        {/* Big stats */}
        <div className="grid grid-cols-2 divide-x divide-border/60 border-b border-border/60">
          <div className="px-4 py-4">
            <span className="label-meta">Incidents · 30 days</span>
            <div
              className={cn(
                "mt-1 font-mono text-[32px] font-semibold leading-none",
                `text-[var(--${sev})]`
              )}
            >
              {hotspot.total_incidents}
            </div>
            {rising && (
              <span className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-[var(--primary)]">
                <Sparkles className="size-2.5" strokeWidth={2.5} />
                rising trend
              </span>
            )}
          </div>
          <div className="px-4 py-4">
            <span className="label-meta flex items-center gap-1">
              <Clock className="size-2.5" strokeWidth={2} />
              Last incident
            </span>
            <div className="mt-1 font-mono text-[13px] font-medium text-foreground">
              {formatRelative(hotspot.last_incident_at)}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
              {hotspot.last_incident_at
                ? new Date(hotspot.last_incident_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—"}
            </div>
          </div>
        </div>

        {/* 7-day trend */}
        <div className="border-b border-border/60 px-4 py-4">
          <span className="label-section">7-day incident trend</span>
          <div className="mt-2 h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} interval={0} />
                <Tooltip
                  cursor={{ fill: "oklch(0.80 0.15 75 / 8%)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as { full: string; count: number };
                    return (
                      <div className="surface-raised px-2 py-1.5">
                        <div className="label-meta">{p.full}</div>
                        <div className="font-mono text-[12px] font-medium text-foreground">
                          {p.count} incident{p.count === 1 ? "" : "s"}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={18}>
                  {trend.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.count > 0 ? `var(--${sev})` : "var(--chart-track)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cause breakdown */}
        <div className="border-b border-border/60 px-4 py-4">
          <span className="label-section">Cause breakdown · 30 days</span>
          <div className="mt-2.5 flex flex-col gap-2">
            {causes.map(([cause, count]) => (
              <div key={cause} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">
                  {formatCause(cause)}
                </span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--chart-track)]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary"
                    style={{ width: `${(count / maxCause) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-mono text-[11px] text-foreground">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* AI recommendation */}
        <div className="px-4 py-4">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-primary" strokeWidth={2} />
            <span className="label-section text-primary/80">AI Recommendation</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-foreground">
            {hotspot.recommendation}
          </p>
        </div>
      </div>
    </div>
  );
}
