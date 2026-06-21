/**
 * Typed client for the ASTraM / UrbanPulse FastAPI backend.
 *
 * The backend is the source of truth; this wrapper only:
 *   1. resolves the base URL from NEXT_PUBLIC_API_BASE_URL
 *   2. attaches JSON headers
 *   3. surfaces the FastAPI error detail on failure (per the brief: graceful
 *      503 handling for the real "model not loaded" path)
 */

import type {
  DashboardResponse,
  IntelligenceResponse,
  IntelligenceFilters,
  HotspotsExtendedResponse,
  ResourcePlanResponse,
  SimulateEventResponse,
  PredictEventResponse,
  ImpactScoreResponse,
  AllocateResourcesResponse,
  HotspotRecord,
  CopilotResponse,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  detail: string;
  endpoint: string;

  constructor(status: number, detail: string, endpoint: string) {
    super(`[${status}] ${endpoint}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.endpoint = endpoint;
  }
}

async function request<T>(
  endpoint: string,
  init?: RequestInit & { signal?: AbortSignal }
): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      // The backend is on another origin; never cache at the fetch layer.
      cache: "no-store",
    });
  } catch (err) {
    throw new ApiError(
      0,
      err instanceof Error ? err.message : "Network request failed",
      endpoint
    );
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? body?.message ?? JSON.stringify(body);
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* keep statusText */
      }
    }
    throw new ApiError(res.status, detail, endpoint);
  }

  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Endpoints — existing                                                */
/* ------------------------------------------------------------------ */

export const api = {
  health: () => request<{ status: string; version: string }>("/health"),

  predictEvent: (body: {
    latitude: number;
    longitude: number;
    hour: number;
    day_of_week: number;
    month: number;
    zone: string;
    junction: string;
    police_station: string;
    priority: "High" | "Low";
  }) =>
    request<PredictEventResponse>("/predict-event", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  impactScore: (body: {
    event_cause: string;
    priority: "High" | "Low";
    requires_road_closure: boolean;
  }) =>
    request<ImpactScoreResponse>("/impact-score", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  allocateResources: (body: {
    impact_score: number;
    event_cause: string;
  }) =>
    request<AllocateResourcesResponse>("/allocate-resources", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  simulateEvent: (body: {
    latitude: number;
    longitude: number;
    hour: number;
    day_of_week: number;
    month: number;
    zone: string;
    junction: string;
    police_station: string;
    priority: "High" | "Low";
    requires_road_closure?: boolean;
    event_cause?: string | null;
  }) =>
    request<SimulateEventResponse>("/simulate-event", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  hotspots: () =>
    request<HotspotRecord[]>("/hotspots"),

  stats: () => request<Record<string, unknown>>("/stats"),

  /* ------------------------------------------------------------------ */
  /* Endpoints — new (added to api/main.py by this project)             */
  /* ------------------------------------------------------------------ */

  dashboard: () => request<DashboardResponse>("/dashboard"),

  intelligence: (filters: IntelligenceFilters = {}) => {
    const qs = new URLSearchParams();
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);
    if (filters.cause) qs.set("cause", filters.cause);
    if (filters.zone) qs.set("zone", filters.zone);
    const s = qs.toString();
    return request<IntelligenceResponse>(`/intelligence${s ? `?${s}` : ""}`);
  },

  hotspotsExtended: () => request<HotspotsExtendedResponse>("/hotspots/extended"),

  resourcePlan: (body: {
    label?: string;
    latitude: number;
    longitude: number;
    hour: number;
    day_of_week: number;
    month: number;
    zone: string;
    junction: string;
    police_station: string;
    priority: "High" | "Low";
    requires_road_closure?: boolean;
    event_cause?: string | null;
    crowd_estimate?: number;
  }) =>
    request<ResourcePlanResponse>("/resource-plan", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  copilot: (body: {
    conversation_id?: string;
    message: string;
  }) =>
    request<CopilotResponse>("/copilot", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  copilotConversations: () =>
    request<Array<{ id: string; title: string; message_count: number }>>(
      "/copilot/conversations"
    ),

  forecast: () =>
    request<Record<string, unknown>>("/forecast"),
};

export { BASE_URL };
