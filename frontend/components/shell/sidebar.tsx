"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FlaskConical,
  LineChart,
  Siren,
  ShieldAlert,
  Bot,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  hint: string;
  match: (path: string) => boolean;
}

const NAV: NavItem[] = [
  {
    label: "Command Center",
    href: "/",
    icon: LayoutDashboard,
    hint: "City-wide overview",
    match: (p) => p === "/",
  },
  {
    label: "Event Simulator",
    href: "/simulator",
    icon: FlaskConical,
    hint: "Predict impact",
    match: (p) => p.startsWith("/simulator"),
  },
  {
    label: "Event Intelligence",
    href: "/intelligence",
    icon: LineChart,
    hint: "Historical analytics",
    match: (p) => p.startsWith("/intelligence"),
  },
  {
    label: "Hotspot Intelligence",
    href: "/hotspots",
    icon: Siren,
    hint: "Recurring risk zones",
    match: (p) => p.startsWith("/hotspots"),
  },
  {
    label: "Resource Planner",
    href: "/resources",
    icon: ShieldAlert,
    hint: "AI deployment plan",
    match: (p) => p.startsWith("/resources"),
  },
  {
    label: "AI Copilot",
    href: "/copilot",
    icon: Bot,
    hint: "Ask anything",
    match: (p) => p.startsWith("/copilot"),
  },
  {
    label: "Forecasting Center",
    href: "/forecasting",
    icon: Sparkles,
    hint: "ML predictions",
    match: (p) => p.startsWith("/forecasting"),
  },
];

function useApiHealth() {
  const [state, setState] = useState<"online" | "offline" | "checking">(
    "checking"
  );
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        await api.health();
        if (!cancelled) setState("online");
      } catch (err) {
        if (!cancelled)
          setState(err instanceof ApiError && err.status === 0 ? "offline" : "online");
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return state;
}

export function Sidebar() {
  const pathname = usePathname();
  const health = useApiHealth();

  return (
    <aside
      className={cn(
        "flex h-screen w-[252px] shrink-0 flex-col border-r border-sidebar-border",
        "bg-sidebar text-sidebar-foreground"
      )}
    >
      {/* Wordmark — Instrument Serif italic for the brand, mono tag below */}
      <div className="flex items-baseline gap-2.5 px-5 pt-6 pb-5">
        <span className="live-dot mt-1.5 shrink-0" aria-hidden />
        <div className="flex flex-col leading-none">
          <span
            className="text-[22px] leading-none tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-heading)", fontStyle: "italic" }}
          >
            UrbanPulse
          </span>
          <span className="label-meta mt-1.5">
            <span className="text-primary">AI</span>
            <span className="mx-1.5 text-sidebar-border">/</span>
            BLR Traffic
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        <span className="label-section px-2 pb-2 pt-1">Operations</span>
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors",
                active
                  ? "bg-primary/12 text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
                strokeWidth={1.75}
              />
              <span className="flex flex-1 flex-col leading-tight">
                <span className="text-[13px] font-medium tracking-tight">
                  {item.label}
                </span>
                <span className="font-mono text-[10px] tracking-wide text-muted-foreground/70">
                  {item.hint}
                </span>
              </span>
              {active && (
                <span
                  className="size-1 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* System status */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-1.5 rounded-full",
                health === "online" && "bg-primary",
                health === "offline" && "bg-[var(--critical)]",
                health === "checking" && "bg-muted-foreground animate-pulse"
              )}
            />
            <span className="label-meta">
              {health === "online" && "API Online"}
              {health === "offline" && "API Offline"}
              {health === "checking" && "Connecting"}
            </span>
          </div>
          <span className="label-meta text-muted-foreground/60">v1.0.0</span>
        </div>
        <Link
          href="/settings"
          className="mt-2.5 flex items-center gap-2 rounded-sm px-1 py-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings className="size-3.5" strokeWidth={1.75} />
          <span className="text-[11px] tracking-wide">Settings</span>
        </Link>
      </div>
    </aside>
  );
}
