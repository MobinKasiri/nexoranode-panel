"use client";

import { AppShell } from "@/components/layout/Sidebar";
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
      <AdminsPanel />
    </AppShell>
  );
}
