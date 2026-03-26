"use client";

import React, { useState, useEffect, useMemo } from "react";
import { fetchPrompts } from "@/lib/api";
import { PromptRecord, RiskLevel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Search, ChevronDown, ChevronRight, Filter, MessageSquareText } from "lucide-react";

const riskBadgeStyles: Record<RiskLevel, string> = {
  safe: "bg-sentinel-green/15 text-sentinel-green border-sentinel-green/30",
  low: "bg-sentinel-green/10 text-sentinel-green/80 border-sentinel-green/20",
  medium: "bg-sentinel-amber/15 text-sentinel-amber border-sentinel-amber/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  critical: "bg-sentinel-red/15 text-sentinel-red border-sentinel-red/30",
};

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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
      if (search) {
        const q = search.toLowerCase();
        return (
          p.prompt.toLowerCase().includes(q) ||
          p.employee_name.toLowerCase().includes(q) ||
          p.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [prompts, search, riskFilter, deptFilter]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Risk level summary stats
  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { safe: 0, low: 0, medium: 0, high: 0, critical: 0 };
    prompts.forEach((p) => counts[p.risk_level]++);
    return counts;
  }, [prompts]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-sentinel-text-primary">Prompt History</h1>
        <p className="text-sm text-sentinel-text-secondary mt-1">
          Complete audit trail of all analyzed prompts
        </p>
      </div>

      {/* Summary Chips */}
      <div className="flex flex-wrap gap-2">
        {(["safe", "low", "medium", "high", "critical"] as RiskLevel[]).map((level) => (
          <button
            key={level}
            onClick={() => setRiskFilter(riskFilter === level ? "all" : level)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
              riskFilter === level
                ? riskBadgeStyles[level]
                : "border-sentinel-border/50 text-sentinel-text-secondary hover:border-sentinel-border"
            }`}
          >
            <span className="uppercase tracking-wider">{level}</span>
            <span className="metric-number">{riskCounts[level]}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sentinel-text-secondary" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts, employees..."
            className="pl-10 bg-sentinel-surface/50 border-sentinel-border text-sentinel-text-primary placeholder:text-sentinel-text-secondary/60 h-9 text-sm"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-40 bg-sentinel-surface/50 border-sentinel-border text-sentinel-text-primary h-9 text-sm">
            <Filter className="w-3.5 h-3.5 mr-2 text-sentinel-text-secondary" />
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent className="bg-sentinel-surface border-sentinel-border">
            <SelectItem value="all" className="text-sentinel-text-primary">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d} className="text-sentinel-text-primary">{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Prompts Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 skeleton" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-sentinel-border hover:bg-transparent">
                <TableHead className="w-8 text-sentinel-text-secondary" />
                <TableHead className="text-sentinel-text-secondary font-medium">Timestamp</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Employee</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Department</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Prompt</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Risk</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((prompt) => (
                <React.Fragment key={prompt.id}>
                  <TableRow
                    className="border-sentinel-border/50 hover:bg-sentinel-surface-hover/50 cursor-pointer transition-colors duration-150"
                    onClick={() => toggleExpand(prompt.id)}
                  >
                    <TableCell className="w-8">
                      {expanded.has(prompt.id) ? (
                        <ChevronDown className="w-4 h-4 text-sentinel-text-secondary" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-sentinel-text-secondary" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-sentinel-text-secondary whitespace-nowrap">
                      {formatTimestamp(prompt.timestamp)}
                    </TableCell>
                    <TableCell className="text-sm text-sentinel-text-primary font-medium">
                      {prompt.employee_name}
                    </TableCell>
                    <TableCell className="text-sm text-sentinel-text-secondary">
                      {prompt.department}
                    </TableCell>
                    <TableCell className="text-sm text-sentinel-text-secondary max-w-md truncate">
                      {prompt.prompt}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase tracking-wider font-semibold ${riskBadgeStyles[prompt.risk_level]}`}
                      >
                        {prompt.risk_level}
                      </Badge>
                    </TableCell>
                    <TableCell className="metric-number text-sm text-sentinel-text-primary">
                      {prompt.risk_score}
                    </TableCell>
                  </TableRow>
                  {expanded.has(prompt.id) && (
                    <TableRow className="border-sentinel-border/30">
                      <TableCell colSpan={7} className="p-0">
                        <div className="px-6 py-4 bg-sentinel-surface/30 border-t border-sentinel-border/30">
                          <div className="space-y-3">
                            <div>
                              <h4 className="text-xs font-medium text-sentinel-text-secondary mb-1.5 flex items-center gap-1.5">
                                <MessageSquareText className="w-3.5 h-3.5" /> Full Prompt
                              </h4>
                              <p className="text-sm text-sentinel-text-primary bg-sentinel-bg/50 p-3 rounded-lg border border-sentinel-border/30">
                                {prompt.prompt}
                              </p>
                            </div>
                            {prompt.categories.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-sentinel-text-secondary mb-1.5">
                                  Categories Flagged
                                </h4>
                                <div className="flex gap-2">
                                  {prompt.categories.map((cat) => (
                                    <Badge key={cat} variant="outline" className="text-[10px] border-sentinel-border text-sentinel-text-secondary">
                                      {cat}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div>
                              <h4 className="text-xs font-medium text-sentinel-text-secondary mb-1.5">
                                Analysis Reasoning
                              </h4>
                              <p className="text-sm text-sentinel-text-secondary">{prompt.reasoning}</p>
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
