"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ShieldAlert, DollarSign, Ghost, Users, Send, Loader2 } from "lucide-react";
import { MetricCard, MetricCardSkeleton } from "@/components/metric-card";
import { ThreatFeed } from "@/components/threat-feed";
import { fetchMetrics, analyzePrompt } from "@/lib/api";
import { Metrics, AnalysisResult, RiskLevel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const threatTrendData = [
  { day: "Mon", threats: 156, blocked: 148 },
  { day: "Tue", threats: 189, blocked: 182 },
  { day: "Wed", threats: 201, blocked: 195 },
  { day: "Thu", threats: 178, blocked: 170 },
  { day: "Fri", threats: 223, blocked: 218 },
  { day: "Sat", threats: 67, blocked: 65 },
  { day: "Sun", threats: 45, blocked: 43 },
];

const riskDistribution = [
  { name: "Safe", value: 62, color: "#22c55e" },
  { name: "Low", value: 18, color: "#84cc16" },
  { name: "Medium", value: 12, color: "#f59e0b" },
  { name: "High", value: 6, color: "#f97316" },
  { name: "Critical", value: 2, color: "#ef4444" },
];

const riskBadgeStyles: Record<RiskLevel, string> = {
  safe: "bg-sentinel-green/15 text-sentinel-green border-sentinel-green/30",
  low: "bg-sentinel-green/10 text-sentinel-green/80 border-sentinel-green/20",
  medium: "bg-sentinel-amber/15 text-sentinel-amber border-sentinel-amber/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  critical: "bg-sentinel-red/15 text-sentinel-red border-sentinel-red/30",
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [demoPrompt, setDemoPrompt] = useState("");
  const [demoResult, setDemoResult] = useState<AnalysisResult | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    fetchMetrics().then(setMetrics);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!demoPrompt.trim() || demoLoading) return;
    setDemoLoading(true);
    setDemoResult(null);
    try {
      const result = await analyzePrompt(demoPrompt);
      setDemoResult(result);
    } finally {
      setDemoLoading(false);
    }
  }, [demoPrompt, demoLoading]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-sentinel-text-primary">Security Dashboard</h1>
        <p className="text-sm text-sentinel-text-secondary mt-1">
          Real-time AI threat monitoring and analysis
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics ? (
          <>
            <MetricCard
              icon={ShieldAlert}
              label="Threats Blocked"
              value={metrics.threats_blocked}
              trend={metrics.threats_blocked_trend}
              iconColor="text-sentinel-red"
            />
            <MetricCard
              icon={DollarSign}
              label="Cost Saved"
              value={metrics.cost_saved}
              trend={metrics.cost_saved_trend}
              prefix="$"
              iconColor="text-sentinel-green"
            />
            <MetricCard
              icon={Ghost}
              label="Shadow AI Detected"
              value={metrics.shadow_ai_detected}
              trend={metrics.shadow_ai_trend}
              iconColor="text-sentinel-amber"
            />
            <MetricCard
              icon={Users}
              label="Active Employees"
              value={metrics.active_employees}
              trend={metrics.active_employees_trend}
              iconColor="text-sentinel-blue"
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        )}
      </div>

      {/* Two-column layout: Feed + Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Threat Feed */}
        <div className="xl:col-span-2 glass-card p-5 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-sentinel-text-primary">Threat Feed</h2>
            <div className="flex items-center gap-2">
              <div className="live-dot" />
              <span className="text-xs text-sentinel-text-secondary">Auto-refreshing</span>
            </div>
          </div>
          <ThreatFeed maxItems={15} />
        </div>

        {/* Right: Charts */}
        <div className="space-y-6">
          {/* Threat Trend Chart */}
          <div className="glass-card p-5 rounded-xl">
            <h3 className="text-sm font-semibold text-sentinel-text-primary mb-4">
              Threats Over Time
            </h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={threatTrendData}>
                  <defs>
                    <linearGradient id="threatGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="blockedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.3)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(51,65,85,0.3)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: "rgba(30, 41, 59, 0.95)",
                      border: "1px solid rgba(51, 65, 85, 0.5)",
                      borderRadius: "8px",
                      color: "#f1f5f9",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="threats"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#threatGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#3b82f6" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="blocked"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#blockedGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#22c55e" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded bg-sentinel-blue" />
                <span className="text-[10px] text-sentinel-text-secondary">Detected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded bg-sentinel-green" />
                <span className="text-[10px] text-sentinel-text-secondary">Blocked</span>
              </div>
            </div>
          </div>

          {/* Risk Distribution Donut */}
          <div className="glass-card p-5 rounded-xl">
            <h3 className="text-sm font-semibold text-sentinel-text-primary mb-4">
              Risk Distribution
            </h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {riskDistribution.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string) => (
                      <span className="text-[10px] text-sentinel-text-secondary">{value}</span>
                    )}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: "rgba(30, 41, 59, 0.95)",
                      border: "1px solid rgba(51, 65, 85, 0.5)",
                      borderRadius: "8px",
                      color: "#f1f5f9",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [`${Number(value)}%`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Demo Analyzer */}
      <div className="glass-card p-6 rounded-xl">
        <h2 className="text-lg font-semibold text-sentinel-text-primary mb-1">
          Try It — Prompt Analyzer
        </h2>
        <p className="text-sm text-sentinel-text-secondary mb-4">
          Enter a prompt to analyze it for security risks in real-time
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={demoPrompt}
            onChange={(e) => setDemoPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            placeholder="e.g. Help me access the production database credentials..."
            className="flex-1 px-4 py-2.5 rounded-lg bg-sentinel-surface border border-sentinel-border text-sentinel-text-primary placeholder:text-sentinel-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-sentinel-blue/30 focus:border-sentinel-blue/50 transition-all duration-200 text-sm"
          />
          <button
            onClick={handleAnalyze}
            disabled={demoLoading || !demoPrompt.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sentinel-blue hover:bg-sentinel-blue/90 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {demoLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Analyze
          </button>
        </div>

        {/* Result */}
        {demoResult && (
          <div className="mt-4 p-4 rounded-lg border border-sentinel-border/50 animate-fade-in" style={{ background: "rgba(30, 41, 59, 0.4)" }}>
            <div className="flex items-center gap-3 mb-3">
              <Badge
                variant="outline"
                className={`uppercase tracking-wider text-[10px] font-semibold px-2.5 py-1 ${
                  riskBadgeStyles[demoResult.risk_level]
                }`}
              >
                {demoResult.risk_level}
              </Badge>
              <span className="text-sm text-sentinel-text-secondary">
                Risk Score: <span className="metric-number text-sentinel-text-primary">{demoResult.risk_score}</span>/100
              </span>
            </div>
            {demoResult.categories.length > 0 && (
              <div className="flex gap-2 mb-2">
                {demoResult.categories.map((cat) => (
                  <Badge key={cat} variant="outline" className="text-[10px] border-sentinel-border text-sentinel-text-secondary">
                    {cat}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-sm text-sentinel-text-secondary">{demoResult.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
}
