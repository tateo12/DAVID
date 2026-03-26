"use client";

import React, { useState } from "react";
import { mockPolicies } from "@/lib/api";
import { Policy, PolicyStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollText, Calendar, Tag, Edit3, Save, X } from "lucide-react";

const statusStyles: Record<PolicyStatus, string> = {
  active: "bg-sentinel-green/15 text-sentinel-green border-sentinel-green/30",
  draft: "bg-sentinel-amber/15 text-sentinel-amber border-sentinel-amber/30",
  archived: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>(mockPolicies);
  const [selected, setSelected] = useState<Policy | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const handleEdit = (policy: Policy) => {
    setEditText(policy.full_text);
    setEditing(true);
  };

  const handleSave = () => {
    if (!selected) return;
    setPolicies((prev) =>
      prev.map((p) =>
        p.id === selected.id
          ? { ...p, full_text: editText, last_updated: new Date().toISOString() }
          : p
      )
    );
    setSelected({ ...selected, full_text: editText, last_updated: new Date().toISOString() });
    setEditing(false);
  };

  const activePolicies = policies.filter((p) => p.status === "active");
  const draftPolicies = policies.filter((p) => p.status === "draft");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-sentinel-text-primary">AI Usage Policies</h1>
        <p className="text-sm text-sentinel-text-secondary mt-1">
          Manage and enforce organizational AI governance rules
        </p>
      </div>

      {/* Summary */}
      <div className="flex gap-3">
        <div className="glass-card px-4 py-2.5 rounded-lg flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sentinel-green" />
          <span className="text-sm text-sentinel-text-primary font-medium">{activePolicies.length} Active</span>
        </div>
        <div className="glass-card px-4 py-2.5 rounded-lg flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sentinel-amber" />
          <span className="text-sm text-sentinel-text-primary font-medium">{draftPolicies.length} Draft</span>
        </div>
        <div className="glass-card px-4 py-2.5 rounded-lg flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-sm text-sentinel-text-primary font-medium">
            {policies.length - activePolicies.length - draftPolicies.length} Archived
          </span>
        </div>
      </div>

      {/* Policy Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {policies.map((policy) => (
          <div
            key={policy.id}
            className="glass-card p-5 rounded-xl cursor-pointer group"
            onClick={() => {
              setSelected(policy);
              setEditing(false);
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg bg-sentinel-blue/10">
                <ScrollText className="w-4 h-4 text-sentinel-blue" />
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] uppercase tracking-wider font-semibold ${statusStyles[policy.status]}`}
              >
                {policy.status}
              </Badge>
            </div>

            <h3 className="text-sm font-semibold text-sentinel-text-primary mb-2 group-hover:text-sentinel-blue transition-colors duration-200">
              {policy.name}
            </h3>
            <p className="text-xs text-sentinel-text-secondary line-clamp-2 mb-4">
              {policy.description}
            </p>

            <div className="flex items-center justify-between text-[10px] text-sentinel-text-secondary/60">
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {policy.category}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(policy.last_updated)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Policy Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="bg-sentinel-bg border-sentinel-border max-w-2xl max-h-[80vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <div className="flex items-center gap-3">
                    <DialogTitle className="text-sentinel-text-primary text-lg">
                      {selected.name}
                    </DialogTitle>
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase tracking-wider font-semibold ${statusStyles[selected.status]}`}
                    >
                      {selected.status}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-sentinel-text-secondary mt-1">{selected.description}</p>
              </DialogHeader>

              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-sentinel-text-primary">Policy Text</h4>
                  {!editing ? (
                    <button
                      onClick={() => handleEdit(selected)}
                      className="flex items-center gap-1.5 text-xs text-sentinel-blue hover:text-sentinel-blue/80 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(false)}
                        className="flex items-center gap-1 text-xs text-sentinel-text-secondary hover:text-sentinel-text-primary transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        className="flex items-center gap-1 text-xs text-sentinel-green hover:text-sentinel-green/80 transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save
                      </button>
                    </div>
                  )}
                </div>

                {editing ? (
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full h-48 p-4 rounded-lg bg-sentinel-surface border border-sentinel-border text-sentinel-text-primary text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sentinel-blue/30 focus:border-sentinel-blue/50 transition-all duration-200"
                  />
                ) : (
                  <div className="p-4 rounded-lg bg-sentinel-surface/50 border border-sentinel-border/30 text-sm text-sentinel-text-primary/90 leading-relaxed">
                    {selected.full_text}
                  </div>
                )}

                <div className="flex items-center gap-6 text-xs text-sentinel-text-secondary/60 pt-2 border-t border-sentinel-border/30">
                  <span>Category: {selected.category}</span>
                  <span>Created: {formatDate(selected.created_at)}</span>
                  <span>Updated: {formatDate(selected.last_updated)}</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
