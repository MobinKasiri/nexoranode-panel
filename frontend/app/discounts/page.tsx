"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Download, Tag, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpiryDateField } from "@/components/discounts/ExpiryDateField";
import { TablePagination } from "@/components/ui/TablePagination";
import { useTableQuery } from "@/hooks/useTableQuery";
import { api } from "@/lib/api";
import { cn, discountStatusLabel, formatDate, formatToman, toPersianDigits } from "@/lib/utils";

interface DiscountItem {
  id: number;
  code: string;
  discount_percent?: number;
  discount_amount?: number;
  used_count: number;
  max_uses: number;
  expires_at?: string;
  is_active: boolean;
  status: string;
}

interface UsageRow {
  user_id: number;
  username?: string;
  full_name?: string;
  used_at: string;
  order_amount?: number | null;
}

export default function DiscountsPage() {
  return (
    <Suspense fallback={<AppShell><Skeleton className="h-64" /></AppShell>}>
      <DiscountsContent />
    </Suspense>
  );
}

function DiscountsContent() {
  const { page, limit, queryString, setPage, setLimit } = useTableQuery();
  const [items, setItems] = useState<DiscountItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(true);
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("100");
  const [expiresAt, setExpiresAt] = useState("");
  const [formError, setFormError] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    code: string;
    status: string;
    expires_at?: string;
    discount_percent?: number;
    discount_amount?: number;
    items: UsageRow[];
    total: number;
    page: number;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [usagePage, setUsagePage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<{ items: DiscountItem[]; total: number }>(`/discounts?${queryString}`)
      .then((d) => {
        setItems(d.items);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  }, [queryString]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = (id: number, page = 1) => {
    setDetailLoading(true);
    api
      .get<typeof detail & { items: UsageRow[] }>(`/discounts/${id}/stats?page=${page}&limit=20`)
      .then((d) => setDetail(d as NonNullable<typeof detail>))
      .finally(() => setDetailLoading(false));
  };

  useEffect(() => {
    if (detailId) loadDetail(detailId, usagePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, usagePage]);

  const randomCode = async () => {
    const r = await api.get<{ code: string }>("/discounts/random");
    setCode(r.code);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    const num = parseInt(value, 10);
    if (!code.trim()) {
      setFormError("کد تخفیف الزامی است");
      return;
    }
    if (!num || num < 1) {
      setFormError("مقدار تخفیف معتبر وارد کنید");
      return;
    }
    try {
      await api.post("/discounts", {
        code,
        discount_percent: percent ? num : null,
        discount_amount: percent ? null : num,
        max_uses: parseInt(maxUses, 10),
        expires_at: expiresAt || null,
      });
      toast.success("کد تخفیف ایجاد شد");
      setCode("");
      setValue("");
      setExpiresAt("");
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "خطا");
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/discounts/${deleteId}`);
      toast.success("کد تخفیف غیرفعال شد");
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا");
    } finally {
      setDeleting(false);
    }
  };

  const exportCsv = () => {
    if (!detail?.items.length) return;
    const header = "user_id,username,used_at,order_amount\n";
    const rows = detail.items
      .map((u) => `${u.user_id},${u.username || ""},${u.used_at},${u.order_amount ?? ""}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `discount-${detail.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewValue = percent
    ? value ? `${toPersianDigits(value)}٪ تخفیف` : "—"
    : value ? formatToman(parseInt(value, 10) || 0) : "—";

  return (
    <AppShell>
      <PageHeader
        title="کدهای تخفیف"
        description="ایجاد و مدیریت کدهای تخفیف"
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? <ChevronUp size={16} className="ml-2" /> : <ChevronDown size={16} className="ml-2" />}
            {showForm ? "بستن فرم" : "کد جدید"}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardTitle className="mb-4">ایجاد کد تخفیف</CardTitle>
          <form onSubmit={create} className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-text-muted block mb-1.5">نوع تخفیف</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={percent} onChange={() => setPercent(true)} />
                    درصدی
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!percent} onChange={() => setPercent(false)} />
                    مبلغ ثابت
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">کد</label>
                <div className="flex gap-2">
                  <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required className="font-latin" />
                  <Button type="button" variant="outline" onClick={randomCode}>تصادفی</Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">{percent ? "درصد" : "مبلغ (تومان)"}</label>
                <Input type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} required className="font-latin" />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">حداکثر استفاده (هر کاربر یک‌بار — توسط ربات)</label>
                <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="font-latin" />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">تاریخ انقضا</label>
                <ExpiryDateField value={expiresAt} onChange={setExpiresAt} />
              </div>
              {formError && <p className="text-danger text-sm">{formError}</p>}
              <Button type="submit">ایجاد</Button>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-xs text-text-muted mb-2">پیش‌نمایش</p>
              <p className="font-latin font-bold text-lg">{code || "CODE"}</p>
              <p className="text-primary mt-1">{previewValue}</p>
              <p className="text-text-muted text-sm mt-2">حداکثر {maxUses ? toPersianDigits(maxUses) : "—"} بار</p>
              <p className="text-text-muted text-sm">{expiresAt ? `تا ${formatDate(expiresAt)}` : "بدون انقضا"}</p>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Tag} title="کد تخفیفی وجود ندارد" description="با دکمه بالا اولین کد را بسازید" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>کد</th>
                <th>نوع</th>
                <th>استفاده</th>
                <th>انقضا</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const inactive = c.status !== "active";
                return (
                  <tr
                    key={c.id}
                    className={cn("cursor-pointer", inactive && "opacity-50")}
                    onClick={() => { setDetailId(c.id); setUsagePage(1); }}
                  >
                    <td className="font-latin font-medium">{c.code}</td>
                    <td>
                      {c.discount_percent ? `${toPersianDigits(c.discount_percent)}٪` : formatToman(c.discount_amount || 0)}
                    </td>
                    <td>{toPersianDigits(c.used_count)} / {toPersianDigits(c.max_uses)}</td>
                    <td className="text-text-secondary whitespace-nowrap">{c.expires_at ? formatDate(c.expires_at) : "—"}</td>
                    <td>
                      <Badge status={c.status === "active" ? "confirmed" : "rejected"}>
                        {discountStatusLabel(c.status)}
                      </Badge>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:text-danger"
                        disabled={inactive}
                        title={inactive ? "کدهای منقضی/غیرفعال قابل حذف مجدد نیستند" : "غیرفعال‌سازی"}
                        onClick={() => setDeleteId(c.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && items.length > 0 && (
          <TablePagination
            page={page}
            limit={limit}
            total={total}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        )}
      </Card>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="غیرفعال‌سازی کد تخفیف"
        destructive
        confirmLabel="غیرفعال"
        loading={deleting}
        onConfirm={confirmDelete}
        description={<p>این کد دیگر توسط ربات پذیرفته نمی‌شود.</p>}
      />

      <Modal
        open={detailId !== null}
        onOpenChange={(o) => { if (!o) { setDetailId(null); setDetail(null); } }}
        title={detail ? `کد: ${detail.code}` : "جزئیات کد تخفیف"}
        className="max-w-2xl"
      >
        {detailLoading || !detail ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>وضعیت: <Badge status={detail.status === "active" ? "confirmed" : "rejected"}>{discountStatusLabel(detail.status)}</Badge></div>
              <div>انقضا: {detail.expires_at ? formatDate(detail.expires_at) : "—"}</div>
            </div>
            <div className="flex justify-between items-center">
              <h3 className="font-medium">استفاده‌ها ({toPersianDigits(detail.total)})</h3>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!detail.items.length}>
                <Download size={14} className="ml-1" /> CSV
              </Button>
            </div>
            <table className="data-table text-sm">
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>تاریخ</th>
                  <th>مبلغ سفارش</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((u) => (
                  <tr key={`${u.user_id}-${u.used_at}`}>
                    <td>@{u.username || u.user_id}</td>
                    <td>{formatDate(u.used_at)}</td>
                    <td>{u.order_amount != null ? formatToman(u.order_amount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.total > 20 && (
              <div className="flex gap-2 justify-center">
                <Button size="sm" variant="outline" disabled={usagePage <= 1} onClick={() => setUsagePage((p) => p - 1)}>قبلی</Button>
                <span className="text-sm self-center">صفحه {toPersianDigits(usagePage)}</span>
                <Button size="sm" variant="outline" disabled={usagePage * 20 >= detail.total} onClick={() => setUsagePage((p) => p + 1)}>بعدی</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
