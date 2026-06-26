"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const [payment, setPayment] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get<Record<string, string>>("/settings/payment").then(setPayment).catch(() => {});
  }, []);

  return (
    <AppShell>
      <PageHeader title="پرداخت" description="اطلاعات کارت به کارت (فقط خواندن — از .env)" />
      <Card className="max-w-lg">
        <CardTitle className="mb-6">پرداخت کارت به کارت</CardTitle>
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
