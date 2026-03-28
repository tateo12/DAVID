"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MaterialIcon } from "./material-icon";

export function StitchHeaderSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [searchParams, pathname]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (pathname === "/employees" || pathname === "/prompts") {
      router.push(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname);
      return;
    }
    if (query) router.push(`/prompts?q=${encodeURIComponent(query)}`);
  };

  return (
    <form
      onSubmit={submit}
      className="hidden max-w-[12rem] items-center gap-2 rounded-sm bg-surface-container-highest px-2 py-1.5 sm:flex md:max-w-xs"
    >
      <MaterialIcon name="search" className="text-sm text-outline" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full border-none bg-transparent font-mono text-[10px] uppercase tracking-widest text-on-surface-variant placeholder:text-outline/50 focus:outline-none focus:ring-0"
        placeholder="Query logs…"
        aria-label="Search"
      />
    </form>
  );
}
