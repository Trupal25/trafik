"use client";

import { useState, useMemo } from "react";
import { FlaskConical, Cpu, Gauge, Users, Check } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorPanel } from "@/components/common/state";
import {
  SimulatorForm,
  type SimulatorFormValues,
  type JunctionOption,
} from "@/components/simulator/simulator-form";
import { SimulationResult } from "@/components/simulator/simulation-result";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { HotspotsExtendedResponse, SimulateEventResponse } from "@/lib/types";

export default function SimulatorPage() {
  // Junction list sourced from real hotspot data so the dropdown reflects
  // real places with real coordinates.
  const hotspots = useApi<HotspotsExtendedResponse>(() => api.hotspotsExtended());
  const junctions: JunctionOption[] = useMemo(() => {
    if (!hotspots.data) return FALLBACK_JUNCTIONS;
    const seen = new Set<string>();
    const out: JunctionOption[] = [];
    for (const h of hotspots.data.hotspots) {
      if (seen.has(h.junction) || h.junction === "unknown") continue;
      seen.add(h.junction);
      out.push({
        code: h.junction_code,
        name: h.junction,
        lat: h.lat,
        lng: h.lng,
        zone: String(h.zone_code),
        policeStation: "Bengaluru Traffic Police",
      });
      if (out.length >= 24) break;
    }
    return out.length ? out : FALLBACK_JUNCTIONS;
  }, [hotspots.data]);

  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<SimulateEventResponse | null>(null);
  const [lastValues, setLastValues] = useState<SimulatorFormValues | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function handleSubmit(values: SimulatorFormValues) {
    setLastValues(values);
    setPhase("running");
    setStep(0);
    setError(null);
    setResult(null);

    // Stage the pipeline display — three steps at ~500ms each, overlapped
    // with the real network call.
    const startMs = Date.now();
    const stepTimers = [0, 500, 1000].map((ms, i) =>
      setTimeout(() => setStep(i + 1), ms)
    );

    // Derive backend fields from form values.
    const [hourStr] = values.startTime.split(":");
    const hour = parseInt(hourStr ?? "12", 10);
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon … 6=Sun
    const month = now.getMonth() + 1;
    const priority = values.crowdSize > 5000 || values.requiresClosure ? "High" : "Low";

    try {
      const res = await api.simulateEvent({
        latitude: values.junction.lat,
        longitude: values.junction.lng,
        hour,
        day_of_week: dayOfWeek,
        month,
        zone: values.junction.zone,
        junction: values.junction.name,
        police_station: values.junction.policeStation,
        priority: priority as "High" | "Low",
        requires_road_closure: values.requiresClosure,
        event_cause: values.cause,
      });
      // Ensure the staged display plays for at least ~1.5s total.
      const elapsed = Date.now() - startMs;
      const minTotal = 1500;
      if (elapsed < minTotal) {
        await new Promise((r) => setTimeout(r, minTotal - elapsed));
      }
      setStep(3);
      setResult(res);
      setPhase("done");
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err), "simulate-event"));
      setPhase("error");
    } finally {
      stepTimers.forEach(clearTimeout);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="02 / What-if Analysis"
        title="Event Simulator"
        description="Configure a hypothetical event and run the chained ML pipeline (cause prediction → impact scoring → resource allocation) to see projected risk and required deployment before it happens."
        meta={
          <span className="label-meta flex items-center gap-1.5">
            <FlaskConical className="size-3 text-primary" strokeWidth={2} />
            Chained: RandomForest → Rules Engine → Tiered Allocator
          </span>
        }
      />

      <div className="flex-1 overflow-auto p-6 sm:p-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <div className="surface h-fit p-5">
            <span className="label-section">Event Configuration</span>
            <div className="mt-4">
              <SimulatorForm
                junctions={junctions}
                onSubmit={handleSubmit}
                disabled={phase === "running"}
              />
            </div>
          </div>

          {/* Results stage */}
          <div>
            {phase === "idle" && (
              <div className="surface flex h-full min-h-[480px] flex-col items-center justify-center gap-3 p-8 text-center">
                <FlaskConical className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
                <div className="flex flex-col gap-1">
                  <span className="text-[14px] font-medium text-foreground">
                    Configure an event and run the simulation
                  </span>
                  <span className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                    The pipeline will classify the event, compute impact, and
                    recommend officers, barricades, and diversion routes from
                    real Bengaluru junction data.
                  </span>
                </div>
              </div>
            )}

            {phase === "running" && <ProcessingPipeline step={step} />}

            {phase === "error" && error && (
              <div className="surface">
                <ErrorPanel
                  error={error}
                  title="Simulation failed"
                  onRetry={() => lastValues && handleSubmit(lastValues)}
                />
              </div>
            )}

            {phase === "done" && result && lastValues && (
              <SimulationResult result={result} formValues={lastValues} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const STEPS = [
  { icon: Cpu, label: "Classifying event cause", model: "RandomForest classifier" },
  { icon: Gauge, label: "Computing impact score", model: "Rules engine" },
  { icon: Users, label: "Allocating resources", model: "Tiered allocator" },
];

function ProcessingPipeline({ step }: { step: number }) {
  return (
    <div className="surface flex h-full min-h-[480px] flex-col gap-3 p-6">
      <span className="label-section">Running chained inference</span>
      <div className="flex flex-col gap-2">
        {STEPS.map((s, i) => {
          const active = step === i;
          const done = step > i;
          const Icon = s.icon;
          return (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 rounded-md border p-3 transition-all",
                done
                  ? "border-primary/40 bg-primary/8"
                  : active
                    ? "border-primary/60 bg-primary/12"
                    : "border-border opacity-50"
              )}
            >
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={2.5} />
                ) : active ? (
                  <Icon className="size-4 animate-pulse" strokeWidth={2} />
                ) : (
                  <Icon className="size-4" strokeWidth={1.5} />
                )}
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-[13px] font-medium text-foreground">{s.label}</span>
                <span className="label-meta">{s.model}</span>
              </div>
              {active && (
                <span className="flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="size-1.5 rounded-full bg-primary"
                      style={{
                        animation: "pulse-marker 0.9s ease-in-out infinite",
                        animationDelay: `${d * 150}ms`,
                      }}
                    />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Fallback used while the hotspot junction list loads (real coords).
const FALLBACK_JUNCTIONS: JunctionOption[] = [
  { code: 252, name: "SilkBoardJunc", lat: 12.9176, lng: 77.6224, zone: "7", policeStation: "Madiwala" },
  { code: 176, name: "MekhriCircle", lat: 13.0328, lng: 77.5867, zone: "1", policeStation: "Malleshwaram" },
  { code: 293, name: "YeshwanthpuraCircle", lat: 13.0285, lng: 77.5402, zone: "9", policeStation: "Yeshwanthpur" },
  { code: 291, name: "YelhankaCircle", lat: 13.1007, lng: 77.5963, zone: "5", policeStation: "Yelahanka" },
  { code: 21, name: "AyyappaTempleJunc", lat: 12.9116, lng: 77.6473, zone: "7", policeStation: "HSR Layout" },
];
