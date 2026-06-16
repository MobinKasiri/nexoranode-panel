"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/layout/Sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatBytes, formatDate, toPersianDigits, trafficBarColor, trafficPercent } from "@/lib/utils";
import type { VPNConfigItem } from "@/types";

export default function ConfigsPage() {
  const [items, setItems] = useState<VPNConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = () => {
    api.get<{ items: VPNConfigItem[] }>("/configs").then((d) => setItems(d.items)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const syncAll = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ synced: number; total: number }>("/configs/sync-all");
      toast.success(`${toPersianDigits(r.synced)} از ${toPersianDigits(r.total)} همگام شد`);
      load();
    } finally {
      setSyncing(false);
    }
  };

  const toggle = async (id: number) => {
    await api.post(`/configs/${id}/toggle`);
    load();
  };

  const del = async (id: number) => {
    if (!confirm("حذف سرویس؟")) return;
    await api.delete(`/configs/${id}`);
    toast.success("حذف شد");
    load();
  };

  return (
    <AppShell>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">مدیریت سرویس‌ها</h1>
        <Button onClick={syncAll} disabled={syncing}>{syncing ? "همگام‌سازی..." : "همگام‌سازی همه"}</Button>
      </div>
      <Card className="overflow-x-auto p-0">
        {loading ? <Skeleton className="h-48 m-4" /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="p-3 text-right">نام</th>
                <th className="p-3 text-right">کاربر</th>
                <th className="p-3 text-right">مصرف</th>
                <th className="p-3 text-right">انقضا</th>
                <th className="p-3 text-right">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const pct = trafficPercent(c.traffic_used_bytes, c.traffic_limit_bytes);
                return (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="p-3">{c.service_name}</td>
                    <td className="p-3">@{c.username || c.user_id}</td>
                    <td className="p-3">
                      <div className="h-2 w-20 rounded-full bg-border overflow-hidden inline-block">
                        <div className={`h-full ${trafficBarColor(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-text-muted mr-2">{formatBytes(c.traffic_used_bytes)}/{formatBytes(c.traffic_limit_bytes)}</span>
                    </td>
                    <td className="p-3">{formatDate(c.expiry_date)}</td>
                    <td className="p-3">
                      <Button size="sm" variant="outline" onClick={() => toggle(c.id)}>{c.is_active ? "⏸" : "▶"}</Button>
                      <Button size="sm" variant="danger" className="mr-1" onClick={() => del(c.id)}>🗑</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  );
}
