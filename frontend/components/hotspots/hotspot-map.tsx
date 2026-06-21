"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { HotspotsExtendedResponse } from "@/lib/types";
import {
  HOTSPOT_LAYERS,
  type HotspotLayerKey,
} from "./hotspot-map-inner";

const HotspotMapInner = dynamic(
  () => import("./hotspot-map-inner").then((m) => m.HotspotMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="surface flex h-full min-h-[560px] items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="skeleton h-8 w-8 rounded-full" />
          <span className="label-meta">Loading hotspot map</span>
        </div>
      </div>
    ),
  }
);

const DEFAULT_LAYERS: Record<HotspotLayerKey, boolean> = {
  accident: true,
  construction: true,
  breakdown: true,
  waterlogging: true,
  congestion: true,
  predicted: true,
};

export function HotspotMap({
  hotspots,
  selectedId,
  onSelect,
  dataAsOf,
}: {
  hotspots: HotspotsExtendedResponse["hotspots"];
  selectedId: number | null;
  onSelect: (junctionCode: number) => void;
  dataAsOf?: string;
}) {
  const [layers, setLayers] = useState<Record<HotspotLayerKey, boolean>>(DEFAULT_LAYERS);
  const onToggle = useCallback((key: HotspotLayerKey) => {
    setLayers((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  return (
    <div className="relative h-full">
      <HotspotMapInner
        hotspots={hotspots}
        layers={layers}
        selectedId={selectedId}
        onSelect={onSelect}
        dataAsOf={dataAsOf}
      />
      {/* Layer toggles */}
      <div className="absolute right-3 top-3 z-10 flex max-w-[200px] flex-col gap-1 rounded-md border border-border bg-background/90 p-1.5 backdrop-blur-sm">
        <span className="label-section px-1.5 py-0.5">Hotspot Layers</span>
        {HOTSPOT_LAYERS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => onToggle(l.key)}
            className={cn(
              "flex items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors",
              layers[l.key]
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {l.shape === "triangle" ? (
              <span
                className="size-2 shrink-0"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderBottom: `7px solid ${l.color}`,
                  opacity: layers[l.key] ? 1 : 0.3,
                }}
              />
            ) : l.shape === "diamond" ? (
              <span
                className="size-2 shrink-0 rotate-45 rounded-sm"
                style={{
                  backgroundColor: layers[l.key] ? l.color : "transparent",
                  border: `1.5px solid ${l.color}`,
                }}
              />
            ) : (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: layers[l.key] ? l.color : "transparent",
                  border: `1.5px solid ${l.color}`,
                }}
              />
            )}
            <span className="text-[11px] tracking-tight">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
