"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Tag, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { formatToman, toPersianDigits } from "@/lib/utils";

interface DiscountItem {
  id: number;
  code: string;
  discount_percent?: number;
  discount_amount?: number;
  used_count: number;
  max_uses: number;
  expires_at?: string;
  is_active: boolean;
}

export default function DiscountsPage() {
  const [items, setItems] = useState<DiscountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(true);
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("100");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: DiscountItem[] }>("/discounts")
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const randomCode = async () => {
    const r = await api.get<{ code: string }>("/discounts/random");
    setCode(r.code);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/discounts", {
        code,
        discount_percent: percent ? parseInt(value, 10) : null,
        discount_amount: percent ? null : parseInt(value, 10),
        max_uses: parseInt(maxUses, 10),
      });
      toast.success("کد ایجاد شد");
      setCode("");
      setValue("");
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا");
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/discounts/${deleteId}`);
      toast.success("کد حذف شد");
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="کدهای تخفیف"
        description="ایجاد و مدیریت کدهای تخفیف برای کاربران"
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? <ChevronUp size={16} className="ml-2" /> : <ChevronDown size={16} className="ml-2" />}
            {showForm ? "بستن فرم" : "کد جدید"}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardTitle className="mb-4">ایجاد کد تخفیف جدید</CardTitle>
          <form onSubmit={create} className="space-y-4 max-w-md">
            <div>
              <label className="text-xs text-text-muted block mb-1.5">کد تخفیف</label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="SUMMER20"
                  required
                  className="font-latin"
                />
                <Button type="button" variant="outline" onClick={randomCode} title="کد تصادفی">
                  تصادفی
                </Button>
              </div>
            </div>
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
            <div>
              <label className="text-xs text-text-muted block mb-1.5">
                {percent ? "درصد تخفیف" : "مبلغ تخفیف (تومان)"}
              </label>
              <Input
                type="number"
                min={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                className="font-latin"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1.5">حداکثر استفاده</label>
              <Input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="font-latin"
              />
            </div>
            <Button type="submit">ایجاد کد</Button>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-8 text-center text-text-muted">در حال بارگذاری...</p>
        ) : items.length === 0 ? (
          <EmptyState icon={Tag} title="کد تخفیفی وجود ندارد" description="با دکمه «کد جدید» اولین کد را بسازید" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>کد</th>
                <th>نوع</th>
                <th>استفاده</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="font-latin font-medium">{c.code}</td>
                  <td>
                    {c.discount_percent
                      ? `${toPersianDigits(c.discount_percent)}٪`
                      : formatToman(c.discount_amount || 0)}
                  </td>
                  <td>
                    {toPersianDigits(c.used_count)} / {toPersianDigits(c.max_uses)}
                  </td>
                  <td>
                    <Badge status={c.is_active ? "confirmed" : "rejected"}>
                      {c.is_active ? "فعال" : "غیرفعال"}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:text-danger"
                      onClick={() => setDeleteId(c.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={deleteId !== null} onOpenChange={() => setDeleteId(null)} title="حذف کد تخفیف">
        <p className="text-text-secondary text-sm mb-4">آیا از حذف این کد تخفیف مطمئن هستید؟</p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? "در حال حذف..." : "بله، حذف کن"}
          </Button>
          <Button variant="outline" onClick={() => setDeleteId(null)}>انصراف</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
