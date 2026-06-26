"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { PlansEditor, type PlansData } from "@/components/settings/PlansEditor";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";

export default function PlansPage() {
  const { admin } = useAuth();
  const canWrite = hasPermission(admin, "settings_plans", "write");
  const [plansData, setPlansData] = useState<PlansData | null>(null);
  const [savingPlans, setSavingPlans] = useState(false);

  useEffect(() => {
    api.get<PlansData>("/settings/plans").then(setPlansData).catch((err) => {
      toast.error(err instanceof Error ? err.message : "خطا در بارگذاری پلن‌ها");
    });
  }, []);

  const savePlans = async () => {
    if (!plansData || !canWrite) return;
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

  return (
    <AppShell>
      <PageHeader title="پلن‌ها" description="قیمت‌گذاری و پلن‌های فروش VPN" />
      {plansData ? (
        <PlansEditor
          data={plansData}
          onChange={setPlansData}
          onSave={savePlans}
          saving={savingPlans}
          canWrite={canWrite}
        />
      ) : (
        <Card className="p-8 text-center text-text-muted">در حال بارگذاری پلن‌ها…</Card>
      )}
    </AppShell>
  );
}
