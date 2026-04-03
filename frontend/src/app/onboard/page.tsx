"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchOnboardInfo, onboardCompany, sendVerificationCode } from "@/lib/api";
import { setSession } from "@/lib/session";
import { ShieldMark } from "@/components/shield-mark";
import { MaterialIcon } from "@/components/stitch/material-icon";

type Step = "info" | "verify" | "password";

function OnboardForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [step, setStep] = useState<Step>("info");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
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
    fetchOnboardInfo(token)
      .then((info) => {
        if (info.company_hint) setCompanyName(info.company_hint);
        setLoading(false);
      })
      .catch(() => {
        setInvalidLink(true);
        setLoading(false);
      });
  }, [token]);

  const handleInfoContinue = () => {
    setError(null);
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Valid work email is required.");
      return;
    }
    setStep("verify");
  };

  const handleSendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendVerificationCode(email.trim());
      setCodeSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyContinue = () => {
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
      const res = await onboardCompany(token, companyName.trim(), email.trim(), password, code);
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
            <p className="font-mono text-[10px] uppercase tracking-widest text-outline">Company Onboarding</p>
          </div>
        </div>
        <div className="w-full max-w-md border border-outline-variant/15 bg-surface-container-low p-8 text-center">
          <MaterialIcon name="link_off" className="mx-auto mb-4 text-4xl text-error" />
          <h2 className="mb-2 font-headline text-lg font-bold text-on-surface">Invalid or Expired Link</h2>
          <p className="text-sm text-on-surface-variant">
            This onboarding link is no longer valid. Contact the Sentinel team for a new one.
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
          <p className="font-mono text-[10px] uppercase tracking-widest text-outline">Company Onboarding</p>
        </div>
      </div>

      <div className="w-full max-w-md border border-outline-variant/15 bg-surface-container-low p-8">
        <div className="mb-6">
          <h2 className="mb-1 font-headline text-2xl font-bold tracking-tight text-on-surface">
            Set Up Your Company
          </h2>
          <p className="font-mono text-xs text-on-surface-variant">
            {step === "info" && "Enter your company information and work email."}
            {step === "verify" && "Verify your email address."}
            {step === "password" && "Create your password to finish."}
          </p>
          {/* Step indicator */}
          <div className="mt-3 flex items-center gap-2">
            {(["info", "verify", "password"] as const).map((s, i) => (
              <React.Fragment key={s}>
                <div className={`h-1.5 flex-1 rounded-full ${
                  (["info", "verify", "password"].indexOf(step) >= i) ? "bg-secondary-fixed" : "bg-outline-variant/20"
                }`} />
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step 1: Company info + email */}
        {step === "info" && (
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Company Name
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                  <MaterialIcon name="business" className="text-lg" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full border border-outline-variant/25 bg-surface-container-high py-3 pl-12 pr-4 font-mono text-sm text-white placeholder:text-on-surface-variant/30 focus:outline-none"
                  placeholder="Acme Corp"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
                Your Work Email
              </label>
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                  <MaterialIcon name="email" className="text-lg" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-outline-variant/25 bg-surface-container-high py-3 pl-12 pr-4 font-mono text-sm text-white placeholder:text-on-surface-variant/30 focus:outline-none"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            {error && <p className="text-center text-xs text-error">{error}</p>}

            <button
              type="button"
              disabled={!companyName.trim() || !email.trim() || !email.includes("@")}
              onClick={handleInfoContinue}
              className="flex w-full items-center justify-center gap-3 bg-secondary-container py-3 font-headline text-xs font-bold uppercase text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
            >
              Continue
              <MaterialIcon name="arrow_forward" className="text-lg" />
            </button>
          </div>
        )}

        {/* Step 2: Verify email */}
        {step === "verify" && (
          <div className="space-y-5">
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
                  onClick={handleVerifyContinue}
                  className="flex w-full items-center justify-center gap-3 bg-secondary-container py-3 font-headline text-xs font-bold uppercase text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                >
                  Verify & Continue
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

            <button
              type="button"
              onClick={() => { setStep("info"); setError(null); }}
              className="w-full text-center font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
            >
              Back
            </button>

            {error && <p className="text-center text-xs text-error">{error}</p>}
          </div>
        )}

        {/* Step 3: Set password */}
        {step === "password" && (
          <form className="space-y-5" onSubmit={handleSubmit}>
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
              {busy ? "Creating Company..." : "Create Company & Sign In"}
              <MaterialIcon name="rocket_launch" className="text-lg" />
            </button>
          </form>
        )}

        <p className="mt-6 text-center font-mono text-[9px] text-on-surface-variant">
          You&apos;ll be signed in as manager. You can then invite your team from the dashboard.
        </p>
      </div>
    </div>
  );
}

export default function OnboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background font-mono text-on-surface-variant">
          Loading...
        </div>
      }
    >
      <OnboardForm />
    </Suspense>
  );
}
