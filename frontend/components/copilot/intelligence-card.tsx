"use client";

import { Route, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEVERITY_BADGE_CLASS, type Severity } from "@/lib/severity";
import type { CopilotCard } from "@/lib/types";

export function IntelligenceCard({ card }: { card: CopilotCard }) {
  const sev = (card.severity ?? "medium") as Severity;
  return (
    <div className="animate-feed-in surface-raised mt-2 flex flex-col gap-3 overflow-hidden p-0">
      {/* Header strip */}
      <div className={cn("flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5", `bg-[var(--${sev})]/8`)}>
        <div className="flex flex-col">
          <span className="label-meta">Intelligence Card</span>
          <span className="text-[13px] font-semibold leading-tight text-foreground">
            {card.title}
          </span>
        </div>
        <span className={cn("sev", SEVERITY_BADGE_CLASS[sev])}>{sev}</span>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        {/* Summary */}
        <p className="text-[13px] leading-relaxed text-foreground">{card.summary}</p>

        {/* Metrics grid */}
        {card.metrics?.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {card.metrics.map((m, i) => (
              <div key={i} className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <div className="label-meta">{m.label}</div>
                <div className={cn("mt-0.5 font-mono text-[15px] font-semibold", `text-[var(--${sev})]`)}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recommendations */}
        {card.recommendations?.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="size-3 text-primary" strokeWidth={2} />
              <span className="label-section text-primary/80">Recommendations</span>
            </div>
            <ul className="flex flex-col gap-1">
              {card.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Diversion routes */}
        {card.diversions?.length ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Route className="size-3 text-primary" strokeWidth={2} />
              <span className="label-section text-primary/80">Diversion Routes</span>
            </div>
            <div className="flex flex-col gap-1">
              {card.diversions.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-sm border border-border/60 bg-background/40 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-medium text-foreground">{d.from}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-muted-foreground">{d.via}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium text-foreground">{d.to}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Confidence + sources footer */}
        <div className="flex items-center justify-between border-t border-border/60 pt-2">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-2.5 text-primary" strokeWidth={2.5} />
            <span className="label-meta">
              confidence{" "}
              <span className="text-primary">{card.confidence ?? 80}%</span>
            </span>
          </span>
          {card.sources?.length ? (
            <span className="label-meta text-muted-foreground/60">
              {card.sources.join(" · ")}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
