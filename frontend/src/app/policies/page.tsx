"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createPolicy, fetchPolicies, fetchPolicyPresets, postPolicyAssistantChat, updatePolicy } from "@/lib/api";
import { Policy, PolicyPresetInfo } from "@/lib/types";
import { ORG_CHART_ROLE_OPTIONS } from "@/lib/org-chart-roles";
import { getSession, isPolicyEditor, type StoredSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollText, Calendar, Tag, Edit3, Save, X, Loader2, Plus, MessageSquare, Sparkles } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function PoliciesPage() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Policy | null>(null);
  const [editing, setEditing] = useState(false);
  const [editJson, setEditJson] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("employee");
  const [policyPresets, setPolicyPresets] = useState<PolicyPresetInfo[]>([]);
  const [presetsStatus, setPresetsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [policyDraft, setPolicyDraft] = useState<Record<string, unknown>>({});
  const [draftJsonText, setDraftJsonText] = useState("{}");
  const [jsonMode, setJsonMode] = useState(false);
  const [assistantThread, setAssistantThread] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const syncSession = useCallback(() => {
    setSession(getSession());
  }, []);

  useEffect(() => {
    syncSession();
    window.addEventListener("sentinel-auth", syncSession);
    return () => window.removeEventListener("sentinel-auth", syncSession);
  }, [syncSession]);

  const canEdit = session != null && isPolicyEditor(session.user.role);
  const isEmployeeViewer = session != null && !canEdit;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchPolicies()
      .then((rows) => {
        if (!cancelled) {
          setPolicies(rows);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load policies");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!createOpen || !canEdit) return;
    setSelectedPresetIds([]);
    setPolicyDraft({});
    setDraftJsonText("{}");
    setAssistantThread([]);
    setAssistantInput("");
    setJsonMode(false);
    setCreateError(null);
    setPresetsStatus("loading");
    setPresetsError(null);
    let cancelled = false;
    fetchPolicyPresets()
      .then((rows) => {
        if (cancelled) return;
        setPolicyPresets(rows);
        setPresetsStatus("ok");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPolicyPresets([]);
        setPresetsError(e instanceof Error ? e.message : "Failed to load presets");
        setPresetsStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen, canEdit]);

  const togglePreset = (id: string) => {
    setSelectedPresetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const runPolicyAssistant = async (forcedUserMessage?: string) => {
    const text = forcedUserMessage ?? assistantInput.trim();
    if (!text || assistantBusy) return;
    setAssistantBusy(true);
    setCreateError(null);
    const userLine = { role: "user" as const, content: text };
    const nextMsgs = [...assistantThread, userLine];
    setAssistantThread(nextMsgs);
    if (!forcedUserMessage) setAssistantInput("");
    try {
      const res = await postPolicyAssistantChat({
        messages: nextMsgs,
        selected_presets: selectedPresetIds,
        draft_rule: policyDraft,
      });
      setAssistantThread((m) => [...m, { role: "assistant", content: res.message }]);
      setPolicyDraft(res.rule_json);
      setDraftJsonText(JSON.stringify(res.rule_json, null, 2));
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Assistant request failed");
      setAssistantThread((m) => m.slice(0, -1));
    } finally {
      setAssistantBusy(false);
    }
  };

  const handleEdit = (policy: Policy) => {
    setEditJson(JSON.stringify(policy.rule_json, null, 2));
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!selected || !canEdit) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editJson) as Record<string, unknown>;
    } catch {
      setSaveError("Invalid JSON. Fix syntax and try again.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updatePolicy(selected.id, parsed);
      setPolicies((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSelected(updated);
      setEditing(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!canEdit) return;
    const name = newName.trim();
    const role = newRole.trim();
    if (!name || !role) {
      setCreateError("Name and audience role are required.");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = jsonMode
        ? (JSON.parse(draftJsonText) as Record<string, unknown>)
        : { ...policyDraft };
    } catch {
      setCreateError("Invalid JSON in rules.");
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      setCreateError("Rules must be a JSON object.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createPolicy({ name, role, rule_json: parsed });
      setPolicies((prev) => [...prev, created].sort((a, b) => a.id - b.id));
      setCreateOpen(false);
      setNewName("");
      setNewRole("employee");
      setSelected(created);
      setEditing(false);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-4 border-b border-outline-variant/10 pb-8 md:flex-row md:items-end">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-black uppercase tracking-tight text-white">
            {canEdit ? "AI policy builder" : "Company AI policies"}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-on-surface-variant">
            {canEdit
              ? "Use building blocks and the policy assistant for most changes; raw JSON remains available for power users."
              : isEmployeeViewer
                ? "Read-only view of the rules your organization applies to AI use. Ask a manager if something should change."
                : "Sign in as a manager to create and edit policies, or as an employee to view them."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!session && (
            <Link
              href="/login"
              className="rounded-sm border border-secondary-container/40 bg-secondary-container/10 px-4 py-2 font-label text-xs font-bold uppercase tracking-wider text-secondary-fixed hover:bg-secondary-container/20"
            >
              Sign in
            </Link>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
              className="flex items-center gap-2 rounded-sm bg-secondary-container px-4 py-2 font-label text-xs font-bold uppercase tracking-wider text-black hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              New policy
            </button>
          )}
        </div>
      </header>

      {loadError && (
        <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">{loadError}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading policies…
        </div>
      ) : (
        <>
          <div className="text-sm text-on-surface-variant">
            <span>
              {policies.length} polic{policies.length === 1 ? "y" : "ies"}
              {session ? ` · signed in as ${session.user.username} (${session.user.role})` : ""}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {policies.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low px-6 py-14 text-center text-sm text-on-surface-variant">
                No policies in the database yet.
                {canEdit ? " Use “New policy” to add one." : " A manager can add policies after signing in."}
              </div>
            ) : null}
            {policies.map((policy) => (
              <div
                key={policy.id}
                className="group cursor-pointer rounded-xl border border-outline-variant/10 bg-surface-container-low p-5 transition-colors hover:border-primary-container/25"
                onClick={() => {
                  setSelected(policy);
                  setEditing(false);
                  setSaveError(null);
                }}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="rounded-lg bg-primary-container/15 p-2">
                    <ScrollText className="h-4 w-4 text-primary" />
                  </div>
                  <Badge
                    variant="outline"
                    className="border-outline-variant/30 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant"
                  >
                    {policy.role}
                  </Badge>
                </div>

                <h3 className="mb-2 text-sm font-semibold text-white transition-colors group-hover:text-primary">{policy.name}</h3>
                <p className="mb-4 line-clamp-3 font-mono text-xs text-on-surface-variant">
                  {JSON.stringify(policy.rule_json).slice(0, 160)}
                  {JSON.stringify(policy.rule_json).length > 160 ? "…" : ""}
                </p>

                <div className="flex items-center justify-between text-[10px] text-outline">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    id {policy.id}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(policy.updated_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-outline-variant/20 bg-surface">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5 text-secondary-fixed" />
              New AI policy
            </DialogTitle>
            <p className="text-sm text-on-surface-variant">
              Choose building blocks, merge them into a draft, then refine with the assistant (LLM when configured on
              the server). Finish by reviewing JSON and creating the policy.
            </p>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-on-surface-variant">Policy name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-white"
                  placeholder="e.g. Sales — customer data"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-on-surface-variant">
                  Audience / org segment (role key)
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-white"
                >
                  {ORG_CHART_ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} className="bg-surface text-on-surface">
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <h4 className="mb-2 flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-outline">
                <span>Policy building blocks</span>
              </h4>
              <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {presetsStatus === "loading" ? (
                  <p className="text-xs text-on-surface-variant">Loading presets…</p>
                ) : presetsStatus === "error" ? (
                  <p className="text-xs text-error">Could not load building blocks: {presetsError}</p>
                ) : policyPresets.length === 0 ? (
                  <p className="text-xs text-on-surface-variant">No presets returned from the API.</p>
                ) : (
                  policyPresets.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer gap-2 rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-2 text-left hover:border-secondary-container/30"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPresetIds.includes(p.id)}
                        onChange={() => togglePreset(p.id)}
                        className="mt-1 accent-secondary-fixed"
                      />
                      <span>
                        <span className="block text-sm font-medium text-white">{p.label}</span>
                        <span className="text-xs text-on-surface-variant">{p.description}</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <button
                type="button"
                disabled={assistantBusy}
                onClick={() => void runPolicyAssistant("Apply my selected policy building blocks.")}
                className="mt-2 rounded border border-secondary-container/40 bg-secondary-container/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-secondary-fixed hover:bg-secondary-container/20 disabled:opacity-50"
              >
                Merge blocks into draft
              </button>
            </div>

            <div className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-3">
              <h4 className="mb-2 flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-outline">
                <MessageSquare className="h-3.5 w-3.5" />
                Policy assistant
              </h4>
              <div className="mb-2 max-h-40 space-y-2 overflow-y-auto font-mono text-xs">
                {assistantThread.length === 0 ? (
                  <p className="text-on-surface-variant">
                    After merging blocks, ask for stricter keywords, different code-paste rules, or a lower extension
                    warning threshold.
                  </p>
                ) : (
                  assistantThread.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === "user"
                          ? "ml-4 rounded bg-primary-container/10 pl-2 text-on-surface"
                          : "mr-4 rounded border border-outline-variant/10 pl-2 text-on-surface-variant"
                      }
                    >
                      <span className="text-[9px] uppercase text-outline">{m.role}</span>
                      <p className="whitespace-pre-wrap text-white">{m.content}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void runPolicyAssistant()}
                  placeholder="e.g. Add keywords for HIPAA and block all code pastes for this role"
                  className="min-w-0 flex-1 rounded border border-outline-variant/20 bg-surface-container-high px-2 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  disabled={assistantBusy || !assistantInput.trim()}
                  onClick={() => void runPolicyAssistant()}
                  className="shrink-0 rounded bg-secondary-container px-3 py-2 font-label text-[10px] font-bold uppercase text-black disabled:opacity-40"
                >
                  {assistantBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                </button>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="font-mono text-[10px] uppercase text-on-surface-variant">rule_json preview</label>
                <button
                  type="button"
                  onClick={() => {
                    if (!jsonMode) setDraftJsonText(JSON.stringify(policyDraft, null, 2));
                    setJsonMode((j) => !j);
                  }}
                  className="text-[10px] uppercase tracking-wider text-secondary-fixed hover:underline"
                >
                  {jsonMode ? "Use assistant draft" : "Edit raw JSON"}
                </button>
              </div>
              <textarea
                value={jsonMode ? draftJsonText : JSON.stringify(policyDraft, null, 2)}
                onChange={(e) => {
                  if (jsonMode) setDraftJsonText(e.target.value);
                }}
                readOnly={!jsonMode}
                className="min-h-[160px] w-full resize-y rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3 font-mono text-xs text-on-surface read-only:opacity-90"
              />
            </div>

            {createError && <p className="text-xs text-error">{createError}</p>}
            <div className="flex justify-end gap-2 border-t border-outline-variant/10 pt-4">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded px-3 py-2 text-xs text-on-surface-variant hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreate()}
                className="rounded-sm bg-secondary-container px-4 py-2 font-label text-xs font-bold uppercase text-black hover:brightness-110 disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create policy"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto border-outline-variant/20 bg-surface">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <div className="flex items-center gap-3">
                    <DialogTitle className="text-lg text-white">{selected.name}</DialogTitle>
                    <Badge variant="outline" className="text-[10px] font-semibold uppercase">
                      {selected.role}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {canEdit
                    ? "Edit the JSON rules for this policy, then save to persist."
                    : "Your organization’s policy for this audience. Editing is limited to manager accounts."}
                </p>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">rule_json</h4>
                  {canEdit && (
                    <>
                      {!editing ? (
                        <button
                          type="button"
                          onClick={() => handleEdit(selected)}
                          className="flex items-center gap-1.5 text-xs text-primary transition-colors hover:text-primary-container"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit JSON
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditing(false)}
                            className="flex items-center gap-1 text-xs text-on-surface-variant transition-colors hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={saving}
                            className="flex items-center gap-1 text-xs text-secondary-fixed transition-colors hover:text-secondary-container disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Save
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {saveError && <p className="text-xs text-error">{saveError}</p>}

                {canEdit && editing ? (
                  <textarea
                    value={editJson}
                    onChange={(e) => setEditJson(e.target.value)}
                    className="min-h-[240px] w-full resize-y rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4 font-mono text-xs text-on-surface focus:border-primary-container/50 focus:outline-none focus:ring-2 focus:ring-primary-container/20"
                  />
                ) : (
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-4 text-xs text-on-surface">
                    {JSON.stringify(selected.rule_json, null, 2)}
                  </pre>
                )}

                <div className="flex items-center gap-6 border-t border-outline-variant/10 pt-2 text-xs text-outline">
                  <span>Policy id: {selected.id}</span>
                  <span>Updated: {formatDate(selected.updated_at)}</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
