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
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  trend,
  prefix = "",
  iconColor = "text-sentinel-blue",
}: MetricCardProps) {
  const isPositive = (trend ?? 0) >= 0;
  const trendColor =
    label.toLowerCase().includes("shadow")
      ? (trend ?? 0) <= 0
        ? "text-sentinel-green"
        : "text-sentinel-red"
      : isPositive
        ? "text-sentinel-green"
        : "text-sentinel-red";
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  const iconBg =
    iconColor.includes("red")
      ? "bg-red-500/10"
      : iconColor.includes("green")
        ? "bg-emerald-500/10"
        : iconColor.includes("amber")
          ? "bg-amber-500/10"
          : iconColor.includes("blue")
            ? "bg-blue-500/10"
            : "bg-slate-500/10";

  return (
    <div className="glass-card p-5 rounded-xl group cursor-default transition-shadow duration-300 hover:shadow-lg hover:shadow-cyan-500/5">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("p-2.5 rounded-lg transition-all duration-200", iconBg)}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {trend === null ? (
          <span className="text-xs text-sentinel-text-secondary/70">—</span>
        ) : (
          <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="w-3.5 h-3.5" />
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        )}
      </div>
      <div className="metric-number text-2xl lg:text-3xl text-sentinel-text-primary mb-1">
        {prefix}
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <p className="text-sm text-sentinel-text-secondary">{label}</p>
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="glass-card p-5 rounded-xl">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 skeleton rounded-lg" />
        <div className="w-14 h-4 skeleton" />
      </div>
      <div className="w-24 h-8 skeleton mb-2" />
      <div className="w-32 h-4 skeleton" />
    </div>
  );
}
