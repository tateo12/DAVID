"use client";

import React, { useState, useEffect, useMemo } from "react";
import { fetchEmployees } from "@/lib/api";
import { Employee, EmployeeStatus } from "@/lib/types";
import { RiskGauge } from "@/components/risk-gauge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Search, ArrowUpDown } from "lucide-react";

const statusStyles: Record<EmployeeStatus, string> = {
  active: "bg-sentinel-green/15 text-sentinel-green border-sentinel-green/30",
  inactive: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  suspended: "bg-sentinel-red/15 text-sentinel-red border-sentinel-red/30",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SortField = "name" | "risk_score" | "total_prompts" | "last_active";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("risk_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Employee | null>(null);

  useEffect(() => {
    fetchEmployees().then((data) => {
      setEmployees(data);
      setLoading(false);
    });
  }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    const list = employees.filter(
      (e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.department.toLowerCase().includes(search.toLowerCase()) ||
        e.email.toLowerCase().includes(search.toLowerCase())
    );

    list.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return list;
  }, [employees, search, sortField, sortDir]);

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-sentinel-text-primary transition-colors duration-200"
    >
      {children}
      <ArrowUpDown className={`w-3 h-3 ${sortField === field ? "text-sentinel-blue" : ""}`} />
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-sentinel-text-primary">Employees</h1>
          <p className="text-sm text-sentinel-text-secondary mt-1">
            Monitor employee risk scores and AI usage patterns
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sentinel-text-secondary" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees..."
              className="pl-10 bg-sentinel-surface/50 border-sentinel-border text-sentinel-text-primary placeholder:text-sentinel-text-secondary/60 h-9 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-40 h-5 skeleton" />
                <div className="w-24 h-5 skeleton" />
                <div className="w-12 h-12 skeleton rounded-full" />
                <div className="w-16 h-5 skeleton" />
                <div className="w-24 h-5 skeleton" />
                <div className="w-16 h-5 skeleton rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-sentinel-border hover:bg-transparent">
                <TableHead className="text-sentinel-text-secondary font-medium">
                  <SortHeader field="name">Name</SortHeader>
                </TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Department</TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">
                  <SortHeader field="risk_score">Risk Score</SortHeader>
                </TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">
                  <SortHeader field="total_prompts">Total Prompts</SortHeader>
                </TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">
                  <SortHeader field="last_active">Last Active</SortHeader>
                </TableHead>
                <TableHead className="text-sentinel-text-secondary font-medium">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp) => (
                <TableRow
                  key={emp.id}
                  className="border-sentinel-border/50 hover:bg-sentinel-surface-hover/50 cursor-pointer transition-colors duration-150"
                  onClick={() => setSelected(emp)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sentinel-blue/30 to-cyan-500/30 flex items-center justify-center text-xs font-bold text-sentinel-text-primary">
                        {emp.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <div className="font-medium text-sentinel-text-primary text-sm">{emp.name}</div>
                        <div className="text-xs text-sentinel-text-secondary">{emp.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sentinel-text-secondary text-sm">{emp.department}</TableCell>
                  <TableCell>
                    <RiskGauge score={emp.risk_score} size={40} strokeWidth={3} />
                  </TableCell>
                  <TableCell className="metric-number text-sentinel-text-primary text-sm">
                    {emp.total_prompts.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sentinel-text-secondary text-sm">
                    {formatDate(emp.last_active)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider font-semibold ${statusStyles[emp.status]}`}>
                      {emp.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Employee Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="bg-sentinel-bg border-sentinel-border w-[480px] sm:max-w-[480px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="pb-6 border-b border-sentinel-border">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sentinel-blue/30 to-cyan-500/30 flex items-center justify-center text-lg font-bold text-sentinel-text-primary">
                      {selected.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <SheetTitle className="text-sentinel-text-primary text-lg">{selected.name}</SheetTitle>
                      <p className="text-sm text-sentinel-text-secondary">{selected.department}</p>
                      <p className="text-xs text-sentinel-text-secondary/60 mt-0.5">{selected.email}</p>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="py-6 space-y-6">
                {/* Risk Gauge Large */}
                <div className="flex items-center justify-center">
                  <RiskGauge score={selected.risk_score} size={120} strokeWidth={8} showLabel />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="glass-card p-3 rounded-lg text-center">
                    <div className="metric-number text-lg text-sentinel-text-primary">
                      {selected.total_prompts}
                    </div>
                    <div className="text-[10px] text-sentinel-text-secondary mt-1">Total Prompts</div>
                  </div>
                  <div className="glass-card p-3 rounded-lg text-center">
                    <div className="metric-number text-lg text-sentinel-red">
                      {selected.flagged_prompts}
                    </div>
                    <div className="text-[10px] text-sentinel-text-secondary mt-1">Flagged</div>
                  </div>
                  <div className="glass-card p-3 rounded-lg text-center">
                    <Badge variant="outline" className={`text-[10px] uppercase ${statusStyles[selected.status]}`}>
                      {selected.status}
                    </Badge>
                    <div className="text-[10px] text-sentinel-text-secondary mt-1">Status</div>
                  </div>
                </div>

                {/* Risk Trend Sparkline */}
                <div>
                  <h4 className="text-sm font-medium text-sentinel-text-primary mb-3">Risk Trend (7 Days)</h4>
                  <div className="h-16 flex items-end gap-1">
                    {selected.risk_trend.map((val, i) => {
                      const height = Math.max(4, (val / 100) * 64);
                      const color = val <= 25 ? "#22c55e" : val <= 50 ? "#f59e0b" : val <= 75 ? "#f97316" : "#ef4444";
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t transition-all duration-300"
                          style={{
                            height: `${height}px`,
                            background: color,
                            opacity: 0.7,
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[9px] text-sentinel-text-secondary/50 mt-1">
                    <span>7 days ago</span>
                    <span>Today</span>
                  </div>
                </div>

                {/* Last Active */}
                <div className="glass-card p-3 rounded-lg">
                  <div className="text-xs text-sentinel-text-secondary">Last Active</div>
                  <div className="text-sm text-sentinel-text-primary mt-1">
                    {formatDate(selected.last_active)}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
