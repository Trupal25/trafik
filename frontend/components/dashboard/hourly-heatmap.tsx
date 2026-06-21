"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { DashboardResponse } from "@/lib/types";

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

export function HourlyHeatmap({
  data,
  dataAsOf,
}: {
  data: DashboardResponse["hourly_congestion"];
  dataAsOf?: string;
}) {
  const chartData = data.map((d) => ({
    hour: d.hour,
    label: `${String(d.hour).padStart(2, "0")}:00`,
    today: d.today,
    yesterday: d.yesterday,
  }));

  return (
    <div className="surface flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="label-section">24-hour incident volume</span>
          <span className="text-[11px] text-muted-foreground">
            Today vs prior 24h. Saffron = current window, dashed = baseline.
          </span>
        </div>
        <Legend2
          items={[
            { label: "Today", color: "var(--primary)", dashed: false },
            { label: "Yesterday", color: "var(--muted-foreground)", dashed: true },
          ]}
        />
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="todayFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
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
            <Tooltip
              cursor={{ stroke: "var(--primary)", strokeOpacity: 0.3 }}
              content={<HeatTooltip dataAsOf={dataAsOf} />}
            />
            <Area
              type="monotone"
              dataKey="yesterday"
              stroke="var(--muted-foreground)"
              strokeWidth={1.25}
              strokeDasharray="3 3"
              fill="transparent"
              dot={false}
              name="Yesterday"
            />
            <Area
              type="monotone"
              dataKey="today"
              stroke="var(--primary)"
              strokeWidth={1.75}
              fill="url(#todayFill)"
              dot={false}
              name="Today"
              activeDot={{ r: 3, fill: "var(--primary)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend2({
  items,
}: {
  items: { label: string; color: string; dashed: boolean }[];
}) {
  return (
    <div className="flex items-center gap-3">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span
            style={{
              backgroundColor: it.dashed ? "transparent" : it.color,
              borderColor: it.color,
              borderStyle: it.dashed ? "dashed" : "solid",
              borderWidth: it.dashed ? 0 : 0,
            }}
            className="inline-block h-[2px] w-4"
          />
          <span className="label-meta">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

function HeatTooltip({
  active,
  payload,
  label,
  dataAsOf,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  dataAsOf?: string;
}) {
  if (!active || !payload?.length) return null;
  const hr = typeof label === "number" ? `${String(label).padStart(2, "0")}:00` : label;
  return (
    <div className="surface-raised min-w-[140px] p-2.5">
      <div className="label-meta mb-1.5">{hr}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="inline-block h-[2px] w-3"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
          </span>
          <span className="font-mono font-medium text-foreground">{p.value}</span>
        </div>
      ))}
      {dataAsOf && (
        <div className="mt-1.5 border-t border-border pt-1 font-mono text-[9px] text-muted-foreground/60">
          data as of {new Date(dataAsOf).toLocaleString("en-IN")}
        </div>
      )}
    </div>
  );
}
