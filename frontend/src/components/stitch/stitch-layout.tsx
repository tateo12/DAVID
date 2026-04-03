"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getSession, isTeamManager } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { AppShellContext, type AppShellContextValue } from "@/components/shell-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { ShieldMark } from "@/components/shield-mark";
import { MaterialIcon } from "./material-icon";
import { StitchHeaderSearch } from "./stitch-header-search";
import { StitchHeaderRibbon } from "./stitch-header-ribbon";

const SIDEBAR_PX = 256;

export const STITCH_NAV = [
  { href: "/", label: "Command Center", icon: "grid_view" as const },
  { href: "/policies", label: "AI Policies", icon: "policy" as const },
  { href: "/reports", label: "Risk Trends", icon: "monitoring" as const },
  { href: "/employees", label: "Skill Hub", icon: "psychology" as const },
  { href: "/curriculum", label: "Curriculum", icon: "menu_book" as const },
  { href: "/prompts", label: "Security Logs", icon: "security" as const },
] as const;

function SidebarSessionFooter() {
  const router = useRouter();
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const s = getSession();
      setLine(s ? `${s.user.username} · ${s.user.role}` : null);
    };
    sync();
    window.addEventListener("sentinel-auth", sync);
    return () => window.removeEventListener("sentinel-auth", sync);
  }, []);

  return (
    <footer className="mt-auto space-y-2 border-t border-outline-variant/10 px-6 pt-6">
      {line ? (
        <>
          <p className="px-1 font-mono text-[9px] uppercase tracking-wider text-on-surface-variant">{line}</p>
          <button
            type="button"
            onClick={() => {
              supabase.auth.signOut().finally(() => {
                clearSession();
                router.push("/login");
              });
            }}
            className="flex w-full items-center gap-3 py-2 font-label text-[10px] uppercase tracking-widest text-error/90 hover:text-error"
          >
            <MaterialIcon name="logout" className="text-lg" />
            Sign out
          </button>
        </>
      ) : null}
      <Link
        href="/login"
        className="flex items-center gap-3 py-2 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-white"
      >
        <MaterialIcon name="login" className="text-lg" />
        {line ? "Switch account" : "Command Login"}
      </Link>
    </footer>
  );
}

function StitchChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMdUp = useMediaQuery("(min-width: 768px)");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showTeamHub, setShowTeamHub] = useState(false);

  useEffect(() => {
    const sync = () => setShowTeamHub(isTeamManager(getSession()?.user?.role ?? ""));
    sync();
    window.addEventListener("sentinel-auth", sync);
    return () => window.removeEventListener("sentinel-auth", sync);
  }, []);

  useEffect(() => {
    if (isMdUp) setMobileNavOpen(false);
  }, [isMdUp]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!isMdUp && mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isMdUp, mobileNavOpen]);

  const ctx = useMemo<AppShellContextValue>(
    () => ({
      sidebarExpanded: true,
      setSidebarExpanded: () => {},
      sidebarWidthPx: isMdUp ? SIDEBAR_PX : 0,
      mobileNavOpen,
      setMobileNavOpen,
      isMdUp,
    }),
    [isMdUp, mobileNavOpen]
  );

  const mainMargin = isMdUp ? SIDEBAR_PX : 0;
  const mobileSlide = !isMdUp
    ? mobileNavOpen
      ? "translate-x-0 shadow-2xl shadow-black/40"
      : "-translate-x-full pointer-events-none"
    : "translate-x-0";

  return (
    <AppShellContext.Provider value={ctx}>
      {!isMdUp && mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[45] bg-black/55 backdrop-blur-sm"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-outline-variant/15 bg-surface pb-6 pt-20 transition-transform duration-300 ease-out md:translate-x-0",
          mobileSlide,
          !isMdUp && mobileNavOpen && "z-50"
        )}
      >
        <div className="mb-8 px-6">
          <div className="font-headline text-lg font-black tracking-tighter text-white">SENTINEL</div>
          <div className="font-headline text-[10px] uppercase tracking-[0.05em] text-outline">
            v2.4.0 High-Vigilance
          </div>
        </div>
        <nav className="flex flex-1 flex-col space-y-1 overflow-y-auto">
          {STITCH_NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => !isMdUp && setMobileNavOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-6 py-3 font-label text-[10px] font-medium uppercase tracking-widest transition-all",
                  active
                    ? "border-r-2 border-secondary-fixed bg-secondary-fixed/10 text-secondary-fixed"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-white"
                )}
              >
                <MaterialIcon name={item.icon} className="text-lg" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <SidebarSessionFooter />
      </aside>

      <div
        className="flex min-h-screen flex-col transition-[margin-left] duration-300 ease-in-out"
        style={{ marginLeft: mainMargin }}
      >
        <header className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center justify-between border-b border-outline-variant/10 bg-surface-container pl-4 pr-4 font-headline text-sm tracking-tight md:pl-6 md:pr-6 lg:left-64">
          <div className="flex min-w-0 flex-1 items-center gap-4 md:gap-8">
            {!isMdUp ? (
              <button
                type="button"
                className="shrink-0 rounded p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-white"
                aria-label="Open menu"
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(true)}
              >
                <MaterialIcon name="menu" />
              </button>
            ) : null}
            <span className="hidden shrink-0 items-center gap-2 text-xl font-bold tracking-tighter text-white sm:inline-flex">
              <ShieldMark size={26} className="text-secondary-fixed" title="Sentinel" />
              Sentinel
            </span>
            <nav className="hidden flex-wrap items-center gap-x-5 gap-y-1 lg:flex">
              <Link
                href="/"
                className={cn(
                  "transition-colors",
                  pathname === "/" ? "font-bold text-secondary-fixed" : "text-on-surface-variant hover:text-white"
                )}
              >
                Command Center
              </Link>
              <Link
                href="/policies"
                className={cn(
                  "transition-colors",
                  pathname === "/policies"
                    ? "font-bold text-secondary-fixed"
                    : "text-on-surface-variant hover:text-white"
                )}
              >
                AI Policies
              </Link>
              <Link
                href="/reports"
                className={cn(
                  "transition-colors",
                  pathname === "/reports"
                    ? "font-bold text-secondary-fixed"
                    : "text-on-surface-variant hover:text-white"
                )}
              >
                Risk Trends
              </Link>
              <Link
                href="/employees"
                className={cn(
                  "transition-colors",
                  pathname === "/employees"
                    ? "font-bold text-secondary-fixed"
                    : "text-on-surface-variant hover:text-white"
                )}
              >
                Skill Hub
              </Link>
              <Link
                href="/curriculum"
                className={cn(
                  "transition-colors",
                  pathname === "/curriculum"
                    ? "font-bold text-secondary-fixed"
                    : "text-on-surface-variant hover:text-white"
                )}
              >
                Curriculum
              </Link>

              <Link
                href="/prompts"
                className={cn(
                  "transition-colors",
                  pathname === "/prompts"
                    ? "font-bold text-secondary-fixed"
                    : "text-on-surface-variant hover:text-white"
                )}
              >
                Security Logs
              </Link>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            <Suspense
              fallback={
                <div className="hidden h-9 w-48 rounded-sm bg-surface-container-highest sm:block" />
              }
            >
              <StitchHeaderSearch />
            </Suspense>
            {showTeamHub ? (
              <Link
                href="/team"
                title="Team directory — invites, roles, onboarding"
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-secondary-container/35 bg-surface-container-high transition hover:border-secondary-fixed hover:bg-secondary-container/15",
                  pathname === "/team" ? "border-secondary-fixed ring-1 ring-secondary-fixed/40" : ""
                )}
              >
                <MaterialIcon name="hub" className="text-xl text-secondary-fixed" />
              </Link>
            ) : null}
            <StitchHeaderRibbon />
          </div>
        </header>

        <main className="min-h-screen flex-1 overflow-y-auto px-4 pb-6 pt-20 md:px-6">{children}</main>
      </div>
    </AppShellContext.Provider>
  );
}

export function StitchLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/register-invite" || pathname === "/setup-account" || pathname === "/onboard") {
    return <>{children}</>;
  }
  return <StitchChrome>{children}</StitchChrome>;
}
