"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchOrganizations, setAdminOrgOverride, type OrgListItem } from "@/lib/api";
import { getSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { MaterialIcon } from "./material-icon";

export function AdminOrgSwitcher() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<OrgListItem | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => {
      const s = getSession();
      setIsAdmin(s?.user?.role === "admin");
    };
    sync();
    window.addEventListener("sentinel-auth", sync);
    return () => window.removeEventListener("sentinel-auth", sync);
  }, []);

  useEffect(() => {
    if (!open || !isAdmin) return;
    setLoading(true);
    fetchOrganizations(search)
      .then(setOrgs)
      .catch(() => setOrgs([]))
      .finally(() => setLoading(false));
  }, [open, search, isAdmin]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = useCallback((org: OrgListItem) => {
    setSelectedOrg(org);
    setAdminOrgOverride(org.id);
    setOpen(false);
    setSearch("");
    // Trigger a page-level data refresh
    window.dispatchEvent(new Event("sentinel-org-override"));
  }, []);

  const handleClear = useCallback(() => {
    setSelectedOrg(null);
    setAdminOrgOverride(null);
    setOpen(false);
    setSearch("");
    window.dispatchEvent(new Event("sentinel-org-override"));
  }, []);

  if (!isAdmin) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 items-center gap-2 rounded border px-3 font-mono text-xs transition-colors",
          selectedOrg
            ? "border-secondary-fixed/40 bg-secondary-fixed/10 text-secondary-fixed"
            : "border-outline-variant/25 bg-surface-container-high text-on-surface-variant hover:border-outline-variant/50 hover:text-white"
        )}
        title={selectedOrg ? `Viewing as: ${selectedOrg.name}` : "View as organization"}
      >
        <MaterialIcon name="swap_horiz" className="text-base" />
        <span className="hidden max-w-[140px] truncate sm:inline">
          {selectedOrg ? selectedOrg.name : "View as org"}
        </span>
        <MaterialIcon name="expand_more" className="text-sm opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded border border-outline-variant/20 bg-surface-container shadow-xl shadow-black/40">
          <div className="border-b border-outline-variant/10 p-2">
            <div className="flex items-center gap-2 rounded border border-outline-variant/20 bg-surface-container-highest px-2.5">
              <MaterialIcon name="search" className="text-sm text-outline" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies..."
                className="min-w-0 flex-1 bg-transparent py-2 font-mono text-xs text-white placeholder:text-outline focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {selectedOrg && (
              <button
                type="button"
                onClick={handleClear}
                className="flex w-full items-center gap-2.5 border-b border-outline-variant/10 px-3 py-2.5 text-left font-mono text-xs text-error/80 transition-colors hover:bg-error/5 hover:text-error"
              >
                <MaterialIcon name="close" className="text-sm" />
                Clear — back to admin view
              </button>
            )}

            {loading ? (
              <p className="px-3 py-4 font-mono text-[10px] text-outline">Loading...</p>
            ) : orgs.length === 0 ? (
              <p className="px-3 py-4 font-mono text-[10px] text-outline">
                {search ? "No matching organizations" : "No organizations yet"}
              </p>
            ) : (
              orgs.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => handleSelect(org)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-container-high",
                    selectedOrg?.id === org.id && "bg-secondary-fixed/5"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold uppercase",
                      selectedOrg?.id === org.id
                        ? "border-secondary-fixed/40 bg-secondary-fixed/15 text-secondary-fixed"
                        : "border-outline-variant/20 bg-surface-container-highest text-on-surface-variant"
                    )}
                  >
                    {org.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-white">{org.name}</p>
                    <p className="font-mono text-[9px] text-outline">{org.plan} plan</p>
                  </div>
                  {selectedOrg?.id === org.id && (
                    <MaterialIcon name="check" className="text-sm text-secondary-fixed" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
