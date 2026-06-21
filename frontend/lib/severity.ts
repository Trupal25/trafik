/**
 * Severity classification + label/color helpers.
 *
 * Severity is the committed color vocabulary across the whole app:
 *   critical → red, high → orange, medium → yellow, low → blue
 * Used for meaning only, never decoration.
 */

import type { Severity } from "./types";

export type { Severity };
export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Tailwind class fragments — kept here so severity styling is consistent. */
export const SEVERITY_BADGE_CLASS: Record<Severity, string> = {
  critical: "sev sev-critical",
  high: "sev sev-high",
  medium: "sev sev-medium",
  low: "sev sev-low",
};

export const SEVERITY_TEXT_CLASS: Record<Severity, string> = {
  critical: "text-[var(--critical)]",
  high: "text-[var(--high)]",
  medium: "text-[var(--medium)]",
  low: "text-[var(--low)]",
};

export const SEVERITY_FILL_CLASS: Record<Severity, string> = {
  critical: "bg-[var(--critical)]",
  high: "bg-[var(--high)]",
  medium: "bg-[var(--medium)]",
  low: "bg-[var(--low)]",
};

export const SEVERITY_HEX: Record<Severity, string> = {
  // Approximate hex fallbacks for MapLibre paint properties (which don't
  // accept oklch or var() in all positions). Tuned to the OKLCH tokens.
  critical: "#d44a3d",
  high: "#e08a3d",
  medium: "#e8c34a",
  low: "#4a8ad4",
};

export function classifySeverity(
  score: number,
  /** Optional thresholds; defaults suit a 0-10 impact score. */
  thresholds: { critical?: number; high?: number; medium?: number } = {}
): Severity {
  const c = thresholds.critical ?? 8;
  const h = thresholds.high ?? 6;
  const m = thresholds.medium ?? 3.5;
  if (score >= c) return "critical";
  if (score >= h) return "high";
  if (score >= m) return "medium";
  return "low";
}

/** Normalize free-form severity strings from the backend into the union. */
export function normalizeSeverity(s: string | undefined | null): Severity {
  if (!s) return "low";
  const lc = s.toLowerCase();
  if (lc.includes("crit") || lc.includes("severe")) return "critical";
  if (lc.includes("high")) return "high";
  if (lc.includes("med") || lc.includes("mod")) return "medium";
  return "low";
}
