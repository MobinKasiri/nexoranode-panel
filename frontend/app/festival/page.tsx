"use client";

import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { FestivalPanel } from "@/components/settings/FestivalPanel";

export default function FestivalPage() {
  return (
    <AppShell>
      <PageHeader title="جشنواره" description="کمپین تخفیف خودکار برای کاربران جدید" />
      <FestivalPanel />
    </AppShell>
  );
}
