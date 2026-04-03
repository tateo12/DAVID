"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  createEmployeeInvite,
  deleteEmployee,
  fetchTeamDirectory,
  patchEmployee,
} from "@/lib/api";
import { ORG_CHART_ROLE_OPTIONS } from "@/lib/org-chart-roles";
import { getSession, isTeamManager, type StoredSession } from "@/lib/session";
import type { EmployeeTeamMember } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MaterialIcon } from "@/components/stitch/material-icon";
import { Loader2, Trash2 } from "lucide-react";

function statusLabel(row: EmployeeTeamMember): string {
  if (row.extension_first_seen_at) return "Extension active";
  if (row.linked_username) return "Account created";
  if (row.invite_sent_at) return "Invite sent";
  return "Directory only";
}

export default function TeamDirectoryPage() {
  const [session, setSes] = useState<StoredSession | null>(null);
  const [rows, setRows] = useState<EmployeeTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Inline add
  const [addEmail, setAddEmail] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Edit dialog
  const [editRow, setEditRow] = useState<EmployeeTeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetchTeamDirectory()
      .then(setRows)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load team"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSes(getSession());
    const onAuth = () => setSes(getSession());
    window.addEventListener("sentinel-auth", onAuth);
    return () => window.removeEventListener("sentinel-auth", onAuth);
  }, []);

  useEffect(() => {
    if (!session || !isTeamManager(session.user.role)) {
      setLoading(false);
      return;
    }
    load();
  }, [session, load]);

  const onAdd = async () => {
    const em = addEmail.trim();
    if (!em || addBusy) return;
    setAddBusy(true);
    setAddSuccess(null);
    setErr(null);
    try {
      await createEmployeeInvite({ email: em });
      setAddEmail("");
      setAddSuccess(`Invite sent to ${em}`);
      load();
      setTimeout(() => setAddSuccess(null), 4000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to add employee");
    } finally {
      setAddBusy(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editRow || editBusy) return;
    setEditBusy(true);
    try {
      await patchEmployee(editRow.id, {
        name: editName.trim() || undefined,
        department: editDept.trim() || undefined,
        role: editRole || undefined,
      });
      setEditRow(null);
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEditBusy(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm("Delete this employee and all related activity? This cannot be undone.")) return;
    try {
      await deleteEmployee(id);
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-8 text-center">
          <p className="font-mono text-sm leading-relaxed text-on-surface-variant">
            Sign in as a manager to open the team directory.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded border border-secondary-container/40 bg-secondary-container/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-secondary-fixed hover:bg-secondary-container/20"
          >
            Command login
          </Link>
        </div>
      </div>
    );
  }

  if (!isTeamManager(session.user.role)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-8 text-center">
          <p className="font-mono text-sm leading-relaxed text-on-surface-variant">
            Your role does not include team administration.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded border border-outline-variant/25 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white hover:border-secondary-container/40 hover:text-secondary-fixed"
          >
            Back to Command Center
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-10 pt-4 md:px-6">
      <header className="border-b border-outline-variant/10 pb-6">
        <h1 className="font-headline text-2xl font-black uppercase tracking-tighter text-white md:text-3xl">
          Team directory
        </h1>
        <p className="mt-1 max-w-xl font-mono text-xs text-on-surface-variant">
          Add employees by email. They&apos;ll receive an invite to set up their account.
        </p>
      </header>

      {/* Inline add employee */}
      <div className="flex items-center gap-3">
        <div className="group relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
            <MaterialIcon name="email" className="text-lg" />
          </div>
          <input
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onAdd(); } }}
            className="w-full rounded border border-outline-variant/25 bg-surface-container-high py-3 pl-12 pr-4 font-mono text-sm text-white placeholder:text-on-surface-variant/30 focus:outline-none"
            placeholder="employee@company.com"
          />
        </div>
        <button
          type="button"
          disabled={addBusy || !addEmail.trim() || !addEmail.includes("@")}
          onClick={() => void onAdd()}
          className="inline-flex items-center gap-2 bg-secondary-container px-6 py-3 font-headline text-xs font-bold uppercase tracking-wider text-black hover:brightness-110 disabled:opacity-40"
        >
          {addBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MaterialIcon name="person_add" className="text-lg" />}
          Add
        </button>
      </div>

      {addSuccess && (
        <p className="font-mono text-xs text-secondary-fixed">{addSuccess}</p>
      )}
      {err && (
        <p className="rounded border border-error/30 bg-error/10 px-3 py-2 font-mono text-xs text-error">{err}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 font-mono text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant/10 bg-surface-container-low">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-outline-variant/15 bg-surface-container-lowest">
                {["Name", "Email", "Segment", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] uppercase tracking-widest text-outline">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-on-surface">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-container-highest/50">
                  <td className="px-4 py-3 text-white">{r.name}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-on-surface-variant">{r.email || "\u2014"}</td>
                  <td className="px-4 py-3 capitalize text-outline">{r.role.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className="text-secondary-fixed">{statusLabel(r)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditRow(r);
                          setEditName(r.name);
                          setEditDept(r.department);
                          setEditRole(r.role);
                          setErr(null);
                        }}
                        className="rounded border border-outline-variant/25 px-2 py-1 text-[10px] uppercase text-white hover:border-secondary-container/40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(r.id)}
                        className="inline-flex items-center gap-1 rounded border border-error/30 px-2 py-1 text-[10px] uppercase text-error hover:bg-error/10"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="p-8 text-center text-on-surface-variant">No employees yet. Add one above.</p>
          ) : null}
        </div>
      )}

      <p className="font-mono text-[10px] text-outline">
        <Link href="/" className="text-secondary-fixed hover:underline">
          &larr; Command Center
        </Link>
      </p>

      {/* Edit dialog */}
      <Dialog open={editRow != null} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent className="max-w-md border-outline-variant/20 bg-surface text-on-surface">
          <DialogHeader>
            <DialogTitle className="font-headline text-white">Edit employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 font-mono text-xs">
            <label className="block">
              <span className="text-[10px] uppercase text-outline">Name</span>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full rounded border border-outline-variant/25 bg-surface-container-high px-3 py-2 text-white"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase text-outline">Department</span>
              <input
                value={editDept}
                onChange={(e) => setEditDept(e.target.value)}
                className="mt-1 w-full rounded border border-outline-variant/25 bg-surface-container-high px-3 py-2 text-white"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase text-outline">Org segment</span>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="mt-1 w-full rounded border border-outline-variant/25 bg-surface-container-high px-3 py-2 text-white"
              >
                {ORG_CHART_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-surface">
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={editBusy}
              onClick={() => void onSaveEdit()}
              className="w-full bg-secondary-container py-3 font-headline text-xs font-bold uppercase text-black"
            >
              Save
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
