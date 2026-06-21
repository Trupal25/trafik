"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatCause } from "@/lib/format";
import type { EventCause } from "@/lib/types";

const CAUSES: { value: EventCause; category: string }[] = [
  { value: "vehicle_breakdown", category: "Operational" },
  { value: "pot_holes", category: "Operational" },
  { value: "construction", category: "Operational" },
  { value: "water_logging", category: "Operational" },
  { value: "tree_fall", category: "Operational" },
  { value: "road_conditions", category: "Operational" },
  { value: "congestion", category: "Operational" },
  { value: "debris", category: "Operational" },
  { value: "fog_low_visibility", category: "Operational" },
  { value: "accident", category: "Critical" },
  { value: "public_event", category: "Crowd" },
  { value: "procession", category: "Crowd" },
  { value: "vip_movement", category: "Crowd" },
  { value: "protest", category: "Crowd" },
  { value: "others", category: "Operational" },
];

export interface JunctionOption {
  code: number;
  name: string;
  lat: number;
  lng: number;
  zone: string;
  policeStation: string;
}

export interface SimulatorFormValues {
  eventName: string;
  cause: EventCause;
  junction: JunctionOption;
  crowdSize: number;
  durationHours: number;
  startTime: string;
  requiresClosure: boolean;
}

interface SimulatorFormProps {
  junctions: JunctionOption[];
  onSubmit: (values: SimulatorFormValues) => void;
  disabled: boolean;
}

export function SimulatorForm({ junctions, onSubmit, disabled }: SimulatorFormProps) {
  const [eventName, setEventName] = useState("");
  const [cause, setCause] = useState<EventCause>("public_event");
  const [junctionCode, setJunctionCode] = useState<number>(0);
  const [crowdSize, setCrowdSize] = useState(3000);
  const [durationHours, setDurationHours] = useState(4);
  const [startTime, setStartTime] = useState("19:00");
  const [requiresClosure, setRequiresClosure] = useState(true);

  // Derive the effective selection: if the stored code isn't in the loaded
  // list (or nothing is loaded yet), fall back to the first option.
  const effectiveJunctionCode = junctions.some((j) => j.code === junctionCode)
    ? junctionCode
    : junctions[0]?.code ?? 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const junction = junctions.find((j) => j.code === effectiveJunctionCode);
    if (!junction) return;
    onSubmit({
      eventName: eventName || `${formatCause(cause)} at ${junction.name}`,
      cause,
      junction,
      crowdSize,
      durationHours,
      startTime,
      requiresClosure,
    });
  };

  // Group causes by category for the dropdown.
  const grouped = CAUSES.reduce<Record<string, typeof CAUSES>>((acc, c) => {
    (acc[c.category] ||= []).push(c);
    return acc;
  }, {});

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Event Name" hint="Optional — auto-generated if blank">
        <input
          type="text"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="e.g. Diwali at Silk Board"
          className="input-field"
        />
      </Field>

      <Field label="Event Type">
        <select
          value={cause}
          onChange={(e) => setCause(e.target.value as EventCause)}
          className="input-field"
        >
          {Object.entries(grouped).map(([cat, items]) => (
            <optgroup key={cat} label={cat}>
              {items.map((c) => (
                <option key={c.value} value={c.value}>
                  {formatCause(c.value)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label="Location">
        <select
          value={effectiveJunctionCode}
          onChange={(e) => setJunctionCode(Number(e.target.value))}
          className="input-field"
        >
          {junctions.map((j) => (
            <option key={j.code} value={j.code}>
              {j.name} · {j.zone}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Expected Crowd Size"
        hint={`${crowdSize.toLocaleString("en-IN")} people`}
      >
        <input
          type="range"
          min={0}
          max={100000}
          step={500}
          value={crowdSize}
          onChange={(e) => setCrowdSize(Number(e.target.value))}
          className="range-field"
        />
        <div className="flex justify-between">
          <span className="label-meta">0</span>
          <span className="label-meta">1,00,000</span>
        </div>
      </Field>

      <Field label="Duration" hint={`${durationHours} hour${durationHours === 1 ? "" : "s"}`}>
        <input
          type="range"
          min={1}
          max={24}
          step={1}
          value={durationHours}
          onChange={(e) => setDurationHours(Number(e.target.value))}
          className="range-field"
        />
      </Field>

      <Field label="Start Time">
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="input-field"
        />
      </Field>

      <Field label="Road Closure Required">
        <button
          type="button"
          role="switch"
          aria-checked={requiresClosure}
          onClick={() => setRequiresClosure((v) => !v)}
          className={cn(
            "relative h-7 w-12 rounded-full transition-colors",
            requiresClosure ? "bg-input" : "bg-primary/80"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-6 rounded-full bg-foreground transition-transform",
              requiresClosure ? "-translate-x-[22px]" : "-translate-x-0.5"
            )}
          />
        </button>
      </Field>

      <button
        type="submit"
        disabled={disabled}
        className={cn(
          "mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md px-6 text-xs font-semibold uppercase tracking-widest transition-all",
          "bg-primary text-primary-foreground hover:bg-primary/85",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        {disabled ? "Running simulation…" : "Run Simulation"}
      </button>

      <style jsx>{`
        .input-field {
          width: 100%;
          height: 38px;
          padding: 0 10px;
          background: var(--input);
          border: 1px solid var(--border);
          border-radius: 3px;
          color: var(--foreground);
          font-size: 13px;
          font-family: var(--font-sans);
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          border-color: var(--primary);
        }
        .range-field {
          width: 100%;
          accent-color: var(--primary);
          height: 4px;
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label className="label-meta">{label}</label>
        {hint && <span className="font-mono text-[10px] text-primary">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
