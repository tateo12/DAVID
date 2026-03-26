"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { fetchWeeklyReport } from "@/lib/api";
import { WeeklyReport } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileBarChart,
  ShieldAlert,
  DollarSign,
  Users,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Calendar,
} from "lucide-react";
import { RiskGauge } from "@/components/risk-gauge";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function ReportsPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeeklyReport().then((data) => {
      setReport(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 max-w-5xl mx-auto">
        <div className="h-10 w-64 skeleton" />
        <div className="h-6 w-96 skeleton" />
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 skeleton rounded-xl" />
          ))}
        </div>
        <div className="h-64 skeleton rounded-xl" />
        <div className="h-48 skeleton rounded-xl" />
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Report Header */}
      <div className="border-b border-sentinel-border pb-6">
        <div className="flex items-center gap-3 mb-2">
          <Image
            src="/sentinel_logo.png"
            alt="Sentinel"
            width={44}
            height={44}
            className="shrink-0 rounded-full"
          />
          <div>
            <h1 className="text-3xl font-bold text-sentinel-text-primary">Weekly Executive Summary</h1>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="w-3.5 h-3.5 text-sentinel-text-secondary" />
              <span className="text-sm text-sentinel-text-secondary">
                {formatDate(report.week_start)} — {formatDate(report.week_end)}
              </span>
            </div>
          </div>
        </div>
        <p className="text-sm text-sentinel-text-secondary/80 mt-3 leading-relaxed max-w-2xl">
          Comprehensive overview of AI security posture, threat landscape, and actionable recommendations
          for the reporting period.
        </p>
      </div>

      {/* Key Metrics */}
      <section>
        <h2 className="text-lg font-semibold text-sentinel-text-primary mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-sentinel-blue" />
          Key Metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <div className="glass-card p-5 rounded-xl text-center">
            <div className="p-2 rounded-lg bg-sentinel-blue/10 w-fit mx-auto mb-3">
              <FileBarChart className="w-5 h-5 text-sentinel-blue" />
            </div>
            <div className="metric-number text-2xl text-sentinel-text-primary">
              {report.key_metrics.total_prompts.toLocaleString()}
            </div>
            <div className="text-xs text-sentinel-text-secondary mt-1">Total Prompts</div>
          </div>
          <div className="glass-card p-5 rounded-xl text-center">
            <div className="p-2 rounded-lg bg-sentinel-red/10 w-fit mx-auto mb-3">
              <ShieldAlert className="w-5 h-5 text-sentinel-red" />
            </div>
            <div className="metric-number text-2xl text-sentinel-red">
              {report.key_metrics.threats_blocked.toLocaleString()}
            </div>
            <div className="text-xs text-sentinel-text-secondary mt-1">Threats Blocked</div>
          </div>
          <div className="glass-card p-5 rounded-xl text-center">
            <div className="p-2 rounded-lg bg-sentinel-amber/10 w-fit mx-auto mb-3">
              <Users className="w-5 h-5 text-sentinel-amber" />
            </div>
            <div className="metric-number text-2xl text-sentinel-amber">
              {report.key_metrics.high_risk_users}
            </div>
            <div className="text-xs text-sentinel-text-secondary mt-1">High Risk Users</div>
          </div>
          <div className="glass-card p-5 rounded-xl text-center">
            <div className="p-2 rounded-lg bg-sentinel-green/10 w-fit mx-auto mb-3">
              <DollarSign className="w-5 h-5 text-sentinel-green" />
            </div>
            <div className="metric-number text-2xl text-sentinel-green">
              ${report.key_metrics.cost_saved.toLocaleString()}
            </div>
            <div className="text-xs text-sentinel-text-secondary mt-1">Cost Saved</div>
          </div>
          <div className="glass-card p-5 rounded-xl text-center">
            <div className="p-2 rounded-lg bg-cyan-500/10 w-fit mx-auto mb-3">
              <TrendingUp className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="metric-number text-2xl text-sentinel-text-primary">
              {report.key_metrics.avg_risk_score.toFixed(1)}
            </div>
            <div className="text-xs text-sentinel-text-secondary mt-1">Avg Risk Score</div>
          </div>
        </div>
      </section>

      {/* Threat Trend Chart */}
      <section>
        <h2 className="text-lg font-semibold text-sentinel-text-primary mb-4 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-sentinel-red" />
          Threat Trend
        </h2>
        <div className="glass-card p-6 rounded-xl">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.threat_trend}>
                <defs>
                  <linearGradient id="reportThreatGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="reportSafeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.3)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(51,65,85,0.3)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: "rgba(30, 41, 59, 0.95)",
                    border: "1px solid rgba(51, 65, 85, 0.5)",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                    fontSize: "13px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="safe"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#reportSafeGrad)"
                  dot={{ fill: "#22c55e", r: 3 }}
                />
                <Area
                  type="monotone"
                  dataKey="threats"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#reportThreatGrad)"
                  dot={{ fill: "#ef4444", r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-6 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded bg-sentinel-green" />
              <span className="text-xs text-sentinel-text-secondary">Safe Prompts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded bg-sentinel-red" />
              <span className="text-xs text-sentinel-text-secondary">Threats Detected</span>
            </div>
          </div>
        </div>
      </section>

      {/* Top Risks */}
      <section>
        <h2 className="text-lg font-semibold text-sentinel-text-primary mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-sentinel-amber" />
          Top Risks
        </h2>
        <div className="glass-card rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-sentinel-border hover:bg-transparent">
                <TableHead className="text-sentinel-text-secondary font-medium">Employee</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Department</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Risk Score</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Flagged Prompts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.top_risks.map((risk, i) => (
                <TableRow key={i} className="border-sentinel-border/50 hover:bg-sentinel-surface-hover/50 transition-colors">
                  <TableCell className="text-sm font-medium text-sentinel-text-primary">{risk.employee}</TableCell>
                  <TableCell className="text-sm text-sentinel-text-secondary">{risk.department}</TableCell>
                  <TableCell>
                    <RiskGauge score={risk.risk_score} size={36} strokeWidth={3} />
                  </TableCell>
                  <TableCell className="metric-number text-sm text-sentinel-red">{risk.flagged_prompts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Recommendations */}
      <section>
        <h2 className="text-lg font-semibold text-sentinel-text-primary mb-4 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-sentinel-amber" />
          Recommendations
        </h2>
        <div className="space-y-3">
          {report.recommendations.map((rec, i) => (
            <div
              key={i}
              className="glass-card p-4 rounded-xl flex items-start gap-3 group hover:border-sentinel-blue/30"
            >
              <div className="mt-0.5 w-6 h-6 rounded-full bg-sentinel-blue/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-sentinel-blue">{i + 1}</span>
              </div>
              <p className="text-sm text-sentinel-text-primary/90 leading-relaxed">{rec}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Report Footer */}
      <div className="flex flex-col items-center gap-3 py-8 border-t border-sentinel-border/30">
        <Image
          src="/sentinel_logo.png"
          alt="Sentinel"
          width={28}
          height={28}
          className="opacity-40 rounded-full"
        />
        <p className="text-xs text-sentinel-text-secondary/50">
          Generated by Sentinel AI Security Supervisor • {formatDate(report.generated_at)}
        </p>
      </div>
    </div>
  );
}
