"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CreditCard, Shield, Tag } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlansEditor, type PlansData } from "@/components/settings/PlansEditor";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const [tab, setTab] = useState("plans");
  const [plansData, setPlansData] = useState<PlansData | null>(null);
  const [savingPlans, setSavingPlans] = useState(false);
  const [payment, setPayment] = useState<Record<string, string>>({});
  const [admins, setAdmins] = useState<{ id: number; username: string; full_name: string }[]>([]);
  const [newAdmin, setNewAdmin] = useState({ username: "", password: "", full_name: "" });
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  useEffect(() => {
    api.get<PlansData>("/settings/plans").then(setPlansData).catch((err) => {
      toast.error(err instanceof Error ? err.message : "خطا در بارگذاری قیمت‌ها");
    });
    api.get<Record<string, string>>("/settings/payment").then(setPayment).catch((err) => {
      toast.error(err instanceof Error ? err.message : "خطا در بارگذاری اطلاعات پرداخت");
    });
    api.get<{ items: typeof admins }>("/settings/admins").then((a) => setAdmins(a.items)).catch((err) => {
      toast.error(err instanceof Error ? err.message : "خطا در بارگذاری ادمین‌ها");
    });
  }, []);

  const savePlans = async () => {
    if (!plansData) return;
    setSavingPlans(true);
    try {
      await api.put("/settings/plans", plansData);
      toast.success("قیمت‌ها ذخیره شد — ربات به‌صورت خودکار به‌روز می‌شود");
    } catch {
      toast.error("خطا در ذخیره قیمت‌ها");
    } finally {
      setSavingPlans(false);
    }
  };

  const createAdmin = async () => {
    if (!newAdmin.username || !newAdmin.password) {
      toast.error("نام کاربری و رمز عبور الزامی است");
      return;
    }
    setCreatingAdmin(true);
    try {
      await api.post("/settings/admins", newAdmin);
      toast.success("ادمین ایجاد شد");
      setNewAdmin({ username: "", password: "", full_name: "" });
      const a = await api.get<{ items: typeof admins }>("/settings/admins");
      setAdmins(a.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا");
    } finally {
      setCreatingAdmin(false);
    }
  };

  const tabs = [
    { key: "plans", label: "قیمت‌ها", icon: Tag },
    { key: "payment", label: "پرداخت", icon: CreditCard },
    { key: "admins", label: "ادمین‌ها", icon: Shield },
  ];

  return (
    <AppShell>
      <PageHeader title="تنظیمات" description="مدیریت قیمت‌ها، اطلاعات پرداخت و دسترسی ادمین‌ها" />

      <div className="flex flex-wrap gap-2 mb-6 p-1 rounded-xl bg-surface border border-border w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors",
              tab === t.key
                ? "bg-primary text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
            )}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "plans" && (
        plansData ? (
          <PlansEditor data={plansData} onChange={setPlansData} onSave={savePlans} saving={savingPlans} />
        ) : (
          <Card className="p-8 text-center text-text-muted">در حال بارگذاری قیمت‌ها...</Card>
        )
      )}

      {tab === "payment" && (
        <Card className="max-w-lg">
          <CardTitle className="mb-6">اطلاعات پرداخت کارت به کارت</CardTitle>
          <div className="space-y-4">
            <PaymentRow label="شماره کارت" value={payment.card_number} mono />
            <PaymentRow label="صاحب کارت" value={payment.card_owner} />
            <PaymentRow label="بانک" value={payment.card_bank} />
            {payment.note && (
              <p className="text-text-muted text-sm mt-6 p-4 rounded-lg bg-background/60 border border-border/60">
                {payment.note}
              </p>
            )}
          </div>
        </Card>
      )}

      {tab === "admins" && (
        <div className="grid gap-6 lg:grid-cols-2 max-w-4xl">
          <Card>
            <CardTitle className="mb-4">ادمین‌های فعال</CardTitle>
            {admins.length === 0 ? (
              <p className="text-text-muted text-sm py-4">ادمینی ثبت نشده</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {admins.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="font-medium">{a.full_name || a.username}</p>
                      <p className="text-text-muted text-xs font-latin">@{a.username}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle className="mb-4">افزودن ادمین جدید</CardTitle>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1.5">نام کاربری</label>
                <Input
                  placeholder="username"
                  value={newAdmin.username}
                  onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })}
                  className="font-latin"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">رمز عبور</label>
                <Input
                  type="password"
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1.5">نام کامل</label>
                <Input
                  placeholder="نام نمایشی"
                  value={newAdmin.full_name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, full_name: e.target.value })}
                />
              </div>
              <Button onClick={createAdmin} disabled={creatingAdmin} className="w-full sm:w-auto">
                {creatingAdmin ? "در حال ایجاد..." : "ایجاد ادمین"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function PaymentRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-2 border-b border-border/40 last:border-0">
      <span className="text-text-muted text-sm">{label}</span>
      <span className={cn("text-text-primary", mono && "font-latin tracking-wider")}>{value || "—"}</span>
    </div>
  );
}
