"use client";

import React, { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const ROUTE_META: Record<string, { title: string; hint: string }> = {
  "/": { title: "Security Dashboard", hint: "KPIs, charts, prompt analyzer" },
  "/employees": { title: "Employees", hint: "Directory & risk" },
  "/prompts": { title: "Prompt history", hint: "Audit trail" },
  "/policies": { title: "Policies", hint: "rule_json" },
  "/shadow-ai": { title: "Shadow AI", hint: "Unsanctioned tools" },
  "/agents": { title: "Agents", hint: "Budgets & runs" },
  "/reports": { title: "Reports", hint: "Executive summary" },
};

function TopBarInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [searchParams, pathname]);

  const meta = ROUTE_META[pathname] ?? { title: "Sentinel", hint: "AI security" };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (pathname === "/employees" || pathname === "/prompts") {
      if (!query) router.push(pathname);
      else router.push(`${pathname}?q=${encodeURIComponent(query)}`);
      return;
    }
    if (!query) return;
    router.push(`/prompts?q=${encodeURIComponent(query)}`);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-sentinel-border px-6 glass-surface">
      <div className="flex min-w-0 flex-1 items-center gap-6">
        <div className="hidden min-w-0 md:block">
          <h2 className="truncate font-display text-sm font-semibold tracking-tight text-sentinel-text-primary">
            {meta.title}
          </h2>
          <p className="truncate text-[11px] text-sentinel-text-secondary/80">{meta.hint}</p>
        </div>
        <form onSubmit={submitSearch} className="relative w-full max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sentinel-text-secondary" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              pathname === "/employees" || pathname === "/prompts"
                ? "Filter this list… (Enter)"
                : "Search prompts… (Enter)"
            }
            className="h-9 border-sentinel-border bg-sentinel-surface/50 pl-10 text-sm text-sentinel-text-primary placeholder:text-sentinel-text-secondary/60 focus:border-sentinel-blue/50 focus:ring-sentinel-blue/30"
            aria-label="Search"
          />
        </form>
      </div>

      <div className="flex items-center gap-3 pl-4">
        <div className="hidden items-center gap-2 rounded-full glass-card px-3 py-1.5 sm:flex">
          <div className="live-dot" />
          <span className="text-xs font-medium text-sentinel-green">Live</span>
        </div>

        <button
          type="button"
          className="relative rounded-lg p-2 text-sentinel-text-secondary transition-all duration-200 hover:bg-sentinel-surface-hover hover:text-sentinel-text-primary"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-sentinel-red" />
        </button>

        <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-sentinel-blue to-cyan-400 text-xs font-bold text-white transition-all duration-200 hover:ring-2 hover:ring-sentinel-blue/30">
          SA
        </div>
      </div>
    </header>
  );
}

function TopBarSkeleton() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-sentinel-border px-6 glass-surface">
      <div className="h-9 w-full max-w-md skeleton rounded-md" />
      <div className="h-8 w-24 skeleton rounded-full" />
    </header>
  );
}

export function TopBar() {
  return (
    <Suspense fallback={<TopBarSkeleton />}>
      <TopBarInner />
    </Suspense>
  );
}
