"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type SearchResult = {
  users: { tg_id: number; username?: string; full_name: string }[];
  configs: { id: number; service_name: string; user_id: number }[];
  transactions: { id: number; service_name?: string; user_id: number; status: string }[];
};

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || q.trim().length < 1) {
      setResult(null);
      return;
    }
    const t = setTimeout(() => {
      api.get<SearchResult>(`/search?q=${encodeURIComponent(q.trim())}`).then(setResult).catch(() => setResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      setQ("");
      router.push(path);
    },
    [router]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:border-primary/40 transition-colors"
      >
        <Search size={16} />
        <span className="flex-1 text-right">Search…</span>
        <kbd className="hidden sm:inline text-xs font-latin opacity-60">⌘K</kbd>
      </button>

      <Modal open={open} onOpenChange={setOpen} title="Global search" className="max-w-lg">
        <Input
          autoFocus
          placeholder="Users, configs, pending orders…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="font-latin mb-4"
        />
        {!result ? (
          <p className="text-text-muted text-sm">Type to search</p>
        ) : (
          <div className="space-y-4 max-h-[50vh] overflow-y-auto text-sm">
            {result.users.length > 0 && (
              <section>
                <h4 className="text-xs text-text-muted mb-2">Users</h4>
                {result.users.map((u) => (
                  <button
                    key={u.tg_id}
                    type="button"
                    className="block w-full text-right py-2 hover:bg-surface-hover rounded px-2"
                    onClick={() => go(`/users`)}
                  >
                    {u.full_name} <span className="text-text-muted font-latin">@{u.username || u.tg_id}</span>
                  </button>
                ))}
              </section>
            )}
            {result.configs.length > 0 && (
              <section>
                <h4 className="text-xs text-text-muted mb-2">Services</h4>
                {result.configs.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="block w-full text-right py-2 hover:bg-surface-hover rounded px-2"
                    onClick={() => go("/configs")}
                  >
                    {c.service_name}
                  </button>
                ))}
              </section>
            )}
            {result.transactions.length > 0 && (
              <section>
                <h4 className="text-xs text-text-muted mb-2">Pending orders</h4>
                {result.transactions.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="block w-full text-right py-2 hover:bg-surface-hover rounded px-2"
                    onClick={() => go("/transactions")}
                  >
                    #{t.id} {t.service_name || ""}
                  </button>
                ))}
              </section>
            )}
            {!result.users.length && !result.configs.length && !result.transactions.length && (
              <p className="text-text-muted">No results</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
