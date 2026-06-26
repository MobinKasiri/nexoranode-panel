"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, Check, X, Download, Search, Receipt, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { TablePagination } from "@/components/ui/TablePagination";
import { useDebounce } from "@/hooks/use-debounce";
import { useFilterPageReset } from "@/hooks/useFilterPageReset";
import { useTableQuery } from "@/hooks/useTableQuery";
import { api } from "@/lib/api";
import { ReceiptImage } from "@/components/transactions/ReceiptImage";
import { formatDate, formatToman, toPersianDigits } from "@/lib/utils";
import type { Transaction } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";

const STATUS_FILTERS = [
  { key: "", label: "همه" },
  { key: "pending", label: "در انتظار" },
  { key: "confirmed", label: "تایید شده" },
  { key: "rejected", label: "رد شده" },
];

const SCOPE_FILTERS = [
  { key: "payments", label: "پرداخت خارجی" },
  { key: "all", label: "همه تراکنش‌ها" },
];

const TYPE_LABELS: Record<string, string> = {
  purchase: "خرید سرویس",
  wallet_topup: "شارژ کیف پول",
  renewal: "تمدید",
  referral: "پاداش معرف",
  refund: "استرداد",
  admin_credit: "اعتبار مدیر",
};

function txTypeLabel(tx: Transaction): string {
  if (tx.plan) {
    return `${toPersianDigits(tx.plan.gb)} گیگ / ${toPersianDigits(tx.plan.days)} روز`;
  }
  return TYPE_LABELS[tx.type] || tx.type;
}

function txMethodLabel(tx: Transaction): string {
  if (tx.payment_method === "card") return "کارت";
  if (tx.payment_method === "wallet") return "کیف پول (داخلی)";
  return "—";
}

const PROCESSED_ACTION_LABELS: Record<string, string> = {
  approved: "تایید شده",
  rejected: "رد شده",
};

const PROCESSED_SOURCE_LABELS: Record<string, string> = {
  telegram: "ربات تلگرام",
  panel: "پنل مدیریت",
};

