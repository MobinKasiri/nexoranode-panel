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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { formatBytes, formatDate, trafficBarColor, trafficPercent } from "@/lib/utils";
import type { VPNConfigItem } from "@/types";

export default function ConfigsPage() {
  const [items, setItems] = useState<VPNConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VPNConfigItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: VPNConfigItem[] }>("/configs")
      .then((d) => setItems(d.items))
      .catch((e) => toast.error(e instanceof Error ? e.message : "خطا"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const syncAll = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ synced: number; total: number; failed?: { id: number; reason: string }[] }>(
        "/configs/sync-all"
      );
      const failNote = r.failed?.length ? ` (${r.failed.length} خطا)` : "";
      toast.success(`${r.synced} از ${r.total} همگام شد${failNote}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در همگام‌سازی");
    } finally {
      setSyncing(false);
    }
  };

  const toggle = async (id: number) => {
    try {
      await api.post(`/configs/${id}/toggle`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/configs/${deleteTarget.id}`);
      toast.success("حذف در صف قرار گرفت — چند ثانیه صبر کنید");
      setDeleteTarget(null);
      setTimeout(load, 6000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در حذف");
    } finally {
      setDeleting(false);
    }
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
                        <Button size="sm" variant="danger" onClick={() => setDeleteTarget(c)}>
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="حذف سرویس"
        destructive
        confirmLabel="حذف"
        loading={deleting}
        onConfirm={confirmDelete}
        description={
          deleteTarget ? (
            <>
              <p>
                سرویس <strong>{deleteTarget.service_name}</strong> برای کاربر{" "}
                <strong>@{deleteTarget.username || deleteTarget.user_id}</strong> حذف می‌شود.
              </p>
              <p className="text-text-muted text-xs mt-2">
                پلن: {deleteTarget.plan_gb} GB · {deleteTarget.plan_days} روز · مصرف{" "}
                {formatBytes(deleteTarget.traffic_used_bytes)}
              </p>
            </>
          ) : null
        }
      />
    </AppShell>
  );
}
