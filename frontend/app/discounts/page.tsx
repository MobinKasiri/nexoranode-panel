"use client";

import { useEffect, useState } from "react";
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
import { api } from "@/lib/api";
import { cn, discountStatusLabel, formatDate, formatToman } from "@/lib/utils";

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
  const [items, setItems] = useState<DiscountItem[]>([]);
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

  const load = () => {
    setLoading(true);
    api
      .get<{ items: DiscountItem[] }>("/discounts")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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

  const applyExpiryPreset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setExpiresAt(d.toISOString().slice(0, 16));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    const num = parseInt(value, 10);
    if (!code.trim()) {
      setFormError("Code is required");
      return;
    }
    if (!num || num < 1) {
      setFormError("Enter a valid discount value");
      return;
    }
    try {
      await api.post("/discounts", {
        code,
        discount_percent: percent ? num : null,
        discount_amount: percent ? null : num,
        max_uses: parseInt(maxUses, 10),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      toast.success("Discount created");
      setCode("");
      setValue("");
      setExpiresAt("");
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error");
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/discounts/${deleteId}`);
      toast.success("Discount deactivated");
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
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
    ? value ? `${value}% off` : "—"
    : value ? formatToman(parseInt(value, 10) || 0) : "—";

  return (
    <AppShell>
      <PageHeader
        title="Discount codes"
        description="Create and manage promo codes"
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? <ChevronUp size={16} className="ml-2" /> : <ChevronDown size={16} className="ml-2" />}
            {showForm ? "Close form" : "New code"}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardTitle className="mb-4">Create discount</CardTitle>
          <form onSubmit={create} className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Type</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={percent} onChange={() => setPercent(true)} />
                    Percentage
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!percent} onChange={() => setPercent(false)} />
                    Fixed amount
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Code</label>
                <div className="flex gap-2">
                  <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required className="font-latin" />
                  <Button type="button" variant="outline" onClick={randomCode}>Random</Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">{percent ? "Percent" : "Amount (Toman)"}</label>
                <Input type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} required className="font-latin" />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Max uses (1 per user enforced by bot)</label>
                <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="font-latin" />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">Expires</label>
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="font-latin" />
                <div className="flex gap-2 mt-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => applyExpiryPreset(1)}>24h</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => applyExpiryPreset(7)}>7 days</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => applyExpiryPreset(30)}>30 days</Button>
                </div>
              </div>
              {formError && <p className="text-danger text-sm">{formError}</p>}
              <Button type="submit">Create</Button>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <p className="text-xs text-text-muted mb-2">Preview</p>
              <p className="font-latin font-bold text-lg">{code || "CODE"}</p>
              <p className="text-primary mt-1">{previewValue}</p>
              <p className="text-text-muted text-sm mt-2">Max {maxUses || "—"} uses</p>
              <p className="text-text-muted text-sm">{expiresAt ? `Until ${formatDate(expiresAt)}` : "No expiry"}</p>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Tag} title="No discount codes" description="Create your first code with the button above" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th>Usage</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Actions</th>
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
                      {c.discount_percent ? `${c.discount_percent}%` : formatToman(c.discount_amount || 0)}
                    </td>
                    <td>{c.used_count} / {c.max_uses}</td>
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
                        title={inactive ? "Expired/disabled codes cannot be deactivated again" : "Deactivate"}
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
      </Card>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Deactivate discount"
        destructive
        confirmLabel="Deactivate"
        loading={deleting}
        onConfirm={confirmDelete}
        description={<p>This code will no longer be accepted by the bot.</p>}
      />

      <Modal
        open={detailId !== null}
        onOpenChange={(o) => { if (!o) { setDetailId(null); setDetail(null); } }}
        title={detail ? `Discount: ${detail.code}` : "Discount details"}
        className="max-w-2xl"
      >
        {detailLoading || !detail ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Status: <Badge status={detail.status === "active" ? "confirmed" : "rejected"}>{discountStatusLabel(detail.status)}</Badge></div>
              <div>Expires: {detail.expires_at ? formatDate(detail.expires_at) : "—"}</div>
            </div>
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Redemptions ({detail.total})</h3>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!detail.items.length}>
                <Download size={14} className="ml-1" /> CSV
              </Button>
            </div>
            <table className="data-table text-sm">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Date</th>
                  <th>Order</th>
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
                <Button size="sm" variant="outline" disabled={usagePage <= 1} onClick={() => setUsagePage((p) => p - 1)}>Prev</Button>
                <span className="text-sm self-center">Page {usagePage}</span>
                <Button size="sm" variant="outline" disabled={usagePage * 20 >= detail.total} onClick={() => setUsagePage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
