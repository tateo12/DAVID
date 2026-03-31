"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  fetchEmployees,
  fetchEmployeeSkill,
  fetchEmployeeLessons,
  fetchCurriculumOutline,
  fetchEmployeeCurriculumProgress,
  postAutoAssignEmployeeLessons,
  postCompleteEmployeeLesson,
} from "@/lib/api";
import type {
  CurriculumProgress,
  CurriculumUnitOutline,
  Employee,
  EmployeeLessonRow,
  EmployeeSkillProfile,
  EmployeeStatus,
} from "@/lib/types";
import { RiskGauge } from "@/components/risk-gauge";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowUpDown, Info } from "lucide-react";

const statusStyles: Record<EmployeeStatus, string> = {
  active: "border-secondary-container/30 bg-secondary-container/10 text-secondary-fixed",
  inactive: "border-outline/30 bg-surface-container-high text-on-surface-variant",
  suspended: "border-error/30 bg-error/10 text-error",
};

function formatDate(iso: string) {
  if (!iso.trim()) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SortField = "name" | "risk_score" | "total_prompts" | "last_active" | "sentinel_score";

function EmployeesContent() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("sentinel_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [skillProfile, setSkillProfile] = useState<EmployeeSkillProfile | null>(null);
  const [empLessons, setEmpLessons] = useState<EmployeeLessonRow[]>([]);
  const [curriculumOutline, setCurriculumOutline] = useState<CurriculumUnitOutline[]>([]);
  const [curriculumProgress, setCurriculumProgress] = useState<CurriculumProgress | null>(null);
  const [hubBusy, setHubBusy] = useState(false);

  useEffect(() => {
    fetchEmployees().then((data) => {
      setEmployees(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selected) {
      setSkillProfile(null);
      setEmpLessons([]);
      setCurriculumOutline([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [sk, les, out] = await Promise.all([
        fetchEmployeeSkill(selected.id),
        fetchEmployeeLessons(selected.id),
        fetchCurriculumOutline(),
      ]);
      if (!cancelled) {
        setSkillProfile(sk);
        setEmpLessons(les);
        setCurriculumOutline(out);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const refreshHub = async (empId: string) => {
    const [sk, les, prog] = await Promise.all([
      fetchEmployeeSkill(empId),
      fetchEmployeeLessons(empId),
      fetchEmployeeCurriculumProgress(empId),
    ]);
    setSkillProfile(sk);
    setEmpLessons(les);
    setCurriculumProgress(prog);
  };

  const handleAutoAssign = async (needBased: boolean) => {
    if (!selected) return;
    setHubBusy(true);
    try {
      const les = await postAutoAssignEmployeeLessons(selected.id, needBased);
      setEmpLessons(les);
      await refreshHub(selected.id);
    } finally {
      setHubBusy(false);
    }
  };

  const handleCompleteLesson = async (lessonId: number) => {
    if (!selected) return;
    setHubBusy(true);
    try {
      await postCompleteEmployeeLesson(selected.id, lessonId);
      await refreshHub(selected.id);
    } finally {
      setHubBusy(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    const list = employees.filter((e) => {
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      const aScore = a.ai_skill_score !== undefined ? a.ai_skill_score * 100 : Math.max(0, 100 - a.risk_score);
      const bScore = b.ai_skill_score !== undefined ? b.ai_skill_score * 100 : Math.max(0, 100 - b.risk_score);

      if (sortField === "sentinel_score") {
         return sortDir === "asc" ? aScore - bScore : bScore - aScore;
      }

      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return list;
  }, [employees, q, sortField, sortDir]);

  const activeCoachingCount = employees.filter((e) => e.flagged_prompts > 0 || e.risk_score > 60).length;
  const avgProf =
    employees.length > 0
      ? employees.reduce((a, e) => a + (e.ai_skill_score !== undefined ? e.ai_skill_score * 100 : Math.max(0, 100 - e.risk_score)), 0) / employees.length
      : 0;

  const criticalUsers = [...employees].sort((a, b) => b.risk_score - a.risk_score).slice(0, 2);

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => handleSort(field)}
      className="flex flex-row items-center gap-1 hover:text-white transition-colors uppercase tracking-widest text-[10px] text-on-surface-variant font-label"
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "text-secondary-fixed" : ""}`} />
    </button>
  );

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto p-4 md:p-8">
      {/* HEADER & KPI CARDS */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-outline-variant/10 pb-8">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-black tracking-tight text-white uppercase">Employee Skill &amp; Coaching Hub</h1>
          <p className="text-on-surface-variant max-w-2xl text-sm leading-relaxed">
            Quantifying human-AI interaction security through the <span className="text-primary font-medium">Sentinel Score</span>. 
            Monitoring real-time behavioral drift and automated remedial coaching loops.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <section className="bg-surface-container-low px-4 py-2 rounded-lg border border-outline-variant/15 flex flex-col min-w-[140px]">
            <span className="font-label text-[10px] uppercase text-on-surface-variant tracking-wider">Global Proficiency</span>
            <span className="font-headline text-xl font-bold text-secondary-fixed">{avgProf.toFixed(1)}%</span>
          </section>
          <section className="bg-surface-container-low px-4 py-2 rounded-lg border border-outline-variant/15 flex flex-col min-w-[140px]">
             <span className="font-label text-[10px] uppercase text-on-surface-variant tracking-wider">Active Coaching</span>
             <span className="font-headline text-xl font-bold text-primary">{activeCoachingCount}</span>
          </section>
        </div>
      </header>

      {/* ANALYTICS & LEADERBOARD GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* SKILL MATRIX RADAR */}
        <article className="xl:col-span-4 bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 relative overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-label text-xs font-bold tracking-widest text-secondary-fixed uppercase">Skill Matrix Analysis</h2>
            <Info className="text-on-surface-variant w-4 h-4 cursor-help" />
          </div>
          <div className="relative h-64 flex items-center justify-center rounded-full" style={{ backgroundImage: "radial-gradient(circle, #464555 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
            <div className="absolute inset-0 border border-outline-variant/20 rounded-full scale-100"></div>
            <div className="absolute inset-0 border border-outline-variant/20 rounded-full scale-75"></div>
            <div className="absolute inset-0 border border-outline-variant/20 rounded-full scale-50"></div>
            <svg className="w-full h-full drop-shadow-2xl opacity-90" viewBox="0 0 100 100">
              <polygon fill="rgba(93, 95, 239, 0.25)" points="50,10 85,35 75,85 25,85 15,35" stroke="#5D5FEF" strokeWidth="1.5"></polygon>
              <circle cx="50" cy="10" fill="#5D5FEF" r="1.5"></circle>
              <circle cx="85" cy="35" fill="#5D5FEF" r="1.5"></circle>
              <circle cx="75" cy="85" fill="#5D5FEF" r="1.5"></circle>
              <circle cx="25" cy="85" fill="#5D5FEF" r="1.5"></circle>
              <circle cx="15" cy="35" fill="#5D5FEF" r="1.5"></circle>
            </svg>
            <div className="absolute top-2 font-label text-[9px] uppercase tracking-tighter text-white">Risk Awareness</div>
            <div className="absolute bottom-2 left-4 font-label text-[9px] uppercase tracking-tighter text-white">Policy Compliance</div>
            <div className="absolute bottom-2 right-4 font-label text-[9px] uppercase tracking-tighter text-white">Prompt Specificity</div>
            <div className="absolute top-1/2 -right-4 -translate-y-1/2 font-label text-[9px] uppercase tracking-tighter text-white rotate-90">Data Shielding</div>
          </div>
          <div className="mt-8 space-y-2">
            <div className="flex items-center justify-between text-xs p-3 bg-surface-container-lowest rounded border border-outline-variant/5">
              <span className="text-on-surface-variant font-headline uppercase text-[10px]">Top Strength</span>
              <span className="text-secondary-fixed font-mono font-bold">Prompt Specificity</span>
            </div>
            <div className="flex items-center justify-between text-xs p-3 bg-surface-container-lowest rounded border border-outline-variant/5">
              <span className="text-on-surface-variant font-headline uppercase text-[10px]">Growth Area</span>
              <span className="text-error font-mono font-bold uppercase">Data Shielding</span>
            </div>
          </div>
        </article>

        {/* PROFICIENCY LEADERBOARD */}
        <article className="xl:col-span-8 bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden flex flex-col">
          <header className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low/50">
            <h2 className="font-label text-xs font-bold tracking-widest text-white uppercase">Personnel Proficiency Leaderboard</h2>
            <button className="text-xs text-primary font-bold hover:underline transition-all">View Full Roster ({employees.length})</button>
          </header>
          <div className="overflow-x-auto flex-1 max-h-[460px] overflow-y-auto w-full">
            {loading ? (
              <div className="p-8 space-y-4">
                {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-surface-container-highest animate-pulse rounded"></div>)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-sm text-on-surface-variant font-mono uppercase">No personnel found</div>
            ) : (
              <table className="w-full text-left border-collapse ">
                <thead className="sticky top-0 bg-surface-container-low z-10">
                  <tr className="bg-surface-container-lowest/50 border-b border-outline-variant/10 shadow-sm">
                    <th className="px-6 py-4"><SortHeader field="name">Employee</SortHeader></th>
                    <th className="px-6 py-4 font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Department</th>
                    <th className="px-6 py-4 font-label text-[10px] text-on-surface-variant uppercase tracking-widest text-center">Prompt Master Status</th>
                    <th className="px-6 py-4 flex justify-end"><SortHeader field="sentinel_score">Sentinel Score</SortHeader></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {filtered.map((emp) => {
                    const sScore = emp.ai_skill_score !== undefined ? emp.ai_skill_score * 100 : Math.max(0, 100 - emp.risk_score);
                    const stars = Math.min(5, Math.max(0, Math.round(sScore / 20)));
                    return (
                      <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors cursor-pointer group" onClick={() => setSelected(emp)}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full ${sScore >= 80 ? 'bg-primary/20 text-primary ring-1 ring-primary/30' : 'bg-surface-container-highest text-on-surface-variant ring-1 ring-outline-variant/30'} flex items-center justify-center font-bold text-xs`}>
                              {emp.name.split(" ").map((n) => n[0]).join("")}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{emp.name}</p>
                              <p className="text-[10px] text-on-surface-variant font-mono uppercase">ID: {emp.id.substring(0,6)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-on-surface-variant font-medium">{emp.department}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <svg key={i} xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" className={i < stars ? "fill-secondary-fixed" : "fill-outline-variant/30"}>
                                <path d="m233-120 65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z"/>
                              </svg>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-headline text-lg font-bold ${sScore >= 80 ? 'text-secondary-fixed' : sScore >= 60 ? 'text-on-surface' : 'text-on-surface-variant'}`}>{sScore.toFixed(1)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </article>
      </div>

      {/* INTERVENTION & LOGS GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* AUTOMATED COACHING LOGS */}
        <section className="xl:col-span-7 bg-surface-container-low rounded-xl border border-outline-variant/10 flex flex-col h-[520px]">
          <header className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low/30">
            <div className="flex items-center gap-2">
              <h2 className="font-label text-xs font-bold tracking-widest text-white uppercase">Automated Coaching Logs</h2>
              <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded font-mono font-bold animate-pulse">LIVE FEED</span>
            </div>
            <button className="hover:bg-white/5 rounded p-1 transition-colors"><Info className="w-4 h-4 text-on-surface-variant"/></button>
          </header>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Mock Log 1 */}
            <article className="flex gap-4 group">
              <aside className="flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-secondary-fixed shadow-[0_0_8px_rgba(195,244,0,0.5)]"></div>
                <div className="w-px flex-1 bg-outline-variant/20 my-2"></div>
              </aside>
              <div className="flex-1 bg-surface-container-lowest/50 p-4 rounded-lg border border-outline-variant/5 group-hover:border-primary/20 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <time className="text-[10px] font-mono text-on-surface-variant uppercase tracking-tighter">Event #AI-4421 • Just Now</time>
                  <span className="text-[10px] bg-secondary-container/10 text-secondary-fixed px-2 py-0.5 rounded uppercase font-bold border border-secondary-fixed/20">Optimization</span>
                </div>
                <p className="text-sm text-on-surface leading-snug mb-3">
                  Sentinel suggested more specific context for <span className="text-white font-medium">@M.Jenkins</span> to minimize PII leakage during financial data extrapolation.
                </p>
                <blockquote className="p-2.5 bg-surface-container-highest rounded text-[11px] font-mono text-secondary-fixed-dim border-l-2 border-secondary-fixed italic">
                  &quot;Refining prompt to use synthetic identifiers instead of actual client names.&quot;
                </blockquote>
              </div>
            </article>
            {/* Mock Log 2 */}
            <article className="flex gap-4 group">
              <aside className="flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-error shadow-[0_0_8px_rgba(255,180,171,0.5)]"></div>
                <div className="w-px flex-1 bg-outline-variant/20 my-2"></div>
              </aside>
              <div className="flex-1 bg-surface-container-lowest/50 p-4 rounded-lg border border-outline-variant/5 group-hover:border-error/20 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <time className="text-[10px] font-mono text-on-surface-variant uppercase tracking-tighter">Event #AI-4418 • 14m ago</time>
                  <span className="text-[10px] bg-error/10 text-error px-2 py-0.5 rounded uppercase font-bold border border-error/20">Intervention</span>
                </div>
                <p className="text-sm text-on-surface leading-snug mb-4">
                  Real-time block triggered for <span className="text-white font-medium">@UnknownUser</span>. User was attempting to bypass &quot;hallucination guards&quot; via nested roleplay prompts.
                </p>
                <div className="flex items-center gap-4">
                  <button className="text-[10px] font-bold text-primary hover:text-white uppercase tracking-wider transition-colors">Review Full Transcript</button>
                  <button className="text-[10px] font-bold text-on-surface-variant hover:text-white uppercase tracking-wider transition-colors">Flag Manager</button>
                </div>
              </div>
            </article>
            {/* Mock Log 3 */}
            <article className="flex gap-4 group">
              <aside className="flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(93,95,239,0.5)]"></div>
                <div className="w-px flex-1 bg-outline-variant/20 my-2"></div>
              </aside>
              <div className="flex-1 bg-surface-container-lowest/50 p-4 rounded-lg border border-outline-variant/5 group-hover:border-primary/20 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <time className="text-[10px] font-mono text-on-surface-variant uppercase tracking-tighter">Event #AI-4390 • 1h ago</time>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded uppercase font-bold border border-primary/20">Reinforcement</span>
                </div>
                <p className="text-sm text-on-surface leading-snug">
                  System recognized <span className="text-white font-medium">@E.Kormov</span> for exemplary prompt-structuring. Efficiency gains estimated at 12% relative to department baseline.
                </p>
              </div>
            </article>
          </div>
        </section>

        {/* INCIDENT HUB & CRITICAL NEEDS */}
        <aside className="xl:col-span-5 flex flex-col gap-6">
          <section className="bg-primary-container rounded-xl p-6 text-on-primary-container relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="font-headline text-xl font-bold mb-1">Incident Training Hub</h3>
              <p className="text-on-primary-container/80 text-sm mb-6 leading-relaxed">
                Automated enrollment modules for users exceeding risk thresholds.
              </p>
              <div className="space-y-2">
                <div className="bg-on-primary-container/10 p-4 rounded flex items-center justify-between group cursor-pointer hover:bg-on-primary-container/20 transition-all border border-on-primary-container/5">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-tight">Data Leakage 101</p>
                      <p className="text-[10px] opacity-70">Mandatory for High-Risk Users</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-white opacity-50 group-hover:translate-x-1 group-hover:opacity-100 transition-all">→</span>
                </div>
                <div className="bg-on-primary-container/10 p-4 rounded flex items-center justify-between group cursor-pointer hover:bg-on-primary-container/20 transition-all border border-on-primary-container/5">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-tight">Advanced Sanitization</p>
                      <p className="text-[10px] opacity-70">Optional Proficiency Booster</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-white opacity-50 group-hover:translate-x-1 group-hover:opacity-100 transition-all">→</span>
                </div>
              </div>
            </div>
            <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
          </section>

          <section className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 flex-1 flex flex-col">
            <header className="flex items-center justify-between mb-6">
              <h2 className="font-label text-xs font-bold tracking-widest text-white uppercase">Critical Training Needs</h2>
              <span className="text-error text-sm animate-pulse">!</span>
            </header>
            <div className="space-y-6 flex-1">
              {criticalUsers.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No critical personnel identified.</p>
              ) : criticalUsers.map((cu) => (
                <div key={cu.id} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center font-bold text-sm text-on-surface border border-outline-variant/20 grayscale brightness-75">
                    {cu.name.split(" ").map(x => x[0]).join("")}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-white uppercase tracking-tight">{cu.name}</p>
                    <div className="w-full bg-surface-container-highest h-1 rounded-full mt-2 overflow-hidden ring-1 ring-white/5">
                      <div className="bg-error h-full shadow-[0_0_8px_rgba(255,180,171,0.5)]" style={{ width: `${Math.min(100, cu.risk_score)}%` }}></div>
                    </div>
                  </div>
                  <span className="text-[10px] text-error font-mono font-bold tracking-tighter uppercase whitespace-pre">
                    {cu.risk_score >= 80 ? "CRITICAL" : "MODERATE"}
                  </span>
                </div>
              ))}
            </div>
            <button className="w-full mt-8 bg-surface-container-highest hover:bg-surface-bright text-white text-[10px] font-bold py-3 rounded transition-all uppercase tracking-[0.2em] border border-outline-variant/10 active:scale-[0.98]">
              Generate Coaching Queue
            </button>
          </section>
        </aside>
      </div>

      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-[480px] overflow-y-auto border-outline-variant/20 bg-surface sm:max-w-[480px]">
          {selected && (
            <>
              <SheetHeader className="border-b border-outline-variant/10 pb-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-container/20 text-lg font-bold text-primary">
                    {selected.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <SheetTitle className="text-lg text-white">{selected.name}</SheetTitle>
                    <p className="text-sm text-on-surface-variant">{selected.department}</p>
                    <p className="mt-0.5 text-xs text-outline">{selected.email}</p>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-6 py-6">
                <div className="flex justify-center">
                  <RiskGauge score={selected.risk_score} size={120} strokeWidth={8} showLabel />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-3 text-center">
                    <div className="font-mono text-lg text-white">{selected.total_prompts}</div>
                    <div className="mt-1 text-[10px] text-on-surface-variant">Total Prompts</div>
                  </div>
                  <div className="rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-3 text-center">
                    <div className="font-mono text-lg text-error">{selected.flagged_prompts}</div>
                    <div className="mt-1 text-[10px] text-on-surface-variant">Flagged</div>
                  </div>
                  <div className="rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-3 text-center">
                    <Badge variant="outline" className={`text-[10px] uppercase ${statusStyles[selected.status]}`}>
                      {selected.status}
                    </Badge>
                    <div className="mt-1 text-[10px] text-on-surface-variant">Status</div>
                  </div>
                </div>
                <div>
                  <h4 className="mb-3 text-sm font-medium text-white">Risk Trend (7 Days)</h4>
                  <div className="flex h-16 items-end gap-1">
                    {selected.risk_trend.length ? (
                      selected.risk_trend.map((val, i) => {
                        const height = Math.max(4, (val / 100) * 64);
                        const color = val <= 25 ? "#c3f400" : val <= 50 ? "#f59e0b" : val <= 75 ? "#ffb4ab" : "#ffb4ab";
                        return (
                          <div
                            key={i}
                            className="flex-1 rounded-t transition-all duration-300"
                            style={{ height: `${height}px`, background: color, opacity: 0.75 }}
                          />
                        );
                      })
                    ) : (
                      <span className="text-xs text-on-surface-variant">No trend samples</span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-3">
                  <div className="text-xs text-on-surface-variant">Last Active</div>
                  <div className="mt-1 text-sm text-white">{formatDate(selected.last_active)}</div>
                </div>

                <div className="space-y-4 rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-white">Skill Hub &amp; curriculum</h4>
                    {hubBusy ? (
                      <span className="shrink-0 font-mono text-[10px] text-outline">Updating…</span>
                    ) : null}
                  </div>
                  <p className="text-[11px] leading-relaxed text-on-surface-variant">
                    Automated assignment can queue the next lesson or risk-based stacks; buttons below always work for
                    manual control. Scheduled coaching and learning emails are on the command dashboard (managers).
                  </p>
                  {curriculumProgress && curriculumProgress.total_curriculum_lessons > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-on-surface-variant">Curriculum progress</span>
                        <span className="font-mono text-white">
                          {curriculumProgress.completed_curriculum} / {curriculumProgress.total_curriculum_lessons}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-container-highest">
                        <div
                          className="h-full rounded-full bg-secondary-fixed transition-[width] duration-300"
                          style={{
                            width: `${Math.min(
                              100,
                              (curriculumProgress.completed_curriculum /
                                curriculumProgress.total_curriculum_lessons) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                      {curriculumProgress.next_lesson_id > 0 ? (
                        <p className="font-mono text-[10px] text-outline">
                          Next in order: lesson #{curriculumProgress.next_lesson_id}
                        </p>
                      ) : (
                        <p className="text-[10px] text-secondary-fixed">All curriculum lessons completed.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface-variant">
                      No curriculum totals yet, or catalog is empty.
                    </p>
                  )}
                  {skillProfile ? (
                    <div className="space-y-3 text-xs">
                      <p className="text-on-surface-variant">
                        Class <span className="text-white">{skillProfile.skill_class}</span>
                        {" · "}
                        skill score {(skillProfile.ai_skill_score * 100).toFixed(0)}
                        {skillProfile.prompts_evaluated > 0 ? (
                          <>
                            {" · "}
                            <span className="font-mono text-outline">
                              {skillProfile.prompts_evaluated} prompt{skillProfile.prompts_evaluated === 1 ? "" : "s"} analyzed
                            </span>
                          </>
                        ) : null}
                      </p>
                      {skillProfile.ai_use_profile_summary?.trim() ? (
                        <div className="rounded border border-secondary-container/20 bg-secondary-container/5 p-3">
                          <div className="font-label text-[9px] uppercase tracking-widest text-secondary-fixed">
                            AI use profile
                          </div>
                          <p className="mt-2 leading-relaxed text-on-surface-variant">
                            {skillProfile.ai_use_profile_summary}
                          </p>
                        </div>
                      ) : null}
                      {skillProfile.last_coaching_message?.trim() ? (
                        <div className="rounded border border-outline-variant/15 p-3">
                          <div className="font-label text-[9px] uppercase tracking-widest text-outline">
                            Latest coaching
                          </div>
                          <p className="mt-1.5 text-white">{skillProfile.last_coaching_message}</p>
                        </div>
                      ) : null}
                      {skillProfile.last_dimension_scores &&
                      Object.keys(skillProfile.last_dimension_scores).length > 0 ? (
                        <div>
                          <div className="mb-2 font-label text-[9px] uppercase tracking-widest text-outline">
                            Last prompt dimensions
                          </div>
                          <ul className="space-y-1.5 font-mono text-[10px] text-on-surface-variant">
                            {Object.entries(skillProfile.last_dimension_scores).map(([k, v]) => (
                              <li key={k} className="flex items-center justify-between gap-2">
                                <span className="capitalize text-outline">{k.replace(/_/g, " ")}</span>
                                <span className="text-white">{Math.round(v * 100)}%</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(skillProfile.last_strengths?.length ?? 0) > 0 ||
                      (skillProfile.last_improvements?.length ?? 0) > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(skillProfile.last_strengths?.length ?? 0) > 0 ? (
                            <div>
                              <div className="mb-1 font-label text-[9px] uppercase tracking-widest text-outline">
                                Strengths
                              </div>
                              <ul className="list-inside list-disc space-y-1 text-on-surface-variant">
                                {skillProfile.last_strengths.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {(skillProfile.last_improvements?.length ?? 0) > 0 ? (
                            <div>
                              <div className="mb-1 font-label text-[9px] uppercase tracking-widest text-outline">
                                Focus next
                              </div>
                              <ul className="list-inside list-disc space-y-1 text-on-surface-variant">
                                {skillProfile.last_improvements.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface-variant">No skill profile for this employee.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={hubBusy}
                      onClick={() => void handleAutoAssign(false)}
                      className="rounded border border-secondary-container/40 bg-secondary-container/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-secondary-fixed transition hover:bg-secondary-container/20 disabled:opacity-50"
                    >
                      Assign next (course order)
                    </button>
                    <button
                      type="button"
                      disabled={hubBusy}
                      onClick={() => void handleAutoAssign(true)}
                      className="rounded border border-outline-variant/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-outline transition hover:border-error/40 hover:text-error disabled:opacity-50"
                      title="Adds extra stacked lessons when risk is elevated"
                    >
                      Stack for need (risk)
                    </button>
                    <Link
                      href="/curriculum"
                      className="inline-flex items-center rounded border border-outline-variant/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-outline transition hover:border-secondary-fixed/50 hover:text-secondary-fixed"
                    >
                      Full curriculum
                    </Link>
                  </div>
                  <div>
                    <h5 className="mb-2 font-label text-[10px] uppercase tracking-widest text-outline">
                      Assigned &amp; history
                    </h5>
                    {empLessons.length === 0 ? (
                      <p className="text-xs text-on-surface-variant">None yet — use assign above.</p>
                    ) : (
                      <ul className="max-h-52 space-y-2 overflow-y-auto text-xs">
                        {empLessons.map((l, idx) => (
                          <li
                            key={`${l.lesson_id}-${l.status}-${l.assigned_at}-${idx}`}
                            className="flex items-start justify-between gap-2 rounded border border-outline-variant/10 bg-surface-container-low p-2"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-white">{l.title}</div>
                              <div className="mt-0.5 font-mono text-[9px] uppercase text-outline">
                                {l.status}
                                {l.unit_title ? ` · ${l.unit_title}` : ""}
                                {l.lesson_kind ? ` · ${l.lesson_kind}` : ""}
                              </div>
                            </div>
                            {l.status === "assigned" ? (
                              <button
                                type="button"
                                disabled={hubBusy}
                                onClick={() => void handleCompleteLesson(l.lesson_id)}
                                className="shrink-0 rounded bg-secondary-container px-2 py-1 font-mono text-[9px] font-bold uppercase text-black disabled:opacity-50"
                              >
                                Done
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {curriculumOutline.length > 0 ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-outline">
                        Course catalog (exported curriculum)
                      </summary>
                      <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto border-t border-outline-variant/10 pt-2">
                        {curriculumOutline.map((u) => (
                          <li key={u.unit_title}>
                            <div className="text-white">{u.unit_title}</div>
                            <div className="font-mono text-[9px] text-outline">
                              {u.lessons.length} module{u.lessons.length === 1 ? "" : "s"} · {u.skill_class}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EmployeesFallback() {
  return (
    <div className="space-y-8">
      <div className="h-24 animate-pulse rounded-xl bg-surface-container-high" />
      <div className="space-y-4 rounded-xl border border-outline-variant/10 p-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-surface-container-highest" />
        ))}
      </div>
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<EmployeesFallback />}>
      <EmployeesContent />
    </Suspense>
  );
}
