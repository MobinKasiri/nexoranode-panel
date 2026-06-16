"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Shield } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { formatBytes, formatDate, toPersianDigits, trafficBarColor, trafficPercent } from "@/lib/utils";
import type { VPNConfigItem } from "@/types";

export default function ConfigsPage() {
  const [items, setItems] = useState<VPNConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: VPNConfigItem[] }>("/configs")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const syncAll = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ synced: number; total: number }>("/configs/sync-all");
      toast.success(`${toPersianDigits(r.synced)} از ${toPersianDigits(r.total)} همگام شد`);
      load();
    } finally {
      setSyncing(false);
    }
  };

  const toggle = async (id: number) => {
    await api.post(`/configs/${id}/toggle`);
    load();
  };

  const del = async (id: number) => {
    if (!confirm("آیا از حذف این سرویس مطمئن هستید؟")) return;
    await api.delete(`/configs/${id}`);
    toast.success("حذف شد");
    load();
  };

  return (
    <AppShell>
      <PageHeader
        title="مدیریت سرویس‌ها"
        description="مشاهده و همگام‌سازی کانفیگ‌های VPN کاربران"
        actions={
          <Button onClick={syncAll} disabled={syncing} size="sm">
            <RefreshCw size={16} className={`ml-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "همگام‌سازی..." : "همگام‌سازی همه"}
          </Button>
        }
      />

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="p-4 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Shield} title="سرویسی یافت نشد" description="هنوز کانفیگی ثبت نشده یا فیلتر نتیجه‌ای ندارد" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>نام</th>
                <th>کاربر</th>
                <th>مصرف</th>
                <th>انقضا</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const pct = trafficPercent(c.traffic_used_bytes, c.traffic_limit_bytes);
                return (
                  <tr key={c.id}>
                    <td className="font-medium">{c.service_name}</td>
                    <td className="text-text-secondary">@{c.username || c.user_id}</td>
                    <td>
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <div className="h-2 flex-1 max-w-24 rounded-full bg-border overflow-hidden">
                          <div className={`h-full ${trafficBarColor(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-text-muted whitespace-nowrap">
                          {formatBytes(c.traffic_used_bytes)}/{formatBytes(c.traffic_limit_bytes)}
                        </span>
                      </div>
                    </td>
                    <td className="text-text-secondary whitespace-nowrap">{formatDate(c.expiry_date)}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => toggle(c.id)}>
                          {c.is_active ? "غیرفعال" : "فعال"}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => del(c.id)}>
                          حذف
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  );
}
