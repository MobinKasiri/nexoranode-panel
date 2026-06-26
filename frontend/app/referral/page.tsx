"use client";

import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReferralSettingsEditor } from "@/components/settings/ReferralSettingsEditor";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";

export default function ReferralPage() {
  const { admin } = useAuth();
  const canWrite = hasPermission(admin, "settings_referral", "write");

  return (
    <AppShell>
      <PageHeader title="دعوت دوستان" description="پاداش معرف، هدیه دوست و متن‌های دعوت" />
      <ReferralSettingsEditor canWrite={canWrite} />
    </AppShell>
  );
}
