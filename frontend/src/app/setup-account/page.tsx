"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchInviteInfo, sendVerificationCode, setupAccount } from "@/lib/api";
import { setSession } from "@/lib/session";
import { ShieldMark } from "@/components/shield-mark";
import { MaterialIcon } from "@/components/stitch/material-icon";

type Step = "verify" | "password";

function SetupAccountForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [step, setStep] = useState<Step>("verify");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalidLink(true);
      setLoading(false);
      return;
    }
    fetchInviteInfo(token)
      .then((info) => {
        setEmail(info.email);
        setName(info.name);
        setOrgName(info.org_name);
        setLoading(false);
      })
      .catch(() => {
        setInvalidLink(true);
        setLoading(false);
      });
  }, [token]);

  const handleSendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendVerificationCode(email);
      setCodeSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyAndContinue = () => {
    if (code.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError(null);
    setStep("password");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      const res = await setupAccount(token, password, code);
      setSession({
        access_token: res.access_token,
        expires_at: res.expires_at,
        user: res.user,
      });
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-mono text-on-surface-variant">
        Loading...
      </div>
    );
  }

  if (invalidLink) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <div className="mb-8 flex items-center gap-3">
          <ShieldMark size={40} className="text-secondary-fixed" title="Sentinel" />
          <div>
            <h1 className="font-headline text-xl font-black tracking-tight text-white">Sentinel</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest text-outline">Account Setup</p>
          </div>
        </div>
        <div className="w-full max-w-md border border-outline-variant/15 bg-surface-container-low p-8 text-center">
          <MaterialIcon name="link_off" className="mx-auto mb-4 text-4xl text-error" />
          <h2 className="mb-2 font-headline text-lg font-bold text-on-surface">Invalid or Expired Link</h2>
          <p className="text-sm text-on-surface-variant">
            This invite link is no longer valid. Contact your manager for a new invite.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <ShieldMark size={40} className="text-secondary-fixed" title="Sentinel" />
        <div>
          <h1 className="font-headline text-xl font-black tracking-tight text-white">Sentinel</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-outline">Account Setup</p>
        </div>
      </div>

      <div className="w-full max-w-md border border-outline-variant/15 bg-surface-container-low p-8">
        <div className="mb-6">
          <h2 className="mb-1 font-headline text-2xl font-bold tracking-tight text-on-surface">
            Welcome, {name}
          </h2>
          <p className="font-mono text-xs text-on-surface-variant">
            {orgName
              ? `Verify your email and set a password to join ${orgName} on Sentinel.`
              : "Verify your email and set a password to activate your Sentinel account."}
          </p>
        </div>

        {step === "verify" && (
          <div className="space-y-5">
            {/* Email (read-only) */}
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Email
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant">
                  <MaterialIcon name="email" className="text-lg" />
                </div>
                <input
                  type="email"
                  readOnly
                  value={email}
                  className="w-full cursor-not-allowed border border-outline-variant/25 bg-surface-container-highest/50 py-3 pl-12 pr-4 font-mono text-sm text-on-surface/70 focus:outline-none"
                />
              </div>
            </div>

            {!codeSent ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSendCode()}
                className="flex w-full items-center justify-center gap-3 bg-secondary-container py-3 font-headline text-xs font-bold uppercase text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
              >
                {busy ? "Sending..." : "Send Verification Code"}
                <MaterialIcon name="send" className="text-lg" />
              </button>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                    Verification Code
                  </label>
                  <p className="mb-2 font-mono text-[10px] text-on-surface-variant">
                    A 6-digit code was sent to {email}
                  </p>
                  <div className="group relative">
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
                      className="w-full border border-outline-variant/25 bg-surface-container-high py-3 pl-12 pr-4 text-center font-mono text-2xl tracking-[0.5em] text-white placeholder:text-on-surface-variant/30 focus:outline-none"
                      placeholder="000000"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={code.length < 6}
                  onClick={handleVerifyAndContinue}
                  className="flex w-full items-center justify-center gap-3 bg-secondary-container py-3 font-headline text-xs font-bold uppercase text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                >
                  Continue
                  <MaterialIcon name="arrow_forward" className="text-lg" />
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSendCode()}
                  className="w-full text-center font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
                >
                  {busy ? "Sending..." : "Resend code"}
                </button>
              </>
            )}

            {error && <p className="text-center text-xs text-error">{error}</p>}
          </div>
        )}

        {step === "password" && (
          <form className="space-y-5" onSubmit={handleSubmit}>
            {/* Email (read-only) */}
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Email
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant">
                  <MaterialIcon name="email" className="text-lg" />
                </div>
                <input
                  type="email"
                  readOnly
                  value={email}
                  className="w-full cursor-not-allowed border border-outline-variant/25 bg-surface-container-highest/50 py-3 pl-12 pr-4 font-mono text-sm text-on-surface/70 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Create Password
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                  <MaterialIcon name="lock" className="text-lg" />
                </div>
                <input
                  type="password"
                  required
                  autoFocus
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-outline-variant/25 bg-surface-container-high py-3 pl-12 pr-4 font-mono text-sm text-white placeholder:text-on-surface-variant/30 focus:outline-none"
                  placeholder="Minimum 8 characters"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Confirm Password
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                  <MaterialIcon name="lock" className="text-lg" />
                </div>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-outline-variant/25 bg-surface-container-high py-3 pl-12 pr-4 font-mono text-sm text-white placeholder:text-on-surface-variant/30 focus:outline-none"
                  placeholder="Re-enter your password"
                />
              </div>
            </div>

            {error && <p className="text-center text-xs text-error">{error}</p>}

            <button
              type="submit"
              disabled={busy || password.length < 8 || confirmPassword.length < 8}
              className="flex w-full items-center justify-center gap-3 bg-secondary-container py-3 font-headline text-xs font-bold uppercase text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
            >
              {busy ? "Creating Account..." : "Create Account & Sign In"}
              <MaterialIcon name="check" className="text-lg" />
            </button>
          </form>
        )}

        <p className="mt-6 text-center font-mono text-[9px] text-on-surface-variant">
          Your password is securely stored (bcrypt hashed). You&apos;ll use it for future sign-ins.
        </p>
      </div>
    </div>
  );
}

export default function SetupAccountPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background font-mono text-on-surface-variant">
          Loading...
        </div>
      }
    >
      <SetupAccountForm />
    </Suspense>
  );
}
