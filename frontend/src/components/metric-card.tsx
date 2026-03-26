"use client";

import React from "react";
import { TrendingUp, TrendingDown, LucideIcon } from "lucide-react";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend: number;
  prefix?: string;
  iconColor?: string;
}

export function MetricCard({ icon: Icon, label, value, trend, prefix = "", iconColor = "text-sentinel-blue" }: MetricCardProps) {
  const isPositive = trend >= 0;
  // For "Shadow AI Detected", negative trend = good (fewer detections)
  const trendColor = label.toLowerCase().includes("shadow")
    ? trend <= 0
      ? "text-sentinel-green"
      : "text-sentinel-red"
    : isPositive
    ? "text-sentinel-green"
    : "text-sentinel-red";
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="glass-card p-5 rounded-xl group cursor-default">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-lg bg-opacity-10 ${iconColor} transition-all duration-200`}
          style={{ backgroundColor: "rgba(59, 130, 246, 0.1)" }}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span>{Math.abs(trend).toFixed(1)}%</span>
        </div>
      </div>
      <div className="metric-number text-2xl lg:text-3xl text-sentinel-text-primary mb-1">
        {prefix}{typeof value === "number" ? value.toLocaleString() : value}
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
