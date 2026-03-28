"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchAlerts,
  fetchHealth,
  fetchMetrics,
  fetchScoutTelemetry,
  postScoutChat,
} from "@/lib/api";
import type { AlertRecord, Metrics, ScoutChatMessage, ScoutTelemetryResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MaterialIcon } from "./material-icon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const SCOUT_STORAGE_KEY = "sentinel-scout-chat-v1";

type ChatLine = ScoutChatMessage & { usedLlm?: boolean };

function loadScoutMessages(): ChatLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SCOUT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveScoutMessages(msgs: ChatLine[]) {
  try {
    sessionStorage.setItem(SCOUT_STORAGE_KEY, JSON.stringify(msgs.slice(-40)));
  } catch {
    /* ignore */
  }
}

function renderScoutText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const SEVERITY_CHIP: Record<string, string> = {
  low: "border-secondary-container/30 bg-secondary-container/10 text-secondary-fixed",
  medium: "border-yellow-500/30 bg-yellow-500/10 text-yellow-500",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  critical: "border-error/40 bg-error/10 text-error",
};

export function StitchHeaderRibbon() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [scoutOpen, setScoutOpen] = useState(false);

  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  useEffect(() => {
    fetchAlerts().then(setAlerts);
  }, []);

  const [health, setHealth] = useState<{ status: string } | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [connLoading, setConnLoading] = useState(false);

  const [scoutMessages, setScoutMessages] = useState<ChatLine[]>([]);
  const [scoutInput, setScoutInput] = useState("");
  const [scoutSending, setScoutSending] = useState(false);
  const [scoutTelemetry, setScoutTelemetry] = useState<ScoutTelemetryResponse | null>(null);
  const scoutEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setScoutMessages(loadScoutMessages());
  }, []);

  useEffect(() => {
    saveScoutMessages(scoutMessages);
  }, [scoutMessages]);

  useEffect(() => {
    if (!notificationsOpen) return;
    setAlertsLoading(true);
    fetchAlerts()
      .then(setAlerts)
      .finally(() => setAlertsLoading(false));
  }, [notificationsOpen]);

  useEffect(() => {
    if (!connectionsOpen) return;
    setConnLoading(true);
    Promise.all([fetchHealth(), fetchMetrics()])
      .then(([h, m]) => {
        setHealth(h);
        setMetrics(m);
      })
      .finally(() => setConnLoading(false));
  }, [connectionsOpen]);

  useEffect(() => {
    if (!scoutOpen) return;
    fetchScoutTelemetry().then((t) => {
      setScoutTelemetry(t);
      if (!t) return;
      setScoutMessages((prev) => {
        if (prev.length > 0) return prev;
        return [
          {
            role: "assistant",
            content:
              `Telemetry loaded: **${t.total_prompts}** prompts in Sentinel. ` +
              (t.llm_available
                ? "I can use the configured model for richer answers."
                : "I'm using on-device rules over this data (set an OpenRouter/API key on the backend for full LLM replies).") +
              " Ask about risk mix, top employees, recent activity, or actions taken.",
            usedLlm: false,
          },
        ];
      });
    });
  }, [scoutOpen]);

  useEffect(() => {
    scoutEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [scoutMessages, scoutOpen]);

  const alertCount = alerts.length;

  const sendScout = useCallback(async () => {
    const text = scoutInput.trim();
    if (!text || scoutSending) return;
    const userLine: ChatLine = { role: "user", content: text };
    const next = [...scoutMessages, userLine];
    setScoutMessages(next);
    setScoutInput("");
    setScoutSending(true);
    try {
      const payload: ScoutChatMessage[] = next.map(({ role, content }) => ({ role, content }));
      const res = await postScoutChat(payload);
      setScoutMessages((m) => [
        ...m,
        { role: "assistant", content: res.message, usedLlm: res.used_llm },
      ]);
    } catch {
      setScoutMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Could not reach Scout. Check that the API is running.",
          usedLlm: false,
        },
      ]);
    } finally {
      setScoutSending(false);
    }
  }, [scoutInput, scoutMessages, scoutSending]);

  const clearScoutChat = useCallback(() => {
    try {
      sessionStorage.removeItem(SCOUT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (scoutTelemetry) {
      setScoutMessages([
        {
          role: "assistant",
          content:
            `Chat cleared. **${scoutTelemetry.total_prompts}** prompts on file. Ask anything about stored telemetry.`,
          usedLlm: false,
        },
      ]);
    } else {
      setScoutMessages([]);
    }
  }, [scoutTelemetry]);

  const apiBase = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000",
    []
  );

  return (
    <>
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={() => setConnectionsOpen(true)}
          className="rounded p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-white"
          title="Connections & status"
          aria-label="Connections and integration status"
        >
          <MaterialIcon name="hub" />
        </button>
        <button
          type="button"
          onClick={() => setNotificationsOpen(true)}
          className="relative rounded p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-white"
          title="Alerts"
          aria-label="Open notifications"
        >
          <MaterialIcon name="notifications" />
          {alertCount > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary-container px-1 font-mono text-[9px] font-bold leading-none text-black">
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          ) : null}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setScoutOpen(true)}
        className="flex items-center gap-2 bg-primary-container px-3 py-1.5 text-on-primary-container transition-all hover:brightness-110 md:px-4"
        aria-label="Open Scout AI assistant"
      >
        <MaterialIcon name="bolt" className="text-sm" />
        <span className="hidden font-bold tracking-tighter sm:inline">Scout AI</span>
      </button>

      <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <SheetContent
          side="right"
          className="w-full border-outline-variant/20 bg-surface-container-low text-on-surface sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle className="font-headline text-white">Alerts</SheetTitle>
            <SheetDescription className="text-on-surface-variant">
              Active items from Sentinel&apos;s alerts channel.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 max-h-[calc(100vh-8rem)] space-y-3 overflow-y-auto pr-1">
            {alertsLoading ? (
              <p className="font-mono text-xs text-outline">Loading…</p>
            ) : alerts.length === 0 ? (
              <p className="font-mono text-sm text-on-surface-variant">No active alerts.</p>
            ) : (
              alerts.map((a) => (
                <article
                  key={a.id}
                  className="border border-outline-variant/15 bg-surface-container-lowest p-3"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase",
                        SEVERITY_CHIP[a.severity] ?? SEVERITY_CHIP.medium
                      )}
                    >
                      {a.severity}
                    </span>
                    <span className="font-mono text-[9px] uppercase text-outline">{a.alert_type}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-on-surface-variant">{a.detail}</p>
                  <p className="mt-2 font-mono text-[9px] text-outline">{a.created_at}</p>
                </article>
              ))
            )}
            <Link
              href="/prompts"
              onClick={() => setNotificationsOpen(false)}
              className="block pt-2 font-mono text-[10px] uppercase tracking-widest text-secondary-fixed hover:underline"
            >
              Security logs →
            </Link>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={connectionsOpen} onOpenChange={setConnectionsOpen}>
        <SheetContent
          side="right"
          className="w-full border-outline-variant/20 bg-surface-container-low text-on-surface sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle className="font-headline text-white">Connections</SheetTitle>
            <SheetDescription className="text-on-surface-variant">
              API reachability and quick links to data streams.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {connLoading ? (
              <p className="font-mono text-xs text-outline">Checking…</p>
            ) : (
              <>
                <section className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-4">
                  <h3 className="mb-2 font-label text-[10px] uppercase tracking-widest text-outline">
                    Backend
                  </h3>
                  <p className="font-mono text-sm text-white">
                    {health?.status === "ok" ? (
                      <span className="text-secondary-fixed">● Online</span>
                    ) : (
                      <span className="text-error">● Unreachable</span>
                    )}
                  </p>
                  <p className="mt-1 break-all font-mono text-[10px] text-on-surface-variant">{apiBase}</p>
                </section>
                {metrics ? (
                  <section className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-4">
                    <h3 className="mb-2 font-label text-[10px] uppercase tracking-widest text-outline">
                      7-day snapshot
                    </h3>
                    {metrics.load_error ? (
                      <p className="font-mono text-xs text-error">
                        /api/metrics/dashboard failed: {metrics.load_error}
                      </p>
                    ) : (
                      <ul className="space-y-1 font-mono text-xs text-on-surface-variant">
                        <li>
                          Threats blocked:{" "}
                          <span className="text-white">{metrics.threats_blocked}</span>
                        </li>
                        <li>
                          Shadow signals:{" "}
                          <span className="text-white">{metrics.shadow_ai_detected}</span>
                        </li>
                        <li>
                          Active employees:{" "}
                          <span className="text-white">{metrics.active_employees}</span>
                        </li>
                      </ul>
                    )}
                  </section>
                ) : null}
              </>
            )}
            <section className="space-y-2">
              <h3 className="font-label text-[10px] uppercase tracking-widest text-outline">Data streams</h3>
              <Link
                href="/prompts"
                onClick={() => setConnectionsOpen(false)}
                className="flex items-center justify-between border border-outline-variant/15 bg-surface-container-highest px-3 py-2 font-mono text-xs text-white transition hover:border-secondary-container/30"
              >
                Security logs
                <MaterialIcon name="chevron_right" className="text-outline" />
              </Link>
              <Link
                href="/reports#shadow-signals"
                onClick={() => setConnectionsOpen(false)}
                className="flex items-center justify-between border border-outline-variant/15 bg-surface-container-highest px-3 py-2 font-mono text-xs text-white transition hover:border-secondary-container/30"
              >
                Risk trends (shadow)
                <MaterialIcon name="chevron_right" className="text-outline" />
              </Link>
              <Link
                href="/employees"
                onClick={() => setConnectionsOpen(false)}
                className="flex items-center justify-between border border-outline-variant/15 bg-surface-container-highest px-3 py-2 font-mono text-xs text-white transition hover:border-secondary-container/30"
              >
                Skill Hub
                <MaterialIcon name="chevron_right" className="text-outline" />
              </Link>

            </section>
            <p className="font-mono text-[10px] leading-relaxed text-outline">
              Browser extension captures flow into the same pipeline as manual probes; they appear under Security
              Logs once analyzed.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={scoutOpen} onOpenChange={setScoutOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col border-outline-variant/20 bg-surface-container-low p-0 text-on-surface sm:max-w-lg"
        >
          <SheetHeader className="border-b border-outline-variant/10 px-6 pb-4 pt-6 text-left">
            <SheetTitle className="font-headline text-white">Scout AI</SheetTitle>
            <SheetDescription className="text-on-surface-variant">
              Answers from aggregated employee prompt telemetry. Add an API key on the server for full LLM replies.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-hidden px-6 pb-6 pt-2">
            <div className="mb-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={clearScoutChat}
                className="font-mono text-[10px] uppercase tracking-wider text-outline hover:text-white"
              >
                Clear chat
              </button>
              <Link
                href="/"
                onClick={() => setScoutOpen(false)}
                className="font-mono text-[10px] uppercase tracking-wider text-secondary-fixed hover:underline"
              >
                Dashboard probe →
              </Link>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded border border-outline-variant/10 bg-surface-container-lowest p-3">
              {scoutMessages.map((m, i) => (
                <div
                  key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "ml-4 bg-primary-container/15 text-on-surface"
                      : "mr-4 border border-outline-variant/10 bg-surface-container-high text-on-surface-variant"
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-label text-[9px] uppercase tracking-widest text-secondary-fixed">
                        Scout
                      </span>
                      {m.usedLlm ? (
                        <span className="rounded bg-secondary-container/20 px-1 font-mono text-[8px] text-secondary-fixed">
                          LLM
                        </span>
                      ) : (
                        <span className="rounded bg-outline/10 px-1 font-mono text-[8px] text-outline">
                          Rules
                        </span>
                      )}
                    </div>
                  ) : null}
                  <div className="whitespace-pre-wrap text-white">{renderScoutText(m.content)}</div>
                </div>
              ))}
              {scoutSending ? (
                <p className="font-mono text-[10px] text-outline">Scout is thinking…</p>
              ) : null}
              <div ref={scoutEndRef} />
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={scoutInput}
                onChange={(e) => setScoutInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void sendScout()}
                placeholder="Ask about prompts, risk, employees…"
                className="min-w-0 flex-1 border border-outline-variant/20 bg-surface-container-highest px-3 py-2 font-mono text-sm text-white placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary-fixed"
              />
              <button
                type="button"
                disabled={scoutSending || !scoutInput.trim()}
                onClick={() => void sendScout()}
                className="bg-secondary-container px-4 py-2 font-headline text-xs font-bold uppercase tracking-wide text-black disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
