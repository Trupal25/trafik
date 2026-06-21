"use client";

import { useState } from "react";
import {
  ShieldAlert,
  Users,
  Construction,
  Route,
  Activity,
  FileText,
  Check,
  Clock,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/common/state";
import { ResourceMap } from "@/components/resources/resource-map";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  SEVERITY_BADGE_CLASS,
  type Severity,
} from "@/lib/severity";
import type { ResourcePlanResponse } from "@/lib/types";

interface Scenario {
  id: string;
  label: string;
  lat: number;
  lng: number;
  zone: string;
  junction: string;
  policeStation: string;
  cause: string;
  crowd: number;
  priority: "High" | "Low";
  closure: boolean;
  hour: number;
}

const SCENARIOS: Scenario[] = [
  { id: "diwali-silk", label: "Diwali — Silk Board Junction", lat: 12.9176, lng: 77.6224, zone: "7", junction: "SilkBoardJunc", policeStation: "Madiwala", cause: "public_event", crowd: 8000, priority: "High", closure: true, hour: 19 },
  { id: "ganesh-mekhri", label: "Ganesh Visarjan — Mekhri Circle", lat: 13.0328, lng: 77.5867, zone: "1", junction: "MekhriCircle", policeStation: "Malleshwaram", cause: "procession", crowd: 12000, priority: "High", closure: true, hour: 17 },
  { id: "vvip-yeshwanthpur", label: "VVIP Movement — Yeshwanthpur Circle", lat: 13.0285, lng: 77.5402, zone: "9", junction: "YeshwanthpuraCircle", policeStation: "Yeshwanthpur", cause: "vip_movement", crowd: 200, priority: "High", closure: true, hour: 9 },
  { id: "rush-agara", label: "Evening Rush — Agara Junction", lat: 12.9346, lng: 77.6219, zone: "7", junction: "AgaraJunction", policeStation: "HSR Layout", cause: "congestion", crowd: 0, priority: "High", closure: false, hour: 20 },
  { id: "monsoon-yelhanka", label: "Monsoon Waterlogging — Yelahanka", lat: 13.1007, lng: 77.5963, zone: "5", junction: "YelhankaCircle", policeStation: "Yelahanka", cause: "water_logging", crowd: 0, priority: "High", closure: false, hour: 8 },
  { id: "accident-ayyappa", label: "Major Accident — Ayyappa Temple Jn", lat: 12.9116, lng: 77.6473, zone: "7", junction: "AyyappaTempleJunc", policeStation: "HSR Layout", cause: "accident", crowd: 0, priority: "High", closure: true, hour: 14 },
];

const PHASE_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  advance: Users,
  main: ShieldAlert,
  monitor: Activity,
  full: ShieldAlert,
  withdraw: Users,
  allclear: Check,
};

