"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CreditCard, Shield, Tag } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PlansEditor, type PlansData } from "@/components/settings/PlansEditor";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

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
      toast.error(err instanceof Error ? err.message : "Failed to load plans");
    });
    api.get<Record<string, string>>("/settings/payment").then(setPayment).catch(() => {});
    loadAdmins();
  }, []);

  const savePlans = async () => {
    if (!plansData) return;
    setSavingPlans(true);
    try {
      await api.put("/settings/plans", plansData);
      toast.success("Plans saved — bot reloads automatically");
    } catch {
      toast.error("Failed to save plans");
    } finally {
      setSavingPlans(false);
    }
  };

  const createAdmin = async () => {
    if (!newAdmin.username || !newAdmin.password) {
      toast.error("Username and password required");
      return;
    }
    setCreatingAdmin(true);
    try {
      await api.post("/settings/admins", newAdmin);
      toast.success("Admin created");
      setNewAdmin({ username: "", password: "", full_name: "" });
      loadAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setCreatingAdmin(false);
    }
  };

  const confirmRemoveAdmin = async () => {
    if (!removeId) return;
    setRemoving(true);
    try {
      await api.delete(`/settings/admins/${removeId}`);
      toast.success("Admin removed");
      setRemoveId(null);
      loadAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setRemoving(false);
    }
  };

  const tabs = [
    { key: "plans", label: "Plans", icon: Tag },
    { key: "payment", label: "Payment", icon: CreditCard },
    { key: "admins", label: "Admins", icon: Shield },
  ];

  const isSuperadmin = me?.role === "superadmin";

  return (
    <AppShell>
      <PageHeader title="Settings" description="Plans, payment info, and admin access" />

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
          <Card className="p-8 text-center text-text-muted">Loading plans…</Card>
        )
      )}

      {tab === "payment" && (
        <Card className="max-w-lg">
          <CardTitle className="mb-6">Card-to-card payment</CardTitle>
          <div className="space-y-4">
            <PaymentRow label="Card number" value={payment.card_number} mono />
            <PaymentRow label="Owner" value={payment.card_owner} />
            <PaymentRow label="Bank" value={payment.card_bank} />
            {payment.note && (
              <p className="text-text-muted text-sm mt-6 p-4 rounded-lg bg-background/60 border border-border/60">{payment.note}</p>
            )}
          </div>
        </Card>
      )}

      {tab === "admins" && (
        <div className="grid gap-6 lg:grid-cols-2 max-w-4xl">
          <Card>
            <CardTitle className="mb-4">Active admins</CardTitle>
            {admins.length === 0 ? (
              <p className="text-text-muted text-sm py-4">No admins</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {admins.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-2">
                    <div>
                      <p className="font-medium flex items-center gap-2">
                        {a.full_name || a.username}
                        <Badge status={a.role === "superadmin" ? "confirmed" : "pending"}>{a.role}</Badge>
                      </p>
                      <p className="text-text-muted text-xs font-latin">@{a.username}</p>
                    </div>
                    {isSuperadmin && a.role !== "superadmin" && a.id !== me?.id && (
                      <Button size="sm" variant="danger" onClick={() => setRemoveId(a.id)}>
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle className="mb-4">Add admin</CardTitle>
            <div className="space-y-3">
              <Input placeholder="Username" value={newAdmin.username} onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })} className="font-latin" />
              <Input type="password" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} />
              <Input placeholder="Display name" value={newAdmin.full_name} onChange={(e) => setNewAdmin({ ...newAdmin, full_name: e.target.value })} />
              <Button onClick={createAdmin} disabled={creatingAdmin} className="w-full sm:w-auto">
                {creatingAdmin ? "Creating…" : "Create admin"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(o) => !o && setRemoveId(null)}
        title="Remove admin"
        destructive
        confirmLabel="Remove"
        loading={removing}
        onConfirm={confirmRemoveAdmin}
        description={<p>This admin will lose access to the panel.</p>}
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
