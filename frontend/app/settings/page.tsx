"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CreditCard, Gift, PartyPopper, Shield, Tag, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardTitle } from "@/components/ui/card";
import { AdminsPanel } from "@/components/settings/AdminsPanel";
import { FestivalPanel } from "@/components/settings/FestivalPanel";
import { MaintenancePanel } from "@/components/settings/MaintenancePanel";
import { PlansEditor, type PlansData } from "@/components/settings/PlansEditor";
import { ReferralSettingsEditor } from "@/components/settings/ReferralSettingsEditor";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";

export default function SettingsPage() {
  const { admin } = useAuth();
  const [tab, setTab] = useState("plans");
  const [plansData, setPlansData] = useState<PlansData | null>(null);
  const [savingPlans, setSavingPlans] = useState(false);
  const [payment, setPayment] = useState<Record<string, string>>({});

  useEffect(() => {
    if (hasPermission(admin, "settings_plans", "read")) {
      api.get<PlansData>("/settings/plans").then(setPlansData).catch((err) => {
        toast.error(err instanceof Error ? err.message : "خطا در بارگذاری پلن‌ها");
      });
    }
    if (hasPermission(admin, "settings_payment", "read")) {
      api.get<Record<string, string>>("/settings/payment").then(setPayment).catch(() => {});
    }
  }, [admin]);

  const savePlans = async () => {
    if (!plansData) return;
    setSavingPlans(true);
    try {
      const res = await api.put<{ bot_sync?: { skipped?: string[]; in_sync?: boolean } }>(
        "/settings/plans",
        plansData
      );
      if (res.bot_sync?.skipped?.length && res.bot_sync.in_sync === false) {
        toast.error(
          "پلن ذخیره شد اما فایل ربات همگام نشد — PLANS_DIR_HOST را با app/data ربات یکسان کنید",
          { duration: 6000 }
        );
      } else {
        toast.success("پلن‌ها ذخیره شد — ربات خودکار به‌روز می‌شود");
      }
    } catch {
      toast.error("خطا در ذخیره پلن‌ها");
    } finally {
      setSavingPlans(false);
    }
  };

  const tabs = [
    { key: "plans", label: "پلن‌ها", icon: Tag, show: hasPermission(admin, "settings_plans", "read") },
    { key: "referral", label: "دعوت دوستان", icon: Gift, show: hasPermission(admin, "settings_plans", "read") },
    { key: "festival", label: "جشنواره", icon: PartyPopper, show: hasPermission(admin, "discounts", "read") },
    { key: "maintenance", label: "تعمیر ربات", icon: Wrench, show: hasPermission(admin, "settings_maintenance", "read") },
    { key: "payment", label: "پرداخت", icon: CreditCard, show: hasPermission(admin, "settings_payment", "read") },
    { key: "admins", label: "مدیران", icon: Shield, show: admin?.is_superadmin },
  ].filter((t) => t.show);

  useEffect(() => {
    if (tabs.length && !tabs.find((t) => t.key === tab)) {
      setTab(tabs[0].key);
    }
  }, [tabs, tab]);

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

      {tab === "plans" && hasPermission(admin, "settings_plans", "read") && (
        plansData ? (
          <PlansEditor data={plansData} onChange={setPlansData} onSave={savePlans} saving={savingPlans} />
        ) : (
          <Card className="p-8 text-center text-text-muted">در حال بارگذاری پلن‌ها…</Card>
        )
      )}

      {tab === "referral" && hasPermission(admin, "settings_plans", "read") && (
        <ReferralSettingsEditor />
      )}

      {tab === "festival" && hasPermission(admin, "discounts", "read") && <FestivalPanel />}

      {tab === "maintenance" && hasPermission(admin, "settings_maintenance", "read") && <MaintenancePanel />}

      {tab === "payment" && hasPermission(admin, "settings_payment", "read") && (
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

      {tab === "admins" && admin?.is_superadmin && <AdminsPanel />}
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
