/**
 * Shared API response types.
 *
 * These mirror the Pydantic schemas in api/main.py exactly. The backend is
 * the source of truth; if you change an endpoint shape there, update here.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export type EventCause =
  | "vehicle_breakdown"
  | "pot_holes"
  | "construction"
  | "water_logging"
  | "accident"
  | "tree_fall"
  | "road_conditions"
  | "congestion"
  | "public_event"
  | "procession"
  | "vip_movement"
  | "protest"
  | "debris"
  | "fog_low_visibility"
  | "others";

export interface GeoPoint {
  lat: number;
  lng: number;
}

/* ---------- existing endpoints (already in api/main.py) ---------- */

export interface PredictEventResponse {
  prediction: EventCause | string;
  probability: number;
  top_3: { cause: string; probability: number }[];
}

export interface ImpactScoreResponse {
  score: number;
  severity_level: Severity | string;
  expected_delay_mins: number | null;
  description: string;
}

export interface AllocateResourcesResponse {
  officers: number;
  barricades: number;
  diversion_routes: number;
  recommended_actions: string[];
  estimated_cost: number;
}

export interface SimulateEventResponse {
  prediction: Record<string, unknown>;
  impact: {
    score: number;
    severity_level: Severity | string;
    expected_delay_mins: number | null;
    description: string;
  };
  resources: AllocateResourcesResponse;
  timestamp: string;
}

export interface HotspotRecord {
  junction_code: number;
  junction: string;
  total_incidents: number;
  cause_breakdown: Record<string, number>;
  pct_road_closure: number;
  mean_priority: number;
  mean_duration_mins: number | null;
}

/* ---------- new endpoints (added to api/main.py) ---------- */

export interface DashboardKpi {
  key: string;
  label: string;
  value: number;
  unit?: string;
  delta?: number;
  sparkline: number[];
  severity?: Severity;
}

export interface DashboardResponse {
  generated_at: string;
  data_as_of?: string;
  kpis: DashboardKpi[];
  active_incidents: {
    id: string;
    cause: EventCause | string;
    junction: string;
    zone: string;
    severity: Severity;
    started_at: string;
    lat: number;
    lng: number;
    requires_road_closure: boolean;
  }[];
  ai_feed: {
    id: string;
    summary: string;
    confidence: number;
    zone: string;
    severity: Severity;
    generated_at: string;
  }[];
  hourly_congestion: {
    hour: number;
    today: number;
    yesterday: number;
  }[];
  risk_index: {
    score: number;
    band: Severity;
    contributors: { zone: string; weight: number }[];
  };
  zones: { code: number; name: string; incidents_30d: number; risk: Severity }[];
}

export interface IntelligenceFilters {
  from?: string;
  to?: string;
  cause?: string;
  zone?: string;
}

export interface IntelligenceResponse {
  filters: IntelligenceFilters;
  total_in_scope: number;
  monthly_trends: {
    month: number;
    label: string;
    operational: number;
    event: number;
    accident: number;
  }[];
  weekday_vs_weekend: {
    hour: number;
    weekday: number;
    weekend: number;
  }[];
  zone_distribution: {
    zone: string;
    zone_code: number;
    total: number;
    by_cause: Record<string, number>;
  }[];
  cause_distribution: { cause: string; count: number; pct: number }[];
  recent_events: {
    id: string;
    cause: EventCause | string;
    junction: string;
    zone: string;
    started_at: string;
    priority: number;
    requires_road_closure: boolean;
    severity: Severity;
    status: string;
    crowd_estimate?: number;
  }[];
}

export interface HotspotDetail extends HotspotRecord {
  lat: number;
  lng: number;
  zone_code: number;
  severity: Severity;
  incidents_7d: { day: string; count: number }[];
  last_incident_at: string;
  recommendation: string;
  dominant_cause: string;
}

export interface HotspotsExtendedResponse {
  generated_at: string;
  data_as_of?: string;
  summary: { critical: number; high: number; medium: number; total: number };
  hotspots: HotspotDetail[];
}

export interface ResourcePlanResponse {
  scenario: {
    label: string;
    junction: string;
    zone: string;
    lat: number;
    lng: number;
    impact_score: number;
    severity: Severity;
  };
  officers: {
    total: number;
    by_zone: { zone: string; count: number; position: GeoPoint }[];
    existing: GeoPoint[];
    recommended: GeoPoint[];
  };
  equipment: {
    barricades: { total: number; locations: { label: string; units: number; point: GeoPoint }[] };
    erts: { count: number; position: GeoPoint; label: string }[];
  };
  diversion_routes: { from: string; via: string; to: string; path: GeoPoint[] }[];
  timeline: {
    phase: string;
    label: string;
    offset_mins: number;
    severity: Severity;
    detail: string;
  }[];
  generated_at: string;
}

/* ---------- Copilot ---------- */

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  card?: CopilotCard;
  created_at: string;
}

export interface CopilotCard {
  title: string;
  severity: Severity;
  summary: string;
  metrics: { label: string; value: string }[];
  recommendations: string[];
  diversions?: { from: string; via: string; to: string }[];
  confidence: number;
  sources?: string[];
}

export interface CopilotResponse {
  message: CopilotMessage;
  conversation_id: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}
