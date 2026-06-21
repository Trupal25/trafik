"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  Legend as RechartsLegend,
} from "recharts";
import { Filter, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton, ErrorPanel } from "@/components/common/state";
import { useApi } from "@/lib/use-api";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SEVERITY_BADGE_CLASS,
  type Severity,
} from "@/lib/severity";
import { formatCause, formatTimestamp } from "@/lib/format";
import type { IntelligenceResponse } from "@/lib/types";

const CAUSE_OPTIONS = [
  "vehicle_breakdown", "pot_holes", "construction", "water_logging",
  "accident", "tree_fall", "congestion", "public_event", "procession",
  "vip_movement", "protest", "debris", "road_conditions", "fog_low_visibility",
];

const ZONE_OPTIONS = [
  { code: "1", name: "Central Zone 1" },
  { code: "2", name: "Central Zone 2" },
  { code: "3", name: "East Zone 1" },
  { code: "4", name: "East Zone 2" },
  { code: "5", name: "North Zone 1" },
  { code: "6", name: "North Zone 2" },
  { code: "7", name: "South Zone 1" },
  { code: "8", name: "South Zone 2" },
  { code: "9", name: "West Zone 1" },
  { code: "10", name: "West Zone 2" },
];

const CHART_COLORS = ["var(--primary)", "var(--critical)", "var(--high)", "var(--medium)", "var(--low)", "var(--chart-5)"];

