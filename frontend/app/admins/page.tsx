"use client";

import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { AdminsPanel } from "@/components/settings/AdminsPanel";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminsPage() {
  const { admin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!admin?.is_superadmin) router.replace("/dashboard");
  }, [admin, loading, router]);

  if (loading || !admin?.is_superadmin) return null;

  return (
    <AppShell>
      <PageHeader title="مدیران" description="دسترسی‌ها و حساب‌های پنل مدیریت" />
      <AdminsPanel />
    </AppShell>
  );
}
