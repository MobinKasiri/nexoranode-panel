"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Shield, TrendingUp, Clock } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatToman, toPersianDigits } from "@/lib/utils";
import type { DashboardStats, ServerHealth } from "@/types";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

function StatsCard({ icon: Icon, label, value, sub, color, href }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string; href?: string;
}) {
  const content = (
    <Card className={`${href ? "cursor-pointer hover:bg-surface-hover transition-colors" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-text-muted text-sm">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-text-secondary mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}><Icon size={20} /></div>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chart, setChart] = useState<{ date: string; revenue: number; new_users: number }[]>([]);
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [activity, setActivity] = useState<{ type: string; text: string; at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<DashboardStats>("/dashboard/stats"),
      api.get<{ items: typeof chart }>("/dashboard/revenue-chart?days=30"),
      api.get<ServerHealth>("/server/health"),
      api.get<{ items: typeof activity }>("/dashboard/activity"),
    ]).then(([s, c, h, a]) => {
      setStats(s); setChart(c.items); setHealth(h); setActivity(a.items);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      api.get<ServerHealth>("/server/health").then(setHealth).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-6">داشبورد</h1>

      {stats && stats.pending_payments > 0 && (
        <Link href="/transactions?status=pending">
          <div className="mb-4 rounded-xl border border-warning/50 bg-warning/10 p-4 text-warning text-sm">
            ⚠️ {toPersianDigits(stats.pending_payments)} پرداخت در انتظار تایید — مشاهده و تایید ←
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatsCard icon={Users} label="کل کاربران" value={`${toPersianDigits(stats?.total_users || 0)} نفر`}
          sub={`+${toPersianDigits(stats?.today_users || 0)} امروز`} color="bg-info/20 text-info" />
        <StatsCard icon={Shield} label="سرویس‌های فعال" value={`${toPersianDigits(stats?.active_configs || 0)} سرویس`}
          color="bg-success/20 text-success" />
        <StatsCard icon={TrendingUp} label="درآمد امروز" value={formatToman(stats?.today_revenue || 0)}
          sub={stats?.revenue_change_pct ? `${toPersianDigits(stats.revenue_change_pct)}% نسبت به دیروز` : undefined}
          color="bg-primary/20 text-primary" />
        <StatsCard icon={Clock} label="پرداخت‌های معلق" value={`${toPersianDigits(stats?.pending_payments || 0)} در انتظار`}
          sub="کلیک برای مدیریت →" color="bg-warning/20 text-warning" href="/transactions?status=pending" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <Card className="xl:col-span-2">
          <CardTitle className="mb-4">درآمد ۳۰ روز اخیر</CardTitle>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3e" }} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="درآمد" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="new_users" name="کاربر جدید" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardTitle className="mb-4">وضعیت سرور</CardTitle>
          {health && (
            <div className="space-y-4 text-sm">
              <Bar label="CPU" pct={health.cpu_percent} warn={health.cpu_percent > 80} />
              <Bar label="RAM" pct={health.ram_percent} />
              <div className="flex justify-between"><span className="text-text-muted">Xray</span>
                <span className={health.xray_status === "running" ? "text-success" : "text-danger"}>
                  {health.xray_status === "running" ? "● در حال اجرا" : "● متوقف"}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-text-muted">آپتایم</span><span>{health.uptime}</span></div>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardTitle>فعالیت اخیر</CardTitle>
          <Link href="/activity" className="text-sm text-primary hover:underline">مشاهده همه</Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-text-muted text-sm">فعالیتی ثبت نشده</p>
        ) : (
          <ul className="space-y-2">
            {activity.map((e, i) => (
              <li key={i} className="text-sm text-text-secondary border-b border-border/50 pb-2 last:border-0">{e.text}</li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}

function Bar({ label, pct, warn }: { label: string; pct: number; warn?: boolean }) {
  return (
    <div>
      <div className="flex justify-between mb-1"><span className="text-text-muted">{label}</span><span className={warn ? "text-danger" : ""}>{toPersianDigits(pct.toFixed(0))}%</span></div>
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${warn ? "bg-danger" : "bg-primary"}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
