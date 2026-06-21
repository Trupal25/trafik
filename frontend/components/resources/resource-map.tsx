"use client";

import dynamic from "next/dynamic";
import type { ResourcePlanResponse } from "@/lib/types";

const ResourceMapInner = dynamic(
  () => import("./resource-map-inner").then((m) => m.ResourceMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="surface flex h-full min-h-[480px] items-center justify-center">
        <span className="label-meta">Loading deployment map</span>
      </div>
    ),
  }
);

export function ResourceMap({ plan }: { plan: ResourcePlanResponse }) {
  return <ResourceMapInner plan={plan} />;
}
