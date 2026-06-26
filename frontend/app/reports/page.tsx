"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Receipt,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { BreakdownList } from "@/components/analytics/BreakdownList";
import { MetricCard } from "@/components/analytics/MetricCard";
import { PeriodSelector } from "@/components/analytics/PeriodSelector";
import { TrendAreaChart } from "@/components/analytics/TrendAreaChart";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { getReportRange, reportQueryString, type ReportPeriod } from "@/lib/report-range";
import { formatToman, toPersianDigits } from "@/lib/utils";
import type { BreakdownItem, ReportSummary, TimelinePoint, TopUserRow } from "@/types/reports";

export default function ReportsPage() {
  const initial = getReportRange("30d");
  const [period, setPeriod] = useState<ReportPeriod>("30d");
  const [customFrom, setCustomFrom] = useState(initial.from);
  const [customTo, setCustomTo] = useState(initial.to);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [plans, setPlans] = useState<BreakdownItem[]>([]);
  const [methods, setMethods] = useState<(BreakdownItem & { method: string })[]>([]);
  const [types, setTypes] = useState<(BreakdownItem & { type: string })[]>([]);
  const [topUsers, setTopUsers] = useState<TopUserRow[]>([]);

  const range = useMemo(
    () => getReportRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const query = reportQueryString(range.from, range.to);

  const handlePeriodChange = (next: ReportPeriod) => {
    setPeriod(next);
    if (next !== "custom") {
      const r = getReportRange(next);
      setCustomFrom(r.from);
      setCustomTo(r.to);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<ReportSummary>(`/reports/summary?${query}`),
      api.get<{ items: TimelinePoint[] }>(`/reports/charts/timeline?${query}`),
      api.get<{ items: BreakdownItem[] }>(`/reports/charts/plans?${query}`),
      api.get<{ items: (BreakdownItem & { method: string; label: string })[] }>(
        `/reports/charts/payment-methods?${query}`
      ),
      api.get<{ items: (BreakdownItem & { type: string; label: string })[] }>(
        `/reports/charts/types?${query}`
      ),
      api.get<{ items: TopUserRow[] }>(`/reports/charts/top-users?limit=10&${query}`),
    ])
      .then(([s, t, p, m, ty, u]) => {
        setSummary(s);
        setTimeline(t.items);
        setPlans(p.items);
        setMethods(m.items);
        setTypes(ty.items);
        setTopUsers(u.items);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "خطا در بارگذاری گزارش"))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const chartData = timeline.map((d) => ({
    label: d.date,
    primary: d.revenue,
    secondary: d.transactions,
  }));

  const exportExcel = () => {
    window.open(`/api/reports/export?${query}`, "_blank");
  };

  return (
    <AppShell>
      <PageHeader
        title="گزارش‌ها"
        description="تحلیل مالی، روند فروش و عملکرد کاربران"
        actions={
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={loading}>
            <Download size={16} className="ml-2" />
            خروجی Excel
          </Button>
        }
      />

      <div className="mb-6">
        <PeriodSelector
          period={period}
          onPeriodChange={handlePeriodChange}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      </div>

      {loading ? (
        <ReportsSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            <MetricCard
              icon={TrendingUp}
              label="درآمد کل بازه"
              value={formatToman(summary?.total_revenue || 0)}
              hint={
                summary?.is_today_in_range
                  ? `امروز: ${formatToman(summary.today_revenue)}`
                  : `میانگین روزانه: ${formatToman(summary?.avg_daily || 0)}`
              }
              accent="primary"
            />
            <MetricCard
              icon={Receipt}
              label="تراکنش‌های تایید شده"
              value={toPersianDigits(summary?.transaction_count || 0)}
              hint={`میانگین هر تراکنش: ${formatToman(summary?.avg_ticket || 0)}`}
              accent="info"
            />
            <MetricCard
              icon={UserPlus}
              label="کاربران جدید"
              value={`${toPersianDigits(summary?.new_users || 0)} نفر`}
              accent="success"
            />
            <MetricCard
              icon={ArrowUpRight}
              label="نرخ تایید"
              value={`${toPersianDigits(summary?.confirmation_rate || 0)}٪`}
              hint={`${toPersianDigits(summary?.pending_count || 0)} در انتظار`}
              accent="success"
            />
            <MetricCard
              icon={ArrowDownLeft}
              label="رد شده"
              value={formatToman(summary?.rejected_amount || 0)}
              hint={`${toPersianDigits(summary?.rejected_count || 0)} تراکنش`}
              accent="danger"
            />
            <MetricCard
              icon={Wallet}
              label="میانگین روزانه"
              value={formatToman(summary?.avg_daily || 0)}
              hint={
                summary
                  ? `${toPersianDigits(summary.from_date)} — ${toPersianDigits(summary.to_date)}`
                  : undefined
              }
              accent="warning"
            />
          </div>

          <Card className="mb-6">
            <CardTitle className="mb-1">روند درآمد</CardTitle>
            <p className="text-xs text-text-muted mb-4">درآمد روزانه و تعداد تراکنش‌های تایید شده</p>
            {timeline.length === 0 ? (
              <EmptyState title="داده‌ای در این بازه نیست" description="بازه زمانی را تغییر دهید" />
            ) : (
              <TrendAreaChart
                data={chartData}
                primaryLabel="درآمد"
                secondaryLabel="تراکنش"
                height={300}
              />
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardTitle className="mb-4">فروش بر اساس پلن</CardTitle>
              <BreakdownList
                items={plans.map((p) => ({
                  key: p.label,
                  label: p.label,
                  value: p.revenue,
                  sublabel: `${toPersianDigits(p.count)} فروش`,
                }))}
                emptyLabel="فروشی ثبت نشده"
              />
            </Card>
            <Card>
              <CardTitle className="mb-4">روش پرداخت</CardTitle>
              <BreakdownList
                items={methods.map((m) => ({
                  key: m.method,
                  label: m.label || m.method,
                  value: m.revenue,
                  sublabel: `${toPersianDigits(m.count)} تراکنش`,
                }))}
                emptyLabel="تراکنشی ثبت نشده"
              />
            </Card>
            <Card>
              <CardTitle className="mb-4">نوع تراکنش</CardTitle>
              <BreakdownList
                items={types.map((t) => ({
                  key: t.type,
                  label: t.label || t.type,
                  value: t.revenue,
                  sublabel: `${toPersianDigits(t.count)} مورد`,
                }))}
                emptyLabel="تراکنشی ثبت نشده"
              />
            </Card>
          </div>

          <Card className="overflow-x-auto p-0">
            <div className="p-4 border-b border-border/60">
              <CardTitle>برترین مشتریان</CardTitle>
              <p className="text-xs text-text-muted mt-1">بر اساس مجموع پرداخت در بازه انتخابی</p>
            </div>
            {topUsers.length === 0 ? (
              <EmptyState icon={Users} title="مشتری برتری نیست" />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>کاربر</th>
                    <th>تراکنش</th>
                    <th>مجموع پرداخت</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {topUsers.map((u, i) => (
                    <tr key={u.user_id}>
                      <td className="text-text-muted">{toPersianDigits(i + 1)}</td>
                      <td>
                        <div className="font-medium">{u.full_name || u.username || "—"}</div>
                        {u.username && (
                          <div className="text-xs text-text-muted font-latin">@{u.username}</div>
                        )}
                      </td>
                      <td>{toPersianDigits(u.transaction_count)}</td>
                      <td className="font-semibold">{formatToman(u.total)}</td>
                      <td>
                        <Link
                          href={`/users/${u.user_id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          مشاهده
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
