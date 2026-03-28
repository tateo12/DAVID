"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ShieldAlert, DollarSign, Ghost, Users, Send, Loader2, LayoutDashboard } from "lucide-react";
import { MetricCard, MetricCardSkeleton } from "@/components/metric-card";
import { ThreatFeed } from "@/components/threat-feed";
import { PageHeader } from "@/components/page-header";
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

const RISK_PIE_COLORS: Record<string, string> = {
  low: "#84cc16",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const riskBadgeStyles: Record<RiskLevel, string> = {
  low: "bg-sentinel-green/10 text-sentinel-green/80 border-sentinel-green/20",
  medium: "bg-sentinel-amber/15 text-sentinel-amber border-sentinel-amber/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  critical: "bg-sentinel-red/15 text-sentinel-red border-sentinel-red/30",
};

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [analyzerPrompt, setAnalyzerPrompt] = useState("");
  const [analyzerResult, setAnalyzerResult] = useState<AnalysisResult | null>(null);
  const [analyzerLoading, setAnalyzerLoading] = useState(false);

  useEffect(() => {
    fetchMetrics().then(setMetrics);
  }, []);

  const pieData = useMemo(() => {
    if (!metrics?.risk_distribution?.length) return [];
    return metrics.risk_distribution
      .filter((s) => s.count > 0)
      .map((s) => ({
        name: s.level.charAt(0).toUpperCase() + s.level.slice(1),
        value: s.count,
        color: RISK_PIE_COLORS[s.level] ?? "#94a3b8",
      }));
  }, [metrics?.risk_distribution]);

  const chartTrend = metrics?.threat_trend_chart ?? [];

  const handleAnalyze = useCallback(async () => {
    if (!analyzerPrompt.trim() || analyzerLoading) return;
    setAnalyzerLoading(true);
    setAnalyzerResult(null);
    try {
      const result = await analyzePrompt(analyzerPrompt);
      setAnalyzerResult(result);
    } finally {
      setAnalyzerLoading(false);
    }
  }, [analyzerPrompt, analyzerLoading]);

  return (
    <div className="space-y-6">
      <PageHeader
        accent="dashboard"
        icon={LayoutDashboard}
        title="Security dashboard"
        description="Rolling 7-day KPIs with week-over-week trends. Threat feed polls the API; charts share the same window as KPIs."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics ? (
          <>
            <MetricCard
              icon={ShieldAlert}
              label="Threats blocked (7d)"
              value={metrics.threats_blocked}
              trend={metrics.threats_blocked_trend}
              iconColor="text-sentinel-red"
            />
            <MetricCard
              icon={DollarSign}
              label="Est. cost saved (7d)"
              value={metrics.cost_saved}
              trend={metrics.cost_saved_trend}
              prefix="$"
              iconColor="text-sentinel-green"
            />
            <MetricCard
              icon={Ghost}
              label="Shadow AI events (7d)"
              value={metrics.shadow_ai_detected}
              trend={metrics.shadow_ai_trend}
              iconColor="text-sentinel-amber"
            />
            <MetricCard
              icon={Users}
              label="Employees with prompts (7d)"
              value={metrics.active_employees}
              trend={metrics.active_employees_trend}
              iconColor="text-sentinel-blue"
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-card p-5 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-sentinel-text-primary">Threat Feed</h2>
            <div className="flex items-center gap-2">
              <div className="live-dot" />
              <span className="text-xs text-sentinel-text-secondary">Live from API</span>
            </div>
          </div>
          <ThreatFeed maxItems={15} />
        </div>

        <div className="space-y-6">
          <div className="glass-card p-5 rounded-xl">
            <h3 className="text-sm font-semibold text-sentinel-text-primary mb-1">Threats over time</h3>
            <p className="text-[10px] text-sentinel-text-secondary/80 mb-3">High/critical vs blocked prompts by day (UTC)</p>
            <div className="h-[200px]">
              {chartTrend.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-sentinel-text-secondary">
                  No prompts in the last 7 days
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartTrend}>
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
                      allowDecimals={false}
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
                      name="High/critical"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#threatGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#3b82f6" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="blocked"
                      name="Blocked"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#blockedGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#22c55e" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded bg-sentinel-blue" />
                <span className="text-[10px] text-sentinel-text-secondary">High/critical</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded bg-sentinel-green" />
                <span className="text-[10px] text-sentinel-text-secondary">Blocked</span>
              </div>
            </div>
          </div>

          <div className="glass-card p-5 rounded-xl">
            <h3 className="text-sm font-semibold text-sentinel-text-primary mb-1">Risk distribution</h3>
            <p className="text-[10px] text-sentinel-text-secondary/80 mb-3">Prompts by risk level (last 30 days)</p>
            <div className="h-[200px]">
              {pieData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-sentinel-text-secondary">
                  No prompts in the last 30 days
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {pieData.map((entry, idx) => (
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
                      formatter={(value: number) => [`${value} prompts`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 rounded-xl">
        <h2 className="text-lg font-semibold text-sentinel-text-primary mb-1">Prompt analyzer</h2>
        <p className="text-sm text-sentinel-text-secondary mb-4">
          Runs the same analysis pipeline as the API (uses the default employee id from the client config).
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={analyzerPrompt}
            onChange={(e) => setAnalyzerPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            placeholder="Enter a prompt to analyze…"
            className="flex-1 px-4 py-2.5 rounded-lg bg-sentinel-surface border border-sentinel-border text-sentinel-text-primary placeholder:text-sentinel-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-sentinel-blue/30 focus:border-sentinel-blue/50 transition-all duration-200 text-sm"
          />
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzerLoading || !analyzerPrompt.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-sentinel-blue hover:bg-sentinel-blue/90 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {analyzerLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Analyze
          </button>
        </div>

        {analyzerResult && (
          <div
            className="mt-4 p-4 rounded-lg border border-sentinel-border/50 animate-fade-in"
            style={{ background: "rgba(30, 41, 59, 0.4)" }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Badge
                variant="outline"
                className={`uppercase tracking-wider text-[10px] font-semibold px-2.5 py-1 ${
                  riskBadgeStyles[analyzerResult.risk_level]
                }`}
              >
                {analyzerResult.risk_level}
              </Badge>
              <span className="text-sm text-sentinel-text-secondary">
                Risk score:{" "}
                <span className="metric-number text-sentinel-text-primary">{analyzerResult.risk_score}</span>/100
              </span>
            </div>
            {analyzerResult.categories.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {analyzerResult.categories.map((cat) => (
                  <Badge
                    key={cat}
                    variant="outline"
                    className="text-[10px] border-sentinel-border text-sentinel-text-secondary"
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-sm text-sentinel-text-secondary">{analyzerResult.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
}
