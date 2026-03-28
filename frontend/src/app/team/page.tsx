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
import { Loader2, Trash2, UserPlus } from "lucide-react";

function statusLabel(row: EmployeeTeamMember): string {
  if (row.extension_first_seen_at) return "Extension active";
  if (row.linked_username) return "Account created · extension pending";
  if (row.invite_sent_at) return "Invite sent · awaiting signup";
  return "Directory only";
}

export default function TeamDirectoryPage() {
  const [session, setSes] = useState<StoredSession | null>(null);
  const [rows, setRows] = useState<EmployeeTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteDept, setInviteDept] = useState("General");
  const [inviteRole, setInviteRole] = useState("employee");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteDoneUrl, setInviteDoneUrl] = useState<string | null>(null);

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

  const onInvite = async () => {
    const em = inviteEmail.trim();
    if (!em || inviteBusy) return;
    setInviteBusy(true);
    setInviteDoneUrl(null);
    try {
      const res = await createEmployeeInvite({
        email: em,
        name: inviteName.trim() || undefined,
        department: inviteDept.trim() || undefined,
        role: inviteRole,
      });
      setInviteDoneUrl(res.invite_url);
      load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviteBusy(false);
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
      <header className="flex flex-col gap-4 border-b border-outline-variant/10 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-headline text-2xl font-black uppercase tracking-tighter text-white md:text-3xl">
            Team directory
          </h1>
          <p className="mt-1 max-w-xl font-mono text-xs text-on-surface-variant">
            Invite by email, assign org segments, and track onboarding. Pending invites receive an automatic reminder
            after about two days if SMTP is configured (otherwise the message is queued in system_messages).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setInviteOpen(true);
            setInviteDoneUrl(null);
            setInviteEmail("");
            setInviteName("");
            setInviteDept("General");
            setInviteRole("employee");
            setErr(null);
          }}
          className="inline-flex items-center gap-2 bg-secondary-container px-4 py-3 font-headline text-xs font-bold uppercase tracking-wider text-black hover:brightness-110"
        >
          <UserPlus className="h-4 w-4" />
          Invite employee
        </button>
      </header>

      {err ? <p className="rounded border border-error/30 bg-error/10 px-3 py-2 font-mono text-xs text-error">{err}</p> : null}

      {inviteDoneUrl ? (
        <p className="font-mono text-xs text-secondary-fixed">
          Invite link (also emailed when SMTP is set):{" "}
          <a href={inviteDoneUrl} className="break-all underline">
            {inviteDoneUrl}
          </a>
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 font-mono text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant/10 bg-surface-container-low">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-outline-variant/15 bg-surface-container-lowest">
                {["Name", "Email", "Segment", "Onboarding", "Extension", "Actions"].map((h) => (
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
                  <td className="max-w-[200px] truncate px-4 py-3 text-on-surface-variant">{r.email || "—"}</td>
                  <td className="px-4 py-3 capitalize text-outline">{r.role.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className="text-secondary-fixed">{statusLabel(r)}</span>
                    {r.linked_username ? (
                      <span className="ml-1 text-on-surface-variant">(@{r.linked_username})</span>
                    ) : null}
                    {r.invite_reminder_sent_at ? (
                      <span className="mt-0.5 block text-[10px] text-outline">Reminder sent</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.extension_first_seen_at ? (
                      <span className="text-secondary-fixed">Connected</span>
                    ) : (
                      <span className="text-outline">Not yet</span>
                    )}
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
            <p className="p-8 text-center text-on-surface-variant">No employees yet. Send an invite.</p>
          ) : null}
        </div>
      )}

      <p className="font-mono text-[10px] text-outline">
        <Link href="/" className="text-secondary-fixed hover:underline">
          ← Command Center
        </Link>
      </p>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md border-outline-variant/20 bg-surface text-on-surface">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-headline text-white">
              <MaterialIcon name="mail" className="text-secondary-fixed" />
              Invite employee
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 font-mono text-xs">
            <label className="block">
              <span className="text-[10px] uppercase text-outline">Work email</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1 w-full rounded border border-outline-variant/25 bg-surface-container-high px-3 py-2 text-white"
                placeholder="jane@company.com"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase text-outline">Display name (optional)</span>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="mt-1 w-full rounded border border-outline-variant/25 bg-surface-container-high px-3 py-2 text-white"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase text-outline">Department</span>
              <input
                value={inviteDept}
                onChange={(e) => setInviteDept(e.target.value)}
                className="mt-1 w-full rounded border border-outline-variant/25 bg-surface-container-high px-3 py-2 text-white"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase text-outline">Org segment</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="mt-1 w-full rounded border border-outline-variant/25 bg-surface-container-high px-3 py-2 text-white"
              >
                {ORG_CHART_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-surface">
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {inviteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <button
              type="button"
              disabled={inviteBusy || !inviteEmail.trim()}
              onClick={() => void onInvite()}
              className="w-full bg-secondary-container py-3 font-headline text-xs font-bold uppercase text-black disabled:opacity-40"
            >
              Send invite
            </button>
          </div>
        </DialogContent>
      </Dialog>

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