export default function ResourcesPage() {
  const [scenarioId, setScenarioId] = useState<string>(SCENARIOS[0].id);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [plan, setPlan] = useState<ResourcePlanResponse | null>(null);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;

  async function runScenario(s: Scenario) {
    setRunning(true);
    setError(null);
    setPlan(null);
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    const month = now.getMonth() + 1;
    try {
      const res = await api.resourcePlan({
        label: s.label,
        latitude: s.lat,
        longitude: s.lng,
        hour: s.hour,
        day_of_week: dayOfWeek,
        month,
        zone: s.zone,
        junction: s.junction,
        police_station: s.policeStation,
        priority: s.priority,
        requires_road_closure: s.closure,
        event_cause: s.cause,
        crowd_estimate: s.crowd || undefined,
      });
      setPlan(res);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err), "resource-plan"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="05 / Deployment Planning"
        title="Resource Planner"
        description="AI-generated deployment plan for a chosen scenario: officer allocation per zone, barricade and emergency-response placement, diversion routing, and a phased timeline from advance team through all-clear."
        meta={
          <span className="label-meta flex items-center gap-1.5">
            <ShieldAlert className="size-3 text-primary" strokeWidth={2} />
            Hybrid ML + Rules Engine · zoned allocation
          </span>
        }
      />

      {/* Scenario selector */}
      <div className="flex flex-wrap items-end gap-3 border-b border-border bg-background/60 px-6 py-3 sm:px-8">
        <div className="flex flex-col gap-1">
          <span className="label-meta">Scenario</span>
          <select
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
            className="h-[30px] rounded-[3px] border border-border bg-input px-2 font-mono text-[12px] text-foreground outline-none focus:border-primary"
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <Button
          size="sm"
          onClick={() => runScenario(scenario)}
          disabled={running}
        >
          {running ? "Planning…" : "Generate Deployment Plan"}
        </Button>
        {plan && (
          <div className="ml-auto flex items-center gap-3">
            <span className="label-meta">
              Impact <span className={cn("font-semibold", `text-[var(--${plan.scenario.severity})]`)}>
                {plan.scenario.impact_score}/10
              </span>
            </span>
            <span className={cn("sev", SEVERITY_BADGE_CLASS[plan.scenario.severity as Severity])}>
              {plan.scenario.severity}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6 sm:p-8">
        {error ? (
          <div className="surface"><ErrorPanel error={error} onRetry={() => runScenario(scenario)} /></div>
        ) : !plan ? (
          <div className="surface flex h-full min-h-[420px] flex-col items-center justify-center gap-3 text-center">
            <ShieldAlert className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-medium text-foreground">Select a scenario and generate a plan</span>
              <span className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                The planner chains the impact engine, allocates officers across zones by proximity, places barricades at real junctions near the scenario, and sequences a six-phase deployment timeline.
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Map + allocation split */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
              <div className="h-[480px]">
                <ResourceMap plan={plan} />
              </div>
              <div className="flex flex-col gap-3">
                {/* Officer allocation by zone */}
                <AllocationCard
                  icon={Users}
                  title="Officer Allocation"
                  total={plan.officers.total}
                  unit="officers"
                >
                  <ZoneBars
                    rows={plan.officers.by_zone.map((z) => ({ label: z.zone, value: z.count }))}
                  />
                </AllocationCard>

                {/* Barricades + ERTs */}
                <AllocationCard
                  icon={Construction}
                  title="Equipment"
                  total={plan.equipment.barricades.total}
                  unit="barricades"
                >
                  <div className="flex flex-col gap-1.5">
                    <span className="label-meta">
                      ERTs deployed: {plan.equipment.erts.reduce((s, e) => s + e.count, 0)}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {plan.equipment.barricades.locations.slice(0, 5).map((b, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px]">
                          <span className="truncate text-muted-foreground">{b.label}</span>
                          <span className="font-mono text-foreground">{b.units}u</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </AllocationCard>
              </div>
            </div>

            {/* Diversion routes */}
            {plan.diversion_routes.length > 0 && (
              <div className="surface flex flex-col gap-3 p-5">
                <div className="flex items-center gap-1.5">
                  <Route className="size-3 text-primary" strokeWidth={2} />
                  <span className="label-section text-primary/80">Suggested Diversion Routes</span>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {plan.diversion_routes.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                      <span className="flex flex-1 items-center gap-1.5 text-[11px]">
                        <span className="font-medium text-foreground">{r.from}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-muted-foreground">{r.via}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium text-foreground">{r.to}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deployment timeline */}
            <div className="surface flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3 text-primary" strokeWidth={2} />
                  <span className="label-section text-primary/80">Deployment Timeline</span>
                </div>
                <span className="label-meta">T-0 = event start</span>
              </div>
              <Timeline phases={plan.timeline} />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1">
                <FileText className="size-3.5" strokeWidth={2} />
                Generate Report
              </Button>
              <Button size="sm" className="flex-1">
                <Check className="size-3.5" strokeWidth={2} />
                Approve Deployment Plan
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function AllocationCard({
  icon: Icon,
  title,
  total,
  unit,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  total: number;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3 text-primary" strokeWidth={2} />
          <span className="label-section">{title}</span>
        </div>
        <span className="font-mono text-lg font-semibold text-primary">
          {total}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>
        </span>
      </div>
      {children}
    </div>
  );
}

function ZoneBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-1">
      {rows.slice(0, 8).map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-[10px] text-muted-foreground">{r.label}</span>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--chart-track)]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-right font-mono text-[10px] text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Timeline({
  phases,
}: {
  phases: ResourcePlanResponse["timeline"];
}) {
  return (
    <div className="relative">
      {/* Baseline */}
      <div className="absolute left-0 right-0 top-3 h-px bg-border" />
      <div className="relative grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {phases.map((p, i) => {
          const sev = p.severity as Severity;
          const Icon = PHASE_ICONS[p.phase] ?? Activity;
          const offsetH = Math.round(p.offset_mins / 60);
          const offsetLabel =
            offsetH === 0 ? "T+0" : offsetH > 0 ? `T+${offsetH}h` : `T${offsetH}h`;
          return (
            <div key={i} className="flex flex-col items-center gap-1.5 text-center">
              <div
                className={cn(
                  "relative z-10 flex size-6 items-center justify-center rounded-full border-2 bg-background",
                  p.severity === "critical" && "animate-pulse"
                )}
                style={{
                  borderColor: `var(--${sev})`,
                  backgroundColor: `var(--${sev})`,
                }}
              >
                <Icon className="size-3 text-background" strokeWidth={2.5} />
              </div>
              <span className="font-mono text-[10px] font-medium" style={{ color: `var(--${sev})` }}>
                {offsetLabel}
              </span>
              <span className="text-[10px] font-medium leading-tight text-foreground">
                {p.label}
              </span>
              <span className="text-[9px] leading-tight text-muted-foreground">
                {p.detail}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