function TransactionsContent() {
  const { admin } = useAuth();
  const canWrite = hasPermission(admin, "transactions", "write");
  const searchParams = useSearchParams();
  const { page, limit, queryString, setPage, setLimit, setParams } = useTableQuery(["status", "search", "scope"]);
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [scope, setScope] = useState(searchParams.get("scope") || "payments");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const debouncedSearch = useDebounce(search);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [lightbox, setLightbox] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(queryString);
      if (status) params.set("status", status);
      if (scope) params.set("scope", scope);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const data = await api.get<{ items: Transaction[]; total: number; pending_count: number }>(
        `/transactions?${params}`
      );
      setItems(data.items);
      setTotal(data.total);
      setPendingCount(data.pending_count);
    } catch {
      toast.error("خطا در بارگذاری تراکنش‌ها");
    } finally {
      setLoading(false);
    }
  }, [status, scope, debouncedSearch, queryString]);

  useFilterPageReset({ status, scope, search: debouncedSearch }, setParams);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (status !== "pending") return;
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [status, load]);

  useEffect(() => {
    const txId = selected?.id;
    if (!txId || detail?.status !== "pending") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const st = await api.get<{ id: number; status: string }>(`/transactions/${txId}/status`);
        if (cancelled || st.status === "pending") return;

        toast("این تراکنش توسط مدیر دیگری پردازش شد.");
        const d = await api.get<Transaction>(`/transactions/${txId}`);
        if (!cancelled) {
          setDetail(d);
          setSelected(d);
          load();
        }
      } catch {
        /* ignore transient poll errors */
      }
    };

    const timer = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected?.id, detail?.status, load]);

  const closePanel = () => {
    setSelected(null);
    setDetail(null);
    setDetailLoading(false);
  };

  const openDetail = async (tx: Transaction) => {
    setSelected(tx);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await api.get<Transaction>(`/transactions/${tx.id}`);
      setDetail(d);
    } catch {
      setDetail(tx);
    } finally {
      setDetailLoading(false);
    }
  };

  const approve = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api.post(`/transactions/${selected.id}/approve`);
      toast.success("تراکنش تایید شد");
      setShowApprove(false);
      closePanel();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setActionLoading(false);
    }
  };

  const reject = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api.post(`/transactions/${selected.id}/reject`, { reason: rejectReason });
      toast.success("تراکنش رد شد");
      setShowReject(false);
      setRejectReason("");
      closePanel();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setActionLoading(false);
    }
  };

  const filterOptions = STATUS_FILTERS.map((f) =>
    f.key === "pending" ? { ...f, badge: pendingCount } : f
  );

  return (
    <AppShell>
      <PageHeader
        title="تراکنش‌ها"
        description={
          scope === "all"
            ? "تمام تراکنش‌ها شامل خرید با کیف پول (داخلی)"
            : "پرداخت‌های کارت به کارت و شارژ کیف پول — خرید با موجودی کیف پول نمایش داده نمی‌شود"
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => api.exportTransactions(status || undefined, scope)}>
            <Download size={16} className="ml-2" /> خروجی Excel
          </Button>
        }
      />

      <div className="space-y-4 mb-6">
        <FilterChips options={SCOPE_FILTERS} value={scope} onChange={setScope} />
        <FilterChips options={filterOptions} value={status} onChange={setStatus} />
        <div className="search-input-wrap max-w-md">
          <Search size={16} />
          <Input
            placeholder="جستجو بر اساس نام، یوزرنیم یا آیدی..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="p-4 space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Receipt} title="تراکنشی یافت نشد" description="فیلترها را تغییر دهید یا جستجو را پاک کنید" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>کاربر</th>
                <th>نوع</th>
                <th>مبلغ</th>
                <th>روش</th>
                <th>زمان</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((tx) => (
                <tr key={tx.id} className="cursor-pointer" onClick={() => openDetail(tx)}>
                  <td>{toPersianDigits(tx.id)}</td>
                  <td>
                    <div className="font-medium">{tx.user?.full_name || "—"}</div>
                    <div className="text-text-muted text-xs">@{tx.user?.username || tx.user_id}</div>
                  </td>
                  <td>
                    <div>{txTypeLabel(tx)}</div>
                    {tx.payment_method === "wallet" && (
                      <span className="text-[10px] text-text-muted">حرکت داخلی کیف پول</span>
                    )}
                  </td>
                  <td className="font-medium">{formatToman(tx.payment_amount || tx.amount)}</td>
                  <td>{txMethodLabel(tx)}</td>
                  <td className="text-text-secondary whitespace-nowrap">{formatDate(tx.created_at)}</td>
                  <td><Badge status={tx.status} /></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label="مشاهده" onClick={() => openDetail(tx)}>
                        <Eye size={16} />
                      </Button>
                      {tx.status === "pending" && canWrite && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-success"
                            aria-label="تایید"
                            onClick={() => { setSelected(tx); setShowApprove(true); }}
                          >
                            <Check size={16} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-danger"
                            aria-label="رد"
                            onClick={() => { setSelected(tx); setShowReject(true); }}
                          >
                            <X size={16} />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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

      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={closePanel} aria-hidden />
          <div className="panel-slide">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-4 border-b border-border bg-surface/95 backdrop-blur">
              <h2 className="text-lg font-bold">
                تراکنش #<CopyableValue value={selected.id} />
              </h2>
              <button
                type="button"
                onClick={closePanel}
                className="p-2 rounded-lg hover:bg-surface-hover text-text-muted"
                aria-label="بستن"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-6">
              {detailLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              ) : detail ? (
                <div className="space-y-6 text-sm">
                  <Section title="اطلاعات کاربر">
                    <DetailRow label="نام" value={detail.user?.full_name} />
                    <DetailRow label="یوزرنیم" value={detail.user?.username ? `@${detail.user.username}` : "—"} />
                    <DetailRow label="آیدی" copyValue={detail.user?.tg_id} />
                    <DetailRow label="موجودی" copyValue={detail.user?.balance} />
                    <DetailRow label="خریدهای قبلی" copyValue={detail.user_purchase_count ?? 0} />
                  </Section>
                  <Section title="جزئیات تراکنش">
                    <DetailRow label="نوع" value={TYPE_LABELS[detail.type] || detail.type} />
                    <DetailRow
                      label="پلن"
                      value={
                        detail.plan
                          ? `${detail.plan.tier_name || ""} ${detail.plan.gb} GB / ${detail.plan.days} days`
                          : "—"
                      }
                    />
                    <DetailRow label="مبلغ" copyValue={detail.payment_amount || detail.amount} />
                    {detail.discount_code && (
                      <DetailRow
                        label="تخفیف"
                        value={`${detail.discount_code} (-${detail.discount_amount})`}
                        copyValue={detail.discount_amount}
                      />
                    )}
                    <DetailRow label="روش" value={detail.payment_method === "card" ? "کارت به کارت" : "کیف پول"} />
                    <DetailRow label="زمان" value={formatDate(detail.created_at)} />
                    {detail.service_name && <DetailRow label="نام سرویس" value={detail.service_name} />}
                    <DetailRow label="وضعیت" value={detail.status === "pending" ? "در انتظار" : detail.status === "confirmed" ? "تایید شده" : "رد شده"} />
                  </Section>
                  {detail.status !== "pending" && detail.processed_by && (
                    <Section title="پردازش">
                      <DetailRow
                        label="نتیجه"
                        value={PROCESSED_ACTION_LABELS[detail.processed_by.action] || detail.processed_by.action}
                      />
                      <DetailRow
                        label="توسط"
                        value={
                          detail.processed_by.name
                            ? detail.processed_by.username
                              ? `${detail.processed_by.name} (@${detail.processed_by.username})`
                              : detail.processed_by.name
                            : "—"
                        }
                      />
                      {detail.processed_by.source && (
                        <DetailRow
                          label="از طریق"
                          value={PROCESSED_SOURCE_LABELS[detail.processed_by.source] || detail.processed_by.source}
                        />
                      )}
                      {detail.processed_by.at && (
                        <DetailRow label="زمان پردازش" value={formatDate(detail.processed_by.at)} />
                      )}
                    </Section>
                  )}
                  {detail.has_receipt && (
                    <Section title="تصویر رسید">
                      <div className="flex flex-wrap gap-4 mb-3 text-xs">
                        <span className="text-text-muted">شناسه تراکنش:</span>
                        <CopyableValue value={detail.id} />
                        <span className="text-text-muted">آیدی کاربر:</span>
                        <CopyableValue value={detail.user?.tg_id} />
                      </div>
                      <ReceiptImage
                        txId={detail.id}
                        className="w-full rounded-lg cursor-zoom-in border border-border hover:border-primary/50 transition-colors"
                        onClick={() => setLightbox(true)}
                      />
                    </Section>
                  )}
                </div>
              ) : null}
            </div>

            {detail?.status === "pending" && !detailLoading && canWrite && (
              <div className="sticky bottom-0 p-4 border-t border-border bg-surface/95 backdrop-blur flex gap-2">
                <Button variant="success" className="flex-1" onClick={() => setShowApprove(true)}>تایید</Button>
                <Button variant="danger" className="flex-1" onClick={() => setShowReject(true)}>رد</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {lightbox && selected && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-label="نمایش رسید"
        >
          <ReceiptImage
            txId={selected.id}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <Modal open={showApprove} onOpenChange={setShowApprove} title="تایید تراکنش">
        <p className="text-text-secondary text-sm mb-4">آیا مطمئن هستید؟ سرویس برای کاربر ایجاد می‌شود.</p>
        <div className="flex gap-2">
          <Button variant="success" onClick={approve} disabled={actionLoading}>
            {actionLoading ? "در حال تایید..." : "بله، تایید کن"}
          </Button>
          <Button variant="outline" onClick={() => setShowApprove(false)}>انصراف</Button>
        </div>
      </Modal>

      <Modal open={showReject} onOpenChange={setShowReject} title="رد تراکنش">
        <label className="text-sm text-text-secondary block mb-2">دلیل رد (اختیاری)</label>
        <textarea
          className="w-full rounded-lg border border-border bg-background p-3 text-sm mb-4 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="مثلاً: مبلغ نادرست یا رسید نامعتبر"
        />
        <div className="flex gap-2">
          <Button variant="danger" onClick={reject} disabled={actionLoading}>
            {actionLoading ? "در حال رد..." : "رد کردن"}
          </Button>
          <Button variant="outline" onClick={() => setShowReject(false)}>انصراف</Button>
        </div>
      </Modal>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-text-primary mb-3 pb-2 border-b border-border/50">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  copyValue,
}: {
  label: string;
  value?: string;
  copyValue?: string | number;
}) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-text-muted shrink-0">{label}</span>
      {copyValue !== undefined ? (
        <CopyableValue value={copyValue} />
      ) : (
        <span className="text-left">{value || "—"}</span>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<AppShell><Skeleton className="h-64" /></AppShell>}>
      <TransactionsContent />
    </Suspense>
  );
}
