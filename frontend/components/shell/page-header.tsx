import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}

/**
 * PageHeader — consistent masthead across every authenticated page.
 * Eyebrow is mono uppercase, title is tight sans, optional meta row for
 * live timestamps / data scope. Actions float right.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-border px-6 py-5 sm:px-8",
        "bg-background/80 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="label-section text-primary/80">{eyebrow}</span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {meta && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-0.5">
          {meta}
        </div>
      )}
    </header>
  );
}
