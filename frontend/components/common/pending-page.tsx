import { cn } from "@/lib/utils";

/**
 * PendingPage — honest placeholder for pages whose data layer is wired next.
 * Shows the design system + the page's intended topology via a layout hint,
 * not a bare "under construction" sign.
 */
export function PendingPage({
  eyebrow,
  title,
  description,
  wave,
  topology,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  wave: "Wave A" | "Wave B" | "Wave C";
  topology: "split" | "form" | "grid" | "chat" | "map";
  className?: string;
}) {
  return (
    <>
      <header className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="label-section text-primary/80">{eyebrow}</span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          <span className="sev sev-medium shrink-0">{wave}</span>
        </div>
      </header>

      <div className={cn("flex-1 overflow-auto p-6 sm:p-8", className)}>
        <TopologyHint topology={topology} />
      </div>
    </>
  );
}

function TopologyHint({ topology }: { topology: "split" | "form" | "grid" | "chat" | "map" }) {
  if (topology === "split") {
    return (
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="surface flex h-[480px] items-center justify-center">
          <SkeletonMap />
        </div>
        <div className="surface flex flex-col gap-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-16 w-full rounded-sm" />
          ))}
        </div>
      </div>
    );
  }
  if (topology === "form") {
    return (
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]">
        <div className="surface flex flex-col gap-3 p-5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="skeleton h-3 w-20 rounded-sm" />
              <div className="skeleton h-9 w-full rounded-sm" />
            </div>
          ))}
        </div>
        <div className="surface flex h-full min-h-[480px] items-center justify-center">
          <SkeletonMap />
        </div>
      </div>
    );
  }
  if (topology === "grid") {
    return (
      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="surface flex h-44 flex-col gap-2 p-4">
            <div className="skeleton h-3 w-24 rounded-sm" />
            <div className="skeleton h-24 w-full rounded-sm" />
          </div>
        ))}
      </div>
    );
  }
  if (topology === "chat") {
    return (
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <div className="surface flex flex-col gap-2 p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-12 w-full rounded-sm" />
          ))}
        </div>
        <div className="surface flex h-[560px] flex-col justify-end gap-3 p-5">
          <div className="skeleton h-16 w-3/4 rounded-sm self-end" />
          <div className="skeleton h-24 w-full rounded-sm" />
          <div className="skeleton h-9 w-full rounded-sm" />
        </div>
      </div>
    );
  }
  // map
  return (
    <div className="surface flex h-[560px] items-center justify-center">
      <SkeletonMap />
    </div>
  );
}

function SkeletonMap() {
  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="opacity-40">
        <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 3" />
        <circle cx="60" cy="60" r="32" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 3" />
        <circle cx="60" cy="60" r="3" fill="var(--primary)" opacity="0.7" />
        <circle cx="40" cy="48" r="2" fill="var(--high)" opacity="0.5" />
        <circle cx="78" cy="64" r="2" fill="var(--medium)" opacity="0.5" />
        <circle cx="62" cy="82" r="2" fill="var(--critical)" opacity="0.5" />
      </svg>
      <span className="label-meta">Awaiting live feed</span>
    </div>
  );
}
