"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessageSquareText,
  ScrollText,
  Ghost,
  Bot,
  FileBarChart,
  ChevronLeft,
  ChevronRight,
  Shield,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/prompts", label: "Prompts", icon: MessageSquareText },
  { href: "/policies", label: "Policies", icon: ScrollText },
  { href: "/shadow-ai", label: "Shadow AI", icon: Ghost },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/reports", label: "Reports", icon: FileBarChart },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(true);
  const pathname = usePathname();

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen flex flex-col transition-all duration-300 ease-in-out ${
        expanded ? "w-[240px]" : "w-[64px]"
      }`}
      style={{
        background: "#1e293b",
        borderRight: "1px solid rgba(51, 65, 85, 0.5)",
      }}
    >
      {/* Logo Area */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sentinel-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {expanded && (
          <span className="text-lg font-bold sentinel-gradient whitespace-nowrap overflow-hidden">
            Sentinel
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          const linkContent = (
            <Link
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive
                  ? "bg-sentinel-blue/15 text-sentinel-blue"
                  : "text-sentinel-text-secondary hover:bg-sentinel-surface-hover hover:text-sentinel-text-primary"
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-colors duration-200 ${
                  isActive ? "text-sentinel-blue" : "text-sentinel-text-secondary group-hover:text-sentinel-text-primary"
                }`}
              />
              {expanded && (
                <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                  {item.label}
                </span>
              )}
              {isActive && (
                <div className="absolute left-0 w-[3px] h-6 rounded-r-full bg-sentinel-blue" />
              )}
            </Link>
          );

          if (!expanded) {
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" className="bg-sentinel-surface text-sentinel-text-primary border-sentinel-border">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.href} className="relative">{linkContent}</div>;
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="px-2 pb-4 shrink-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sentinel-text-secondary hover:bg-sentinel-surface-hover hover:text-sentinel-text-primary transition-all duration-200"
        >
          {expanded ? (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs font-medium">Collapse</span>
            </>
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
