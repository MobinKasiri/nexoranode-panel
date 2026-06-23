"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { TablePagination } from "@/components/ui/TablePagination";
import { useTableQuery } from "@/hooks/useTableQuery";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

type ActivityRow = {
  id: number;
  admin_id: number;
  admin_name: string;
  action: string;
  action_label: string;
  target_type?: string;
  target_id?: string;
  details?: string;
  created_at: string;
};

type AdminOption = { id: number; username: string; full_name: string };

function ActivityContent() {
  const { admin } = useAuth();
  const { page, limit, queryString, setPage, setLimit, setParams, extras } = useTableQuery(["admin_id"]);
  const adminFilter = extras.admin_id || "";
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adminOptions, setAdminOptions] = useState<AdminOption[]>([]);

  useEffect(() => {
    if (admin?.is_superadmin) {
      api.get<{ items: AdminOption[] }>("/settings/admins").then((r) => setAdminOptions(r.items)).catch(() => {});
    }
  }, [admin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ items: ActivityRow[]; total: number }>(`/activity?${queryString}`);
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell>
      <PageHeader title="فعالیت‌ها" description="تاریخچه اقدامات مدیران در پنل" />

      {admin?.is_superadmin && (
        <div className="mb-4 max-w-xs">
          <label className="text-sm text-text-muted block mb-1">فیلتر مدیر</label>
          <select
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={adminFilter}
            onChange={(e) => setParams({ admin_id: e.target.value || null, page: 1 })}
          >
            <option value="">همه مدیران</option>
            {adminOptions.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.full_name || a.username}
              </option>
            ))}
          </select>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="فعالیتی ثبت نشده" description="اقدام مدیریتی جدیدی وجود ندارد" />
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>زمان</th>
                  <th>مدیر</th>
                  <th>عملیات</th>
                  <th>هدف</th>
                  <th>جزئیات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-text-secondary">{formatDate(row.created_at)}</td>
                    <td>{row.admin_name}</td>
                    <td>{row.action_label}</td>
                    <td className="font-latin text-xs">{row.target_id || "—"}</td>
                    <td className="text-text-muted text-xs max-w-[200px] truncate">{row.details || "—"}</td>
                  </tr>
                ))}
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
    </AppShell>
  );
}

export default function ActivityPage() {
  return (
    <Suspense fallback={<AppShell><Skeleton className="h-64" /></AppShell>}>
      <ActivityContent />
    </Suspense>
  );
}
