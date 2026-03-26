"use client";

import React from "react";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-6 border-b border-sentinel-border glass-surface">
      {/* Left: Page Context */}
      <div className="flex items-center gap-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sentinel-text-secondary" />
          <Input
            placeholder="Search threats, employees, prompts..."
            className="pl-10 bg-sentinel-surface/50 border-sentinel-border text-sentinel-text-primary placeholder:text-sentinel-text-secondary/60 focus:ring-sentinel-blue/30 focus:border-sentinel-blue/50 h-9 text-sm"
          />
        </div>
      </div>

      {/* Right: Status & Actions */}
      <div className="flex items-center gap-4">
        {/* Live Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-card">
          <div className="live-dot" />
          <span className="text-xs font-medium text-sentinel-green">Live</span>
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-sentinel-text-secondary hover:bg-sentinel-surface-hover hover:text-sentinel-text-primary transition-all duration-200">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-sentinel-red" />
        </button>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sentinel-blue to-cyan-400 flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:ring-2 hover:ring-sentinel-blue/30 transition-all duration-200">
          SA
        </div>
      </div>
    </header>
  );
}
