"use client";

import React, { useState, useEffect } from "react";
import { fetchMetrics, fetchShadowAI, fetchWeeklyReport } from "@/lib/api";
import { ShieldMark } from "@/components/shield-mark";
import type { Metrics, ShadowAISummary, WeeklyReport } from "@/lib/types";
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
  Users,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Calendar,
  Cpu,
  Eye,
} from "lucide-react";
import { RiskGauge } from "@/components/risk-gauge";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function MetricTile({
  icon: Icon,
  iconWrapClass,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconWrapClass: string;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-5 text-center">
      <div className={`mx-auto mb-3 w-fit rounded-lg p-2 ${iconWrapClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-1 text-xs text-on-surface-variant">{label}</div>
    </div>
  );
}

export default function ReportsPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [shadow, setShadow] = useState<ShadowAISummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchWeeklyReport(), fetchMetrics(), fetchShadowAI()]).then(([rep, met, sh]) => {
      setReport(rep);
      setMetrics(met);
      setShadow(sh);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="h-10 w-64 animate-pulse rounded bg-surface-container-high" />
        <div className="h-6 w-96 animate-pulse rounded bg-surface-container-high" />
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container-high" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-surface-container-high" />
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-col gap-6 border-b border-outline-variant/10 pb-8 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-black uppercase tracking-tight text-white">Weekly executive summary</h1>
          <p className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            {formatDate(report.week_start)} — {formatDate(report.week_end)}
          </p>
          <p className="max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            Prompt counts, blocked threats, and risk signals from the last 7 days (aligned with the threat trend below).
          </p>
        </div>
        <ShieldMark size={44} className="shrink-0 text-secondary-fixed opacity-95" />
      </header>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <TrendingUp className="h-5 w-5 text-primary" />
          Key Metrics
        </h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            icon={FileBarChart}
            iconWrapClass="bg-primary-container/15 text-primary"
            value={report.key_metrics.total_prompts.toLocaleString()}
            label="Prompts (7 days)"
          />
          <MetricTile
            icon={ShieldAlert}
            iconWrapClass="bg-error/10 text-error"
            value={report.key_metrics.threats_blocked.toLocaleString()}
            label="Blocked (7 days)"
          />
          <MetricTile
            icon={Users}
            iconWrapClass="bg-[#f59e0b]/10 text-[#f59e0b]"
            value={report.key_metrics.high_risk_users}
            label="Employees (high/critical)"
          />
          <MetricTile
            icon={TrendingUp}
            iconWrapClass="bg-primary-container/15 text-primary-container"
            value={report.key_metrics.avg_risk_score.toFixed(1)}
            label="Avg risk score (active)"
          />
        </div>
      </section>

      <section id="shadow-signals" className="scroll-mt-24">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <Eye className="h-5 w-5 text-orange-400" />
          Shadow AI &amp; unapproved tools
        </h2>
        <p className="mb-4 max-w-3xl text-sm text-on-surface-variant">
          Unsanctioned tool detections roll up here alongside your weekly threat trend. Use Security Logs for full
          prompt history.
        </p>
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricTile
            icon={Eye}
            iconWrapClass="bg-orange-500/15 text-orange-400"
            value={
              metrics?.load_error
                ? "—"
                : metrics?.shadow_ai_detected?.toLocaleString() ?? "—"
            }
            label="Shadow signals (7d)"
          />
          <MetricTile
            icon={TrendingUp}
            iconWrapClass="bg-orange-500/10 text-orange-300"
            value={
              metrics?.load_error
                ? "—"
                : metrics?.shadow_ai_trend != null
                  ? `${metrics.shadow_ai_trend > 0 ? "+" : ""}${metrics.shadow_ai_trend}%`
                  : "—"
            }
            label="WoW shadow trend"
          />
          <MetricTile
            icon={Users}
            iconWrapClass="bg-surface-container-high text-on-surface-variant"
            value={shadow?.unique_tools?.toLocaleString() ?? "—"}
            label="Unique tools"
          />
          <MetricTile
            icon={Cpu}
            iconWrapClass="bg-surface-container-high text-on-surface-variant"
            value={shadow?.employees_involved?.toLocaleString() ?? "—"}
            label="Employees flagged"
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-low">
          <Table>
            <TableHeader>
              <TableRow className="border-outline-variant/10 hover:bg-transparent">
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Tool / domain
                </TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Employee
                </TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Risk
                </TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  When
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(shadow?.flags?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-on-surface-variant">
                    No shadow events in the current sample.
                  </TableCell>
                </TableRow>
              ) : (
                (shadow?.flags ?? []).slice(0, 12).map((f) => (
                  <TableRow key={f.id} className="border-outline-variant/5">
                    <TableCell className="font-mono text-sm text-white">{f.tool_detected}</TableCell>
                    <TableCell className="text-sm text-on-surface-variant">{f.employee_name}</TableCell>
                    <TableCell className="text-xs uppercase text-orange-300">{f.risk_level}</TableCell>
                    <TableCell className="font-mono text-xs text-outline">{f.date}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <ShieldAlert className="h-5 w-5 text-error" />
          Threat Trend
        </h2>
        <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-6">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.threat_trend}>
                <defs>
                  <linearGradient id="reportThreatGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffb4ab" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#ffb4ab" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="reportSafeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c3f400" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#c3f400" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333538" />
                <XAxis dataKey="date" tick={{ fill: "#908fa0", fontSize: 12 }} axisLine={{ stroke: "#333538" }} tickLine={false} />
                <YAxis tick={{ fill: "#908fa0", fontSize: 12 }} axisLine={false} tickLine={false} />
                <RechartsTooltip
                  contentStyle={{
                    background: "#1a1c1f",
                    border: "1px solid #464555",
                    borderRadius: "8px",
                    color: "#e2e2e6",
                    fontSize: "13px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="safe"
                  stroke="#c3f400"
                  strokeWidth={2}
                  fill="url(#reportSafeGrad)"
                  dot={{ fill: "#c3f400", r: 3 }}
                />
                <Area
                  type="monotone"
                  dataKey="threats"
                  stroke="#ffb4ab"
                  strokeWidth={2}
                  fill="url(#reportThreatGrad)"
                  dot={{ fill: "#ffb4ab", r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-3 rounded bg-secondary-fixed" />
              <span className="text-xs text-on-surface-variant">Safe Prompts</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-3 rounded bg-error" />
              <span className="text-xs text-on-surface-variant">Threats Detected</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <AlertTriangle className="h-5 w-5 text-[#f59e0b]" />
          Top Risks
        </h2>
        <div className="overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-low">
          <Table>
            <TableHeader>
              <TableRow className="border-outline-variant/10 hover:bg-transparent">
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Employee</TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Department</TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Risk Score</TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Flagged</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.top_risks.map((risk, i) => (
                <TableRow key={i} className="border-outline-variant/5 transition-colors hover:bg-surface-container-highest">
                  <TableCell className="text-sm font-medium text-white">{risk.employee}</TableCell>
                  <TableCell className="text-sm text-on-surface-variant">{risk.department}</TableCell>
                  <TableCell>
                    <RiskGauge score={risk.risk_score} size={36} strokeWidth={3} />
                  </TableCell>
                  <TableCell className="font-mono text-sm text-error">{risk.flagged_prompts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <Lightbulb className="h-5 w-5 text-[#f59e0b]" />
          Recommendations
        </h2>
        <div className="space-y-3">
          {report.recommendations.map((rec, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border border-outline-variant/10 bg-surface-container-low p-4 transition-colors hover:border-primary-container/30"
            >
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-container/20 text-xs font-bold text-primary">
                {i + 1}
              </div>
              <p className="text-sm leading-relaxed text-on-surface">{rec}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col items-center gap-3 border-t border-outline-variant/10 py-8">
        <ShieldMark size={30} className="text-secondary-fixed opacity-50" />
        <p className="text-xs text-on-surface-variant/60">
          Generated by Sentinel AI Security Supervisor • {formatDate(report.generated_at)}
        </p>
      </div>
    </div>
  );
}
