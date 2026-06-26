"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toPersianDigits } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { canAccessSearchResult } from "@/lib/permissions";

type SearchResult = {
  users: { tg_id: number; username?: string; full_name: string }[];
  configs: { id: number; service_name: string; user_id: number }[];
  transactions: { id: number; service_name?: string; user_id: number; status: string }[];
};

const emptyResult: SearchResult = { users: [], configs: [], transactions: [] };

export function SearchCommand() {
  const { admin } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
    if (!open) {
      setQ("");
      setResult(null);
      setError("");
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    if (!open || query.length < 1) {
      setResult(null);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    const t = setTimeout(() => {
      api
        .get<SearchResult>(`/search?q=${encodeURIComponent(query)}`)
        .then((data) => {
          setResult(data);
          setError("");
        })
        .catch((err) => {
          setResult(emptyResult);
          setError(err instanceof Error ? err.message : "خطا در جستجو");
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(t);
  }, [q, open]);

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [router]
  );

  const hasResults =
    result &&
    (result.users.length > 0 || result.configs.length > 0 || result.transactions.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:border-primary/40 transition-colors"
      >
        <Search size={16} />
        <span className="flex-1 text-right">جستجو…</span>
        <kbd className="hidden sm:inline text-xs font-latin opacity-60">⌘K</kbd>
      </button>

      <Modal open={open} onOpenChange={setOpen} title="جستجوی سراسری" className="max-w-lg">
        <Input
          autoFocus
          placeholder="کاربر، سرویس، شماره تراکنش…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-4"
        />

        {loading && (
          <div className="flex items-center gap-2 text-sm text-text-muted py-4">
            <Loader2 size={16} className="animate-spin" />
            در حال جستجو…
          </div>
        )}

        {!loading && error && <p className="text-danger text-sm py-2">{error}</p>}

        {!loading && !error && q.trim().length < 1 && (
          <p className="text-text-muted text-sm">نام کاربر، آیدی تلگرام یا نام سرویس را وارد کنید</p>
        )}

        {!loading && !error && q.trim().length >= 1 && result && !hasResults && (
          <p className="text-text-muted text-sm">نتیجه‌ای یافت نشد</p>
        )}

        {!loading && result && hasResults && (
          <div className="space-y-4 max-h-[50vh] overflow-y-auto text-sm">
            {result.users.length > 0 && canAccessSearchResult(admin, "users") && (
              <section>
                <h4 className="text-xs text-text-muted mb-2">کاربران</h4>
                {result.users.map((u) => (
                  <button
                    key={u.tg_id}
                    type="button"
                    className="block w-full text-right py-2 hover:bg-surface-hover rounded px-2"
                    onClick={() => go(`/users/${u.tg_id}`)}
                  >
                    {u.full_name}{" "}
                    <span className="text-text-muted font-latin">@{u.username || u.tg_id}</span>
                  </button>
                ))}
              </section>
            )}
            {result.configs.length > 0 && canAccessSearchResult(admin, "configs") && (
              <section>
                <h4 className="text-xs text-text-muted mb-2">سرویس‌ها</h4>
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
            {result.transactions.length > 0 && canAccessSearchResult(admin, "transactions") && (
              <section>
                <h4 className="text-xs text-text-muted mb-2">تراکنش‌های در انتظار</h4>
                {result.transactions.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="block w-full text-right py-2 hover:bg-surface-hover rounded px-2"
                    onClick={() => go("/transactions")}
                  >
                    #{toPersianDigits(t.id)} {t.service_name || ""}
                  </button>
                ))}
              </section>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
