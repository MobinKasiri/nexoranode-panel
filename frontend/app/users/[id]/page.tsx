"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AppShell } from "@/components/layout/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatBytes, formatDate, formatToman, toPersianDigits, trafficBarColor, trafficPercent } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";

export default function UserDetailPage() {
  const { admin } = useAuth();
  const canWrite = hasPermission(admin, "users", "write");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState("configs");
  const [showBalance, setShowBalance] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get<Record<string, unknown>>(`/users/${id}`).then(setUser).finally(() => setLoading(false));
  };

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addBalance = async () => {
    try {
      await api.post(`/users/${id}/add-balance`, { amount: parseInt(amount, 10) });
      toast.success("موجودی افزایش یافت");
      setShowBalance(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    }
  };

  const toggleBan = async () => {
    const banned = user?.is_banned as boolean;
    await api.post(`/users/${id}/${banned ? "unban" : "ban"}`);
    toast.success(banned ? "آنبن شد" : "بن شد");
    load();
  };

  if (loading) return <AppShell><Skeleton className="h-64" /></AppShell>;
  if (!user) return <AppShell><p>کاربر یافت نشد</p></AppShell>;

  const configs = (user.configs as Record<string, unknown>[]) || [];
  const transactions = (user.transactions as Record<string, unknown>[]) || [];
  const referrals = (user.referrals as Record<string, unknown>[]) || [];

  return (
    <AppShell>
      <button onClick={() => router.back()} className="text-text-muted text-sm mb-4 hover:text-text-primary">← بازگشت</button>
      <Card className="mb-6">
        <h1 className="text-xl font-bold">{user.full_name as string}</h1>
        <p className="text-text-muted text-sm">@{user.username as string} | ID: {user.tg_id as number}</p>
        {canWrite && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" onClick={() => setShowBalance(true)}>💰 افزایش موجودی</Button>
            <Button size="sm" variant="danger" onClick={toggleBan}>
              {user.is_banned ? "آنبن" : "🚫 بن کردن"}
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
          <Stat label="موجودی" value={formatToman(user.balance as number)} />
          <Stat label="خریدها" value={toPersianDigits(transactions.length)} />
          <Stat label="زیرمجموعه" value={toPersianDigits(referrals.length)} />
        </div>
      </Card>

      <div className="flex gap-2 mb-4 border-b border-border">
        {["configs", "transactions", "referrals"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-text-muted"}`}>
            {t === "configs" ? "سرویس‌ها" : t === "transactions" ? "تراکنش‌ها" : "زیرمجموعه‌ها"}
          </button>
        ))}
      </div>

      {tab === "configs" && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-text-muted">
              <th className="p-3 text-right">نام</th><th className="p-3 text-right">مصرف</th><th className="p-3 text-right">انقضا</th><th className="p-3 text-right">وضعیت</th>
            </tr></thead>
            <tbody>
              {configs.map((c) => {
                const pct = trafficPercent(c.traffic_used_bytes as number, c.traffic_limit_bytes as number);
                return (
                  <tr key={c.id as number} className="border-b border-border/50">
                    <td className="p-3">{c.service_name as string}</td>
                    <td className="p-3">
                      <div className="h-2 w-24 rounded-full bg-border overflow-hidden inline-block align-middle ml-2">
                        <div className={`h-full ${trafficBarColor(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      {formatBytes(c.traffic_used_bytes as number)}/{formatBytes(c.traffic_limit_bytes as number)}
                    </td>
                    <td className="p-3">{formatDate(c.expiry_date as string)}</td>
                    <td className="p-3">{c.is_active ? "✅" : "⏸"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "transactions" && (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-text-muted">
              <th className="p-3">#</th><th className="p-3">مبلغ</th><th className="p-3">نوع</th><th className="p-3">وضعیت</th>
            </tr></thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id as number} className="border-b border-border/50">
                  <td className="p-3">{toPersianDigits(t.id as number)}</td>
                  <td className="p-3">{formatToman(t.payment_amount as number)}</td>
                  <td className="p-3">{t.type as string}</td>
                  <td className="p-3">{t.status as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "referrals" && (
        <Card>
          {referrals.length === 0 ? <p className="text-text-muted text-sm">زیرمجموعه‌ای ندارد</p> : (
            <ul className="space-y-2 text-sm">
              {referrals.map((r) => (
                <li key={r.referred_id as number}>آیدی {r.referred_id as number} — {toPersianDigits(r.purchase_count as number)} خرید</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal open={showBalance} onOpenChange={setShowBalance} title="افزایش موجودی">
        <Input type="number" placeholder="مبلغ (تومان)" value={amount} onChange={(e) => setAmount(e.target.value)} className="mb-4" />
        <Button onClick={addBalance}>تایید</Button>
      </Modal>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-background p-3"><div className="text-text-muted text-xs">{label}</div><div className="font-semibold mt-1">{value}</div></div>;
}
