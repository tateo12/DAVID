"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithSupabase, signUpWithSupabase } from "@/lib/api";
import { getSession, setSession } from "@/lib/session";
import { ShieldMark } from "@/components/shield-mark";
import { MaterialIcon } from "@/components/stitch/material-icon";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (getSession()) {
      router.replace("/");
    }
  }, [router]);

  const [view, setView] = useState<"login" | "register">("login");
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [regConfirm, setRegConfirm] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    signInWithSupabase(email.trim(), password)
      .then((res) => {
        setSession({ access_token: res.access_token, expires_at: res.expires_at, user: res.user });
        router.push("/");
        router.refresh();
      })
      .catch((err: unknown) => {
        setAuthError(err instanceof Error ? err.message : "Invalid email or password.");
      })
      .finally(() => setAuthLoading(false));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const result = await signUpWithSupabase(email.trim(), password);
      if (result.needsConfirmation) {
        setRegConfirm(true);
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-on-surface">
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
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-on-surface-variant">SYSTEM_STATUS:</span>
              <span className="flex items-center gap-2 border border-secondary-fixed/20 bg-secondary-fixed/10 px-2 py-0.5 font-mono text-[10px] text-secondary-fixed">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary-fixed" />
                ONLINE_ENCRYPTED
              </span>
            </div>
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
            <div className="space-y-1 font-mono text-[9px] text-secondary-fixed/60">INBOUND_ENCRYPTED_TCP</div>
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
            <div className="font-mono text-[9px] text-on-surface">SUPABASE_AUTH_ACTIVE</div>
          </div>
        </footer>
      </main>

      <aside className="relative z-20 flex w-full flex-col overflow-y-auto bg-surface-container-low md:w-[40%]">
        <div className="h-1 w-full shrink-0 bg-gradient-to-r from-primary-container via-secondary-container to-primary-container" />
        <div className="flex flex-1 flex-col justify-center px-8 py-12 lg:px-16">
          <header className="mb-10 flex items-center gap-3 md:hidden">
            <ShieldMark size={32} className="text-secondary-fixed" title="Sentinel" />
            <h1 className="font-headline text-xl font-black tracking-tighter">SENTINEL</h1>
          </header>

          <div className="mb-10 flex justify-between items-end border-b border-outline-variant/30 pb-4">
            <section>
              <h3 className="mb-2 font-headline text-3xl font-bold tracking-tight">
                {view === "login" ? "Authorize Access" : "Create Account"}
              </h3>
              <p className="text-sm text-on-surface-variant">
                {view === "login" ? "Deployment v2.4.0 requires valid credentials." : "Register your Sentinel account."}
              </p>
            </section>

            <button
              onClick={() => {
                setView(view === "login" ? "register" : "login");
                setAuthError(null);
                setRegConfirm(false);
              }}
              className="text-xs text-secondary-fixed hover:underline"
            >
              {view === "login" ? "Need an account?" : "Back to login"}
            </button>
          </div>

          {view === "login" ? (
            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Email</label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                    <MaterialIcon name="email" className="text-lg" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-4 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-0"
                    placeholder="you@company.com"
                  />
                  <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary-fixed transition-all duration-300 group-focus-within:w-full" />
                </div>
              </div>
              <div>
                <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Password</label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                    <MaterialIcon name="lock" className="text-lg" />
                  </div>
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-12 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-0"
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-outline-variant hover:text-on-surface"
                    onClick={() => setShowPw((s) => !s)}
                  >
                    <MaterialIcon name={showPw ? "visibility_off" : "visibility"} className="text-lg" />
                  </button>
                  <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary-fixed transition-all duration-300 group-focus-within:w-full" />
                </div>
              </div>
              {authError && <p className="text-center text-xs text-error">{authError}</p>}
              <button
                type="submit"
                disabled={authLoading}
                className="flex w-full items-center justify-center gap-3 rounded-sm bg-secondary-container py-4 font-headline text-sm font-bold uppercase tracking-widest text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {authLoading ? "Signing in…" : "Deploy Authorization"}
                <MaterialIcon name="arrow_forward" className="text-lg" />
              </button>
            </form>
          ) : regConfirm ? (
            <div className="space-y-4 text-center">
              <MaterialIcon name="mark_email_read" className="text-5xl text-secondary-fixed" />
              <p className="font-headline text-lg font-bold">Check your email</p>
              <p className="text-sm text-on-surface-variant">
                We sent a confirmation link to <span className="text-on-surface">{email}</span>.
                Click it to activate your account, then sign in.
              </p>
              <button
                onClick={() => { setView("login"); setRegConfirm(false); }}
                className="text-xs text-secondary-fixed hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleRegister}>
              <div>
                <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Work Email</label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                    <MaterialIcon name="email" className="text-lg" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-4 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-0"
                    placeholder="you@company.com"
                  />
                  <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary-fixed transition-all duration-300 group-focus-within:w-full" />
                </div>
              </div>
              <div>
                <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Password</label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                    <MaterialIcon name="vpn_key" className="text-lg" />
                  </div>
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-12 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-0"
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-outline-variant hover:text-on-surface"
                    onClick={() => setShowPw((s) => !s)}
                  >
                    <MaterialIcon name={showPw ? "visibility_off" : "visibility"} className="text-lg" />
                  </button>
                  <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary-fixed transition-all duration-300 group-focus-within:w-full" />
                </div>
              </div>
              {authError && <p className="text-center text-xs text-error">{authError}</p>}
              <button
                type="submit"
                disabled={authLoading}
                className="flex w-full items-center justify-center gap-3 rounded-sm bg-secondary-container py-4 font-headline text-sm font-bold uppercase tracking-widest text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {authLoading ? "Creating account…" : "Create Account"}
                <MaterialIcon name="arrow_forward" className="text-lg" />
              </button>
            </form>
          )}

          <footer className="mt-12 rounded-sm border border-outline-variant/10 bg-surface-container-lowest p-4">
            <div className="flex items-start gap-3">
              <MaterialIcon name="verified_user" className="text-lg text-secondary-fixed" />
              <div>
                <div className="mb-1 font-mono text-[10px] leading-tight text-on-surface">ACCESS LAWS</div>
                <p className="font-mono text-[9px] leading-relaxed text-on-surface-variant">
                  Authentication is secured via Supabase Auth. Your first account is auto-assigned the Manager role.
                </p>
              </div>
            </div>
          </footer>
        </div>
      </aside>
    </div>
  );
}