export default function IntelligencePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cause, setCause] = useState("");
  const [zone, setZone] = useState("");

  const query = useMemo(
    () => ({ from: from || undefined, to: to || undefined, cause: cause || undefined, zone: zone || undefined }),
    [from, to, cause, zone]
  );

  const { data, error, loading, refetch } = useApi<IntelligenceResponse>(
    () => api.intelligence(query),
    { refetchMs: 0 }
  );

  return (
    <>
      <PageHeader
        eyebrow="03 / Historical Analytics"
        title="Event Intelligence"
        description="Pattern analysis across the full incident dataset: monthly trends, weekday vs weekend behaviour, zone-level breakdown, and cause distribution."
        actions={
          <Button size="sm" variant="outline" onClick={refetch} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin size-3" : "size-3"} strokeWidth={2} />
            Refresh
          </Button>
        }
        meta={
          data ? (
            <span className="label-meta">
              {data.total_in_scope.toLocaleString("en-IN")} events in scope
            </span>
          ) : null
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 border-b border-border bg-background/60 px-6 py-3 sm:px-8">
        <span className="label-section flex items-center gap-1.5">
          <Filter className="size-3 text-primary" strokeWidth={2} />
          Filters
        </span>
        <FilterField label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="intel-input" />
        </FilterField>
        <FilterField label="To">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="intel-input" />
        </FilterField>
        <FilterField label="Cause">
          <select value={cause} onChange={(e) => setCause(e.target.value)} className="intel-input">
            <option value="">All causes</option>
            {CAUSE_OPTIONS.map((c) => (
              <option key={c} value={c}>{formatCause(c)}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Zone">
          <select value={zone} onChange={(e) => setZone(e.target.value)} className="intel-input">
            <option value="">All zones</option>
            {ZONE_OPTIONS.map((z) => (
              <option key={z.code} value={z.code}>{z.name}</option>
            ))}
          </select>
        </FilterField>
        {(from || to || cause || zone) && (
          <button
            type="button"
            onClick={() => { setFrom(""); setTo(""); setCause(""); setZone(""); }}
            className="label-meta text-primary hover:underline"
          >
            Clear
          </button>
        )}
        <style jsx>{`
          .intel-input {
            height: 30px;
            padding: 0 8px;
            background: var(--input);
            border: 1px solid var(--border);
            border-radius: 3px;
            color: var(--foreground);
            font-size: 12px;
            font-family: var(--font-mono);
            outline: none;
          }
          .intel-input:focus { border-color: var(--primary); }
        `}</style>
      </div>

      <div className="flex-1 overflow-auto p-6 sm:p-8">
        {error && !data ? (
          <div className="surface"><ErrorPanel error={error} onRetry={refetch} /></div>
        ) : loading && !data ? (
          <IntelligenceSkeleton />
        ) : data ? (
          <div className="flex flex-col gap-4">
            {/* Asymmetric chart grid: trend (large) + donut */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
              <ChartCard title="Monthly Event Trends" subtitle="Operational · Crowd · Accident — Jan to Dec">
                <MonthlyTrendChart data={data.monthly_trends} />
              </ChartCard>
              <ChartCard title="Cause Distribution" subtitle="Breakdown by root cause">
                <CauseDonut data={data.cause_distribution} />
              </ChartCard>
            </div>

            {/* Zone stack + weekday/weekend */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
              <ChartCard title="Zone-wise Incident Distribution" subtitle="Stacked by dominant cause">
                <ZoneStackChart data={data.zone_distribution} />
              </ChartCard>
              <ChartCard title="Weekday vs Weekend" subtitle="Hourly distribution by day type">
                <WeekdayChart data={data.weekday_vs_weekend} />
              </ChartCard>
            </div>

            {/* Recent events table */}
            <RecentEventsTable events={data.recent_events} />
          </div>
        ) : null}
      </div>
    </>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-meta">{label}</span>
      {children}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-0.5">
        <span className="label-section">{title}</span>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function MonthlyTrendChart({ data }: { data: IntelligenceResponse["monthly_trends"] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={36} />
          <Tooltip cursor={{ fill: "oklch(0.80 0.15 75 / 6%)" }} content={<ChartTooltip />} />
          <Bar dataKey="operational" stackId="a" fill="var(--primary)" radius={[0, 0, 0, 0]} maxBarSize={28} name="Operational" />
          <Bar dataKey="event" stackId="a" fill="var(--medium)" name="Crowd / Event" />
          <Bar dataKey="accident" stackId="a" fill="var(--critical)" radius={[2, 2, 0, 0]} name="Accident" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CauseDonut({ data }: { data: IntelligenceResponse["cause_distribution"] }) {
  const top = data.slice(0, 8);
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={top}
              dataKey="count"
              nameKey="cause"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={1.5}
              stroke="var(--background)"
              strokeWidth={2}
            >
              {top.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-semibold text-foreground">
            {data.reduce((s, d) => s + d.count, 0).toLocaleString("en-IN")}
          </span>
          <span className="label-meta">total</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {top.map((d, i) => (
          <div key={d.cause} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="flex-1 truncate text-[11px] text-muted-foreground">
              {formatCause(d.cause)}
            </span>
            <span className="font-mono text-[11px] font-medium text-foreground">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ZoneStackChart({ data }: { data: IntelligenceResponse["zone_distribution"] }) {
  // Flatten top 4 causes per zone into stacked bars.
  const topCauses = useMemo(() => {
    const set = new Set<string>();
    data.forEach((z) => Object.keys(z.by_cause).forEach((c) => set.add(c)));
    return Array.from(set).slice(0, 5);
  }, [data]);
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="zone"
            tickLine={false}
            axisLine={false}
            width={84}
            tick={{ fontSize: 10 }}
          />
          <Tooltip cursor={{ fill: "oklch(0.80 0.15 75 / 6%)" }} content={<ChartTooltip />} />
          <RechartsLegend wrapperStyle={{ fontSize: 10 }} formatter={(v) => formatCause(String(v))} />
          {topCauses.map((c, i) => (
            <Bar
              key={c}
              dataKey={`by_cause.${c}`}
              stackId="a"
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              name={c}
              radius={i === topCauses.length - 1 ? [0, 2, 2, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeekdayChart({ data }: { data: IntelligenceResponse["weekday_vs_weekend"] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="wdFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="weFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--low)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--low)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="hour"
            tickFormatter={(h: number) => `${String(h).padStart(2, "0")}`}
            tickLine={false}
            axisLine={false}
            interval={3}
          />
          <YAxis tickLine={false} axisLine={false} width={36} />
          <Tooltip cursor={{ stroke: "var(--primary)", strokeOpacity: 0.3 }} content={<ChartTooltip />} />
          <Area type="monotone" dataKey="weekday" stroke="var(--primary)" strokeWidth={1.75} fill="url(#wdFill)" name="Weekday" />
          <Area type="monotone" dataKey="weekend" stroke="var(--low)" strokeWidth={1.5} strokeDasharray="3 3" fill="url(#weFill)" name="Weekend" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RecentEventsTable({ events }: { events: IntelligenceResponse["recent_events"] }) {
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="label-section">Recent Events</span>
        <span className="label-meta">{events.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border/60">
              <th className="px-5 py-2 label-meta">Cause</th>
              <th className="px-5 py-2 label-meta">Junction</th>
              <th className="px-5 py-2 label-meta">Zone</th>
              <th className="px-5 py-2 label-meta">Started</th>
              <th className="px-5 py-2 label-meta">Closure</th>
              <th className="px-5 py-2 label-meta">Severity</th>
              <th className="px-5 py-2 label-meta">Status</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr
                key={e.id || i}
                className="border-b border-border/40 transition-colors last:border-0 hover:bg-sidebar-accent/40"
              >
                <td className="px-5 py-2.5 text-[12px] text-foreground">{formatCause(e.cause)}</td>
                <td className="px-5 py-2.5 text-[12px] text-muted-foreground">{e.junction}</td>
                <td className="px-5 py-2.5 text-[12px] text-muted-foreground">{e.zone}</td>
                <td className="px-5 py-2.5 font-mono text-[11px] text-muted-foreground">{formatTimestamp(e.started_at)}</td>
                <td className="px-5 py-2.5">
                  {e.requires_road_closure ? (
                    <span className="font-mono text-[10px] text-[var(--high)]">YES</span>
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground/60">no</span>
                  )}
                </td>
                <td className="px-5 py-2.5">
                  <span className={cn("sev", SEVERITY_BADGE_CLASS[e.severity as Severity])}>
                    {e.severity}
                  </span>
                </td>
                <td className="px-5 py-2.5">
                  <span className="label-meta flex items-center gap-1.5">
                    {e.status === "active" && <span className="live-dot" />}
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const labelStr = typeof label === "number"
    ? `${String(label).padStart(2, "0")}:00`
    : label ?? "";
  return (
    <div className="surface-raised min-w-[120px] p-2">
      {labelStr && <div className="label-meta mb-1">{labelStr}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-[2px] w-3" style={{ backgroundColor: p.color }} />
            {formatCause(String(p.name ?? ""))}
          </span>
          <span className="font-mono font-medium text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function IntelligenceSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
