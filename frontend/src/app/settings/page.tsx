"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, setSession, clearSession, type AuthUser } from "@/lib/session";
import { updateProfile } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type FormStatus = { type: "idle" } | { type: "loading" } | { type: "success"; message: string } | { type: "error"; message: string };

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileStatus, setProfileStatus] = useState<FormStatus>({ type: "idle" });
  const [passwordStatus, setPasswordStatus] = useState<FormStatus>({ type: "idle" });

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.push("/login");
      return;
    }
    setUser(s.user);
    setUsername(s.user.username);
  }, [router]);

  const handleProfileSave = useCallback(async () => {
    if (!user) return;
    const trimmed = username.trim();
    if (!trimmed) {
      setProfileStatus({ type: "error", message: "Username cannot be empty" });
      return;
    }
    if (trimmed === user.username) {
      setProfileStatus({ type: "error", message: "No changes to save" });
      return;
    }
    setProfileStatus({ type: "loading" });
    try {
      const updated = await updateProfile({ username: trimmed });
      // Update session with new username
      const s = getSession();
      if (s) {
        setSession({ ...s, user: updated });
      }
      setUser(updated);
      setProfileStatus({ type: "success", message: "Profile updated" });
    } catch (e) {
      setProfileStatus({ type: "error", message: e instanceof Error ? e.message : "Update failed" });
    }
  }, [user, username]);

  const handlePasswordChange = useCallback(async () => {
    if (newPassword.length < 8) {
      setPasswordStatus({ type: "error", message: "Password must be at least 8 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", message: "Passwords do not match" });
      return;
    }
    setPasswordStatus({ type: "loading" });
    try {
      await updateProfile({ new_password: newPassword });
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus({ type: "success", message: "Password changed successfully" });
    } catch (e) {
      setPasswordStatus({ type: "error", message: e instanceof Error ? e.message : "Password change failed" });
    }
  }, [newPassword, confirmPassword]);

  const handleSignOut = useCallback(() => {
    supabase.auth.signOut().finally(() => {
      clearSession();
      router.push("/login");
    });
  }, [router]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-black tracking-tighter text-white">Account Settings</h1>
        <p className="mt-1 font-mono text-xs text-on-surface-variant">
          Manage your profile, password, and organization details.
        </p>
      </div>

      {/* Profile Section */}
      <section className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-6">
        <h2 className="mb-4 font-label text-[10px] uppercase tracking-widest text-outline">Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block font-mono text-xs text-on-surface-variant">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setProfileStatus({ type: "idle" });
              }}
              className="w-full rounded border border-outline-variant/20 bg-surface-container-highest px-3 py-2.5 font-mono text-sm text-white placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary-fixed"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-xs text-on-surface-variant">Role</label>
            <div className="rounded border border-outline-variant/10 bg-surface-container-high px-3 py-2.5 font-mono text-sm text-on-surface-variant">
              {user.role}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-xs text-on-surface-variant">User ID</label>
            <div className="rounded border border-outline-variant/10 bg-surface-container-high px-3 py-2.5 font-mono text-sm text-on-surface-variant">
              {user.id}
            </div>
          </div>
          {profileStatus.type === "success" && (
            <p className="font-mono text-xs text-secondary-fixed">{profileStatus.message}</p>
          )}
          {profileStatus.type === "error" && (
            <p className="font-mono text-xs text-error">{profileStatus.message}</p>
          )}
          <button
            type="button"
            onClick={handleProfileSave}
            disabled={profileStatus.type === "loading"}
            className="bg-secondary-container px-5 py-2.5 font-headline text-xs font-bold uppercase tracking-wide text-black transition-all hover:brightness-110 disabled:opacity-50"
          >
            {profileStatus.type === "loading" ? "Saving..." : "Save changes"}
          </button>
        </div>
      </section>

      {/* Organization Section */}
      <section className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-6">
        <h2 className="mb-4 font-label text-[10px] uppercase tracking-widest text-outline">Organization</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block font-mono text-xs text-on-surface-variant">Organization name</label>
            <div className="rounded border border-outline-variant/10 bg-surface-container-high px-3 py-2.5 font-mono text-sm text-on-surface-variant">
              {user.org_name || "No organization"}
            </div>
          </div>
          {user.org_id && (
            <div>
              <label className="mb-1.5 block font-mono text-xs text-on-surface-variant">Org ID</label>
              <div className="rounded border border-outline-variant/10 bg-surface-container-high px-3 py-2.5 font-mono text-sm text-on-surface-variant">
                {user.org_id}
              </div>
            </div>
          )}
          {user.employee_id && (
            <div>
              <label className="mb-1.5 block font-mono text-xs text-on-surface-variant">Employee ID</label>
              <div className="rounded border border-outline-variant/10 bg-surface-container-high px-3 py-2.5 font-mono text-sm text-on-surface-variant">
                {user.employee_id}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Change Password Section */}
      <section className="rounded-lg border border-outline-variant/15 bg-surface-container-lowest p-6">
        <h2 className="mb-4 font-label text-[10px] uppercase tracking-widest text-outline">Change password</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block font-mono text-xs text-on-surface-variant">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordStatus({ type: "idle" });
              }}
              placeholder="Min 8 characters"
              className="w-full rounded border border-outline-variant/20 bg-surface-container-highest px-3 py-2.5 font-mono text-sm text-white placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary-fixed"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-xs text-on-surface-variant">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordStatus({ type: "idle" });
              }}
              placeholder="Re-enter new password"
              className="w-full rounded border border-outline-variant/20 bg-surface-container-highest px-3 py-2.5 font-mono text-sm text-white placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary-fixed"
            />
          </div>
          {passwordStatus.type === "success" && (
            <p className="font-mono text-xs text-secondary-fixed">{passwordStatus.message}</p>
          )}
          {passwordStatus.type === "error" && (
            <p className="font-mono text-xs text-error">{passwordStatus.message}</p>
          )}
          <button
            type="button"
            onClick={handlePasswordChange}
            disabled={passwordStatus.type === "loading" || !newPassword || !confirmPassword}
            className="bg-secondary-container px-5 py-2.5 font-headline text-xs font-bold uppercase tracking-wide text-black transition-all hover:brightness-110 disabled:opacity-50"
          >
            {passwordStatus.type === "loading" ? "Changing..." : "Change password"}
          </button>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-lg border border-error/20 bg-surface-container-lowest p-6">
        <h2 className="mb-4 font-label text-[10px] uppercase tracking-widest text-error/70">Session</h2>
        <p className="mb-4 font-mono text-xs text-on-surface-variant">
          Sign out of your current session on this device.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded border border-error/30 bg-error/10 px-5 py-2.5 font-headline text-xs font-bold uppercase tracking-wide text-error transition-all hover:bg-error/20"
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
