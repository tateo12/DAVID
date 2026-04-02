"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { sendLoginOtp, verifyLoginOtp } from "@/lib/api";
import { setSession } from "@/lib/session";
import { ShieldMark } from "@/components/shield-mark";
import { MaterialIcon } from "@/components/stitch/material-icon";

type Step = "email" | "code";

function RegisterInviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendLoginOtp(email.trim());
      setStep("code");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send code.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await verifyLoginOtp(email.trim(), code.trim());
      setSession({ access_token: res.access_token, expires_at: res.expires_at, user: res.user });
      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid or expired code.");
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
        {step === "email" ? (
          <>
            <p className="mb-6 font-mono text-xs text-on-surface-variant">
              {token ? "You have been invited to Sentinel. " : ""}
              Enter your work email to receive a one-time access code.
            </p>
            <div className="space-y-4 font-mono text-sm">
              <label className="block">
                <span className="text-[10px] uppercase text-outline">Work Email</span>
                <div className="group relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                    <MaterialIcon name="email" className="text-lg" />
                  </div>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-outline-variant/25 bg-surface-container-high py-3 pl-12 pr-4 text-white placeholder:text-on-surface-variant/30 focus:outline-none"
                    placeholder="you@company.com"
                    autoComplete="email"
                  />
                </div>
              </label>
              {error && <p className="text-xs text-error">{error}</p>}
              <button
                type="button"
                disabled={busy || email.trim().length < 5}
                onClick={() => void handleSendCode()}
                className="flex w-full items-center justify-center gap-3 bg-secondary-container py-3 font-headline text-xs font-bold uppercase text-black disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send Code"}
                <MaterialIcon name="send" className="text-lg" />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-6 font-mono text-xs text-on-surface-variant">
              A 6-digit code was sent to {email}.
            </p>
            <div className="space-y-4 font-mono text-sm">
              <label className="block">
                <span className="text-[10px] uppercase text-outline">Verification Code</span>
                <div className="group relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                    <MaterialIcon name="pin" className="text-lg" />
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full border border-outline-variant/25 bg-surface-container-high py-3 pl-12 pr-4 text-center text-2xl tracking-[0.5em] text-white placeholder:text-on-surface-variant/30 focus:outline-none"
                    placeholder="000000"
                  />
                </div>
              </label>
              {error && <p className="text-xs text-error">{error}</p>}
              <button
                type="button"
                disabled={busy || code.length < 6}
                onClick={() => void handleVerify()}
                className="flex w-full items-center justify-center gap-3 bg-secondary-container py-3 font-headline text-xs font-bold uppercase text-black disabled:opacity-40"
              >
                {busy ? "Verifying…" : "Activate Account"}
                <MaterialIcon name="arrow_forward" className="text-lg" />
              </button>
              <button
                type="button"
                onClick={() => { setStep("email"); setCode(""); setError(null); }}
                className="w-full text-center font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
              >
                Use a different email
              </button>
            </div>
          </>
        )}
        <p className="mt-6 text-center font-mono text-[10px] text-on-surface-variant">
          <Link href="/login" className="text-secondary-fixed hover:underline">
            Already have an account? Sign in
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
