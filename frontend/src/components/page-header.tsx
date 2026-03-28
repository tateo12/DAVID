"use client";

import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PageAccent =
  | "dashboard"
  | "employees"
  | "prompts"
  | "policies"
  | "shadow"
  | "agents"
  | "reports";

const ACCENT: Record<
  PageAccent,
  { mesh: string; bar: string; iconWrap: string }
> = {
  dashboard: {
    mesh: "from-cyan-500/25 via-blue-600/15 to-indigo-900/30",
    bar: "bg-gradient-to-b from-cyan-400 to-blue-600",
    iconWrap: "bg-cyan-500/15 border-cyan-400/25 text-cyan-300",
  },
  employees: {
    mesh: "from-violet-500/20 via-fuchsia-600/10 to-slate-900/40",
    bar: "bg-gradient-to-b from-violet-400 to-fuchsia-600",
    iconWrap: "bg-violet-500/15 border-violet-400/25 text-violet-200",
  },
  prompts: {
    mesh: "from-teal-500/20 via-emerald-600/12 to-slate-900/40",
    bar: "bg-gradient-to-b from-teal-400 to-emerald-600",
    iconWrap: "bg-teal-500/15 border-teal-400/25 text-teal-200",
  },
  policies: {
    mesh: "from-amber-500/20 via-orange-600/12 to-slate-900/40",
    bar: "bg-gradient-to-b from-amber-400 to-orange-600",
    iconWrap: "bg-amber-500/15 border-amber-400/25 text-amber-100",
  },
  shadow: {
    mesh: "from-fuchsia-500/18 via-rose-600/12 to-slate-950/50",
    bar: "bg-gradient-to-b from-fuchsia-500 to-rose-600",
    iconWrap: "bg-fuchsia-500/15 border-fuchsia-400/20 text-fuchsia-200",
  },
  agents: {
    mesh: "from-emerald-500/22 via-green-600/12 to-slate-900/40",
    bar: "bg-gradient-to-b from-emerald-400 to-green-600",
    iconWrap: "bg-emerald-500/15 border-emerald-400/25 text-emerald-200",
  },
  reports: {
    mesh: "from-sky-500/22 via-blue-600/14 to-indigo-950/40",
    bar: "bg-gradient-to-b from-sky-400 to-indigo-600",
    iconWrap: "bg-sky-500/15 border-sky-400/25 text-sky-200",
  },
};

interface PageHeaderProps {
  accent: PageAccent;
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  /** Optional right-side actions (filters, buttons) */
  actions?: React.ReactNode;
}

export function PageHeader({ accent, icon: Icon, title, description, actions }: PageHeaderProps) {
  const a = ACCENT[accent];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-900/40 mb-8">
      <div
        className={cn(
          "pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl opacity-70",
          "bg-gradient-to-br",
          a.mesh
        )}
      />
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20256%20256%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.85%22%20numOctaves%3D%224%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%20opacity%3D%220.04%22%2F%3E%3C%2Fsvg%3E')]"
      />
      <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex gap-4 min-w-0">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border shadow-lg shadow-black/20",
              a.iconWrap
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("h-6 w-1 rounded-full", a.bar)} aria-hidden />
              <h1 className="font-display text-2xl font-bold tracking-tight text-sentinel-text-primary sm:text-3xl">
                {title}
              </h1>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-sentinel-text-secondary">
              {description}
            </p>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-1">{actions}</div> : null}
      </div>
    </div>
  );
}
