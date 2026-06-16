"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/layout/Sidebar";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const [tab, setTab] = useState("plans");
  const [plans, setPlans] = useState("");
  const [payment, setPayment] = useState<Record<string, string>>({});
  const [admins, setAdmins] = useState<{ id: number; username: string; full_name: string }[]>([]);
  const [newAdmin, setNewAdmin] = useState({ username: "", password: "", full_name: "" });

  useEffect(() => {
    api.get<Record<string, unknown>>("/settings/plans").then((p) => setPlans(JSON.stringify(p, null, 2)));
    api.get<Record<string, string>>("/settings/payment").then(setPayment);
    api.get<{ items: typeof admins }>("/settings/admins").then((a) => setAdmins(a.items));
  }, []);

  const savePlans = async () => {
    try {
      await api.put("/settings/plans", JSON.parse(plans));
      toast.success("قیمت‌ها ذخیره شد");
    } catch {
      toast.error("JSON نامعتبر است");
    }
  };

  const createAdmin = async () => {
    await api.post("/settings/admins", newAdmin);
    toast.success("ادمین ایجاد شد");
    setNewAdmin({ username: "", password: "", full_name: "" });
    api.get<{ items: typeof admins }>("/settings/admins").then((a) => setAdmins(a.items));
  };

  const tabs = [
    { key: "plans", label: "قیمت‌ها" },
    { key: "payment", label: "پرداخت" },
    { key: "admins", label: "ادمین‌ها" },
  ];

  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-6">تنظیمات</h1>
      <div className="flex gap-2 mb-4 border-b border-border">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === t.key ? "border-primary text-primary" : "border-transparent text-text-muted"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "plans" && (
        <Card>
          <CardTitle className="mb-4">plans.json</CardTitle>
          <textarea className="w-full font-mono text-xs rounded-lg border border-border bg-background p-3 min-h-[400px] mb-4" dir="ltr"
            value={plans} onChange={(e) => setPlans(e.target.value)} />
          <Button onClick={savePlans}>ذخیره</Button>
        </Card>
      )}

      {tab === "payment" && (
        <Card className="max-w-md space-y-3 text-sm">
          <Row label="شماره کارت" value={payment.card_number} />
          <Row label="صاحب کارت" value={payment.card_owner} />
          <Row label="بانک" value={payment.card_bank} />
          <p className="text-text-muted text-xs mt-4">{payment.note}</p>
        </Card>
      )}

      {tab === "admins" && (
        <div className="space-y-4 max-w-md">
          <Card>
            <CardTitle className="mb-4">ادمین‌های فعال</CardTitle>
            <ul className="space-y-2 text-sm">
              {admins.map((a) => (
                <li key={a.id} className="flex justify-between border-b border-border/50 pb-2">
                  <span>{a.full_name} (@{a.username})</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle className="mb-4">افزودن ادمین</CardTitle>
            <div className="space-y-3">
              <Input placeholder="نام کاربری" value={newAdmin.username} onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })} />
              <Input type="password" placeholder="رمز عبور" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} />
              <Input placeholder="نام کامل" value={newAdmin.full_name} onChange={(e) => setNewAdmin({ ...newAdmin, full_name: e.target.value })} />
              <Button onClick={createAdmin}>ایجاد</Button>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return <div className="flex justify-between"><span className="text-text-muted">{label}</span><span>{value || "—"}</span></div>;
}
