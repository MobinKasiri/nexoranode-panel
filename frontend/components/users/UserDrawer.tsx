"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, formatDate, formatToman } from "@/lib/utils";

type UserDetail = {
  tg_id: number;
  username?: string;
  full_name: string;
  balance: number;
  is_banned: boolean;
  created_at: string;
  total_spend?: number;
  configs: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
};

type AuditEntry = {
  id: number;
  action: string;
  details?: string;
  created_at: string;
};

type Props = {
  tgId: number | null;
  onClose: () => void;
  onUpdated?: () => void;
};

export function UserDrawer({ tgId, onClose, onUpdated }: Props) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"configs" | "transactions" | "audit">("configs");
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!tgId) return;
    setLoading(true);
    Promise.all([
      api.get<UserDetail>(`/users/${tgId}`),
      api.get<{ items: AuditEntry[] }>(`/users/${tgId}/audit?limit=20`),
    ])
      .then(([u, a]) => {
        setUser(u);
        setAudit(a.items);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (tgId) load();
    else {
      setUser(null);
      setAudit([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tgId]);

  const toggleBan = async () => {
    if (!user) return;
    try {
      await api.post(`/users/${user.tg_id}/${user.is_banned ? "unban" : "ban"}`);
      toast.success(user.is_banned ? "Unbanned" : "Banned");
      load();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const adjustBalance = async () => {
    if (!user || !note.trim()) {
      toast.error("Reason is required");
      return;
    }
    const num = parseInt(amount, 10);
    if (!num) return;
    setSubmitting(true);
    try {
      await api.post(`/users/${user.tg_id}/adjust-balance`, { amount: num, note: note.trim() });
      toast.success("Balance updated");
      setBalanceOpen(false);
      setAmount("");
      setNote("");
      load();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const sendMessage = async () => {
    if (!user || !message.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/users/${user.tg_id}/message`, { text: message.trim() });
      toast.success("Message sent");
      setMessageOpen(false);
      setMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!tgId) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 lg:bg-black/40" onClick={onClose} aria-hidden />
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-full max-w-md bg-surface border-r border-border shadow-xl",
          "flex flex-col animate-in slide-in-from-left duration-200"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">User profile</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading || !user ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <div>
                <h3 className="text-lg font-bold">{user.full_name || "—"}</h3>
                <p className="text-text-muted text-sm font-latin">@{user.username || "—"} · ID {user.tg_id}</p>
                <p className="text-text-muted text-xs mt-1">Joined {formatDate(user.created_at)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-text-muted text-xs">Balance</p>
                  <p className="font-semibold">{formatToman(user.balance)}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-text-muted text-xs">Total spend</p>
                  <p className="font-semibold">{formatToman(user.total_spend || 0)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge status={user.is_banned ? "rejected" : "confirmed"}>
                  {user.is_banned ? "Banned" : "Active"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setBalanceOpen(true)}>Wallet</Button>
                <Button size="sm" variant="outline" onClick={() => setMessageOpen(true)}>Send DM</Button>
                <Button size="sm" variant={user.is_banned ? "default" : "danger"} onClick={toggleBan}>
                  {user.is_banned ? "Unban" : "Ban"}
                </Button>
              </div>

              <div className="flex gap-2 border-b border-border">
                {(["configs", "transactions", "audit"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "px-3 py-2 text-sm border-b-2 -mb-px capitalize",
                      tab === t ? "border-primary text-primary" : "border-transparent text-text-muted"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "configs" && (
                <ul className="space-y-2 text-sm">
                  {user.configs.length === 0 ? (
                    <p className="text-text-muted">No services</p>
                  ) : (
                    user.configs.map((c) => (
                      <li key={c.id as number} className="rounded-lg border border-border p-3">
                        <p className="font-medium">{c.service_name as string}</p>
                        <p className="text-text-muted text-xs">{c.plan_gb as number} GB · {c.is_active ? "Active" : "Off"}</p>
                      </li>
                    ))
                  )}
                </ul>
              )}

              {tab === "transactions" && (
                <ul className="space-y-2 text-sm">
                  {user.transactions.length === 0 ? (
                    <p className="text-text-muted">No transactions</p>
                  ) : (
                    user.transactions.map((t) => (
                      <li key={t.id as number} className="flex justify-between border-b border-border/50 py-2">
                        <span>{t.type as string}</span>
                        <span>{formatToman(t.amount as number)}</span>
                      </li>
                    ))
                  )}
                </ul>
              )}

              {tab === "audit" && (
                <ul className="space-y-2 text-sm">
                  {audit.length === 0 ? (
                    <p className="text-text-muted">No admin actions yet</p>
                  ) : (
                    audit.map((a) => (
                      <li key={a.id} className="rounded-lg border border-border/50 p-2">
                        <p className="font-medium">{a.action}</p>
                        <p className="text-text-muted text-xs">{formatDate(a.created_at)}</p>
                        {a.details && <p className="text-xs mt-1">{a.details}</p>}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      </aside>

      <Modal open={balanceOpen} onOpenChange={setBalanceOpen} title="Adjust balance">
        <p className="text-sm text-text-muted mb-3">Use negative amount to deduct. Reason is required.</p>
        <div className="space-y-3">
          <Input type="number" placeholder="Amount (+/-)" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-latin" />
          <Input placeholder="Reason" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={adjustBalance} disabled={submitting} className="w-full">
            {submitting ? "Saving…" : "Apply"}
          </Button>
        </div>
      </Modal>

      <Modal open={messageOpen} onOpenChange={setMessageOpen} title="Send Telegram message">
        <textarea
          className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[120px] mb-3"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="HTML supported"
        />
        <Button onClick={sendMessage} disabled={submitting} className="w-full">
          {submitting ? "Sending…" : "Send"}
        </Button>
      </Modal>
    </>
  );
}
