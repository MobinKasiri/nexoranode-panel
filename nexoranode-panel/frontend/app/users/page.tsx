"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Eye } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatToman, toPersianDigits } from "@/lib/utils";
import type { UserItem } from "@/types";

export default function UsersPage() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filter) params.set("filter", filter);
    api.get<{ items: UserItem[] }>(`/users?${params}`)
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, [search, filter]);

  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-6">کاربران</h1>
      <div className="flex flex-wrap gap-2 mb-4">
        {["", "active", "banned"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${filter === f ? "bg-primary/20 border-primary" : "border-border"}`}>
            {f === "" ? "همه" : f === "active" ? "فعال" : "بن شده"}
          </button>
        ))}
      </div>
      <div className="relative mb-4">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input placeholder="جستجو..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
      </div>
      <Card className="overflow-x-auto p-0">
        {loading ? <div className="p-4"><Skeleton className="h-48" /></div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="p-3 text-right">آیدی</th>
                <th className="p-3 text-right">نام</th>
                <th className="p-3 text-right">موجودی</th>
                <th className="p-3 text-right">سرویس‌ها</th>
                <th className="p-3 text-right">خریدها</th>
                <th className="p-3 text-right">وضعیت</th>
                <th className="p-3 text-right">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.tg_id} className="border-b border-border/50 hover:bg-surface-hover">
                  <td className="p-3 font-latin">{u.tg_id}</td>
                  <td className="p-3"><div>{u.full_name}</div><div className="text-xs text-text-muted">@{u.username}</div></td>
                  <td className="p-3">{formatToman(u.balance)}</td>
                  <td className="p-3">{toPersianDigits(u.active_configs)}</td>
                  <td className="p-3">{toPersianDigits(u.purchases)}</td>
                  <td className="p-3"><Badge status={u.is_banned ? "rejected" : "confirmed"}>{u.is_banned ? "بن" : "فعال"}</Badge></td>
                  <td className="p-3"><Link href={`/users/${u.tg_id}`}><Button size="icon" variant="ghost"><Eye size={16} /></Button></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  );
}
