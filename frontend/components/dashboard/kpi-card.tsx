"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/use-count-up";
import { Sparkline } from "./sparkline";
import {
  SEVERITY_TEXT_CLASS,
  SEVERITY_FILL_CLASS,
  type Severity,
} from "@/lib/severity";

interface KpiCardProps {
  label: string;
  value: number;
  unit?: string;
  sparkline: number[];
  severity: Severity;
  delta?: number;
  delay?: number;
}

export function KpiCard({
  label,
  value,
  unit,
  sparkline,
  severity,
  delta = 0,
  delay = 0,
}: KpiCardProps) {
  const animated = useCountUp(value, { durationMs: 1100, from: 0 });
  const display =
    unit === "%" ? Math.round(animated) : animated.toFixed(unit === "/10" ? 1 : 0);

  const TrendIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : null;
  const trendColor =
    delta > 0 ? "text-[var(--high)]" : delta < 0 ? "text-[var(--low)]" : "text-muted-foreground";

  return (
    <div
      className={cn(
        "surface animate-feed-in relative flex flex-col gap-2 overflow-hidden p-3.5"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Severity leading bar — a 2px block at the top edge, colored by severity.
          Reads as an indicator, not a decorative side-stripe. */}
      <span
        className={cn("absolute left-0 top-0 h-[2px] w-full", SEVERITY_FILL_CLASS[severity])}
        aria-hidden
      />
      <span className="label-meta">{label}</span>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-0.5">
          <span
            className={cn(
              "font-mono text-[26px] font-semibold leading-none tracking-tight",
              SEVERITY_TEXT_CLASS[severity]
            )}
          >
            {display}
          </span>
          {unit && (
            <span className="font-mono text-[11px] text-muted-foreground">{unit}</span>
          )}
        </div>
        <Sparkline data={sparkline} color={`var(--${severity === "low" ? "low" : severity})`} />
      </div>
      <div className="flex h-3 items-center gap-1">
        {TrendIcon && (
          <span className={cn("flex items-center gap-0.5 font-mono text-[10px]", trendColor)}>
            <TrendIcon className="size-2.5" strokeWidth={2.5} />
            {Math.abs(delta)}
          </span>
        )}
        {!TrendIcon && (
          <span className="font-mono text-[10px] text-muted-foreground/70">vs prior</span>
        )}
      </div>
    </div>
  );
}
