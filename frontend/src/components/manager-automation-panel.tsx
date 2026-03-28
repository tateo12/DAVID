"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  postOpsDispatchDailyCoaching,
  postOpsDispatchSecurityNotices,
  postOpsDispatchWeeklyLearning,
  postOpsDispatchWeeklyManagerReport,
  postOpsTick,
  type OpsTickResponse,
} from "@/lib/api";
import { getSession, isAutomationManager } from "@/lib/session";

export function ManagerAutomationPanel() {
  const [role, setRole] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastTick, setLastTick] = useState<OpsTickResponse | null>(null);

  useEffect(() => {
    const sync = () => {
      const s = getSession();
      setRole(s?.user?.role ?? null);
    };
    sync();
    window.addEventListener("sentinel-auth", sync);
    return () => window.removeEventListener("sentinel-auth", sync);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 8000);
  }, []);

  const run = useCallback(
    async (key: string, fn: () => Promise<{ generated_count: number; message: string }>) => {
      setBusy(key);
      try {
        const r = await fn();
        showToast(`${r.message} (${r.generated_count} generated)`);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(null);
      }
    },
    [showToast]
  );

  const runTick = useCallback(
    async (force: boolean) => {
      setBusy(force ? "tick-force" : "tick");
      try {
        const r = await postOpsTick(force);
        setLastTick(r);
        const ran = r.jobs.filter((j) => j.status === "ran").length;
        showToast(
          ran
            ? `Tick complete: ${ran} job(s) ran. Others skipped until due unless you force.`
            : "Tick complete: no jobs were due (use force to run all)."
        );
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Tick failed");
      } finally {
        setBusy(null);
      }
    },
    [showToast]
  );

  if (!role || !isAutomationManager(role)) {
    return null;
  }

  const btn =
    "rounded border border-outline-variant/25 bg-surface-container-highest px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-on-surface-variant transition hover:border-secondary-container/40 hover:text-secondary-fixed disabled:opacity-40";

  return (
    <section className="border border-outline-variant/10 border-t-secondary-container/30 bg-surface-container-low p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-label text-[10px] uppercase tracking-[0.15em] text-white">
            Automation &amp; manual runs
          </h2>
          <p className="mt-2 max-w-3xl font-mono text-xs leading-relaxed text-on-surface-variant">
            Coaching, weekly reports, learning emails, and security notices run automatically when a scheduler calls{" "}
            <code className="text-secondary-fixed">POST /api/ops/tick</code> on an interval (for example hourly cron).
            Nothing blocks you from running the same actions here—use individual buttons to target one job, or tick with
            &quot;force&quot; to run every job immediately regardless of schedule.
          </p>
        </div>
        <Link
          href="/employees"
          className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-secondary-fixed hover:underline"
        >
          Per-employee manual assign →
        </Link>
      </div>

      {toast ? (
        <div className="mb-4 rounded border border-secondary-container/25 bg-secondary-container/10 px-3 py-2 font-mono text-xs text-secondary-fixed">
          {toast}
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex-1 space-y-3">
          <div className="font-label text-[9px] uppercase tracking-widest text-outline">Scheduler (matches automation)</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!busy}
              className={btn}
              onClick={() => void runTick(false)}
            >
              {busy === "tick" ? "Running…" : "Run due jobs (tick)"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              className={btn}
              onClick={() => void runTick(true)}
            >
              {busy === "tick-force" ? "Running…" : "Force run all jobs"}
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-3">
          <div className="font-label text-[9px] uppercase tracking-widest text-outline">Individual dispatches</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!busy}
              className={btn}
              onClick={() => void run("daily", postOpsDispatchDailyCoaching)}
            >
              {busy === "daily" ? "…" : "Daily coaching"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              className={btn}
              onClick={() => void run("weekly", postOpsDispatchWeeklyManagerReport)}
            >
              {busy === "weekly" ? "…" : "Weekly manager report"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              className={btn}
              onClick={() => void run("learning", postOpsDispatchWeeklyLearning)}
            >
              {busy === "learning" ? "…" : "Weekly learning emails"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              className={btn}
              onClick={() => void run("sec", postOpsDispatchSecurityNotices)}
            >
              {busy === "sec" ? "…" : "Security notices"}
            </button>
          </div>
        </div>
      </div>

      {lastTick?.jobs?.length ? (
        <details className="mt-4 rounded border border-outline-variant/15 bg-surface-container-lowest p-3">
          <summary className="cursor-pointer font-mono text-[10px] uppercase text-outline">
            Last tick job results
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-[10px] text-on-surface-variant">
            {lastTick.jobs.map((j) => (
              <li key={j.job_name}>
                <span className="text-white">{j.job_name}</span> · {j.status} · {j.generated_count} ·{" "}
                {j.detail}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
