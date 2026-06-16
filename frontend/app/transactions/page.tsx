"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, Check, X, Download, Search } from "lucide-react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDate, formatToman, toPersianDigits } from "@/lib/utils";
import type { Transaction } from "@/types";

const STATUS_FILTERS = [
  { key: "", label: "همه" },
  { key: "pending", label: "در انتظار" },
  { key: "confirmed", label: "تایید شده" },
  { key: "rejected", label: "رد شده" },
];

function TransactionsContent() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [lightbox, setLightbox] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (search) params.set("search", search);
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
  }, [status, search]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (tx: Transaction) => {
    setSelected(tx);
    try {
      const d = await api.get<Transaction>(`/transactions/${tx.id}`);
      setDetail(d);
    } catch {
      setDetail(tx);
    }
  };

  const approve = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api.post(`/transactions/${selected.id}/approve`);
      toast.success("✅ تراکنش تایید شد");
      setShowApprove(false);
      setSelected(null);
      setDetail(null);
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
      setSelected(null);
      setDetail(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">تراکنش‌ها</h1>
        <Button variant="outline" size="sm" onClick={() => api.exportTransactions(status || undefined)}>
          <Download size={16} className="ml-2" /> خروجی Excel
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button key={f.key} onClick={() => setStatus(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              status === f.key ? "bg-primary/20 border-primary text-primary" : "border-border text-text-secondary hover:bg-surface-hover"
            }`}>
            {f.label}{f.key === "pending" && pendingCount > 0 ? ` ● ${toPersianDigits(pendingCount)}` : ""}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input placeholder="جستجو..." value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()} className="pr-10" />
      </div>

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="p-4 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-text-muted">تراکنشی یافت نشد</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="p-3 text-right">#</th>
                <th className="p-3 text-right">کاربر</th>
                <th className="p-3 text-right">پلن</th>
                <th className="p-3 text-right">مبلغ</th>
                <th className="p-3 text-right">روش</th>
                <th className="p-3 text-right">زمان</th>
                <th className="p-3 text-right">وضعیت</th>
                <th className="p-3 text-right">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((tx) => (
                <tr key={tx.id} className="border-b border-border/50 hover:bg-surface-hover cursor-pointer" onClick={() => openDetail(tx)}>
                  <td className="p-3 font-latin">{toPersianDigits(tx.id)}</td>
                  <td className="p-3">
                    <div>{tx.user?.full_name}</div>
                    <div className="text-text-muted text-xs">@{tx.user?.username || tx.user_id}</div>
                  </td>
                  <td className="p-3">{tx.plan ? `${tx.plan.gb}GB` : tx.type}</td>
                  <td className="p-3">{formatToman(tx.payment_amount || tx.amount)}</td>
                  <td className="p-3">{tx.payment_method === "card" ? "کارت" : "کیف پول"}</td>
                  <td className="p-3 text-text-secondary">{formatDate(tx.created_at)}</td>
                  <td className="p-3"><Badge status={tx.status} /></td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openDetail(tx)}><Eye size={16} /></Button>
                      {tx.status === "pending" && (
                        <>
                          <Button size="icon" variant="ghost" className="text-success" onClick={() => { setSelected(tx); setShowApprove(true); }}><Check size={16} /></Button>
                          <Button size="icon" variant="ghost" className="text-danger" onClick={() => { setSelected(tx); setShowReject(true); }}><X size={16} /></Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-text-muted text-xs mt-2">{toPersianDigits(total)} تراکنش</p>

      {/* Slide-in panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => { setSelected(null); setDetail(null); }} />
          <div className="w-full max-w-[480px] bg-surface border-r border-border h-full overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-4">تراکنش #{toPersianDigits(selected.id)}</h2>
            {detail && (
              <div className="space-y-4 text-sm">
                <Section title="اطلاعات کاربر">
                  <Row label="نام" value={detail.user?.full_name} />
                  <Row label="یوزرنیم" value={detail.user?.username ? `@${detail.user.username}` : "—"} />
                  <Row label="آیدی" value={String(detail.user?.tg_id)} />
                  <Row label="موجودی" value={formatToman(detail.user?.balance || 0)} />
                  <Row label="خریدهای قبلی" value={toPersianDigits(detail.user_purchase_count || 0)} />
                </Section>
                <Section title="جزئیات تراکنش">
                  <Row label="نوع" value={detail.type} />
                  <Row label="پلن" value={detail.plan ? `${detail.plan.tier_name || ""} ${detail.plan.gb}GB / ${detail.plan.days} روز` : "—"} />
                  <Row label="مبلغ" value={formatToman(detail.payment_amount || detail.amount)} />
                  {detail.discount_code && <Row label="تخفیف" value={`${detail.discount_code} (-${formatToman(detail.discount_amount)})`} />}
                  <Row label="روش" value={detail.payment_method === "card" ? "کارت به کارت" : "کیف پول"} />
                  <Row label="زمان" value={formatDate(detail.created_at)} />
                  {detail.service_name && <Row label="نام سرویس" value={detail.service_name} />}
                </Section>
                {detail.has_receipt && (
                  <Section title="تصویر رسید">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/transactions/${detail.id}/receipt`}
                      alt="رسید"
                      className="w-full rounded-lg cursor-zoom-in border border-border"
                      onClick={() => setLightbox(true)}
                    />
                  </Section>
                )}
                {detail.status === "pending" && (
                  <div className="flex gap-2 pt-4">
                    <Button variant="success" className="flex-1" onClick={() => setShowApprove(true)}>✅ تایید</Button>
                    <Button variant="danger" className="flex-1" onClick={() => setShowReject(true)}>❌ رد</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {lightbox && selected && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/transactions/${selected.id}/receipt`} alt="رسید" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      <Modal open={showApprove} onOpenChange={setShowApprove} title="تایید تراکنش">
        <p className="text-text-secondary text-sm mb-4">آیا مطمئن هستید؟ سرویس برای کاربر ایجاد می‌شود.</p>
        <div className="flex gap-2">
          <Button variant="success" onClick={approve} disabled={actionLoading}>{actionLoading ? "..." : "بله، تایید کن"}</Button>
          <Button variant="outline" onClick={() => setShowApprove(false)}>انصراف</Button>
        </div>
      </Modal>

      <Modal open={showReject} onOpenChange={setShowReject} title="رد تراکنش">
        <label className="text-sm text-text-secondary block mb-2">دلیل رد (اختیاری)</label>
        <textarea className="w-full rounded-lg border border-border bg-background p-3 text-sm mb-4 min-h-[80px]"
          value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="danger" onClick={reject} disabled={actionLoading}>رد کردن</Button>
          <Button variant="outline" onClick={() => setShowReject(false)}>انصراف</Button>
        </div>
      </Modal>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="font-semibold text-text-primary mb-2">{title}</h3><div className="space-y-1">{children}</div></div>;
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      <span className="text-left font-latin">{value || "—"}</span>
    </div>
  );
}

export default function TransactionsPage() {
  return <Suspense fallback={<AppShell><Skeleton className="h-64" /></AppShell>}><TransactionsContent /></Suspense>;
}
