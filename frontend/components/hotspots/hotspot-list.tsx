"use client";

import { useMemo } from "react";
import { ChevronRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEVERITY_BADGE_CLASS,
  SEVERITY_TEXT_CLASS,
  type Severity,
} from "@/lib/severity";
import { formatCause } from "@/lib/format";
import { isRising } from "./hotspot-map-inner";
import type { HotspotDetail } from "@/lib/types";

export function HotspotList({
  hotspots,
  selectedId,
  onSelect,
}: {
  hotspots: HotspotDetail[];
  selectedId: number | null;
  onSelect: (junctionCode: number) => void;
}) {
  const ranked = useMemo(
    () =>
      [...hotspots].sort(
        (a, b) =>
          ({"critical": 0, "high": 1, "medium": 2, "low": 3}[a.severity] ?? 4) -
          ({"critical": 0, "high": 1, "medium": 2, "low": 3}[b.severity] ?? 4) ||
        b.total_incidents - a.total_incidents
      ),
    [hotspots]
  );

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <span className="label-section">Ranked by Severity</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {ranked.map((h, i) => (
          <HotspotRow
            key={h.junction_code}
            hotspot={h}
            rank={i + 1}
            selected={h.junction_code === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function HotspotRow({
  hotspot,
  rank,
  selected,
  onSelect,
}: {
  hotspot: HotspotDetail;
  rank: number;
  selected: boolean;
  onSelect: (junctionCode: number) => void;
}) {
  const rising = isRising(hotspot);
  return (
    <button
      type="button"
      onClick={() => onSelect(hotspot.junction_code)}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors",
        selected
          ? "bg-primary/12"
          : "hover:bg-sidebar-accent/60"
      )}
    >
      <span className="w-5 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {hotspot.junction}
          </span>
          <span className={cn("sev", SEVERITY_BADGE_CLASS[hotspot.severity as Severity])}>
            {hotspot.severity}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="label-meta">{formatCause(hotspot.dominant_cause)}</span>
          <span className="label-meta">
            <span className={SEVERITY_TEXT_CLASS[hotspot.severity as Severity]}>
              {hotspot.total_incidents}
            </span>{" "}
            <span className="text-muted-foreground/70">/ 30d</span>
          </span>
          {rising && (
            <span className="flex items-center gap-0.5 font-mono text-[10px] text-[var(--primary)]">
              <TrendingUp className="size-2.5" strokeWidth={2.5} />
              rising
            </span>
          )}
        </div>
      </div>
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 transition-colors",
          selected ? "text-primary" : "text-muted-foreground"
        )}
        strokeWidth={2}
      />
    </button>
  );
}
