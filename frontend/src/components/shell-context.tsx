"use client";

import { createContext, useContext } from "react";

export type AppShellContextValue = {
  sidebarExpanded: boolean;
  setSidebarExpanded: (v: boolean) => void;
  sidebarWidthPx: number;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  isMdUp: boolean;
};

export const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell must be used within AppShell");
  return ctx;
}
