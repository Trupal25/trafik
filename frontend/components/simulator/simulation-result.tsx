"use client";

import { useEffect, useState } from "react";
import {
  ShieldAlert,
  Clock,
  Users,
  Construction,
  Route,
  FileText,
  Save,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEVERITY_BADGE_CLASS,
  normalizeSeverity,
  type Severity,
} from "@/lib/severity";
import { formatCause, formatDuration } from "@/lib/format";
import type { SimulateEventResponse } from "@/lib/types";
import type { SimulatorFormValues } from "./simulator-form";

export function SimulationResult({
  result,
  formValues,
}: {
  result: SimulateEventResponse;
  formValues: SimulatorFormValues;
}) {
  const impact = result.impact;
  const resources = result.resources;
  const severity = normalizeSeverity(impact.severity_level as string);
  const impactScore10 = Math.round((impact.score / 10) * 10) / 10;
  const prediction = result.prediction as { prediction?: string; probability?: number };

  return (
    <div className="flex flex-col gap-3">
      {/* Headline — risk level + scenario */}
      <RevealBlock delay={0}>
        <div className="surface-raised flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="label-meta">Simulation Result</span>
              <h2 className="text-lg font-semibold leading-tight tracking-tight text-foreground">
                {formValues.eventName}
              </h2>
              <span className="text-[12px] text-muted-foreground">
                {formatCause(formValues.cause)} at {formValues.junction.name}
              </span>
            </div>
            <span className={cn("sev text-sm", SEVERITY_BADGE_CLASS[severity])}>
              {severity} risk
            </span>
          </div>
        </div>
      </RevealBlock>

      {/* Impact score — animated bar */}
      <RevealBlock delay={100}>
        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <span className="label-section">Impact Score</span>
            <span className={cn("font-mono text-2xl font-semibold", `text-[var(--${severity})]`)}>
              {impactScore10}
              <span className="text-sm text-muted-foreground">/10</span>
            </span>
          </div>
          <ProgressBar value={impact.score} severity={severity} />
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            {impact.description}
          </p>
        </div>
      </RevealBlock>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <RevealBlock delay={200}>
          <MetricTile
            icon={Users}
            label="Officers Required"
            value={resources.officers.toString()}
            severity={severity}
          />
        </RevealBlock>
        <RevealBlock delay={260}>
          <MetricTile
            icon={Construction}
            label="Barricades"
            value={resources.barricades.toString()}
            severity={severity}
          />
        </RevealBlock>
        <RevealBlock delay={320}>
          <MetricTile
            icon={Clock}
            label="Expected Delay"
            value={formatDuration(impact.expected_delay_mins)}
            severity={severity}
          />
        </RevealBlock>
        <RevealBlock delay={380}>
          <MetricTile
            icon={Route}
            label="Diversion Routes"
            value={resources.diversion_routes.toString()}
            severity={severity}
          />
        </RevealBlock>
      </div>

      {/* ML prediction attribution */}
      {prediction.prediction && prediction.probability != null && (
        <RevealBlock delay={440}>
          <div className="surface flex items-center gap-3 p-4">
            <Cpu className="size-4 text-primary" strokeWidth={1.75} />
            <div className="flex flex-1 flex-col">
              <span className="label-meta">ML Prediction</span>
              <span className="text-[12px] text-foreground">
                Predicted cause:{" "}
                <span className="font-medium">{formatCause(prediction.prediction)}</span>
              </span>
            </div>
            <span className="font-mono text-sm font-semibold text-primary">
              {Math.round(prediction.probability * 100)}%
            </span>
          </div>
        </RevealBlock>
      )}

      {/* Recommended actions */}
      <RevealBlock delay={500}>
        <div className="surface flex flex-col gap-2 p-5">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="size-3 text-primary" strokeWidth={2} />
            <span className="label-section text-primary/80">Recommended Actions</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {resources.recommended_actions.slice(0, 6).map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                {action}
              </li>
            ))}
          </ul>
        </div>
      </RevealBlock>

      {/* Timestamp + model */}
      <RevealBlock delay={560}>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="label-meta">
            Generated {new Date(result.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </span>
          <span className="label-meta text-muted-foreground/60">
            RandomForest · Rules Engine
          </span>
        </div>
      </RevealBlock>

      {/* Post-simulation actions */}
      <RevealBlock delay={620}>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-foreground transition-colors hover:bg-sidebar-accent"
          >
            <FileText className="size-3.5" strokeWidth={2} />
            Generate Report
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-transparent px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-foreground transition-colors hover:bg-sidebar-accent"
          >
            <Save className="size-3.5" strokeWidth={2} />
            Save Simulation
          </button>
        </div>
      </RevealBlock>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  severity,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  severity: Severity;
}) {
  return (
    <div className="surface flex flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("size-3", `text-[var(--${severity})]`)} strokeWidth={2} />
        <span className="label-meta">{label}</span>
      </div>
      <span className={cn("font-mono text-xl font-semibold", `text-[var(--${severity})]`)}>
        {value}
      </span>
    </div>
  );
}

function ProgressBar({ value, severity }: { value: number; severity: Severity }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setWidth(value), 120);
    return () => clearTimeout(id);
  }, [value]);
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--chart-track)]">
      <div
        className={cn("h-full rounded-full transition-[width] duration-1000 ease-out", `bg-[var(--${severity})]`)}
        style={{ width: `${Math.min(100, width)}%` }}
      />
    </div>
  );
}

function RevealBlock({
  delay,
  children,
}: {
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-feed-in" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
