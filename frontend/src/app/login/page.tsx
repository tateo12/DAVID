"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginUser, registerOtpRequest, registerOtpVerify } from "@/lib/api";
import { setSession } from "@/lib/session";
import { ShieldMark } from "@/components/shield-mark";
import { MaterialIcon } from "@/components/stitch/material-icon";

export default function LoginPage() {
  const router = useRouter();
  
  // View state
  const [view, setView] = useState<"login" | "register">("login");
  
  // Login State
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Register State
  const [regStep, setRegStep] = useState(1);
  const [regRole, setRegRole] = useState<"employee" | "manager">("employee");
  const [regEmail, setRegEmail] = useState("");
  const [regCompany, setRegCompany] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    loginUser(username.trim(), password)
      .then((res) => {
        setSession({ access_token: res.access_token, user: res.user });
        router.push("/");
        router.refresh();
      })
      .catch(() => {
        setAuthError("Invalid username or password.");
      })
      .finally(() => setAuthLoading(false));
  };

  const handleRegisterNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (regStep === 1) {
        setRegStep(2);
      } else if (regStep === 2) {
        // Send OTP Request
        await registerOtpRequest({ email: regEmail.trim(), company_name: regCompany.trim(), role: regRole });
        setRegStep(3);
      } else if (regStep === 3) {
        // Proceed to Password
        setRegStep(4);
      } else if (regStep === 4) {
        // Final Verify
        const res = await registerOtpVerify({
          email: regEmail.trim(),
          code: regCode.trim(),
          username: regUsername.trim(),
          password: regPassword,
        });
        setSession({ access_token: res.access_token, user: res.user });
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setAuthError(err.message || "An error occurred.");
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
            <div className="font-mono text-[9px] text-on-surface">AUTH_GATE_4_ACTIVE</div>
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
                {view === "login" ? "Deployment v2.4.0 requires valid credentials." : `Step ${regStep} of 4: Setup your credentials`}
              </p>
            </section>
            
            <button 
              onClick={() => {
                setView(view === "login" ? "register" : "login");
                setAuthError(null);
                setRegStep(1);
              }}
              className="text-xs text-secondary-fixed hover:underline"
            >
              {view === "login" ? "Need an account?" : "Back to login"}
            </button>
          </div>

          {view === "login" ? (
            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Username</label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                    <MaterialIcon name="person" className="text-lg" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-4 font-mono text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-0"
                    placeholder="Your Sentinel username"
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
          ) : (
            <form className="space-y-6" onSubmit={handleRegisterNext}>
              {regStep === 1 && (
                <div className="space-y-4">
                  <label className="block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Select Role</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setRegRole("employee")}
                      className={`flex flex-col items-center justify-center rounded-lg border p-6 transition-all ${
                        regRole === "employee" 
                          ? "border-secondary-fixed bg-secondary-fixed/10 text-secondary-fixed" 
                          : "border-outline-variant/30 bg-surface-container-highest text-on-surface hover:border-outline"
                      }`}
                    >
                      <MaterialIcon name="badge" className="mb-2 text-3xl" />
                      <span className="font-headline font-semibold">Employee</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegRole("manager")}
                      className={`flex flex-col items-center justify-center rounded-lg border p-6 transition-all ${
                        regRole === "manager" 
                          ? "border-secondary-fixed bg-secondary-fixed/10 text-secondary-fixed" 
                          : "border-outline-variant/30 bg-surface-container-highest text-on-surface hover:border-outline"
                      }`}
                    >
                      <MaterialIcon name="manage_accounts" className="mb-2 text-3xl" />
                      <span className="font-headline font-semibold">Manager</span>
                    </button>
                  </div>
                </div>
              )}

              {regStep === 2 && (
                <div className="space-y-6 flex-col flex">
                  <div>
                    <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Work Email</label>
                    <div className="group relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                        <MaterialIcon name="email" className="text-lg" />
                      </div>
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-4 font-mono text-sm text-on-surface focus:outline-none focus:ring-0"
                        placeholder="you@company.com"
                      />
                      <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary-fixed transition-all duration-300 group-focus-within:w-full" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Company Name</label>
                    <div className="group relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                        <MaterialIcon name="business" className="text-lg" />
                      </div>
                      <input
                        type="text"
                        required
                        value={regCompany}
                        onChange={(e) => setRegCompany(e.target.value)}
                        className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-4 font-mono text-sm text-on-surface focus:outline-none focus:ring-0"
                        placeholder="Acme Corp"
                      />
                      <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary-fixed transition-all duration-300 group-focus-within:w-full" />
                    </div>
                  </div>
                </div>
              )}

              {regStep === 3 && (
                <div>
                  <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Verification Code</label>
                  <p className="mb-4 text-xs text-on-surface-variant">We sent a 6-digit code to {regEmail}. Please enter it below.</p>
                  <div className="group relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                      <MaterialIcon name="pin" className="text-lg" />
                    </div>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={regCode}
                      onChange={(e) => setRegCode(e.target.value)}
                      className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-4 font-mono text-xl tracking-widest text-center text-on-surface focus:outline-none focus:ring-0"
                      placeholder="000000"
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary-fixed transition-all duration-300 group-focus-within:w-full" />
                  </div>
                </div>
              )}

              {regStep === 4 && (
                <div className="space-y-6 flex-col flex">
                  <div>
                    <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Choose Username</label>
                    <div className="group relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                        <MaterialIcon name="person_add" className="text-lg" />
                      </div>
                      <input
                        type="text"
                        required
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-4 font-mono text-sm text-on-surface focus:outline-none focus:ring-0"
                        placeholder="Unique username"
                      />
                      <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary-fixed transition-all duration-300 group-focus-within:w-full" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Create Password</label>
                    <div className="group relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-outline-variant group-focus-within:text-secondary-fixed">
                        <MaterialIcon name="vpn_key" className="text-lg" />
                      </div>
                      <input
                        type={showPw ? "text" : "password"}
                        required
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full border-none bg-surface-container-highest py-4 pl-12 pr-12 font-mono text-sm text-on-surface focus:outline-none focus:ring-0"
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
                </div>
              )}

              {authError && <p className="text-center text-xs text-error">{authError}</p>}
              <button
                type="submit"
                disabled={authLoading}
                className="flex w-full items-center justify-center gap-3 rounded-sm bg-secondary-container py-4 font-headline text-sm font-bold uppercase tracking-widest text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {authLoading ? "Processing…" : regStep === 4 ? "Complete Verification" : "Next Phase"}
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
                  Registering a new account establishes an initial identity. Multi-tenant isolation is soft; you will join the global Sentinal schema node unless independently hosted. 
                </p>
              </div>
            </div>
          </footer>
        </div>
      </aside>
    </div>
  );
}
