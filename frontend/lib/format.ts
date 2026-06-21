/**
 * Display formatters. Mono-feeling, terse, control-room voice.
 */

const CAUSE_LABELS: Record<string, string> = {
  vehicle_breakdown: "Vehicle breakdown",
  pot_holes: "Potholes",
  construction: "Construction",
  water_logging: "Waterlogging",
  accident: "Accident",
  tree_fall: "Tree fall",
  road_conditions: "Road conditions",
  congestion: "Congestion",
  public_event: "Public event",
  procession: "Procession",
  vip_movement: "VVIP movement",
  protest: "Protest",
  debris: "Debris",
  fog_low_visibility: "Fog / low visibility",
  others: "Other",
};

export function formatCause(cause: string): string {
  return CAUSE_LABELS[cause] ?? prettify(cause);
}

export function prettify(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "17:01 · Mar 7" — compact for tables and feeds. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const day = d.getDate();
  const month = SHORT_MONTHS[d.getMonth()];
  return `${hh}:${mm} · ${day} ${month}`;
}

/** "5h ago", "now", "2d ago" — relative for feed/cards. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = Date.now() - d;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "now";
  if (sec < 90) return "1m ago";
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 7200) return "1h ago";
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  if (sec < 172800) return "1d ago";
  return `${Math.round(sec / 86400)}d ago`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN").format(n);
}

export function formatPercent(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(4)}°N ${lng.toFixed(4)}°E`;
}

export function formatDuration(mins: number | null | undefined): string {
  if (mins == null || Number.isNaN(mins)) return "—";
  if (mins < 1) return "<1m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const MONTH_LABELS = SHORT_MONTHS;

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
