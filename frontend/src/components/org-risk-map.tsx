"use client";

import React, { useMemo, useState } from "react";
import type { Employee, Metrics } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Standard enterprise segments — departments are matched in order; first match wins. */
export const STANDARD_ORG_SEGMENTS: {
  id: string;
  label: string;
  short: string;
  match: (department: string) => boolean;
}[] = [
  {
    id: "leadership",
    label: "Leadership",
    short: "LDR",
    match: (d) =>
      /executive|leadership|ceo|c-suite|c_suite|board|founder|president|vp\s*of/i.test(d),
  },
  {
    id: "product_eng",
    label: "Product & Engineering",
    short: "ENG",
    match: (d) =>
      /engineer|engineering|product|developer|devops|platform|tech|it|software|research|r\s*&\s*d|rd\b/i.test(
        d
      ),
  },
  {
    id: "gtm",
    label: "Go-to-market",
    short: "GTM",
    match: (d) =>
      /sales|marketing|revenue|growth|business development|bd\b|account|commercial/i.test(d),
  },
  {
    id: "customer",
    label: "Customer success",
    short: "CS",
    match: (d) => /support|success|cx|customer|help\s*desk|services/i.test(d),
  },
  {
    id: "corporate",
    label: "Corporate",
    short: "CORP",
    match: (d) => /hr\b|people|finance|legal|accounting|operations|admin|facilities/i.test(d),
  },
];

function assignSegment(department: string): string {
  const d = department.toLowerCase();
  for (const s of STANDARD_ORG_SEGMENTS) {
    if (s.match(d)) return s.id;
  }
  return "other";
}

function heatClass(avgRisk0to100: number, headcount: number): string {
  if (headcount === 0) return "border-outline-variant/20 bg-surface-container-highest/40";
  if (avgRisk0to100 >= 70) return "border-error/40 bg-error/15 shadow-[0_0_24px_-4px_rgba(255,180,171,0.35)]";
  if (avgRisk0to100 >= 45) return "border-orange-500/35 bg-orange-500/10";
  if (avgRisk0to100 >= 25) return "border-yellow-500/30 bg-yellow-500/5";
  return "border-secondary-container/30 bg-secondary-container/10";
}

type ViewMode = "standard" | "departments";

