"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Clock, ShieldAlert, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { cn, formatDate, toPersianDigits } from "@/lib/utils";

type ActivityItem = {
  type: string;
  text: string;
  at: string;
  created_at?: string;
};

const TYPE_META: Record<string, { label: string; status: "confirmed" | "pending" | "rejected"; icon: typeof Bell }> = {
  approved: { label: "تایید", status: "confirmed", icon: CheckCircle2 },
  pending: { label: "در انتظار", status: "pending", icon: Clock },
  rejected: { label: "رد شده", status: "rejected", icon: XCircle },
  audit: { label: "مدیریت", status: "pending", icon: ShieldAlert },
};

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ items: ActivityItem[] }>("/dashboard/activity?limit=50")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <PageHeader title="فعالیت‌ها" description="رویدادهای اخیر پرداخت و اقدامات مدیران" />

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="فعالیتی ثبت نشده" description="تراکنش یا اقدام مدیریتی جدیدی وجود ندارد" />
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item, i) => {
              const meta = TYPE_META[item.type] || TYPE_META.audit;
              const Icon = meta.icon;
              const when = item.at || item.created_at;
              return (
                <li key={`${item.type}-${when}-${i}`} className="flex items-start gap-3 p-4 hover:bg-surface-hover/50">
                  <div className={cn("mt-0.5 p-2 rounded-lg bg-background border border-border/60")}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge status={meta.status}>{meta.label}</Badge>
                      {when && (
                        <span className="text-xs text-text-muted">{formatDate(when)}</span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary">{item.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {!loading && items.length > 0 && (
        <p className="text-xs text-text-muted mt-4 text-center">
          {toPersianDigits(items.length)} رویداد اخیر
        </p>
      )}
    </AppShell>
  );
}
