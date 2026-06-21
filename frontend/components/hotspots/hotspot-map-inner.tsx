"use client";

import { useMemo } from "react";
import { Map, Marker, NavigationControl, ScaleControl } from "react-map-gl/maplibre";
import { cn } from "@/lib/utils";
import { SEVERITY_HEX } from "@/lib/severity";
import type { HotspotsExtendedResponse, HotspotDetail } from "@/lib/types";
import "maplibre-gl/dist/maplibre-gl.css";

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL;
const BLR_CENTER = { latitude: 12.9716, longitude: 77.5946 };

export type HotspotLayerKey =
  | "accident"
  | "construction"
  | "breakdown"
  | "waterlogging"
  | "congestion"
  | "predicted";

export const HOTSPOT_LAYERS: {
  key: HotspotLayerKey;
  label: string;
  color: string;
  shape: "circle" | "triangle" | "diamond";
}[] = [
  { key: "accident", label: "Accident Hotspots", color: SEVERITY_HEX.critical, shape: "circle" },
  { key: "construction", label: "Construction Zones", color: SEVERITY_HEX.high, shape: "triangle" },
  { key: "breakdown", label: "Breakdown Points", color: SEVERITY_HEX.medium, shape: "circle" },
  { key: "waterlogging", label: "Waterlogging Areas", color: SEVERITY_HEX.low, shape: "circle" },
  { key: "congestion", label: "Congestion Clusters", color: "#a66ce0", shape: "circle" },
  { key: "predicted", label: "AI Predicted Future", color: "#f4f1ea", shape: "diamond" },
];

/** Map a hotspot's dominant cause to a layer key. */
export function layerForHotspot(h: HotspotDetail): HotspotLayerKey {
  if (isRising(h)) return "predicted";
  switch (h.dominant_cause) {
    case "accident": return "accident";
    case "construction": return "construction";
    case "vehicle_breakdown": return "breakdown";
    case "water_logging": return "waterlogging";
    case "congestion": return "congestion";
    default: return "breakdown";
  }
}

/** A hotspot is "AI predicted / rising" if its last 3 days exceed its 7-day daily mean. */
export function isRising(h: HotspotDetail): boolean {
  const trend = h.incidents_7d;
  if (!trend || trend.length < 4) return false;
  const recent = trend.slice(-3).reduce((s, d) => s + d.count, 0);
  const total = trend.reduce((s, d) => s + d.count, 0);
  const dailyMean = total / trend.length;
  return recent / 3 > dailyMean * 1.4 && recent > 0;
}

interface HotspotMapInnerProps {
  hotspots: HotspotsExtendedResponse["hotspots"];
  layers: Record<HotspotLayerKey, boolean>;
  selectedId: number | null;
  onSelect: (junctionCode: number) => void;
  dataAsOf?: string;
}

export function HotspotMapInner({
  hotspots,
  layers,
  selectedId,
  onSelect,
  dataAsOf,
}: HotspotMapInnerProps) {
  const visible = useMemo(() => {
    return hotspots.filter((h) => {
      // A hotspot shows if its assigned layer is on. Rising hotspots also
      // show on the "predicted" overlay when that layer is on.
      const assigned = layerForHotspot(h);
      if (assigned === "predicted") return layers.predicted;
      if (layers[assigned]) return true;
      if (layers.predicted && isRising(h)) return true;
      return false;
    });
  }, [hotspots, layers]);

  if (!TILE_URL) {
    return (
      <div className="surface flex h-full items-center justify-center">
        <span className="label-meta">NEXT_PUBLIC_MAP_TILE_URL unset</span>
      </div>
    );
  }

  return (
    <div className="surface relative h-full min-h-[560px] overflow-hidden">
      <Map
        initialViewState={{ ...BLR_CENTER, zoom: 11.4 }}
        mapStyle={TILE_URL}
        interactiveLayerIds={[]}
        dragRotate={false}
        pitch={0}
        maxBounds={[[77.30, 12.78], [77.78, 13.12]]}
      >
        <ScaleControl unit="metric" position="bottom-left" />
        <NavigationControl position="bottom-right" showCompass={false} />

        {visible.map((h) => (
          <Marker
            key={h.junction_code}
            latitude={h.lat}
            longitude={h.lng}
            anchor="center"
            onClick={() => onSelect(h.junction_code)}
          >
            <HotspotMarker
              hotspot={h}
              selected={h.junction_code === selectedId}
            />
          </Marker>
        ))}
      </Map>

      {dataAsOf && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-sm border border-border bg-background/85 px-2 py-1 backdrop-blur-sm">
          <span className="label-meta">
            Incident history through{" "}
            {new Date(dataAsOf).toLocaleString("en-IN", { dateStyle: "medium" })}
          </span>
        </div>
      )}
    </div>
  );
}

function HotspotMarker({
  hotspot,
  selected,
}: {
  hotspot: HotspotDetail;
  selected: boolean;
}) {
  const rising = isRising(hotspot);
  const layerKey = layerForHotspot(hotspot);
  const layer = HOTSPOT_LAYERS.find((l) => l.key === layerKey)!;
  const color = layer.color;
  // Size scales with incident volume, capped.
  const size = Math.min(18, 7 + Math.sqrt(hotspot.total_incidents) * 1.4);
  const pulse = hotspot.severity === "critical" || rising;

  return (
    <button
      type="button"
      className={cn(
        "group relative -ml-2 -mt-2 cursor-pointer transition-transform",
        selected && "scale-125"
      )}
      style={{ width: size * 2, height: size * 2 }}
      title={`${hotspot.junction} · ${hotspot.total_incidents} incidents · ${hotspot.severity}`}
    >
      {pulse && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: rising ? "#f4f1ea" : color,
            animation: "pulse-marker 2s cubic-bezier(0.16, 1, 0.3, 1) infinite",
          }}
        />
      )}
      {layer.shape === "triangle" ? (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 0,
            height: 0,
            borderLeft: `${size / 2}px solid transparent`,
            borderRight: `${size / 2}px solid transparent`,
            borderBottom: `${size}px solid ${color}`,
            filter: selected
              ? `drop-shadow(0 0 6px ${color})`
              : `drop-shadow(0 0 2px ${color}aa)`,
          }}
        />
      ) : layer.shape === "diamond" ? (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm"
          style={{
            width: size,
            height: size,
            backgroundColor: color,
            boxShadow: selected
              ? `0 0 0 3px oklch(0.17 0.008 40), 0 0 0 4px ${color}`
              : `0 0 0 1.5px oklch(0.17 0.008 40)`,
          }}
        />
      ) : (
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: size,
            height: size,
            backgroundColor: color,
            boxShadow: selected
              ? `0 0 0 3px oklch(0.17 0.008 40), 0 0 0 4px ${color}`
              : `0 0 0 1.5px oklch(0.17 0.008 40)`,
          }}
        />
      )}
    </button>
  );
}
