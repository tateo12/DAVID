"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { registerInvite } from "@/lib/api";
import { setSession } from "@/lib/session";
import { ShieldMark } from "@/components/shield-mark";

function RegisterInviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await registerInvite({
        token,
        username: username.trim(),
        password,
        display_name: displayName.trim() || undefined,
      });
      setSession({
        access_token: res.access_token,
        user: res.user,
      });
      router.push("/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <ShieldMark size={40} className="text-secondary-fixed" title="Sentinel" />
        <div>
          <h1 className="font-headline text-xl font-black tracking-tight text-white">Sentinel</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-outline">Employee activation</p>
        </div>
      </div>
      <div className="w-full max-w-md border border-outline-variant/15 bg-surface-container-low p-8">
        {!token ? (
          <p className="font-mono text-sm text-error">Missing invite token. Open the link from your email.</p>
        ) : (
          <>
            <p className="mb-6 font-mono text-xs text-on-surface-variant">
              Create your dashboard login. Use the same credentials in the Sentinel browser extension.
            </p>
            <div className="space-y-4 font-mono text-sm">
              <label className="block">
                <span className="text-[10px] uppercase text-outline">Username</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 w-full border border-outline-variant/25 bg-surface-container-high px-3 py-2 text-white"
                  placeholder="Often your work email"
                  autoComplete="username"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase text-outline">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full border border-outline-variant/25 bg-surface-container-high px-3 py-2 text-white"
                  autoComplete="new-password"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase text-outline">Display name (optional)</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full border border-outline-variant/25 bg-surface-container-high px-3 py-2 text-white"
                />
              </label>
              {error ? <p className="text-xs text-error">{error}</p> : null}
              <button
                type="button"
                disabled={busy || username.trim().length < 2 || password.length < 4}
                onClick={() => void submit()}
                className="w-full bg-secondary-container py-3 font-headline text-xs font-bold uppercase text-black disabled:opacity-40"
              >
                {busy ? "Creating…" : "Activate account"}
              </button>
            </div>
          </>
        )}
        <p className="mt-6 text-center font-mono text-[10px] text-on-surface-variant">
          <Link href="/login" className="text-secondary-fixed hover:underline">
            Manager login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background font-mono text-on-surface-variant">
          Loading…
        </div>
      }
    >
      <RegisterInviteForm />
    </Suspense>
  );
}
