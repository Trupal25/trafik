"use client";

import { Sparkle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEVERITY_BADGE_CLASS,
  SEVERITY_TEXT_CLASS,
  type Severity,
} from "@/lib/severity";
import { formatRelative } from "@/lib/format";
import type { DashboardResponse } from "@/lib/types";

export function AiFeed({ feed }: { feed: DashboardResponse["ai_feed"] }) {
  if (!feed || feed.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-start gap-2 p-5">
        <Sparkle className="size-4 text-muted-foreground" strokeWidth={1.75} />
        <span className="text-[13px] font-medium text-foreground">
          No clusters detected in the active window.
        </span>
        <p className="max-w-xs text-[12px] leading-relaxed text-muted-foreground">
          The intelligence engine surfaces clusters when the same cause recurs at a
          junction. Standing by.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {feed.map((item, i) => (
        <FeedCard key={item.id} item={item} delay={i * 70} />
      ))}
    </div>
  );
}

function FeedCard({
  item,
  delay,
}: {
  item: DashboardResponse["ai_feed"][number];
  delay: number;
}) {
  return (
    <article
      className={cn(
        "animate-feed-in flex flex-col gap-2 rounded-md border border-border/70 bg-background/40 p-3",
        "transition-colors hover:border-border hover:bg-background/70"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("sev", SEVERITY_BADGE_CLASS[item.severity as Severity])}>
          {item.zone}
        </span>
        <span className="label-meta">{formatRelative(item.generated_at)}</span>
      </div>
      <p className="text-[13px] leading-snug text-foreground">{item.summary}</p>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
          <MapPin className="size-3" strokeWidth={2} />
          <span className={SEVERITY_TEXT_CLASS[item.severity as Severity]}>
            {item.confidence}%
          </span>
          <span className="text-muted-foreground/70">confidence</span>
        </span>
      </div>
    </article>
  );
}
