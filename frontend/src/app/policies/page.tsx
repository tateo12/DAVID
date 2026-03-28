"use client";

import React, { useEffect, useState } from "react";
import { fetchPolicies, updatePolicy } from "@/lib/api";
import { Policy } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollText, Calendar, Tag, Edit3, Save, X, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Policy | null>(null);
  const [editing, setEditing] = useState(false);
  const [editJson, setEditJson] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const handleEdit = (policy: Policy) => {
    setEditJson(JSON.stringify(policy.rule_json, null, 2));
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!selected) return;
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

  return (
    <div className="space-y-6">
      <PageHeader
        accent="policies"
        icon={ScrollText}
        title="AI usage policies"
        description={
          <>
            Rules loaded from the Sentinel API (role-based <code className="rounded bg-sentinel-surface px-1 font-mono text-xs">rule_json</code>).
            Click a card to view or edit JSON.
          </>
        }
      />

      {loadError && (
        <div className="rounded-lg border border-sentinel-red/40 bg-sentinel-red/10 px-4 py-3 text-sm text-sentinel-red">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sentinel-text-secondary text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading policies…
        </div>
      ) : (
        <>
          <div className="flex gap-3 text-sm text-sentinel-text-secondary">
            <span>{policies.length} policy row{policies.length === 1 ? "" : "s"}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {policies.map((policy) => (
              <div
                key={policy.id}
                className="glass-card p-5 rounded-xl cursor-pointer group"
                onClick={() => {
                  setSelected(policy);
                  setEditing(false);
                  setSaveError(null);
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 rounded-lg bg-sentinel-blue/10">
                    <ScrollText className="w-4 h-4 text-sentinel-blue" />
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold border-sentinel-border text-sentinel-text-secondary">
                    {policy.role}
                  </Badge>
                </div>

                <h3 className="text-sm font-semibold text-sentinel-text-primary mb-2 group-hover:text-sentinel-blue transition-colors duration-200">
                  {policy.name}
                </h3>
                <p className="text-xs text-sentinel-text-secondary line-clamp-3 mb-4 font-mono">
                  {JSON.stringify(policy.rule_json).slice(0, 160)}
                  {JSON.stringify(policy.rule_json).length > 160 ? "…" : ""}
                </p>

                <div className="flex items-center justify-between text-[10px] text-sentinel-text-secondary/60">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    id {policy.id}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(policy.updated_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="bg-sentinel-bg border-sentinel-border max-w-2xl max-h-[80vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <div className="flex items-center gap-3">
                    <DialogTitle className="text-sentinel-text-primary text-lg">{selected.name}</DialogTitle>
                    <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                      {selected.role}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-sentinel-text-secondary mt-1">
                  Edit the JSON rules for this policy row, then save to persist.
                </p>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-sentinel-text-primary">rule_json</h4>
                  {!editing ? (
                    <button
                      type="button"
                      onClick={() => handleEdit(selected)}
                      className="flex items-center gap-1.5 text-xs text-sentinel-blue hover:text-sentinel-blue/80 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit JSON
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="flex items-center gap-1 text-xs text-sentinel-text-secondary hover:text-sentinel-text-primary transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className="flex items-center gap-1 text-xs text-sentinel-green hover:text-sentinel-green/80 transition-colors disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                      </button>
                    </div>
                  )}
                </div>

                {saveError && (
                  <p className="text-xs text-sentinel-red">{saveError}</p>
                )}

                {editing ? (
                  <textarea
                    value={editJson}
                    onChange={(e) => setEditJson(e.target.value)}
                    className="w-full min-h-[240px] p-4 rounded-lg bg-sentinel-surface border border-sentinel-border text-sentinel-text-primary text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-sentinel-blue/30 focus:border-sentinel-blue/50"
                  />
                ) : (
                  <pre className="p-4 rounded-lg bg-sentinel-surface/50 border border-sentinel-border/30 text-xs text-sentinel-text-primary/90 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selected.rule_json, null, 2)}
                  </pre>
                )}

                <div className="flex items-center gap-6 text-xs text-sentinel-text-secondary/60 pt-2 border-t border-sentinel-border/30">
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
