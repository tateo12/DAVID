"use client";

import React, { useState, useEffect, useMemo } from "react";
import { fetchShadowAI } from "@/lib/api";
import { ShadowAISummary, RiskLevel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Ghost, Wrench, Users, AlertTriangle, Eye } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const riskBadgeStyles: Record<RiskLevel, string> = {
  low: "bg-sentinel-green/10 text-sentinel-green/80 border-sentinel-green/20",
  medium: "bg-sentinel-amber/15 text-sentinel-amber border-sentinel-amber/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  critical: "bg-sentinel-red/15 text-sentinel-red border-sentinel-red/30",
};

const actionStyles: Record<string, string> = {
  "Access Blocked": "text-sentinel-red",
  "Access Suspended": "text-sentinel-red",
  "Warning Issued": "text-sentinel-amber",
  "Under Review": "text-sentinel-blue",
  Logged: "text-sentinel-text-secondary",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pctDelta(cur: number, prev: number): number | null {
  if (prev === 0 && cur === 0) return 0;
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export default function ShadowAIPage() {
  const [data, setData] = useState<ShadowAISummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchShadowAI().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  const shadowStats = useMemo(() => {
    const flags = data?.flags ?? [];
    const now = Date.now();
    const ms7 = 7 * 24 * 60 * 60 * 1000;
    const last7 = flags.filter((f) => {
      const t = new Date(f.date).getTime();
      return !Number.isNaN(t) && now - t >= 0 && now - t <= ms7;
    });
    const prev7 = flags.filter((f) => {
      const t = new Date(f.date).getTime();
      if (Number.isNaN(t)) return false;
      const age = now - t;
      return age > ms7 && age <= 2 * ms7;
    });
    return {
      flagsLast: last7.length,
      flagsPrev: prev7.length,
      toolsLast: new Set(last7.map((f) => f.tool_detected)).size,
      toolsPrev: new Set(prev7.map((f) => f.tool_detected)).size,
      empLast: new Set(last7.map((f) => f.employee_id)).size,
      empPrev: new Set(prev7.map((f) => f.employee_id)).size,
    };
  }, [data?.flags]);

  const selectedFlag = data?.flags.find((f) => f.id === selectedId);

  return (
    <div className="space-y-6">
      <PageHeader
        accent="shadow"
        icon={Ghost}
        title="Shadow AI detection"
        description="Unsanctioned tools and side-channel usage. Feed shows the last 100 events; summary cards compare the latest 7 days to the prior 7."
      />

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data ? (
          <>
            <MetricCard
              icon={AlertTriangle}
              label="Flags (7d)"
              value={shadowStats.flagsLast}
              trend={pctDelta(shadowStats.flagsLast, shadowStats.flagsPrev)}
              iconColor="text-sentinel-red"
            />
            <MetricCard
              icon={Wrench}
              label="Unique tools (7d)"
              value={shadowStats.toolsLast}
              trend={pctDelta(shadowStats.toolsLast, shadowStats.toolsPrev)}
              iconColor="text-sentinel-amber"
            />
            <MetricCard
              icon={Users}
              label="Employees (7d)"
              value={shadowStats.empLast}
              trend={pctDelta(shadowStats.empLast, shadowStats.empPrev)}
              iconColor="text-sentinel-blue"
            />
          </>
        ) : (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card p-5 rounded-xl">
              <div className="h-20 skeleton" />
            </div>
          ))
        )}
      </div>

      {/* Flags Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 skeleton" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-sentinel-border hover:bg-transparent">
                <TableHead className="text-sentinel-text-secondary font-medium">Employee</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Tool Detected</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Department</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Date</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Risk Level</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Action Taken</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.flags?.length ? data.flags.map((flag) => (
                <TableRow
                  key={flag.id}
                  className="border-sentinel-border/50 hover:bg-sentinel-surface-hover/50 transition-colors duration-150"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sentinel-red/20 to-orange-500/20 flex items-center justify-center">
                        <Ghost className="w-4 h-4 text-sentinel-red/70" />
                      </div>
                      <span className="text-sm font-medium text-sentinel-text-primary">
                        {flag.employee_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Wrench className="w-3.5 h-3.5 text-sentinel-text-secondary" />
                      <span className="text-sm text-sentinel-text-primary font-medium">{flag.tool_detected}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-sentinel-text-secondary">{flag.department}</TableCell>
                  <TableCell className="text-sm text-sentinel-text-secondary whitespace-nowrap">
                    {formatDate(flag.date)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase tracking-wider font-semibold ${riskBadgeStyles[flag.risk_level]}`}
                    >
                      {flag.risk_level}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-medium ${actionStyles[flag.action_taken] || "text-sentinel-text-secondary"}`}>
                      {flag.action_taken}
                    </span>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => setSelectedId(flag.id)}
                      className="p-1.5 rounded-lg hover:bg-sentinel-surface-hover text-sentinel-text-secondary hover:text-sentinel-text-primary transition-all duration-200"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-14 text-center text-sm text-sentinel-text-secondary">
                    No shadow AI events in the current feed.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedFlag} onOpenChange={() => setSelectedId(null)}>
        <DialogContent className="bg-sentinel-bg border-sentinel-border max-w-lg">
          {selectedFlag && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-sentinel-red/10">
                    <Ghost className="w-5 h-5 text-sentinel-red" />
                  </div>
                  <div>
                    <DialogTitle className="text-sentinel-text-primary">Shadow AI Incident</DialogTitle>
                    <p className="text-xs text-sentinel-text-secondary mt-0.5">
                      {selectedFlag.employee_name} — {formatDate(selectedFlag.date)}
                    </p>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-card p-3 rounded-lg">
                    <div className="text-[10px] text-sentinel-text-secondary mb-1">Tool</div>
                    <div className="text-sm font-medium text-sentinel-text-primary">{selectedFlag.tool_detected}</div>
                  </div>
                  <div className="glass-card p-3 rounded-lg">
                    <div className="text-[10px] text-sentinel-text-secondary mb-1">Risk Level</div>
                    <Badge variant="outline" className={`text-[10px] uppercase ${riskBadgeStyles[selectedFlag.risk_level]}`}>
                      {selectedFlag.risk_level}
                    </Badge>
                  </div>
                  <div className="glass-card p-3 rounded-lg">
                    <div className="text-[10px] text-sentinel-text-secondary mb-1">Department</div>
                    <div className="text-sm text-sentinel-text-primary">{selectedFlag.department}</div>
                  </div>
                  <div className="glass-card p-3 rounded-lg">
                    <div className="text-[10px] text-sentinel-text-secondary mb-1">Action Taken</div>
                    <div className={`text-sm font-medium ${actionStyles[selectedFlag.action_taken]}`}>
                      {selectedFlag.action_taken}
                    </div>
                  </div>
                </div>
                <div className="glass-card p-4 rounded-lg">
                  <div className="text-[10px] text-sentinel-text-secondary mb-2">Details</div>
                  <p className="text-sm text-sentinel-text-primary/90 leading-relaxed">
                    {selectedFlag.details}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
