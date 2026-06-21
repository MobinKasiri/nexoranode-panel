"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CreditCard, Shield, Tag, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MaintenancePanel } from "@/components/settings/MaintenancePanel";
import { PlansEditor, type PlansData } from "@/components/settings/PlansEditor";
import { api } from "@/lib/api";
import { cn, adminRoleLabel } from "@/lib/utils";

type AdminRow = { id: number; username: string; full_name: string; role: string };

export default function SettingsPage() {
  const [tab, setTab] = useState("plans");
  const [plansData, setPlansData] = useState<PlansData | null>(null);
  const [savingPlans, setSavingPlans] = useState(false);
  const [payment, setPayment] = useState<Record<string, string>>({});
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [me, setMe] = useState<AdminRow | null>(null);
  const [newAdmin, setNewAdmin] = useState({ username: "", password: "", full_name: "" });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);

  const loadAdmins = () => {
    api.get<{ items: AdminRow[] }>("/settings/admins").then((a) => setAdmins(a.items));
    api.me().then(setMe);
  };

  useEffect(() => {
    api.get<PlansData>("/settings/plans").then(setPlansData).catch((err) => {
      toast.error(err instanceof Error ? err.message : "خطا در بارگذاری پلن‌ها");
    });
    api.get<Record<string, string>>("/settings/payment").then(setPayment).catch(() => {});
    loadAdmins();
  }, []);

  const savePlans = async () => {
    if (!plansData) return;
    setSavingPlans(true);
    try {
      const res = await api.put<{ bot_sync?: { skipped?: string[]; warnings?: string[] } }>(
        "/settings/plans",
        plansData
      );
      toast.success("پلن‌ها ذخیره شد — ربات خودکار به‌روز می‌شود");
      const skipped = res.bot_sync?.skipped;
      if (skipped?.length) {
        toast.error(
          "فایل ربات جداگانه است — PLANS_DIR_HOST را روی app/data ربات تنظیم کنید",
          { duration: 6000 }
        );
      }
    } catch {
      toast.error("خطا در ذخیره پلن‌ها");
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
      toast.success("مدیر ایجاد شد");
      setNewAdmin({ username: "", password: "", full_name: "" });
      loadAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا");
    } finally {
      setCreatingAdmin(false);
    }
  };

  const confirmRemoveAdmin = async () => {
    if (!removeId) return;
    setRemoving(true);
    try {
      await api.delete(`/settings/admins/${removeId}`);
      toast.success("مدیر حذف شد");
      setRemoveId(null);
      loadAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا");
    } finally {
      setRemoving(false);
    }
  };

  const tabs = [
    { key: "plans", label: "پلن‌ها", icon: Tag },
    { key: "maintenance", label: "تعمیر ربات", icon: Wrench },
    { key: "payment", label: "پرداخت", icon: CreditCard },
    { key: "admins", label: "مدیران", icon: Shield },
  ];

  const isSuperadmin = me?.role === "superadmin";

  return (
    <AppShell>
      <PageHeader title="تنظیمات" description="پلن‌ها، اطلاعات پرداخت و دسترسی مدیران" />

      <div className="flex flex-wrap gap-2 mb-6 p-1 rounded-xl bg-surface border border-border w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors",
              tab === t.key ? "bg-primary text-white shadow-sm" : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
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
          <Card className="p-8 text-center text-text-muted">در حال بارگذاری پلن‌ها…</Card>
        )
      )}

      {tab === "maintenance" && <MaintenancePanel />}

      {tab === "payment" && (
        <Card className="max-w-lg">
          <CardTitle className="mb-6">پرداخت کارت به کارت</CardTitle>
          <div className="space-y-4">
            <PaymentRow label="شماره کارت" value={payment.card_number} mono />
            <PaymentRow label="صاحب کارت" value={payment.card_owner} />
            <PaymentRow label="بانک" value={payment.card_bank} />
            {payment.note && (
              <p className="text-text-muted text-sm mt-6 p-4 rounded-lg bg-background/60 border border-border/60">{payment.note}</p>
            )}
          </div>
        </Card>
      )}

      {tab === "admins" && (
        <div className="grid gap-6 lg:grid-cols-2 max-w-4xl">
          <Card>
            <CardTitle className="mb-4">مدیران فعال</CardTitle>
            {admins.length === 0 ? (
              <p className="text-text-muted text-sm py-4">مدیری وجود ندارد</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {admins.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-2">
                    <div>
                      <p className="font-medium flex items-center gap-2">
                        {a.full_name || a.username}
                        <Badge status={a.role === "superadmin" ? "confirmed" : "pending"}>{adminRoleLabel(a.role)}</Badge>
                      </p>
                      <p className="text-text-muted text-xs font-latin">@{a.username}</p>
                    </div>
                    {isSuperadmin && a.role !== "superadmin" && a.id !== me?.id && (
                      <Button size="sm" variant="danger" onClick={() => setRemoveId(a.id)}>
                        حذف
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle className="mb-4">افزودن مدیر</CardTitle>
            <div className="space-y-3">
              <Input placeholder="نام کاربری" value={newAdmin.username} onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })} className="font-latin" />
              <Input type="password" placeholder="رمز عبور" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} />
              <Input placeholder="نام نمایشی" value={newAdmin.full_name} onChange={(e) => setNewAdmin({ ...newAdmin, full_name: e.target.value })} />
              <Button onClick={createAdmin} disabled={creatingAdmin} className="w-full sm:w-auto">
                {creatingAdmin ? "در حال ایجاد…" : "ایجاد مدیر"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(o) => !o && setRemoveId(null)}
        title="حذف مدیر"
        destructive
        confirmLabel="حذف"
        loading={removing}
        onConfirm={confirmRemoveAdmin}
        description={<p>این مدیر دیگر به پنل دسترسی نخواهد داشت.</p>}
      />
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
