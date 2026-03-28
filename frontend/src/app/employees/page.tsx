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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowUpDown } from "lucide-react";

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

type SortField = "name" | "risk_score" | "total_prompts" | "last_active";

function EmployeesContent() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("risk_score");
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

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-on-surface-variant transition-colors hover:text-white"
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "text-secondary-fixed" : ""}`} />
    </button>
  );

  const avgProf =
    employees.length > 0
      ? employees.reduce((a, e) => a + (e.ai_skill_score ?? e.risk_score), 0) / employees.length
      : 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-6 border-b border-outline-variant/10 pb-8 md:flex-row md:items-end">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-black uppercase tracking-tight text-white">
            Employee Skill &amp; Coaching Hub
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            Sentinel workforce telemetry. Filter via top bar search. Click a row for detail.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <section className="flex min-w-[140px] flex-col rounded-lg border border-outline-variant/15 bg-surface-container-low px-4 py-2">
            <span className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
              Avg signal
            </span>
            <span className="font-headline text-xl font-bold text-secondary-fixed">
              {avgProf.toFixed(1)}
            </span>
          </section>
          <section className="flex min-w-[140px] flex-col rounded-lg border border-outline-variant/15 bg-surface-container-low px-4 py-2">
            <span className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">
              Roster
            </span>
            <span className="font-headline text-xl font-bold text-primary">{employees.length}</span>
          </section>
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-low">
        {loading ? (
          <div className="space-y-4 p-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-surface-container-highest" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-on-surface-variant">
            {q ? "No employees match your search." : "No employees loaded."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-outline-variant/10 hover:bg-transparent">
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  <SortHeader field="name">Name</SortHeader>
                </TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Department
                </TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  <SortHeader field="risk_score">Risk</SortHeader>
                </TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  <SortHeader field="total_prompts">Prompts</SortHeader>
                </TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  <SortHeader field="last_active">Last Active</SortHeader>
                </TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => (
                <TableRow
                  key={emp.id}
                  className="cursor-pointer border-outline-variant/5 transition-colors hover:bg-surface-container-highest"
                  onClick={() => setSelected(emp)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container/20 text-xs font-bold text-primary ring-1 ring-primary-container/30">
                        {emp.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{emp.name}</div>
                        <div className="font-mono text-[10px] uppercase text-on-surface-variant">{emp.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-on-surface-variant">{emp.department}</TableCell>
                  <TableCell>
                    <RiskGauge score={emp.risk_score} size={40} strokeWidth={3} />
                  </TableCell>
                  <TableCell className="font-mono text-sm text-white">{emp.total_prompts.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-on-surface-variant">{formatDate(emp.last_active)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${statusStyles[emp.status]}`}>
                      {emp.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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
