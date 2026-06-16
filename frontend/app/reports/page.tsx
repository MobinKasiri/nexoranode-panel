"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/Sidebar";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatToman } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

export default function ReportsPage() {
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [plans, setPlans] = useState<{ label: string; count: number }[]>([]);
  const [methods, setMethods] = useState<{ method: string; count: number }[]>([]);
  const [topUsers, setTopUsers] = useState<{ full_name: string; total: number }[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<Record<string, number>>("/reports/summary"),
      api.get<{ items: { label: string; count: number }[] }>("/reports/charts/plans"),
      api.get<{ items: { method: string; count: number }[] }>("/reports/charts/payment-methods"),
      api.get<{ items: { full_name: string; total: number }[] }>("/reports/charts/top-users"),
    ]).then(([s, p, m, t]) => {
      setSummary(s);
      setPlans(p.items);
      setMethods(m.items);
      setTopUsers(t.items);
    });
  }, []);

  return (
    <AppShell>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">گزارش مالی</h1>
        <Button variant="outline" onClick={() => window.open("/api/reports/export", "_blank")}>📥 Excel</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="درآمد این ماه" value={formatToman(summary?.month_revenue || 0)} />
        <StatCard label="درآمد امروز" value={formatToman(summary?.today_revenue || 0)} />
        <StatCard label="میانگین روزانه" value={formatToman(summary?.avg_daily || 0)} />
        <StatCard label="رد شده" value={formatToman(summary?.rejected_amount || 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardTitle className="mb-4">فروش بر اساس پلن</CardTitle>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={plans} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                {plans.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3e" }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <CardTitle className="mb-4">روش پرداخت</CardTitle>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={methods} dataKey="count" nameKey="method" cx="50%" cy="50%" outerRadius={80} label>
                {methods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle className="mb-4">برترین کاربران</CardTitle>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topUsers} layout="vertical">
              <XAxis type="number" tick={{ fill: "#94a3b8" }} />
              <YAxis type="category" dataKey="full_name" width={100} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3e" }} />
              <Bar dataKey="total" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <Card><p className="text-text-muted text-sm">{label}</p><p className="text-xl font-bold mt-1">{value}</p></Card>;
}
