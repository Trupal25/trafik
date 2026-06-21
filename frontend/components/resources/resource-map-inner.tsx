"use client";

import { useMemo } from "react";
import { Map, Marker, NavigationControl, ScaleControl } from "react-map-gl/maplibre";
import { SEVERITY_HEX } from "@/lib/severity";
import type { ResourcePlanResponse } from "@/lib/types";
import "maplibre-gl/dist/maplibre-gl.css";

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL;

interface ResourceMapInnerProps {
  plan: ResourcePlanResponse;
}

export function ResourceMapInner({ plan }: ResourceMapInnerProps) {
  const center = useMemo(
    () => ({ latitude: plan.scenario.lat, longitude: plan.scenario.lng, zoom: 12.6 }),
    [plan.scenario.lat, plan.scenario.lng]
  );

  if (!TILE_URL) {
    return (
      <div className="surface flex h-full items-center justify-center">
        <span className="label-meta">NEXT_PUBLIC_MAP_TILE_URL unset</span>
      </div>
    );
  }

  return (
    <div className="surface relative h-full min-h-[480px] overflow-hidden">
      <Map initialViewState={center} mapStyle={TILE_URL} dragRotate={false} pitch={0}>
        <ScaleControl unit="metric" position="bottom-left" />
        <NavigationControl position="bottom-right" showCompass={false} />

        {/* Existing officers — blue rings */}
        {plan.officers.existing.map((p, i) => (
          <Marker key={`ex-${i}`} latitude={p.lat} longitude={p.lng} anchor="center">
            <div
              className="-ml-1.5 -mt-1.5 size-3 rounded-full border-2"
              style={{
                backgroundColor: "transparent",
                borderColor: SEVERITY_HEX.low,
                boxShadow: "0 0 0 1px oklch(0.17 0.008 40)",
              }}
              title={`Existing unit ${i + 1}`}
            />
          </Marker>
        ))}

        {/* Recommended officers — saffron dots */}
        {plan.officers.recommended.map((p, i) => (
          <Marker key={`rec-${i}`} latitude={p.lat} longitude={p.lng} anchor="center">
            <div
              className="-ml-1 -mt-1 size-2 rounded-full"
              style={{
                backgroundColor: "var(--primary)",
                boxShadow: "0 0 0 1px oklch(0.17 0.008 40)",
              }}
              title={`Recommended unit ${i + 1}`}
            />
          </Marker>
        ))}

        {/* Barricade locations — orange diamonds */}
        {plan.equipment.barricades.locations.map((b, i) => (
          <Marker key={`bar-${i}`} latitude={b.point.lat} longitude={b.point.lng} anchor="center">
            <div
              className="-ml-1 -mt-1 size-2 rotate-45 rounded-sm"
              style={{
                backgroundColor: SEVERITY_HEX.high,
                boxShadow: "0 0 0 1px oklch(0.17 0.008 40)",
              }}
              title={`${b.label} · ${b.units} units`}
            />
          </Marker>
        ))}

        {/* ERTs — red crosses */}
        {plan.equipment.erts.map((e, i) => (
          <Marker key={`ert-${i}`} latitude={e.position.lat} longitude={e.position.lng} anchor="center">
            <div
              className="-ml-2 -mt-2 flex size-4 items-center justify-center rounded-full"
              style={{
                backgroundColor: SEVERITY_HEX.critical,
                boxShadow: "0 0 0 1.5px oklch(0.17 0.008 40)",
              }}
              title={e.label}
            >
              <span className="text-[8px] font-bold text-white">E</span>
            </div>
          </Marker>
        ))}
      </Map>

      {/* Legend */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-md border border-border bg-background/90 p-2 backdrop-blur-sm">
        <span className="label-section px-0.5">Deployment</span>
        <LegendItem color={SEVERITY_HEX.low} shape="ring" label={`Existing · ${plan.officers.existing.length}`} />
        <LegendItem color="var(--primary)" shape="dot" label={`Recommended · ${plan.officers.recommended.length}`} />
        <LegendItem color={SEVERITY_HEX.high} shape="diamond" label={`Barricades · ${plan.equipment.barricades.total}`} />
        <LegendItem color={SEVERITY_HEX.critical} shape="dot" label={`ERTs · ${plan.equipment.erts.reduce((s, e) => s + e.count, 0)}`} />
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-sm border border-border bg-background/85 px-2 py-1 backdrop-blur-sm">
        <span className="label-meta">Model-estimated positions · scenario-based</span>
      </div>
    </div>
  );
}

function LegendItem({
  color,
  shape,
  label,
}: {
  color: string;
  shape: "ring" | "dot" | "diamond";
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {shape === "ring" && (
        <span className="size-2 rounded-full border-[1.5px]" style={{ borderColor: color }} />
      )}
      {shape === "dot" && (
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      {shape === "diamond" && (
        <span className="size-2 rotate-45 rounded-sm" style={{ backgroundColor: color }} />
      )}
      <span className="label-meta">{label}</span>
    </span>
  );
}
