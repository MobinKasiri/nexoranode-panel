"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/layout/Sidebar";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toPersianDigits } from "@/lib/utils";

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
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(true);
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("100");

  const load = () => api.get<{ items: DiscountItem[] }>("/discounts").then((d) => setItems(d.items));
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
      setCode(""); setValue("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا");
    }
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-6">کدهای تخفیف</h1>
      <Card className="mb-6 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="p-3 text-right">کد</th>
              <th className="p-3 text-right">نوع</th>
              <th className="p-3 text-right">استفاده</th>
              <th className="p-3 text-right">وضعیت</th>
              <th className="p-3 text-right">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-border/50">
                <td className="p-3 font-latin">{c.code}</td>
                <td className="p-3">{c.discount_percent ? `${toPersianDigits(c.discount_percent)}%` : `${toPersianDigits(c.discount_amount || 0)} ت`}</td>
                <td className="p-3">{toPersianDigits(c.used_count)} / {toPersianDigits(c.max_uses)}</td>
                <td className="p-3"><Badge status={c.is_active ? "confirmed" : "rejected"} /></td>
                <td className="p-3"><Button size="sm" variant="danger" onClick={() => api.delete(`/discounts/${c.id}`).then(load)}>حذف</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardTitle className="mb-4">➕ ایجاد کد تخفیف جدید</CardTitle>
        <form onSubmit={create} className="space-y-4 max-w-md">
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="کد تخفیف" required />
            <Button type="button" variant="outline" onClick={randomCode}>🎲</Button>
          </div>
          <div className="flex gap-4 text-sm">
            <label><input type="radio" checked={percent} onChange={() => setPercent(true)} className="ml-1" /> درصدی</label>
            <label><input type="radio" checked={!percent} onChange={() => setPercent(false)} className="ml-1" /> مبلغ ثابت</label>
          </div>
          <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder={percent ? "درصد" : "تومان"} required />
          <Input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="حداکثر استفاده" />
          <Button type="submit">✅ ایجاد کد تخفیف</Button>
        </form>
      </Card>
    </AppShell>
  );
}
