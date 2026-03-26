"use client";

import React, { useState, useEffect } from "react";
import { fetchAgents } from "@/lib/api";
import { Agent, AgentStatus } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Bot, Zap, Clock, DollarSign, Activity } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const statusConfig: Record<AgentStatus, { color: string; bg: string; border: string; dot: string }> = {
  online: { color: "text-sentinel-green", bg: "bg-sentinel-green/15", border: "border-sentinel-green/30", dot: "bg-sentinel-green" },
  offline: { color: "text-gray-400", bg: "bg-gray-500/15", border: "border-gray-500/30", dot: "bg-gray-400" },
  degraded: { color: "text-sentinel-amber", bg: "bg-sentinel-amber/15", border: "border-sentinel-amber/30", dot: "bg-sentinel-amber" },
};

function getSpendColor(spend: number, budget: number): string {
  const pct = (spend / budget) * 100;
  if (pct < 60) return "#22c55e";
  if (pct < 85) return "#f59e0b";
  return "#ef4444";
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgents().then((data) => {
      setAgents(data);
      setLoading(false);
    });
  }, []);

  const chartData = agents.map((a) => ({
    name: a.name,
    spend: a.api_spend,
    budget: a.api_budget,
    pct: (a.api_spend / a.api_budget) * 100,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-sentinel-text-primary">Agent Budgets</h1>
        <p className="text-sm text-sentinel-text-secondary mt-1">
          Monitor AI agent API spending, performance, and availability
        </p>
      </div>

      {/* Agent Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card p-5 rounded-xl h-52 skeleton" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent) => {
              const spendPct = (agent.api_spend / agent.api_budget) * 100;
              const spendColor = getSpendColor(agent.api_spend, agent.api_budget);
              const status = statusConfig[agent.status];

              return (
                <div key={agent.id} className="glass-card p-5 rounded-xl">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-sentinel-blue/10">
                        <Bot className="w-5 h-5 text-sentinel-blue" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-sentinel-text-primary">{agent.name}</h3>
                        <p className="text-[10px] text-sentinel-text-secondary mt-0.5">{agent.model}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase tracking-wider font-semibold ${status.color} ${status.bg} ${status.border}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${status.dot} mr-1.5`} />
                      {agent.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-sentinel-text-secondary mb-4">{agent.description}</p>

                  {/* Spend Progress */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-sentinel-text-secondary flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        API Spend
                      </span>
                      <span className="text-xs text-sentinel-text-secondary">
                        <span className="metric-number text-sentinel-text-primary">${agent.api_spend.toLocaleString()}</span>
                        {" / "}${agent.api_budget.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-sentinel-surface overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(spendPct, 100)}%`,
                          background: spendColor,
                        }}
                      />
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-sentinel-text-secondary" />
                      <div>
                        <div className="metric-number text-sm text-sentinel-text-primary">
                          {agent.requests_today.toLocaleString()}
                        </div>
                        <div className="text-[9px] text-sentinel-text-secondary">Requests Today</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-sentinel-text-secondary" />
                      <div>
                        <div className="metric-number text-sm text-sentinel-text-primary">
                          {agent.avg_latency_ms}ms
                        </div>
                        <div className="text-[9px] text-sentinel-text-secondary">Avg Latency</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Spend Comparison Chart */}
          <div className="glass-card p-6 rounded-xl">
            <h3 className="text-lg font-semibold text-sentinel-text-primary mb-4">
              Spend Comparison
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.3)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(51,65,85,0.3)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: "rgba(30, 41, 59, 0.95)",
                      border: "1px solid rgba(51, 65, 85, 0.5)",
                      borderRadius: "8px",
                      color: "#f1f5f9",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, name: string) => [
                      `$${value.toLocaleString()}`,
                      name === "spend" ? "Current Spend" : "Budget",
                    ]}
                  />
                  <Bar dataKey="budget" fill="rgba(51, 65, 85, 0.4)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={getSpendColor(
                          agents[idx]?.api_spend || 0,
                          agents[idx]?.api_budget || 1
                        )}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[rgba(51,65,85,0.4)]" />
                <span className="text-[10px] text-sentinel-text-secondary">Budget</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-sentinel-green" />
                <span className="text-[10px] text-sentinel-text-secondary">&lt;60%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-sentinel-amber" />
                <span className="text-[10px] text-sentinel-text-secondary">60-85%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-sentinel-red" />
                <span className="text-[10px] text-sentinel-text-secondary">&gt;85%</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
