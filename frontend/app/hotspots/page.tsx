"use client";

import { useState, useMemo } from "react";
import { RefreshCw, Siren } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton, ErrorPanel } from "@/components/common/state";
import { HotspotMap } from "@/components/hotspots/hotspot-map";
import { HotspotList } from "@/components/hotspots/hotspot-list";
import { HotspotDetail } from "@/components/hotspots/hotspot-detail";
import { useApi } from "@/lib/use-api";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { HotspotsExtendedResponse } from "@/lib/types";
import type { Severity } from "@/lib/severity";

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export default function HotspotsPage() {
  const { data, error, loading, refetch } = useApi<HotspotsExtendedResponse>(
    () => api.hotspotsExtended(),
    { refetchMs: 120_000 }
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(
    () => data?.hotspots.find((h) => h.junction_code === selectedId) ?? null,
    [data, selectedId]
  );

  return (
    <>
      <PageHeader
        eyebrow="04 / Recurring Risk"
        title="Hotspot Intelligence"
        description="Recurring high-incident junctions ranked by 30-day frequency, mapped by severity, with AI intervention recommendations and 7-day trend per hotspot."
        actions={
          <Button size="sm" variant="outline" onClick={refetch} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin size-3" : "size-3"} strokeWidth={2} />
            Refresh
          </Button>
        }
        meta={
          <SummaryStats data={data} loading={loading} />
        }
      />

      <div className="flex-1 overflow-auto p-6 sm:p-8">
        {error && !data ? (
          <div className="surface">
            <ErrorPanel error={error} onRetry={refetch} />
          </div>
        ) : loading && !data ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
            <div className="surface flex flex-col">
              <Skeleton className="m-4 h-3 w-32" />
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="mx-3 mb-1 h-14 w-auto" />
              ))}
            </div>
            <Skeleton className="h-[560px] w-full" />
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
            <div className="surface flex h-[680px] flex-col overflow-hidden">
              {selected ? (
                <HotspotDetail hotspot={selected} onBack={() => setSelectedId(null)} />
              ) : (
                <HotspotList
                  hotspots={data.hotspots}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )}
            </div>
            <div className="h-[680px]">
              <HotspotMap
                hotspots={data.hotspots}
                selectedId={selectedId}
                onSelect={setSelectedId}
                dataAsOf={data.data_as_of}
              />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function SummaryStats({
  data,
  loading,
}: {
  data: HotspotsExtendedResponse | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return <span className="label-meta">Loading summary…</span>;
  }
  if (!data) return null;
  const counts: Record<Severity, number> = {
    critical: data.summary.critical,
    high: data.summary.high,
    medium: data.summary.medium,
    low: 0,
  };
  return (
    <div className="flex items-center gap-4">
      <span className="label-meta flex items-center gap-1.5">
        <Siren className="size-3 text-primary" strokeWidth={2} />
        {data.summary.total} active hotspots
      </span>
      {SEV_ORDER.filter((s) => s !== "low").map((s) => (
        <span key={s} className="label-meta flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", `bg-[var(--${s})]`)} />
          <span className={`text-[var(--${s})]`}>{counts[s]}</span>
          <span className="text-muted-foreground/70">{s}</span>
        </span>
      ))}
    </div>
  );
}
