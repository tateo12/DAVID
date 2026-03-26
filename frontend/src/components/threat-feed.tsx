"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { fetchPrompts } from "@/lib/api";
import { PromptRecord, RiskLevel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Clock, User } from "lucide-react";

const riskBadgeStyles: Record<RiskLevel, string> = {
  safe: "bg-sentinel-green/15 text-sentinel-green border-sentinel-green/30",
  low: "bg-sentinel-green/10 text-sentinel-green/80 border-sentinel-green/20",
  medium: "bg-sentinel-amber/15 text-sentinel-amber border-sentinel-amber/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  critical: "bg-sentinel-red/15 text-sentinel-red border-sentinel-red/30",
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60_000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ThreatFeedProps {
  maxItems?: number;
  refreshInterval?: number;
}

export function ThreatFeed({ maxItems = 20, refreshInterval = 5000 }: ThreatFeedProps) {
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef<Set<string>>(new Set());

  const loadPrompts = useCallback(async () => {
    try {
      const data = await fetchPrompts(maxItems);
      const prevIds = prevIdsRef.current;
      const newIds = new Set<string>();

      data.forEach((p) => {
        if (!prevIds.has(p.id)) {
          newIds.add(p.id);
        }
      });

      if (prevIds.size > 0 && newIds.size > 0) {
        setNewItemIds(newIds);
        setTimeout(() => setNewItemIds(new Set()), 500);
      }

      prevIdsRef.current = new Set(data.map((p) => p.id));
      setPrompts(data);
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    loadPrompts();
    const interval = setInterval(loadPrompts, refreshInterval);
    return () => clearInterval(interval);
  }, [loadPrompts, refreshInterval]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-3 rounded-lg glass-card">
            <div className="flex items-center gap-3">
              <div className="w-16 h-4 skeleton" />
              <div className="w-24 h-4 skeleton" />
              <div className="flex-1" />
              <div className="w-16 h-5 skeleton rounded-full" />
            </div>
            <div className="w-full h-4 skeleton mt-2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
      {prompts.map((prompt) => (
        <div
          key={prompt.id}
          className={`p-3 rounded-lg border border-sentinel-border/50 hover:border-sentinel-border transition-all duration-200 cursor-default group ${
            newItemIds.has(prompt.id) ? "threat-feed-enter" : ""
          }`}
          style={{ background: "rgba(30, 41, 59, 0.4)" }}
        >
          <div className="flex items-center gap-3 mb-1.5">
            <div className="flex items-center gap-1.5 text-xs text-sentinel-text-secondary">
              <Clock className="w-3 h-3" />
              <span>{formatTimestamp(prompt.timestamp)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-sentinel-text-secondary">
              <User className="w-3 h-3" />
              <span className="font-medium text-sentinel-text-primary/80">{prompt.employee_name}</span>
            </div>
            <span className="text-xs text-sentinel-text-secondary/60">{prompt.department}</span>
            <div className="flex-1" />
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 ${riskBadgeStyles[prompt.risk_level]}`}
            >
              {prompt.risk_level}
            </Badge>
          </div>
          <p className="text-sm text-sentinel-text-secondary group-hover:text-sentinel-text-primary/80 transition-colors duration-200 line-clamp-1">
            {prompt.prompt}
          </p>
        </div>
      ))}
    </div>
  );
}
