"use client";

import { useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { UserDrawer } from "@/components/users/UserDrawer";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/api";
import { formatToman } from "@/lib/utils";
import type { UserItem } from "@/types";

const USER_FILTERS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "banned", label: "Banned" },
];

export default function UsersPage() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filter) params.set("filter", filter);
    api
      .get<{ items: UserItem[] }>(`/users?${params}`)
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filter) params.set("filter", filter);
    api
      .get<{ items: UserItem[] }>(`/users?${params}`)
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, [debouncedSearch, filter]);

  return (
    <AppShell>
      <PageHeader title="Users" description="Manage bot users and wallets" />

      <div className="space-y-4 mb-6">
        <FilterChips options={USER_FILTERS} value={filter} onChange={setFilter} />
        <div className="search-input-wrap max-w-md">
          <Search size={16} />
          <Input
            placeholder="Search name, username, or Telegram ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="font-latin"
          />
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="p-4 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Users} title="No users found" description="Try a different search or filter" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Balance</th>
                <th>Services</th>
                <th>Purchases</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr
                  key={u.tg_id}
                  className="cursor-pointer hover:bg-surface-hover"
                  onClick={() => setSelectedId(u.tg_id)}
                >
                  <td className="font-latin">{u.tg_id}</td>
                  <td>
                    <div className="font-medium">{u.full_name || "—"}</div>
                    <div className="text-xs text-text-muted font-latin">@{u.username || "—"}</div>
                  </td>
                  <td>{formatToman(u.balance)}</td>
                  <td>{u.active_configs}</td>
                  <td>{u.purchases}</td>
                  <td>
                    <Badge status={u.is_banned ? "rejected" : "confirmed"}>
                      {u.is_banned ? "Banned" : "Active"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <UserDrawer tgId={selectedId} onClose={() => setSelectedId(null)} onUpdated={load} />
    </AppShell>
  );
}
