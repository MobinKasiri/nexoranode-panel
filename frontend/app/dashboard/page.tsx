"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Clock, Server, Shield, TrendingUp, Users } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/analytics/MetricCard";
import { ResourceGauge, StatusPill } from "@/components/analytics/ResourceGauge";
import { TrendAreaChart } from "@/components/analytics/TrendAreaChart";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterChips } from "@/components/ui/filter-chips";
import { api } from "@/lib/api";
import { formatToman, toPersianDigits } from "@/lib/utils";
import type { DashboardStats, ServerHealth } from "@/types";

const CHART_PERIODS = [
  { key: "7", label: "۷ روز" },
  { key: "14", label: "۱۴ روز" },
  { key: "30", label: "۳۰ روز" },
  { key: "90", label: "۹۰ روز" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartDays, setChartDays] = useState("30");
  const [chart, setChart] = useState<{ date: string; revenue: number; transactions: number; new_users: number }[]>([]);
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [activity, setActivity] = useState<{ type: string; text: string; at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<DashboardStats>("/dashboard/stats"),
      api.get<ServerHealth>("/server/health"),
      api.get<{ items: typeof activity }>("/dashboard/activity"),
    ])
      .then(([s, h, a]) => {
        setStats(s);
        setHealth(h);
        setActivity(a.items);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setChartLoading(true);
    api
      .get<{ items: typeof chart }>(`/dashboard/revenue-chart?days=${chartDays}`)
      .then((c) => setChart(c.items))
      .finally(() => setChartLoading(false));
  }, [chartDays]);

  useEffect(() => {
    const t = setInterval(() => {
      api.get<ServerHealth>("/server/health").then(setHealth).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const chartData = chart.map((d) => ({
    label: d.date,
    primary: d.revenue,
    secondary: d.new_users,
  }));

  if (loading) {
    return (
      <AppShell>
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="داشبورد" description="نمای کلی عملکرد ربات و وضعیت سرور" />

      {stats && stats.pending_payments > 0 && (
        <Link href="/transactions?status=pending">
          <div className="mb-4 rounded-xl border border-warning/50 bg-warning/10 p-4 text-warning text-sm hover:bg-warning/15 transition-colors">
            {toPersianDigits(stats.pending_payments)} پرداخت در انتظار تایید — مشاهده و تایید
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={Users}
          label="کل کاربران"
          value={`${toPersianDigits(stats?.total_users || 0)} نفر`}
          hint={`+${toPersianDigits(stats?.today_users || 0)} امروز`}
          trend={stats?.users_change}
          trendLabel={
            stats?.users_change != null
              ? `${stats.users_change >= 0 ? "+" : ""}${toPersianDigits(stats.users_change)} نسبت به دیروز`
              : undefined
          }
          accent="info"
        />
        <MetricCard
          icon={Shield}
          label="سرویس‌های فعال"
          value={`${toPersianDigits(stats?.active_configs || 0)} سرویس`}
          accent="success"
        />
        <MetricCard
          icon={TrendingUp}
          label="درآمد امروز"
          value={formatToman(stats?.today_revenue || 0)}
          trend={stats?.revenue_change_pct}
          trendLabel={
            stats?.revenue_change_pct != null
              ? `${toPersianDigits(Math.abs(stats.revenue_change_pct))}% نسبت به دیروز`
              : undefined
          }
          accent="primary"
        />
        <Link href="/transactions?status=pending">
          <MetricCard
            icon={Clock}
            label="پرداخت‌های معلق"
            value={`${toPersianDigits(stats?.pending_payments || 0)} مورد`}
            hint="کلیک برای مدیریت"
            accent="warning"
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <Card className="xl:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <CardTitle>روند درآمد</CardTitle>
              <p className="text-xs text-text-muted mt-1">درآمد روزانه و کاربران جدید</p>
            </div>
            <FilterChips options={CHART_PERIODS} value={chartDays} onChange={setChartDays} />
          </div>
          {chartLoading ? (
            <Skeleton className="h-[280px]" />
          ) : (
            <TrendAreaChart
              data={chartData}
              primaryLabel="درآمد"
              secondaryLabel="کاربر جدید"
              height={280}
            />
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Server size={18} className="text-primary" />
            <CardTitle>وضعیت سرور</CardTitle>
          </div>
          {health ? (
            <div className="space-y-3">
              <ResourceGauge label="CPU" value={health.cpu_percent} />
              <ResourceGauge
                label="RAM"
                value={health.ram_percent}
                detail={
                  health.ram_used_gb != null && health.ram_total_gb != null
                    ? `${toPersianDigits(health.ram_used_gb.toFixed(1))} / ${toPersianDigits(health.ram_total_gb.toFixed(1))} GB`
                    : undefined
                }
              />
              {health.disk_percent != null && health.disk_percent > 0 && (
                <ResourceGauge label="دیسک" value={health.disk_percent} warnAt={75} />
              )}
              <StatusPill
                label="Xray"
                ok={health.xray_status === "running"}
                detail={health.uptime ? `آپتایم: ${health.uptime}` : undefined}
              />
              {health.active_connections != null && health.active_connections > 0 && (
                <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2.5 flex justify-between text-sm">
                  <span className="text-text-muted">اتصال فعال</span>
                  <span className="font-medium">{toPersianDigits(health.active_connections)}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-text-muted text-sm">اطلاعات سرور در دسترس نیست</p>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-primary" />
            <CardTitle>فعالیت اخیر</CardTitle>
          </div>
          <Link href="/activity" className="text-sm text-primary hover:underline">
            مشاهده همه
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-text-muted text-sm">فعالیتی ثبت نشده</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {activity.map((e, i) => (
              <li key={i} className="py-3 text-sm text-text-secondary first:pt-0 last:pb-0">
                {e.text}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
