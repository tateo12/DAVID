"use client";

import React from "react";

interface RiskGaugeProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

function getRiskColor(score: number): string {
  if (score <= 25) return "#22c55e";
  if (score <= 50) return "#f59e0b";
  if (score <= 75) return "#f97316";
  return "#ef4444";
}

function getRiskLabel(score: number): string {
  if (score <= 25) return "Low";
  if (score <= 50) return "Medium";
  if (score <= 75) return "High";
  return "Critical";
}

export function RiskGauge({ score, size = 48, strokeWidth = 4, showLabel = false }: RiskGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (Math.min(Math.max(score, 0), 100) / 100) * circumference;
  const color = getRiskColor(score);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(51, 65, 85, 0.4)"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
            style={{
              filter: `drop-shadow(0 0 4px ${color}40)`,
            }}
          />
        </svg>
        {/* Score number in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="metric-number text-sentinel-text-primary"
            style={{
              fontSize: size * 0.28,
              color,
            }}
          >
            {score}
          </span>
        </div>
      </div>
      {showLabel && (
        <span
          className="text-xs font-medium"
          style={{ color }}
        >
          {getRiskLabel(score)}
        </span>
      )}
    </div>
  );
}
