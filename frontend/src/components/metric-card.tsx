"use client";

import React from "react";
import { TrendingUp, TrendingDown, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  /** Week-over-week % change; null = no prior-period baseline */
  trend: number | null;
  prefix?: string;
  iconColor?: string;
  /** When true, a negative trend is shown as favorable (e.g. fewer incidents). */
  invertTrend?: boolean;
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  trend,
  prefix = "",
  iconColor = "text-primary",
  invertTrend = false,
}: MetricCardProps) {
  const raw = trend ?? 0;
  const favorable = invertTrend ? raw <= 0 : raw >= 0;
  const trendColor = favorable ? "text-secondary-fixed" : "text-error";
  const TrendIcon = raw >= 0 ? TrendingUp : TrendingDown;

  const iconBg =
    iconColor.includes("error") || iconColor.includes("red")
      ? "bg-error/10"
      : iconColor.includes("secondary") || iconColor.includes("lime") || iconColor.includes("amber")
        ? "bg-secondary-container/10"
        : iconColor.includes("primary")
          ? "bg-primary-container/15"
          : "bg-surface-container-highest";

  return (
    <div className="group cursor-default rounded-xl border border-outline-variant/10 bg-surface-container-low p-5 transition-shadow hover:border-outline-variant/20">
      <div className="mb-3 flex items-start justify-between">
        <div className={cn("rounded-lg p-2.5 transition-all duration-200", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        {trend === null ? (
          <span className="text-xs text-on-surface-variant/70">—</span>
        ) : (
          <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        )}
      </div>
      <div className="mb-1 font-mono text-2xl font-bold text-white lg:text-3xl">
        {prefix}
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <p className="text-sm text-on-surface-variant">{label}</p>
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-5">
      <div className="mb-3 flex items-start justify-between">
        <div className="h-10 w-10 animate-pulse rounded-lg bg-surface-container-highest" />
        <div className="h-4 w-14 animate-pulse rounded bg-surface-container-highest" />
      </div>
      <div className="mb-2 h-8 w-24 animate-pulse rounded bg-surface-container-highest" />
      <div className="h-4 w-32 animate-pulse rounded bg-surface-container-highest" />
    </div>
  );
}