export function OrgRiskMap({
  employees,
  metrics,
}: {
  employees: Employee[];
  metrics: Metrics | null;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [selectedId, setSelectedId] = useState<string>("all");

  const standardStats = useMemo(() => {
    const map = new Map<
      string,
      { label: string; short: string; risks: number[]; names: string[] }
    >();
    for (const s of STANDARD_ORG_SEGMENTS) {
      map.set(s.id, { label: s.label, short: s.short, risks: [], names: [] });
    }
    map.set("other", { label: "Other / unmapped", short: "OTH", risks: [], names: [] });

    for (const e of employees) {
      const sid = assignSegment(e.department);
      const g = map.get(sid)!;
      g.risks.push(e.risk_score);
      g.names.push(e.name);
    }
    return [...STANDARD_ORG_SEGMENTS.map((s) => s.id), "other"].map((id) => {
      const g = map.get(id)!;
      const n = g.risks.length;
      const avg = n ? Math.round(g.risks.reduce((a, b) => a + b, 0) / n) : 0;
      const high = g.risks.filter((r) => r >= 55).length;
      return { id, label: g.label, short: g.short, headcount: n, avgRisk: avg, highRisk: high };
    });
  }, [employees]);

  const departmentStats = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const e of employees) {
      const d = e.department.trim() || "Unassigned";
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e.risk_score);
    }
    return Array.from(map.entries())
      .map(([dept, risks]) => {
        const n = risks.length;
        const avg = n ? Math.round(risks.reduce((a, b) => a + b, 0) / n) : 0;
        const high = risks.filter((r) => r >= 55).length;
        return {
          id: `dept:${dept}`,
          label: dept,
          short: dept.slice(0, 3).toUpperCase(),
          headcount: n,
          avgRisk: avg,
          highRisk: high,
        };
      })
      .sort((a, b) => b.headcount - a.headcount);
  }, [employees]);

  const tiles = viewMode === "standard" ? standardStats : departmentStats;

  const orgWide = useMemo(() => {
    if (!employees.length) return { avg: 0, high: 0, n: 0 };
    const risks = employees.map((e) => e.risk_score);
    return {
      n: employees.length,
      avg: Math.round(risks.reduce((a, b) => a + b, 0) / risks.length),
      high: risks.filter((r) => r >= 55).length,
    };
  }, [employees]);

  const selectedTile = tiles.find((t) => t.id === selectedId);
  const displayStats =
    selectedId === "all" || !selectedTile
      ? orgWide
      : {
          n: selectedTile.headcount,
          avg: selectedTile.avgRisk,
          high: selectedTile.highRisk,
        };

  const metricsFailed = Boolean(metrics?.load_error);
  const globalThreats = metricsFailed ? null : (metrics?.threats_blocked ?? 0);
  const shadowN = metricsFailed ? null : (metrics?.shadow_ai_detected ?? 0);

  return (
    <div className="relative flex h-full min-h-[200px] flex-col overflow-hidden">
      <div className="absolute left-4 top-4 z-10 max-w-[min(100%,420px)]">
        <h2 className="mb-1 font-label text-[10px] uppercase tracking-[0.15em] text-white">
          Organization risk map
        </h2>
        <p className="font-mono text-[8px] uppercase tracking-widest text-outline">
          Standard segments · switch to raw departments anytime
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setViewMode("standard");
              setSelectedId("all");
            }}
            className={cn(
              "rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-wider",
              viewMode === "standard"
                ? "border-secondary-container/50 bg-secondary-container/15 text-secondary-fixed"
                : "border-outline-variant/25 text-outline hover:text-white"
            )}
          >
            Standard company map
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("departments");
              setSelectedId("all");
            }}
            className={cn(
              "rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-wider",
              viewMode === "departments"
                ? "border-secondary-container/50 bg-secondary-container/15 text-secondary-fixed"
                : "border-outline-variant/25 text-outline hover:text-white"
            )}
          >
            By department
          </button>
          <button
            type="button"
            onClick={() => setSelectedId("all")}
            className={cn(
              "rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-wider",
              selectedId === "all"
                ? "border-primary-container/40 bg-primary-container/10 text-primary"
                : "border-outline-variant/25 text-outline hover:text-white"
            )}
          >
            All org
          </button>
        </div>
      </div>

      <div className="absolute inset-0 bg-gradient-to-br from-primary-container/12 via-transparent to-secondary-container/8 opacity-80" />

      <div className="relative mt-24 flex flex-1 flex-col gap-3 px-4 pb-4 pt-2 md:mt-20 md:flex-row md:items-stretch">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-3">
          {tiles.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={cn(
                "flex flex-col items-start rounded-lg border p-3 text-left transition-all md:p-4",
                heatClass(t.avgRisk, t.headcount),
                selectedId === t.id && "ring-2 ring-secondary-fixed ring-offset-2 ring-offset-surface-container-low"
              )}
            >
              <span className="font-mono text-[9px] text-outline">{t.short}</span>
              <span className="font-headline text-sm font-bold text-white">{t.label}</span>
              <span className="mt-2 font-mono text-[10px] text-on-surface-variant">
                {t.headcount} people · avg risk {t.headcount ? `${t.avgRisk}` : "—"}
              </span>
              {t.highRisk > 0 ? (
                <span className="mt-1 font-mono text-[9px] text-error">{t.highRisk} elevated</span>
              ) : (
                <span className="mt-1 font-mono text-[9px] text-secondary-fixed/80">stable</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex w-full shrink-0 flex-col justify-center gap-3 border-t border-outline-variant/10 pt-3 md:w-52 md:border-l md:border-t-0 md:pl-4 md:pt-0">
          <div className="rounded border border-outline-variant/15 bg-surface-container-highest/60 p-3 backdrop-blur-sm">
            <p className="font-label text-[9px] uppercase tracking-widest text-outline">
              {selectedId === "all" ? "Whole organization" : selectedTile?.label ?? "Segment"}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-white">{displayStats.avg}</p>
            <p className="font-mono text-[9px] text-on-surface-variant">Avg risk index (0–100)</p>
            <div className="mt-3 space-y-1 font-mono text-[9px] text-outline">
              <p>
                Headcount: <span className="text-white">{displayStats.n}</span>
              </p>
              <p>
                Elevated (&gt;55): <span className="text-error">{displayStats.high}</span>
              </p>
              <p>
                7d intercepts:{" "}
                <span className="text-white">{globalThreats != null ? globalThreats : "—"}</span>
              </p>
              <p>
                Shadow signals (7d):{" "}
                <span className="text-orange-300">{shadowN != null ? shadowN : "—"}</span>
              </p>
              {metricsFailed ? (
                <p className="text-[8px] leading-tight text-error">Metrics API error — check backend URL.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
