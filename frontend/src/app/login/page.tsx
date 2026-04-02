"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sendLoginOtp, verifyLoginOtp } from "@/lib/api";
import { getSession, setSession } from "@/lib/session";
import { ShieldMark } from "@/components/shield-mark";
import { MaterialIcon } from "@/components/stitch/material-icon";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (getSession()) router.replace("/");
  }, [router]);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await sendLoginOtp(email.trim());
      setStep("code");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await verifyLoginOtp(email.trim(), code.trim());
      setSession({ access_token: res.access_token, expires_at: res.expires_at, user: res.user });
      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-on-surface">
      {/* ── left panel ── */}
      <main className="relative hidden flex-1 flex-col justify-between border-r border-outline-variant/10 bg-[#0a0c10] p-12 md:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(195, 244, 0, 0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(195, 244, 0, 0.05) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#111316] via-transparent to-[#5d5fef]/5" />
        <header className="relative z-10 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <ShieldMark size={38} className="text-secondary-fixed" title="Sentinel" />
            <div>
              <h1 className="font-headline text-2xl font-black leading-none tracking-tighter">SENTINEL</h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-secondary-fixed">
                v2.4.0 High-Vigilance
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-on-surface-variant">SYSTEM_STATUS:</span>
            <span className="flex items-center gap-2 border border-secondary-fixed/20 bg-secondary-fixed/10 px-2 py-0.5 font-mono text-[10px] text-secondary-fixed">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary-fixed" />
              ONLINE_ENCRYPTED
            </span>
          </div>
        </header>
        <section className="relative z-10 flex flex-col items-center">
          <div className="relative flex h-96 w-96 items-center justify-center">
            <div className="absolute inset-0 animate-[spin_20s_linear_infinite] rounded-full border border-secondary-fixed/10" />
            <div className="absolute inset-8 animate-[spin_10s_linear_infinite_reverse] rounded-full border-b-2 border-t-2 border-secondary-fixed/30" />
            <div className="relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-high">
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent" />
              <MaterialIcon name="security" className="relative z-10 text-6xl text-secondary-container/40" />
            </div>
          </div>
          <article className="mt-8 max-w-sm text-center">
            <h2 className="font-headline text-3xl font-bold tracking-tight text-on-surface">
              The Sentinel&apos;s Vigil
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
              Continuous autonomous monitoring of threat vectors and policy compliance within the digital vault.
            </p>
          </article>
        </section>
        <footer className="relative z-10 grid grid-cols-3 gap-8">
          <div className="border-l border-secondary-fixed/30 bg-surface-container-low/50 p-4 backdrop-blur-sm">
            <div className="mb-2 font-mono text-[10px] uppercase text-on-surface-variant">Neural_Traffic</div>
            <div className="font-mono text-[9px] text-secondary-fixed/60">INBOUND_ENCRYPTED_TCP</div>
          </div>
          <div className="border-l border-outline-variant/30 bg-surface-container-low/50 p-4 backdrop-blur-sm">
            <div className="mb-2 font-mono text-[10px] uppercase text-on-surface-variant">Regional_Latency</div>
            <div className="flex h-8 items-end gap-1">
              {[4, 6, 8, 5, 7, 3].map((h, i) => (
                <div key={i} className="w-1 bg-secondary-fixed/40" style={{ height: `${h * 4}px` }} />
              ))}
            </div>
          </div>
          <div className="border-l border-outline-variant/30 bg-surface-container-low/50 p-4 backdrop-blur-sm">
            <div className="mb-2 font-mono text-[10px] uppercase text-on-surface-variant">Identity_Provider</div>
            <div className="font-mono text-[9px] text-on-surface">SUPABASE_OTP_ACTIVE</div>
          </div>
        </footer>
      </main>

      {/* ── right panel ── */}
      <aside className="relative z-20 flex w-full flex-col overflow-y-auto bg-surface-container-low md:w-[40%]">
        <div className="h-1 w-full shrink-0 bg-gradient-to-r from-primary-container via-secondary-container to-primary-container" />
        <div className="flex flex-1 flex-col justify-center px-8 py-12 lg:px-16">

          <header className="mb-10 flex items-center gap-3 md:hidden">
            <ShieldMark size={32} className="text-secondary-fixed" title="Sentinel" />
            <h1 className="font-headline text-xl font-black tracking-tighter">SENTINEL</h1>
          </header>

          <div className="mb-10 border-b border-outline-variant/30 pb-4">
            <h3 className="mb-2 font-headline text-3xl font-bold tracking-tight">
              {step === "email" ? "Authorize Access" : "Enter Code"}
            </h3>
            <p className="text-sm text-on-surface-variant">
              {step === "email"
                ? "Enter your work email to receive a one-time access code."
                : `A 6-digit code was sent to ${email}.`}
            </p>
          </div>

          {step === "email" ? (
            <form className="space-y-6" onSubmit={handleSendCode}>
              <div>
                <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                  Work Email
                </label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                    <MaterialIcon name="email" className="text-lg" />
                  </div>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-4 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-0"
                    placeholder="you@company.com"
                  />
                  <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary-fixed transition-all duration-300 group-focus-within:w-full" />
                </div>
              </div>
              {error && <p className="text-center text-xs text-error">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-sm bg-secondary-container py-4 font-headline text-sm font-bold uppercase tracking-widest text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send Code"}
                <MaterialIcon name="send" className="text-lg" />
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleVerifyCode}>
              <div>
                <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                  Verification Code
                </label>
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
                    className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-4 text-center font-mono text-2xl tracking-[0.5em] text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-0"
                    placeholder="000000"
                  />
                  <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary-fixed transition-all duration-300 group-focus-within:w-full" />
                </div>
              </div>
              {error && <p className="text-center text-xs text-error">{error}</p>}
              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="flex w-full items-center justify-center gap-3 rounded-sm bg-secondary-container py-4 font-headline text-sm font-bold uppercase tracking-widest text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? "Verifying…" : "Authorize"}
                <MaterialIcon name="arrow_forward" className="text-lg" />
              </button>
              <button
                type="button"
                onClick={() => { setStep("email"); setCode(""); setError(null); }}
                className="w-full text-center font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
              >
                Use a different email
              </button>
            </form>
          )}

          <footer className="mt-12 rounded-sm border border-outline-variant/10 bg-surface-container-lowest p-4">
            <div className="flex items-start gap-3">
              <MaterialIcon name="verified_user" className="text-lg text-secondary-fixed" />
              <p className="font-mono text-[9px] leading-relaxed text-on-surface-variant">
                Passwordless login. Your first sign-in automatically creates your account and assigns your role.
              </p>
            </div>
          </footer>
        </div>
      </aside>
    </div>
  );
}
