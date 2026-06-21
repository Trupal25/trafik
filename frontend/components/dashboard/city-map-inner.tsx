"use client";

import { useMemo } from "react";
import { Map, Marker, NavigationControl, ScaleControl } from "react-map-gl/maplibre";
import { cn } from "@/lib/utils";
import { SEVERITY_HEX, type Severity } from "@/lib/severity";
import { formatCause } from "@/lib/format";
import type { DashboardResponse } from "@/lib/types";
import "maplibre-gl/dist/maplibre-gl.css";

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL;
const BLR_CENTER = { latitude: 12.9716, longitude: 77.5946 };

type LayerKey =
  | "live"
  | "predicted"
  | "events"
  | "hotspots"
  | "officers"
  | "diversions";

const LAYERS: { key: LayerKey; label: string; color: string }[] = [
  { key: "live", label: "Live Traffic", color: SEVERITY_HEX.high },
  { key: "predicted", label: "Predicted Risk", color: SEVERITY_HEX.critical },
  { key: "events", label: "Event Zones", color: SEVERITY_HEX.medium },
  { key: "hotspots", label: "Risk Hotspots", color: SEVERITY_HEX.critical },
  { key: "officers", label: "Officer Deployment", color: SEVERITY_HEX.low },
  { key: "diversions", label: "Diversion Routes", color: SEVERITY_HEX.medium },
];

const EVENT_CAUSES = new Set(["public_event", "procession", "vip_movement", "protest"]);

interface CityMapInnerProps {
  incidents: DashboardResponse["active_incidents"];
  dataAsOf?: string;
  layers: Record<LayerKey, boolean>;
  onToggleLayer: (key: LayerKey) => void;
}

export function CityMapInner({
  incidents,
  dataAsOf,
  layers,
  onToggleLayer,
}: CityMapInnerProps) {
  const visible = useMemo(() => {
    const out: DashboardResponse["active_incidents"] = [];
    const seen = new Set<string>();
    for (const inc of incidents) {
      if (seen.has(inc.id)) continue;
      const match =
        layers.live ||
        (layers.predicted && (inc.severity === "critical" || inc.severity === "high")) ||
        (layers.events && EVENT_CAUSES.has(inc.cause)) ||
        (layers.diversions && inc.requires_road_closure);
      if (match) {
        out.push(inc);
        seen.add(inc.id);
      }
    }
    return out.slice(0, 60);
  }, [incidents, layers]);

  if (!TILE_URL) {
    return (
      <div className="surface relative flex h-full min-h-[460px] items-center justify-center">
        <span className="label-meta">NEXT_PUBLIC_MAP_TILE_URL unset</span>
      </div>
    );
  }

  return (
    <div className="surface relative h-full min-h-[460px] overflow-hidden">
      <Map
        initialViewState={{ ...BLR_CENTER, zoom: 11.2 }}
        mapStyle={TILE_URL}
        interactiveLayerIds={[]}
        dragRotate={false}
        pitch={0}
        maxBounds={[[77.30, 12.78], [77.78, 13.12]]}
      >
        <ScaleControl unit="metric" position="bottom-left" />
        <NavigationControl position="bottom-right" showCompass={false} />

        {visible.map((inc) => (
          <Marker key={inc.id} latitude={inc.lat} longitude={inc.lng} anchor="center">
            <IncidentDot
              severity={inc.severity as Severity}
              cause={inc.cause}
              requiresClosure={inc.requires_road_closure}
            />
          </Marker>
        ))}

        {layers.officers && <OfficerLayer incidents={visible} />}
      </Map>

      {/* LIVE indicator */}
      <div className="pointer-events-none absolute left-3 top-3 z-10">
        <div className="flex items-center gap-1.5 rounded-sm border border-border bg-background/85 px-2 py-1 backdrop-blur-sm">
          <span className="live-dot" />
          <span className="label-meta text-primary">Live</span>
        </div>
      </div>

      {/* Layer toggles */}
      <div className="absolute right-3 top-3 z-10 flex max-w-[180px] flex-col gap-1 rounded-md border border-border bg-background/90 p-1.5 backdrop-blur-sm">
        <span className="label-section px-1.5 py-0.5">Layers</span>
        {LAYERS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => onToggleLayer(l.key)}
            className={cn(
              "flex items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors",
              layers[l.key]
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{
                backgroundColor: layers[l.key] ? l.color : "transparent",
                border: `1.5px solid ${l.color}`,
              }}
            />
            <span className="text-[11px] tracking-tight">{l.label}</span>
          </button>
        ))}
      </div>

      {dataAsOf && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-sm border border-border bg-background/85 px-2 py-1 backdrop-blur-sm">
          <span className="label-meta">
            Data as of{" "}
            {new Date(dataAsOf).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>
      )}
    </div>
  );
}

function IncidentDot({
  severity,
  cause,
  requiresClosure,
}: {
  severity: Severity;
  cause: string;
  requiresClosure: boolean;
}) {
  const color = SEVERITY_HEX[severity];
  const pulse = severity === "critical" || severity === "high";
  return (
    <div
      className="group relative -ml-1.5 -mt-1.5 cursor-pointer"
      title={`${formatCause(cause)} · ${severity}${requiresClosure ? " · closure" : ""}`}
    >
      {pulse && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: color,
            animation:
              "pulse-marker 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite",
          }}
        />
      )}
      <span
        className="relative block rounded-full border-2"
        style={{
          width: requiresClosure ? 12 : 9,
          height: requiresClosure ? 12 : 9,
          backgroundColor: color,
          borderColor: "oklch(0.17 0.008 40)",
          boxShadow: `0 0 0 1px ${color}`,
        }}
      />
    </div>
  );
}

function OfficerLayer({
  incidents,
}: {
  incidents: DashboardResponse["active_incidents"];
}) {
  const positions = useMemo(() => {
    const high = incidents.filter(
      (i) => i.severity === "critical" || i.severity === "high"
    );
    return high.slice(0, 12);
  }, [incidents]);
  return (
    <>
      {positions.map((p, i) => (
        <Marker
          key={`off-${p.id}-${i}`}
          latitude={p.lat + 0.002}
          longitude={p.lng + 0.002}
          anchor="center"
        >
          <div
            className="-ml-1.5 -mt-1.5 size-3 rounded-full border-2"
            style={{
              backgroundColor: "transparent",
              borderColor: SEVERITY_HEX.low,
              boxShadow: "0 0 0 1px oklch(0.17 0.008 40)",
            }}
            title={`Officer unit ${i + 1} — model-estimated position`}
          />
        </Marker>
      ))}
    </>
  );
}
