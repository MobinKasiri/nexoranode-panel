"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, RefreshCw, Shield } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TablePagination } from "@/components/ui/TablePagination";
import { ClientModal } from "@/components/configs/ClientModal";
import { useTableQuery } from "@/hooks/useTableQuery";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { formatBytes, formatDate, trafficBarColor, trafficPercent } from "@/lib/utils";
import { hasPermission as can } from "@/lib/permissions";
import type { VPNConfigItem } from "@/types";

function ConfigsContent() {
  const { admin } = useAuth();
  const canWrite = can(admin, "configs", "write");
  const { page, limit, queryString, setPage, setLimit } = useTableQuery();
  const [items, setItems] = useState<VPNConfigItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VPNConfigItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VPNConfigItem | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<{ items: VPNConfigItem[]; total: number }>(`/configs?${queryString}`)
      .then((d) => {
        setItems(d.items);
        setTotal(d.total);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "خطا"))
      .finally(() => setLoading(false));
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

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

  const openCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const openEdit = (c: VPNConfigItem) => {
    setEditTarget(c);
    setModalOpen(true);
  };

  return (
    <AppShell>
      <PageHeader
        title="مدیریت سرویس‌ها"
        description="مشاهده و مدیریت کانفیگ‌های VPN کاربران"
        actions={
          <div className="flex gap-2">
            {canWrite && (
              <Button onClick={openCreate} size="sm">
                <Plus size={16} className="ml-2" />
                افزودن
              </Button>
            )}
            {canWrite && (
              <Button onClick={syncAll} disabled={syncing} size="sm" variant="outline">
                <RefreshCw size={16} className={`ml-2 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "همگام‌سازی..." : "همگام‌سازی همه"}
              </Button>
            )}
          </div>
        }
      />

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="p-4 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Shield} title="سرویسی یافت نشد" description="هنوز کانفیگی ثبت نشده" />
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  {canWrite && <th>عملیات</th>}
                  <th>وضعیت</th>
                  <th>کلاینت</th>
                  <th>Inboundها</th>
                  <th>ترافیک</th>
                  <th>باقیمانده</th>
                  <th>مدت</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const pct = trafficPercent(c.traffic_used_bytes, c.traffic_limit_bytes);
                  const remaining = Math.max(0, c.traffic_limit_bytes - c.traffic_used_bytes);
                  return (
                    <tr key={c.id}>
                      {canWrite && (
                        <td>
                          <div className="flex gap-1 flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                              ویرایش
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => toggle(c.id)}>
                              {c.is_active ? "غیرفعال" : "فعال"}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteTarget(c)}>
                              حذف
                            </Button>
                          </div>
                        </td>
                      )}
                      <td>{c.is_active ? "فعال" : "غیرفعال"}</td>
                      <td>
                        <div className="font-medium font-latin">{c.service_name}</div>
                        <div className="text-xs text-text-muted">@{c.username || c.user_id}</div>
                      </td>
                      <td className="text-xs max-w-[160px] truncate">
                        {(c.inbound_remarks || []).join(", ") || "—"}
                      </td>
                      <td>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="h-2 flex-1 max-w-20 rounded-full bg-border overflow-hidden">
                            <div className={`h-full ${trafficBarColor(pct)}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-text-muted whitespace-nowrap font-latin">
                            {formatBytes(c.traffic_used_bytes)}
                          </span>
                        </div>
                      </td>
                      <td className="font-latin text-xs">{formatBytes(remaining)}</td>
                      <td className="text-text-secondary whitespace-nowrap text-xs">
                        {formatDate(c.expiry_date) || `${c.plan_days} روز`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TablePagination
              page={page}
              limit={limit}
              total={total}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </>
        )}
      </Card>

      <ClientModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        config={editTarget}
        onSaved={load}
        canWrite={canWrite}
      />

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
            <p>
              سرویس <strong>{deleteTarget.service_name}</strong> حذف می‌شود.
            </p>
          ) : null
        }
      />
    </AppShell>
  );
}

export default function ConfigsPage() {
  return (
    <Suspense fallback={<AppShell><Skeleton className="h-64" /></AppShell>}>
      <ConfigsContent />
    </Suspense>
  );
}
