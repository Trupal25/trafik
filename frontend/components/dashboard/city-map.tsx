"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { DashboardResponse } from "@/lib/types";

type LayerKey =
  | "live"
  | "predicted"
  | "events"
  | "hotspots"
  | "officers"
  | "diversions";

const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  live: true,
  predicted: true,
  events: true,
  hotspots: false,
  officers: false,
  diversions: true,
};

// MapLibre needs window/WebGL — never render on the server.
const CityMapInner = dynamic(
  () => import("./city-map-inner").then((m) => m.CityMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="surface flex h-full min-h-[460px] items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="skeleton h-8 w-8 rounded-full" />
          <span className="label-meta">Loading live map</span>
        </div>
      </div>
    ),
  }
);

export function CityMap({
  incidents,
  dataAsOf,
}: {
  incidents: DashboardResponse["active_incidents"];
  dataAsOf?: string;
}) {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(DEFAULT_LAYERS);

  const onToggleLayer = useCallback((key: LayerKey) => {
    setLayers((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  return (
    <CityMapInner
      incidents={incidents}
      dataAsOf={dataAsOf}
      layers={layers}
      onToggleLayer={onToggleLayer}
    />
  );
}
