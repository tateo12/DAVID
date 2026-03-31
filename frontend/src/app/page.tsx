"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ShadowAISummary } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fetchMetrics,
  fetchPrompts,
  fetchShadowAI,
  fetchEmployees,
  analyzePrompt,
} from "@/lib/api";
import { getSession } from "@/lib/session";
import type { Employee, Metrics, PromptRecord, AnalysisResult, RiskLevel } from "@/lib/types";
import { OrgRiskMap } from "@/components/org-risk-map";
import { ManagerAutomationPanel } from "@/components/manager-automation-panel";
import { MaterialIcon } from "@/components/stitch/material-icon";
import { cn } from "@/lib/utils";

function riskMixTotal(metrics: Metrics | null): number {
  if (!metrics?.risk_distribution?.length) return 0;
  return metrics.risk_distribution.reduce((a, b) => a + (b.count || 0), 0);
}

/** Real scores only when the dashboard loaded and there is prompt/risk volume to aggregate. */
function canScoreFromMetrics(metrics: Metrics | null): boolean {
  return Boolean(metrics && !metrics.load_error && riskMixTotal(metrics) > 0);
}

function healthScore(metrics: Metrics | null): number | null {
  if (!canScoreFromMetrics(metrics) || !metrics) return null;
  const w: Record<string, number> = { low: 8, medium: 24, high: 48, critical: 72 };
  let sum = 0;
  let n = 0;
  for (const r of metrics.risk_distribution) {
    const c = r.count || 0;
    sum += (w[r.level] ?? 30) * c;
    n += c;
  }
  if (n === 0) return null;
  return Math.max(12, Math.min(99, Math.round(100 - sum / n)));
}

function networkIntegrity(metrics: Metrics | null): number | null {
  if (!canScoreFromMetrics(metrics) || !metrics) return null;
  const crit =
    metrics.risk_distribution.find((x) => x.level === "critical")?.count ?? 0;
  const high = metrics.risk_distribution.find((x) => x.level === "high")?.count ?? 0;
  return Math.max(60, Math.min(99, 100 - crit * 3 - high));
}

function policyAdherence(metrics: Metrics | null): number | null {
  if (!canScoreFromMetrics(metrics) || !metrics) return null;
  const low = metrics.risk_distribution.find((x) => x.level === "low")?.count ?? 0;
  const total = metrics.risk_distribution.reduce((a, b) => a + b.count, 0);
  if (total === 0) return null;
  return Math.round((low / total) * 100);
}

const RISK_ROW: Record<
  RiskLevel,
  { cls: string; proto: string }
> = {
  low: {
    cls: "border-secondary-container/20 bg-secondary-container/10 text-secondary-fixed",
    proto: "LOG_ONLY",
  },
  medium: {
    cls: "border-yellow-500/20 bg-yellow-500/10 text-yellow-500",
    proto: "ENCRYPT_DATA",
  },
  high: {
    cls: "border-orange-500/20 bg-orange-500/10 text-orange-400",
    proto: "QUARANTINE",
  },
  critical: {
    cls: "border-error/20 bg-error/10 text-error",
    proto: "BLOCK_ENTITY",
  },
};

