"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fetchPrompts } from "@/lib/api";
import { PromptRecord, RiskLevel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Filter, MessageSquareText } from "lucide-react";

const riskBadgeStyles: Record<RiskLevel, string> = {
  low: "border-secondary-container/30 bg-secondary-container/10 text-secondary-fixed",
  medium: "border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#f59e0b]",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  critical: "border-error/30 bg-error/10 text-error",
};

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PromptsContent() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPrompts(100).then((data) => {
      setPrompts(data);
      setLoading(false);
    });
  }, []);

  const departments = useMemo(() => {
    const depts = new Set(prompts.map((p) => p.department));
    return Array.from(depts).sort();
  }, [prompts]);

  const filtered = useMemo(() => {
    return prompts.filter((p) => {
      if (riskFilter !== "all" && p.risk_level !== riskFilter) return false;
      if (deptFilter !== "all" && p.department !== deptFilter) return false;
      if (q) {
        return (
          p.prompt.toLowerCase().includes(q) ||
          p.employee_name.toLowerCase().includes(q) ||
          p.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [prompts, q, riskFilter, deptFilter]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    prompts.forEach((p) => {
      const k = p.risk_level in counts ? p.risk_level : "low";
      counts[k]++;
    });
    return counts;
  }, [prompts]);

  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-outline-variant/10 pb-8">
        <h1 className="font-headline text-3xl font-black uppercase tracking-tight text-white">Prompt history</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-on-surface-variant">
          Full audit trail with expandable rows. Search uses the top bar; chips and department narrow the list.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(["low", "medium", "high", "critical"] as RiskLevel[]).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setRiskFilter(riskFilter === level ? "all" : level)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
              riskFilter === level
                ? riskBadgeStyles[level]
                : "border-outline-variant/40 text-on-surface-variant hover:border-outline-variant"
            }`}
          >
            <span className="uppercase tracking-wider">{level}</span>
            <span className="font-mono font-semibold">{riskCounts[level]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="h-9 w-40 border-outline-variant/20 bg-surface-container-low text-sm text-white">
            <Filter className="mr-2 h-3.5 w-3.5 text-on-surface-variant" />
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent className="border-outline-variant/20 bg-surface-container-low">
            <SelectItem value="all" className="text-white">
              All Departments
            </SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d} className="text-white">
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-low">
        {loading ? (
          <div className="space-y-4 p-8">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-surface-container-highest" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-on-surface-variant">
            {prompts.length === 0 ? "No prompts recorded yet." : "No prompts match the current filters or search."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-outline-variant/10 hover:bg-transparent">
                <TableHead className="w-8 text-on-surface-variant" />
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Timestamp</TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Employee</TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Department</TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Prompt</TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Risk</TableHead>
                <TableHead className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((prompt) => (
                <React.Fragment key={prompt.id}>
                  <TableRow
                    className="cursor-pointer border-outline-variant/5 transition-colors hover:bg-surface-container-highest"
                    onClick={() => toggleExpand(prompt.id)}
                  >
                    <TableCell className="w-8">
                      {expanded.has(prompt.id) ? (
                        <ChevronDown className="h-4 w-4 text-on-surface-variant" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-on-surface-variant" />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-on-surface-variant">{formatTimestamp(prompt.timestamp)}</TableCell>
                    <TableCell className="text-sm font-medium text-white">{prompt.employee_name}</TableCell>
                    <TableCell className="text-sm text-on-surface-variant">{prompt.department}</TableCell>
                    <TableCell className="max-w-md truncate text-sm text-on-surface-variant">{prompt.prompt}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold uppercase tracking-wider ${riskBadgeStyles[prompt.risk_level]}`}
                      >
                        {prompt.risk_level}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-white">{prompt.risk_score}</TableCell>
                  </TableRow>
                  {expanded.has(prompt.id) && (
                    <TableRow className="border-outline-variant/5">
                      <TableCell colSpan={7} className="p-0">
                        <div className="border-t border-outline-variant/10 bg-surface-container-lowest px-6 py-4">
                          <div className="space-y-3">
                            <div>
                              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                                <MessageSquareText className="h-3.5 w-3.5" /> Full Prompt
                              </h4>
                              <p className="rounded-lg border border-outline-variant/15 bg-background p-3 text-sm text-on-surface">{prompt.prompt}</p>
                            </div>
                            {prompt.categories.length > 0 && (
                              <div>
                                <h4 className="mb-1.5 text-xs font-medium text-on-surface-variant">Categories Flagged</h4>
                                <div className="flex flex-wrap gap-2">
                                  {prompt.categories.map((cat) => (
                                    <Badge key={cat} variant="outline" className="border-outline-variant/30 text-[10px] text-on-surface-variant">
                                      {cat}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div>
                              <h4 className="mb-1.5 text-xs font-medium text-on-surface-variant">Analysis Reasoning</h4>
                              <p className="text-sm text-on-surface-variant">{prompt.reasoning}</p>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function PromptsFallback() {
  return (
    <div className="space-y-8">
      <div className="h-24 animate-pulse rounded-xl bg-surface-container-high" />
      <div className="h-10 max-w-lg animate-pulse rounded-lg bg-surface-container-high" />
      <div className="space-y-3 rounded-xl border border-outline-variant/10 p-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-surface-container-highest" />
        ))}
      </div>
    </div>
  );
}

export default function PromptsPage() {
  return (
    <Suspense fallback={<PromptsFallback />}>
      <PromptsContent />
    </Suspense>
  );
}
