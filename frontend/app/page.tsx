"use client";

import { Radio, Activity, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton, ErrorPanel } from "@/components/common/state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AiFeed } from "@/components/dashboard/ai-feed";
import { HourlyHeatmap } from "@/components/dashboard/hourly-heatmap";
import { CityMap } from "@/components/dashboard/city-map";
import { useApi } from "@/lib/use-api";
import { api } from "@/lib/api";
import type { DashboardResponse } from "@/lib/types";
import type { Severity } from "@/lib/severity";

export default function CommandCenterPage() {
  const { data, error, loading, refetch } = useApi<DashboardResponse>(
    () => api.dashboard(),
    { refetchMs: 60_000 }
  );

  return (
    <>
      <PageHeader
        eyebrow="01 / Live Operations"
        title="Command Center"
        description="Real-time, city-wide view of active incidents, ML-flagged risk, and the AI intelligence feed across the Bengaluru Traffic Police network."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={refetch}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin size-3" : "size-3"} strokeWidth={2} />
            Refresh
          </Button>
        }
        meta={
          <>
            <span className="label-meta flex items-center gap-1.5">
              <span className="live-dot" /> Live · auto-refresh 60s
            </span>
            <span className="label-meta flex items-center gap-1.5">
              <Radio className="size-3 text-primary" strokeWidth={2} /> {data?.zones.length ?? 13} zones
            </span>
            <span className="label-meta flex items-center gap-1.5">
              <Activity className="size-3 text-primary" strokeWidth={2} />
              {data ? `${data.active_incidents.length} incidents on map` : "—"}
            </span>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-6 sm:p-8">
        {error && !data ? (
          <div className="surface">
            <ErrorPanel error={error} onRetry={refetch} />
          </div>
        ) : (
          <>
            {/* KPI band */}
            <KpiBand data={data} loading={loading} />

            {/* Map + AI feed split */}
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
              <div className="h-[480px]">
                {loading && !data ? (
                      <div className="surface flex h-full items-center justify-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <div className="skeleton h-8 w-8 rounded-full" />
                          <span className="label-meta">Loading live map</span>
                        </div>
                      </div>
                    ) : data ? (
                      <CityMap
                        incidents={data.active_incidents}
                        dataAsOf={data.data_as_of}
                      />
                    ) : null}
              </div>

              <div className="surface flex h-[480px] flex-col">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="label-section">AI Intelligence Feed</span>
                  <span className="label-meta text-primary/70">
                    {data ? `${data.ai_feed.length} signals` : "—"}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loading && !data ? (
                    <div className="flex flex-col gap-2 p-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                      ))}
                    </div>
                  ) : data ? (
                    <AiFeed feed={data.ai_feed} />
                  ) : null}
                </div>
              </div>
            </div>

            {/* 24h heatmap */}
            <div className="mt-4">
              {loading && !data ? (
                <div className="surface flex h-56 flex-col gap-3 p-5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-44 w-full" />
                </div>
              ) : data ? (
                <HourlyHeatmap data={data.hourly_congestion} dataAsOf={data.data_as_of} />
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function KpiBand({
  data,
  loading,
}: {
  data: DashboardResponse | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="surface flex flex-col gap-2 p-3.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-6 w-full" />
          </div>
        ))}
      </div>
    );
  }
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {data.kpis.map((kpi, i) => (
        <KpiCard
          key={kpi.key}
          label={kpi.label}
          value={kpi.value}
          unit={kpi.unit}
          sparkline={kpi.sparkline}
          severity={(kpi.severity as Severity) ?? "low"}
          delta={kpi.delta}
          delay={i * 80}
        />
      ))}
    </div>
  );
}