export default function CommandDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getSession()) {
      router.replace("/login");
    }
  }, [router]);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [shadowFeed, setShadowFeed] = useState<ShadowAISummary>({
    total_flags: 0,
    unique_tools: 0,
    employees_involved: 0,
    flags: [],
  });
  const [analyzerPrompt, setAnalyzerPrompt] = useState("");
  const [analyzerResult, setAnalyzerResult] = useState<AnalysisResult | null>(null);
  const [analyzerLoading, setAnalyzerLoading] = useState(false);

  useEffect(() => {
    fetchMetrics().then(setMetrics);
    fetchEmployees().then(setEmployees);
    fetchPrompts(12).then(setPrompts);
    fetchShadowAI().then(setShadowFeed);
  }, []);

  const healthSubtitle =
    !metrics ? "Loading…" : metrics.load_error ? "Fix API / metrics" : riskMixTotal(metrics) === 0 ? "No mix (7d)" : "Post-Critical";

  const riskFeedRows = useMemo(() => {
    type Row = {
      key: string;
      kind: "intercept" | "shadow";
      stamp: string;
      entity: string;
      risk_level: RiskLevel;
      vector: string;
      proto: string;
      sortTime: number;
    };
    const rows: Row[] = prompts.map((p) => ({
      key: `p-${p.id}`,
      kind: "intercept" as const,
      stamp: `USR_${p.employee_id}`,
      entity: p.employee_name.slice(0, 12),
      risk_level: p.risk_level,
      vector: `${(p.prompt || "").slice(0, 80)}${(p.prompt || "").length > 80 ? "…" : ""}`,
      proto: (RISK_ROW[p.risk_level] ?? RISK_ROW.low).proto,
      sortTime: new Date(p.timestamp).getTime() || 0,
    }));
    for (const f of shadowFeed.flags.slice(0, 24)) {
      const cfg = RISK_ROW[f.risk_level] ?? RISK_ROW.low;
      rows.push({
        key: `s-${f.id}`,
        kind: "shadow",
        stamp: `USR_${f.employee_id}`,
        entity: f.employee_name.slice(0, 12),
        risk_level: f.risk_level,
        vector: `Shadow tool: ${f.tool_detected}`,
        proto: cfg.proto,
        sortTime: new Date(f.date).getTime() || 0,
      });
    }
    rows.sort((a, b) => b.sortTime - a.sortTime);
    return rows.slice(0, 14);
  }, [prompts, shadowFeed.flags]);

  const h = healthScore(metrics);
  const ni = networkIntegrity(metrics);
  const pa = policyAdherence(metrics);
  const handleAnalyze = useCallback(async () => {
    if (!analyzerPrompt.trim() || analyzerLoading) return;
    const session = getSession();
    const fromUser = session?.user?.employee_id;
    const fallback = employees[0]?.id;
    const empId =
      fromUser != null && !Number.isNaN(Number(fromUser)) ? Number(fromUser) : fallback ? Number(fallback) : null;
    setAnalyzerLoading(true);
    setAnalyzerResult(null);
    try {
      if (empId == null) {
        setAnalyzerResult({
          id: "no-employee",
          prompt: analyzerPrompt,
          risk_level: "low",
          risk_score: 0,
          categories: [],
          reasoning:
            "Add at least one employee to the directory (or log in with a user linked to an employee) to run prompt analysis.",
          timestamp: new Date().toISOString(),
        });
        return;
      }
      setAnalyzerResult(await analyzePrompt(analyzerPrompt, empId));
    } finally {
      setAnalyzerLoading(false);
    }
  }, [analyzerPrompt, analyzerLoading, employees]);

  return (
    <div className="space-y-8">
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="mb-1 font-headline text-3xl font-black uppercase tracking-tighter text-white md:text-4xl">
            Sentinel Command Dashboard
          </h1>
          <div className="flex items-center gap-2 font-mono text-xs text-on-surface-variant">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                metrics?.load_error ? "bg-error" : "animate-pulse bg-secondary-container"
              )}
            />
            {metrics?.load_error
              ? `API: ${metrics.load_error.slice(0, 140)}${metrics.load_error.length > 140 ? "…" : ""}`
              : "SYSTEMS NOMINAL // ENCRYPTION: ACTIVE // THREAT SCANNING: 1.2ms LATENCY"}
          </div>
        </div>
        <div className="glass-edge flex items-center gap-4 border border-outline-variant/10 bg-surface-container-low p-4">
          <div className="text-right">
            <div className="font-label text-[10px] uppercase leading-none tracking-widest text-outline">
              Global Status
            </div>
            <div className="font-headline text-lg font-bold text-secondary-fixed">PROTECTED</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center bg-secondary-container/10">
            <MaterialIcon name="shield_with_heart" className="text-secondary-container" filled />
          </div>
        </div>
      </header>

      <div className="grid auto-rows-[minmax(280px,auto)] grid-cols-12 gap-6">
        <section className="relative col-span-12 row-span-2 min-h-[280px] overflow-hidden border border-outline-variant/10 bg-surface-container-low lg:col-span-8">
          <OrgRiskMap employees={employees} metrics={metrics} />
        </section>

        <section className="col-span-12 row-span-2 flex flex-col justify-between border border-l-2 border-outline-variant/10 border-l-secondary-container/50 bg-surface-container-low p-6 md:col-span-6 lg:col-span-4">
          <div>
            <h2 className="mb-6 font-label text-[10px] uppercase tracking-[0.15em] text-white">
              Organization Health Score
            </h2>
            <div className="relative mx-auto mt-2 h-44 w-44">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#333538"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#c3f400"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${h != null ? (h / 100) * 264 : 0} 264`}
                  opacity={h != null ? 1 : 0.35}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-headline text-5xl font-black leading-none text-white">
                  {h ?? "—"}
                </span>
                <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-secondary-container">
                  {healthSubtitle}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="uppercase text-outline">Network Integrity</span>
                <span className="text-white">{ni != null ? `${ni}%` : "—"}</span>
              </div>
              <div className="h-1 bg-surface-container-highest">
                <div
                  className="h-full bg-secondary-container"
                  style={{ width: ni != null ? `${ni}%` : "0%" }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="uppercase text-outline">AI Policy Adherence</span>
                <span className="text-white">{pa != null ? `${pa}%` : "—"}</span>
              </div>
              <div className="h-1 bg-surface-container-highest">
                <div
                  className="h-full bg-primary-container"
                  style={{ width: pa != null ? `${pa}%` : "0%" }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="col-span-12 row-span-3 flex flex-col overflow-hidden border border-outline-variant/10 bg-surface-container-low lg:col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-container-low/50 p-6 pb-2 backdrop-blur">
            <h2 className="font-label text-[10px] uppercase tracking-[0.15em] text-white">
              Live risk feed
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-outline-variant/20 bg-surface-container-highest/80 px-2 py-0.5 font-mono text-[9px] text-on-surface-variant">
                Shadow events: {shadowFeed.flags.length}
              </span>
              <span className="rounded border border-error/20 bg-error/10 px-2 py-0.5 font-mono text-[9px] text-error">
                {metrics?.threats_blocked ?? 0} BLOCKED (7D)
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-surface-container-lowest">
                <tr>
                  {["SOURCE", "ID_STAMP", "AGENT_ENTITY", "RISK_LVL", "VECTORS", "PROTOCOL"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-outline-variant/10 px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-outline md:px-6"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {riskFeedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center font-mono text-xs text-on-surface-variant">
                      No prompts or shadow events in feed. Connect API or capture activity.
                    </td>
                  </tr>
                ) : (
                  riskFeedRows.map((row) => {
                    const cfg = RISK_ROW[row.risk_level] ?? RISK_ROW.low;
                    return (
                      <tr key={row.key} className="transition-colors hover:bg-surface-container-highest">
                        <td className="px-4 py-4 font-mono text-[9px] uppercase text-outline md:px-6">
                          {row.kind === "shadow" ? (
                            <span className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-orange-400">
                              Shadow AI
                            </span>
                          ) : (
                            <span className="rounded border border-secondary-container/20 bg-secondary-container/10 px-1.5 py-0.5 text-secondary-fixed">
                              Intercept
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-on-surface-variant md:px-6">
                          {row.stamp}
                        </td>
                        <td className="px-4 py-4 md:px-6">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                row.kind === "shadow" ? "bg-orange-400" : "bg-primary-container"
                              )}
                            />
                            <span className="text-xs font-medium text-white">{row.entity}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 md:px-6">
                          <span
                            className={cn(
                              "rounded border px-2 py-0.5 text-[9px] font-bold uppercase",
                              cfg.cls
                            )}
                          >
                            {row.risk_level}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-4 text-xs italic text-outline md:px-6">
                          {row.vector}
                        </td>
                        <td className="px-4 py-4 text-right md:px-6">
                          <span className="border-b border-secondary-container/30 font-mono text-[10px] uppercase tracking-widest text-secondary-fixed">
                            {row.proto}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/10 bg-surface-container-lowest p-4">
            <Link
              href="/prompts"
              className="font-mono text-[10px] uppercase tracking-widest text-on-surface hover:text-white"
            >
              Full security logs →
            </Link>
            <Link
              href="/reports#shadow-signals"
              className="font-mono text-[10px] uppercase tracking-widest text-outline hover:text-white"
            >
              Risk trends (shadow) →
            </Link>
            <Link href="/reports" className="font-mono text-[10px] uppercase tracking-widest text-outline hover:text-white">
              Audit report →
            </Link>
          </footer>
        </section>
      </div>

      <section className="border border-outline-variant/10 bg-surface-container-low p-6">
        <h2 className="mb-1 font-label text-[10px] uppercase tracking-[0.15em] text-white">Scout AI — Prompt probe</h2>
        <p className="mb-4 font-mono text-xs text-on-surface-variant">
          Same pipeline as <code className="text-secondary-fixed">/api/analyze</code>. Default employee id from client config.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={analyzerPrompt}
            onChange={(e) => setAnalyzerPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleAnalyze()}
            className="flex-1 border-none bg-surface-container-highest py-3 pl-4 pr-4 font-mono text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary-fixed"
            placeholder="Enter prompt for analysis…"
          />
          <button
            type="button"
            disabled={analyzerLoading || !analyzerPrompt.trim()}
            onClick={() => void handleAnalyze()}
            className="bg-secondary-container px-6 py-3 font-headline text-sm font-bold uppercase tracking-wider text-black transition-all hover:brightness-110 disabled:opacity-50"
          >
            {analyzerLoading ? "SCANNING…" : "Analyze"}
          </button>
        </div>
        {analyzerResult ? (
          <div className="mt-4 border border-outline-variant/20 bg-surface-container-lowest p-4 font-mono text-sm text-on-surface-variant">
            <span className="text-secondary-fixed">{analyzerResult.risk_level}</span> — score{" "}
            {analyzerResult.risk_score}
            <p className="mt-2 text-xs leading-relaxed">{analyzerResult.reasoning}</p>
          </div>
        ) : null}
      </section>

      <ManagerAutomationPanel />
    </div>
  );
}
