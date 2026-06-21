import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";

/** Skeleton block — shimmer, never a spinner in content. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cn("skeleton", className)} style={style} aria-hidden />;
}

/** Full-panel loading state matching the surface aesthetic. */
export function LoadingPanel({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 p-6", className)}>
      <Skeleton className="h-4 w-32" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-12 w-full"
            style={{ opacity: 1 - i * 0.1 }}
          />
        ))}
      </div>
    </div>
  );
}

/** Error panel — surfaces the real FastAPI detail per the brief. */
export function ErrorPanel({
  error,
  onRetry,
  title = "Couldn’t load this view",
}: {
  error: ApiError | Error;
  onRetry?: () => void;
  title?: string;
}) {
  const isApi = error instanceof ApiError;
  const detail = isApi ? error.detail : error.message;
  const status = isApi ? error.status : -1;

  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="size-4 text-[var(--critical)]" strokeWidth={2} />
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      <p className="max-w-md text-[12px] leading-relaxed text-muted-foreground">
        {status === 0
          ? "Couldn't reach the ASTraM API. Is uvicorn running on port 8000?"
          : status === 503
            ? "The ML model isn't loaded on the backend yet. Run preprocessing + training, then retry."
            : detail || "Unknown error."}
      </p>
      {isApi && status > 0 && (
        <code className="rounded-sm border border-border bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {error.endpoint} → {status}
        </code>
      )}
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="mt-1">
          <RefreshCw className="size-3" strokeWidth={2} />
          Retry
        </Button>
      )}
    </div>
  );
}

/** Empty state — teaches the operator, never "nothing here". */
export function EmptyPanel({
  title,
  hint,
  icon: Icon,
}: {
  title: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="flex flex-col items-start gap-2 p-6">
      {Icon && <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />}
      <span className="text-sm font-medium text-foreground">{title}</span>
      {hint && (
        <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
