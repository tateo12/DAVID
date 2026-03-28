"use client";

import React, { useState, useMemo, createContext, useContext } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";

const SIDEBAR_W = { expanded: 240, collapsed: 64 } as const;

type ShellCtx = {
  sidebarExpanded: boolean;
  setSidebarExpanded: (v: boolean) => void;
  sidebarWidthPx: number;
};

const AppShellContext = createContext<ShellCtx | null>(null);

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell must be used within AppShell");
  return ctx;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const sidebarWidthPx = sidebarExpanded ? SIDEBAR_W.expanded : SIDEBAR_W.collapsed;

  const value = useMemo<ShellCtx>(
    () => ({
      sidebarExpanded,
      setSidebarExpanded,
      sidebarWidthPx,
    }),
    [sidebarExpanded, sidebarWidthPx]
  );

  return (
    <AppShellContext.Provider value={value}>
      <div className="flex min-h-screen">
        <Sidebar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded((e) => !e)} />
        <div
          className="flex min-h-screen flex-1 flex-col transition-[margin] duration-300 ease-in-out"
          style={{ marginLeft: sidebarWidthPx }}
        >
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </AppShellContext.Provider>
  );
}
