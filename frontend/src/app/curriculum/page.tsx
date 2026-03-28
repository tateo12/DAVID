"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchCurriculumOutline,
  fetchCurriculumLessonDetail,
  fetchEmployees,
  postAssignSkillLesson,
  postAutoAssignEmployeeLessons,
} from "@/lib/api";
import type { CurriculumUnitOutline, Employee, SkillLessonDetail } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MaterialIcon } from "@/components/stitch/material-icon";
import { ChevronDown, ChevronRight, Search, UserPlus, ListOrdered } from "lucide-react";

type LessonSlide = {
  title?: string;
  body_md?: string;
  tracks?: Record<string, string>;
};

function parseLessonPayload(content: string): { slides: LessonSlide[]; lessonTitle?: string } | null {
  try {
    const j = JSON.parse(content) as {
      kind?: string;
      slides?: LessonSlide[];
      lesson_title?: string;
    };
    if (j.kind === "quiz") return null;
    if (Array.isArray(j.slides) && j.slides.length) {
      return { slides: j.slides, lessonTitle: j.lesson_title };
    }
    return null;
  } catch {
    return null;
  }
}

function stripMdLite(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export default function CurriculumPage() {
  const [units, setUnits] = useState<CurriculumUnitOutline[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [lessonSheetId, setLessonSheetId] = useState<number | null>(null);
  const [lessonDetail, setLessonDetail] = useState<SkillLessonDetail | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [u, e] = await Promise.all([fetchCurriculumOutline(), fetchEmployees()]);
      setUnits(u);
      setEmployees(e);
      setLoading(false);
      const init: Record<string, boolean> = {};
      for (const un of u) init[un.unit_title] = true;
      setOpenUnits(init);
      if (e[0]) setSelectedEmployee(e[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!lessonSheetId) {
      setLessonDetail(null);
      return;
    }
    setLessonLoading(true);
    fetchCurriculumLessonDetail(lessonSheetId)
      .then(setLessonDetail)
      .finally(() => setLessonLoading(false));
  }, [lessonSheetId]);

  const totalLessons = useMemo(
    () => units.reduce((a, u) => a + u.lessons.length, 0),
    [units]
  );

  const filteredUnits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return units;
    return units
      .map((u) => ({
        ...u,
        lessons: u.lessons.filter(
          (l) =>
            l.title.toLowerCase().includes(q) ||
            (l.objective ?? "").toLowerCase().includes(q) ||
            u.unit_title.toLowerCase().includes(q)
        ),
      }))
      .filter((u) => u.lessons.length > 0 || u.unit_title.toLowerCase().includes(q));
  }, [units, query]);

  const toggleUnit = (title: string) => {
    setOpenUnits((o) => ({ ...o, [title]: !o[title] }));
  };

  const expandAll = () => {
    const n: Record<string, boolean> = {};
    for (const u of units) n[u.unit_title] = true;
    setOpenUnits(n);
  };

  const collapseAll = () => {
    const n: Record<string, boolean> = {};
    for (const u of units) n[u.unit_title] = false;
    setOpenUnits(n);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const handleAssignLesson = useCallback(
    async (lessonId: number) => {
      if (!selectedEmployee) {
        showToast("Select an employee first.");
        return;
      }
      setAssignBusy(true);
      try {
        await postAssignSkillLesson(selectedEmployee, lessonId);
        showToast(`Assigned to employee ${selectedEmployee}.`);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Assign failed");
      } finally {
        setAssignBusy(false);
      }
    },
    [selectedEmployee]
  );

  const handleQueueNext = useCallback(async () => {
    if (!selectedEmployee) {
      showToast("Select an employee first.");
      return;
    }
    setAssignBusy(true);
    try {
      await postAutoAssignEmployeeLessons(selectedEmployee, false);
      showToast("Queued next module in course order (if not at cap).");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Auto-assign failed");
    } finally {
      setAssignBusy(false);
    }
  }, [selectedEmployee]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-6 border-b border-outline-variant/10 pb-8 md:flex-row md:items-end">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-black uppercase tracking-tight text-white">
            Lessons &amp; curriculum
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            Explore the full imported course, open any module, and assign it directly or queue the next lesson in
            sequence. The system also queues lessons automatically when skill profiles update or risk is elevated; this
            page is your manual override—assignments still follow global module order.
          </p>
          <Link
            href="/employees"
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-secondary-fixed hover:underline"
          >
            Skill Hub — per-employee progress
            <MaterialIcon name="chevron_right" className="text-sm" />
          </Link>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/15 bg-surface-container-low px-4 py-3 sm:min-w-[280px]">
          <label className="font-label text-[9px] uppercase tracking-widest text-outline">Assign to employee</label>
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="border border-outline-variant/25 bg-surface-container-highest px-3 py-2 font-mono text-sm text-white"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} · {emp.department}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={assignBusy || !selectedEmployee}
            onClick={() => void handleQueueNext()}
            className="flex items-center justify-center gap-2 border border-secondary-container/40 bg-secondary-container/15 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-secondary-fixed transition hover:bg-secondary-container/25 disabled:opacity-40"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            Queue next in course order
          </button>
        </div>
      </header>

      {toast ? (
        <div className="rounded border border-secondary-container/30 bg-secondary-container/10 px-4 py-2 font-mono text-xs text-secondary-fixed">
          {toast}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-on-surface-variant">
          <span className="rounded border border-outline-variant/20 px-2 py-1 text-white">
            {totalLessons} modules
          </span>
          <span className="rounded border border-outline-variant/20 px-2 py-1">{units.length} units</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-outline" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter modules…"
              className="w-full border border-outline-variant/20 bg-surface-container-highest py-2 pl-8 pr-3 font-mono text-xs text-white placeholder:text-outline"
            />
          </div>
          <button
            type="button"
            onClick={expandAll}
            className="rounded border border-outline-variant/25 px-2 py-1 font-mono text-[10px] uppercase text-outline hover:text-white"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded border border-outline-variant/25 px-2 py-1 font-mono text-[10px] uppercase text-outline hover:text-white"
          >
            Collapse
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-container-high" />
          ))}
        </div>
      ) : filteredUnits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant/30 px-6 py-16 text-center text-sm text-on-surface-variant">
          No curriculum loaded. Ensure <code className="text-secondary-fixed">exported_curriculum.md</code> is imported
          on the server.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredUnits.map((unit) => (
            <div
              key={unit.unit_title}
              className="overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-low"
            >
              <button
                type="button"
                onClick={() => toggleUnit(unit.unit_title)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-surface-container-highest"
              >
                <div>
                  <span className="font-headline text-sm font-bold text-white">{unit.unit_title}</span>
                  <span className="ml-2 font-mono text-[10px] uppercase text-outline">{unit.skill_class}</span>
                  <span className="ml-2 font-mono text-[10px] text-on-surface-variant">
                    {unit.lessons.length} modules
                  </span>
                </div>
                {openUnits[unit.unit_title] ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-outline" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-outline" />
                )}
              </button>
              {openUnits[unit.unit_title] ? (
                <ul className="divide-y divide-outline-variant/5 border-t border-outline-variant/10">
                  {unit.lessons.map((l) => (
                    <li
                      key={l.id}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <button
                        type="button"
                        onClick={() => setLessonSheetId(l.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-outline">#{l.sequence_order}</span>
                          <span className="rounded bg-primary-container/20 px-1.5 py-0.5 font-mono text-[9px] uppercase text-primary">
                            lesson
                          </span>
                        </div>
                        <div className="font-medium text-white">{l.title}</div>
                        {l.objective ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">{l.objective}</p>
                        ) : null}
                      </button>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => setLessonSheetId(l.id)}
                          className="rounded border border-outline-variant/25 px-3 py-1.5 font-mono text-[10px] uppercase text-outline hover:border-secondary-container/40 hover:text-secondary-fixed"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          disabled={assignBusy || !selectedEmployee}
                          onClick={() => void handleAssignLesson(l.id)}
                          className="flex items-center gap-1 rounded bg-secondary-container px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-black disabled:opacity-40"
                        >
                          <UserPlus className="h-3 w-3" />
                          Assign
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Sheet open={lessonSheetId != null} onOpenChange={(o) => !o && setLessonSheetId(null)}>
        <SheetContent className="w-full overflow-y-auto border-outline-variant/20 bg-surface-container-low sm:max-w-lg">
          <SheetHeader className="text-left">
            <SheetTitle className="text-white">
              {lessonDetail?.title ?? (lessonLoading ? "Loading…" : "Module")}
            </SheetTitle>
            <SheetDescription className="space-y-1 text-on-surface-variant">
              {lessonDetail ? (
                <>
                  <span className="font-mono text-[10px] uppercase text-outline">
                    Seq {lessonDetail.sequence_order} · {lessonDetail.unit_title}
                  </span>
                  <p className="text-sm leading-relaxed">{lessonDetail.objective}</p>
                </>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          {lessonLoading ? (
            <p className="mt-4 font-mono text-xs text-outline">Fetching module payload…</p>
          ) : lessonDetail ? (
            <div className="mt-4 space-y-4">
              {(() => {
                const payload = parseLessonPayload(lessonDetail.content);
                if (!payload?.slides.length) {
                  return (
                    <p className="text-sm text-on-surface-variant">
                      This module has no readable lesson sections. It may be legacy or empty.
                    </p>
                  );
                }
                return (
                  <article className="space-y-8 border-t border-outline-variant/10 pt-4">
                    {payload.slides.map((slide, idx) => (
                      <section key={idx} className="space-y-3">
                        <h3 className="font-headline text-lg font-bold text-white">{slide.title ?? `Section ${idx + 1}`}</h3>
                        {slide.tracks && Object.keys(slide.tracks).length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-3">
                            {(["beginner", "intermediate", "pro"] as const).map((k) =>
                              slide.tracks?.[k] ? (
                                <div
                                  key={k}
                                  className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-3"
                                >
                                  <p className="font-mono text-[9px] uppercase tracking-wider text-secondary-fixed">
                                    {k}
                                  </p>
                                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">
                                    {stripMdLite(slide.tracks[k])}
                                  </p>
                                </div>
                              ) : null
                            )}
                          </div>
                        ) : null}
                        {slide.body_md ? (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">
                            {stripMdLite(slide.body_md)}
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </article>
                );
              })()}
              <button
                type="button"
                disabled={assignBusy || !selectedEmployee}
                onClick={() => lessonSheetId && void handleAssignLesson(lessonSheetId)}
                className="w-full bg-secondary-container py-2 font-headline text-sm font-bold uppercase tracking-wide text-black disabled:opacity-40"
              >
                Assign this module
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-error">Could not load lesson.</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
