"use client";

import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { MaintenancePanel } from "@/components/settings/MaintenancePanel";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";

export default function MaintenancePage() {
  const { admin } = useAuth();
  const canWrite = hasPermission(admin, "settings_maintenance", "write");

  return (
    <AppShell>
      <PageHeader title="تعمیر ربات" description="حالت آفلاین و پیام تعمیر برای کاربران" />
      <MaintenancePanel canWrite={canWrite} />
    </AppShell>
  );
}
