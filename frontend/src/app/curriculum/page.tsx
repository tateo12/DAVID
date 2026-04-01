"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getSession, isTeamManager, type StoredSession } from "@/lib/session";
import {
  fetchCurriculumOutline,
  fetchEmployeeLessons,
  fetchEmployeeCurriculumProgress,
  fetchEmployees,
  postAssignSkillLesson,
  postCompleteEmployeeLesson,
  postAutoAssignEmployeeLessons,
} from "@/lib/api";
import type {
  CurriculumUnitOutline,
  EmployeeLessonRow,
  CurriculumProgress,
  Employee,
} from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function lessonStatusForEmployee(
  lessonId: number,
  lessons: EmployeeLessonRow[]
): "completed" | "assigned" | "none" {
  const row = lessons.find((l) => l.lesson_id === lessonId);
  if (!row) return "none";
  if (row.status === "completed") return "completed";
  return "assigned";
}

// ── Employee View ─────────────────────────────────────────────────────────────

function EmployeeCurriculumView({ employeeId }: { employeeId: string }) {
  const [outline, setOutline] = useState<CurriculumUnitOutline[]>([]);
  const [lessons, setLessons] = useState<EmployeeLessonRow[]>([]);
  const [progress, setProgress] = useState<CurriculumProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [o, l, p] = await Promise.all([
      fetchCurriculumOutline(),
      fetchEmployeeLessons(employeeId),
      fetchEmployeeCurriculumProgress(employeeId),
    ]);
    setOutline(o);
    setLessons(l);
    setProgress(p);
    if (o.length > 0 && expandedUnit === null) {
      setExpandedUnit(o[0].unit_title);
    }
  }, [employeeId, expandedUnit]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalLessons = progress?.total_curriculum_lessons ?? outline.reduce((a, u) => a + u.lessons.length, 0);
  const completed = progress?.completed_curriculum ?? lessons.filter((l) => l.status === "completed").length;
  const progressPct = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0;

  const handleAssign = async (lessonId: number) => {
    setActionLoading(lessonId);
    try {
      await postAssignSkillLesson(employeeId, lessonId);
      await reload();
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async (lessonId: number) => {
    setActionLoading(lessonId);
    try {
      await postCompleteEmployeeLesson(employeeId, lessonId);
      await reload();
    } finally {
      setActionLoading(null);
    }
  };

  const handleAutoAssign = async () => {
    setActionLoading(-1);
    try {
      await postAutoAssignEmployeeLessons(employeeId);
      await reload();
    } finally {
      setActionLoading(null);
    }
  };

  const completedLessons = [...lessons]
    .filter((l) => l.status === "completed")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, 5);

  if (loading) {
    return (
      <div className="p-8 text-center text-on-surface-variant text-sm font-mono animate-pulse">
        Loading curriculum…
      </div>
    );
  }

  return (
    <section className="p-6 md:p-10 max-w-7xl w-full mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-outline-variant/10 pb-8">
        <div>
          <span className="font-label text-[0.6875rem] uppercase tracking-widest text-secondary-fixed mb-2 block">
            AI Training System
          </span>
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-white uppercase">
            AI Learning Path
          </h2>
          <p className="text-on-surface-variant max-w-2xl mt-2">
            Complete lessons to build your AI safety skills and reduce risk in your daily work.
          </p>
        </div>
        <button
          onClick={() => void handleAutoAssign()}
          disabled={actionLoading === -1}
          className="px-6 py-2 bg-primary-container text-white text-[0.6875rem] font-headline uppercase font-bold hover:opacity-90 transition-all flex items-center gap-2 rounded-sm disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm">play_arrow</span>
          {actionLoading === -1 ? "Assigning…" : "Auto-Assign Next Lesson"}
        </button>
      </div>

      {/* Progress Dashboard */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-low p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="font-label text-[0.6875rem] text-on-surface-variant mb-1">YOUR PROGRESS</p>
            <p className="font-headline text-3xl font-bold text-white">
              {progressPct}<span className="text-secondary-fixed text-lg">%</span>
            </p>
          </div>
          <div className="flex-grow max-w-md">
            <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-secondary-fixed transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-[0.65rem] text-on-surface-variant mt-2 uppercase tracking-wide">
              {completed} of {totalLessons} lessons completed
            </p>
          </div>
          <div className="text-right">
            <p className="font-label text-[0.6875rem] text-on-surface-variant mb-1">COMPLETED</p>
            <p className="font-headline text-3xl font-bold text-white">
              {completed}<span className="text-secondary-fixed text-lg"> / {totalLessons}</span>
            </p>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 bg-surface-container-high p-6 border-l-4 border-secondary-fixed">
          <p className="font-label text-[0.6875rem] text-secondary-fixed mb-1">ASSIGNED LESSONS</p>
          <p className="font-headline text-2xl font-bold text-white uppercase">
            {lessons.filter((l) => l.status === "assigned").length} Active
          </p>
          <p className="text-[0.6875rem] text-on-surface-variant mt-1">
            {lessons.filter((l) => l.status === "completed").length} completed total
          </p>
        </div>
      </div>

      {/* Learning Units */}
      {outline.length === 0 ? (
        <div className="p-8 text-center text-on-surface-variant text-sm font-mono border border-outline-variant/10">
          No curriculum units available. Ask your manager to set up the learning program.
        </div>
      ) : (
        <div className="space-y-4">
          {outline.map((unit, unitIdx) => {
            const unitLessons = unit.lessons;
            const unitCompleted = unitLessons.filter(
              (l) => lessonStatusForEmployee(l.id, lessons) === "completed"
            ).length;
            const isExpanded = expandedUnit === unit.unit_title;
            const unitPct = unitLessons.length > 0 ? Math.round((unitCompleted / unitLessons.length) * 100) : 0;

            return (
              <div
                key={unit.unit_title}
                className="bg-surface-container-high rounded-sm border border-outline-variant/10"
              >
                {/* Unit Header */}
                <button
                  className="w-full p-5 flex justify-between items-center text-left hover:bg-surface-container-highest/30 transition-colors"
                  onClick={() => setExpandedUnit(isExpanded ? null : unit.unit_title)}
                >
                  <div className="flex gap-4 items-center">
                    <div className="w-10 h-10 bg-primary-container/20 flex items-center justify-center text-primary-container shrink-0">
                      <span className="material-symbols-outlined text-sm">
                        {unitIdx === 0 ? "security" : unitIdx === 1 ? "privacy_tip" : unitIdx === 2 ? "rule" : "hub"}
                      </span>
                    </div>
                    <div>
                      <span className="font-label text-[0.6875rem] text-primary-container font-bold block">
                        UNIT {String(unitIdx + 1).padStart(2, "0")}
                      </span>
                      <h3 className="font-headline text-lg font-bold text-white">{unit.unit_title}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[0.65rem] text-on-surface-variant font-mono">
                      {unitCompleted}/{unitLessons.length} · {unitPct}%
                    </span>
                    <span
                      className={`px-2 py-1 text-[0.6rem] font-bold uppercase tracking-wider rounded-sm ${
                        unitCompleted === unitLessons.length && unitLessons.length > 0
                          ? "bg-secondary-fixed/10 text-secondary-fixed"
                          : unitCompleted > 0
                          ? "bg-primary-container/10 text-primary-container"
                          : "bg-surface-container-highest text-on-surface-variant"
                      }`}
                    >
                      {unitCompleted === unitLessons.length && unitLessons.length > 0
                        ? "Complete"
                        : unitCompleted > 0
                        ? "In Progress"
                        : "Not Started"}
                    </span>
                    <span className="material-symbols-outlined text-outline text-sm">
                      {isExpanded ? "expand_less" : "expand_more"}
                    </span>
                  </div>
                </button>

                {/* Lessons List */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-2 border-t border-outline-variant/10 pt-4">
                    {unitLessons.map((lesson) => {
                      const status = lessonStatusForEmployee(lesson.id, lessons);
                      const isActing = actionLoading === lesson.id;
                      return (
                        <div
                          key={lesson.id}
                          className={`p-3 flex items-center justify-between border-l-2 transition-all ${
                            status === "completed"
                              ? "bg-surface-container-lowest border-secondary-fixed"
                              : status === "assigned"
                              ? "bg-surface-container-lowest border-primary-container"
                              : "bg-surface-container-lowest border-outline-variant/20 opacity-60"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {status === "completed" ? (
                              <span className="material-symbols-outlined text-sm text-secondary-fixed shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                                check_circle
                              </span>
                            ) : status === "assigned" ? (
                              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse shrink-0" />
                            ) : (
                              <span className="material-symbols-outlined text-sm text-outline shrink-0">lock</span>
                            )}
                            <div className="min-w-0">
                              <span className="font-label text-[0.75rem] text-white block truncate">{lesson.title}</span>
                              {lesson.lesson_kind && lesson.lesson_kind !== "lesson" && (
                                <span className="text-[0.6rem] text-on-surface-variant uppercase">{lesson.lesson_kind}</span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 ml-3">
                            {status === "assigned" && (
                              <button
                                onClick={() => void handleComplete(lesson.id)}
                                disabled={isActing}
                                className="bg-secondary-fixed text-black px-3 py-1 text-[0.6rem] font-bold uppercase rounded-sm hover:opacity-90 disabled:opacity-50"
                              >
                                {isActing ? "…" : "Mark Complete"}
                              </button>
                            )}
                            {status === "none" && (
                              <button
                                onClick={() => void handleAssign(lesson.id)}
                                disabled={isActing}
                                className="border border-outline-variant/30 px-3 py-1 text-[0.6rem] font-bold uppercase text-on-surface-variant hover:text-white hover:border-outline-variant/60 transition-colors rounded-sm disabled:opacity-50"
                              >
                                {isActing ? "…" : "Assign"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Training Activity */}
      <div className="grid grid-cols-12 gap-8 border-t border-outline-variant/10 pt-10">
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <h4 className="font-headline text-sm font-black uppercase tracking-widest text-white">Learning Tips</h4>
          <div className="bg-surface-container-lowest p-4 font-label text-[0.75rem] text-on-surface-variant leading-relaxed border-l border-primary-container">
            Complete lessons in order to build foundational skills. Ask your manager to assign specific units if you need to focus on a particular area.
          </div>
        </div>
        <div className="col-span-12 lg:col-span-8 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-headline text-sm font-black uppercase tracking-widest text-white">
              Recent Training Activity
            </h4>
            {completedLessons.length > 0 && (
              <span className="font-headline text-[0.6rem] text-secondary-fixed">● ACTIVE SESSION</span>
            )}
          </div>
          {completedLessons.length === 0 ? (
            <div className="bg-surface-container-lowest p-4 font-mono text-[0.65rem] text-on-surface-variant">
              No completed lessons yet. Start with the first unit above.
            </div>
          ) : (
            <div className="bg-surface-container-lowest p-4 font-mono text-[0.65rem] text-on-surface-variant space-y-1">
              {completedLessons.map((l) => (
                <div key={l.lesson_id} className="flex gap-4">
                  <span className="text-[#5D5FEF] w-20 shrink-0">[{fmtDate(l.completed_at).toUpperCase() || "COMPLETED"}]</span>
                  <span className="text-white w-16 shrink-0">YOU:</span>
                  <span className="truncate">Completed &quot;{l.title}&quot;</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Manager View ──────────────────────────────────────────────────────────────

function ManagerCurriculumView() {
  const [outline, setOutline] = useState<CurriculumUnitOutline[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empProgress, setEmpProgress] = useState<Map<string, CurriculumProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const [assigningEmp, setAssigningEmp] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [o, emps] = await Promise.all([fetchCurriculumOutline(), fetchEmployees()]);
      setOutline(o);
      setEmployees(emps);
      // Fetch progress for each employee (up to 20 to avoid too many requests)
      const slice = emps.slice(0, 20);
      const progressResults = await Promise.all(
        slice.map((e) => fetchEmployeeCurriculumProgress(e.id).then((p) => [e.id, p] as const))
      );
      const map = new Map<string, CurriculumProgress>();
      for (const [id, p] of progressResults) {
        if (p) map.set(String(id), p);
      }
      setEmpProgress(map);
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []);

  const handleAutoAssign = async (empId: string) => {
    setAssigningEmp(empId);
    try {
      await postAutoAssignEmployeeLessons(empId);
      const p = await fetchEmployeeCurriculumProgress(empId);
      if (p) setEmpProgress((prev) => new Map(prev).set(empId, p));
    } finally {
      setAssigningEmp(null);
    }
  };

  const totalLessons = outline.reduce((a, u) => a + u.lessons.length, 0);
  const activeAssignments = Array.from(empProgress.values()).reduce(
    (a, p) => a + (p.total_curriculum_lessons - p.completed_curriculum),
    0
  );
  const avgCompletion =
    empProgress.size > 0
      ? Math.round(
          Array.from(empProgress.values()).reduce(
            (a, p) => a + (p.total_curriculum_lessons > 0 ? p.completed_curriculum / p.total_curriculum_lessons : 0),
            0
          ) / empProgress.size * 100
        )
      : 0;

  if (loading) {
    return (
      <div className="p-8 text-center text-on-surface-variant text-sm font-mono animate-pulse">
        Loading curriculum…
      </div>
    );
  }

  return (
    <section className="p-6 md:p-10 max-w-7xl w-full mx-auto space-y-8">
      {/* Hero */}
      <div className="mb-10 grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 p-8 bg-surface-container-low rounded-lg flex flex-col justify-between border-l-4 border-primary-container relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="font-headline text-3xl font-bold text-white tracking-tight">Active Curriculum Deployment</h2>
            <p className="text-on-surface-variant mt-2 max-w-xl text-sm leading-relaxed">
              Manage and distribute safety protocols across the organization. Monitor completion rates and identify knowledge gaps.
            </p>
          </div>
          <div className="mt-8 flex gap-12 relative z-10">
            <div>
              <p className="font-label text-[10px] uppercase tracking-[0.1em] text-outline">Total Lessons</p>
              <p className="font-headline text-4xl font-bold text-white">{totalLessons}</p>
            </div>
            <div>
              <p className="font-label text-[10px] uppercase tracking-[0.1em] text-outline">Active Assignments</p>
              <p className="font-headline text-4xl font-bold text-secondary-fixed">{activeAssignments}</p>
            </div>
            <div>
              <p className="font-label text-[10px] uppercase tracking-[0.1em] text-outline">Avg Completion</p>
              <p className="font-headline text-4xl font-bold text-white">{avgCompletion}%</p>
            </div>
          </div>
          <div className="absolute right-0 top-0 w-64 h-full opacity-10 pointer-events-none">
            <span className="material-symbols-outlined text-[180px] text-primary rotate-12" style={{ fontVariationSettings: "'FILL' 1" }}>
              shield_with_heart
            </span>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 p-6 bg-surface-container-high rounded-lg flex flex-col justify-center border border-outline-variant/10">
          <h3 className="font-label text-[11px] uppercase tracking-widest text-secondary-fixed mb-4">Curriculum Units</h3>
          <div className="space-y-2">
            {outline.slice(0, 4).map((unit, i) => (
              <div key={unit.unit_title} className="flex items-center justify-between text-xs">
                <span className="text-on-surface-variant truncate">{unit.unit_title}</span>
                <span className="text-outline ml-2 shrink-0">{unit.lessons.length} lessons</span>
              </div>
            ))}
            {outline.length === 0 && (
              <p className="text-xs text-on-surface-variant">No units loaded yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Unit Cards */}
      {outline.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {outline.map((unit, unitIdx) => (
            <div key={unit.unit_title} className="bg-surface-container-low p-5 rounded-lg border border-transparent hover:border-outline-variant/30 flex flex-col h-full transition-all">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 bg-surface-container-lowest rounded-sm flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-2xl">
                    {unitIdx === 0 ? "safety_check" : unitIdx === 1 ? "visibility_off" : unitIdx === 2 ? "verified_user" : "terminal"}
                  </span>
                </div>
                <span className="font-label text-[10px] px-2 py-1 bg-secondary-fixed/10 text-secondary-fixed rounded uppercase">
                  {unit.lessons.length} lessons
                </span>
              </div>
              <h3 className="font-headline text-lg font-bold text-white leading-tight mb-3">{unit.unit_title}</h3>
              <p className="text-on-surface-variant text-sm mb-8 flex-grow font-mono text-[0.7rem]">
                Skill tier: {unit.skill_class}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Employee Assignment Table */}
      <div className="mt-12 bg-surface-container-low rounded-lg p-6 border border-outline-variant/10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h4 className="font-headline font-bold text-white">Employee Curriculum Progress</h4>
            <p className="text-xs text-on-surface-variant">Live assignment status from active learning paths.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className="pb-4 font-label text-[10px] uppercase text-outline px-2">Employee</th>
                <th className="pb-4 font-label text-[10px] uppercase text-outline px-2">Department</th>
                <th className="pb-4 font-label text-[10px] uppercase text-outline px-2">Progress</th>
                <th className="pb-4 font-label text-[10px] uppercase text-outline px-2">Completed</th>
                <th className="pb-4 font-label text-[10px] uppercase text-outline text-right px-2">Actions</th>
              </tr>
            </thead>
            <tbody className="text-xs font-body">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-on-surface-variant font-mono text-xs">
                    No employees found. Invite team members from the Team page.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const p = empProgress.get(String(emp.id));
                  const pct = p && p.total_curriculum_lessons > 0
                    ? Math.round((p.completed_curriculum / p.total_curriculum_lessons) * 100)
                    : 0;
                  const isAssigning = assigningEmp === String(emp.id);
                  return (
                    <tr key={emp.id} className="border-b border-outline-variant/5 hover:bg-surface-container-high transition-colors">
                      <td className="py-4 px-2 text-white font-medium">{emp.name}</td>
                      <td className="py-4 px-2 text-on-surface-variant">{emp.department}</td>
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                            <div className="h-full bg-secondary-fixed rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-on-surface-variant">{pct}%</span>
                        </div>
                      </td>
                      <td className="py-4 px-2 text-on-surface-variant">
                        {p ? `${p.completed_curriculum} / ${p.total_curriculum_lessons}` : "—"}
                      </td>
                      <td className="py-4 px-2 text-right">
                        <button
                          onClick={() => void handleAutoAssign(String(emp.id))}
                          disabled={isAssigning}
                          className="text-[10px] font-label uppercase font-bold text-primary-container hover:text-primary transition-colors disabled:opacity-50"
                        >
                          {isAssigning ? "Assigning…" : "Auto-Assign"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manager Personal Learning Section */}
      <div className="mt-16 pt-8 border-t border-outline-variant/10">
        <div className="mb-8">
          <span className="font-label text-[0.6875rem] uppercase tracking-widest text-secondary-fixed mb-2 block">Manager Learning Context</span>
          <h2 className="font-headline text-3xl font-bold text-white uppercase">Your Personal Growth</h2>
          <p className="text-on-surface-variant text-sm mt-2">Access the same curriculum your team sees to continue your own security education.</p>
        </div>
        <div className="bg-surface-container-lowest -mx-6 md:-mx-10 px-6 md:px-10 py-10 border-y border-outline-variant/5">
          <ManagerPersonalLearning outline={outline} />
        </div>
      </div>
    </section>
  );
}

function ManagerPersonalLearning({ outline }: { outline: CurriculumUnitOutline[] }) {
  if (outline.length === 0) {
    return (
      <div className="text-center text-on-surface-variant text-sm font-mono py-8">
        No curriculum units available yet.
      </div>
    );
  }
  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <h3 className="font-headline text-xl font-bold text-white uppercase mb-6">Curriculum Overview</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {outline.map((unit, i) => (
          <div key={unit.unit_title} className="bg-surface-container-low p-5 border border-outline-variant/10">
            <span className="font-label text-[0.6875rem] text-on-surface-variant">UNIT {String(i + 1).padStart(2, "0")}</span>
            <h4 className="font-headline text-base font-bold text-white mt-1 mb-2">{unit.unit_title}</h4>
            <p className="text-[0.65rem] text-on-surface-variant">{unit.lessons.length} lessons · {unit.skill_class}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page Root ─────────────────────────────────────────────────────────────────

export default function CurriculumPage() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(getSession());
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center text-on-surface-variant text-sm font-mono animate-pulse">
        Initializing Command Interface…
      </div>
    );
  }

  const isManager = session && isTeamManager(session.user?.role ?? "");
  const employeeId = session?.user?.employee_id ? String(session.user.employee_id) : null;

  return (
    <div className="w-full">
      {isManager ? (
        <ManagerCurriculumView />
      ) : employeeId ? (
        <EmployeeCurriculumView employeeId={employeeId} />
      ) : (
        <div className="p-8 text-center text-on-surface-variant text-sm font-mono">
          Log in as an employee to view your curriculum.
        </div>
      )}
    </div>
  );
}
