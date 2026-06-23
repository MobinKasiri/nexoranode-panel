"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const DEFAULT_LIMIT = 20;
const ALLOWED_LIMITS = [10, 20, 50, 100];

export function useTableQuery(extraKeys: string[] = []) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const rawLimit = parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
  const limit = ALLOWED_LIMITS.includes(rawLimit) ? rawLimit : DEFAULT_LIMIT;

  const extras = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of extraKeys) {
      const val = searchParams.get(key);
      if (val) out[key] = val;
    }
    return out;
  }, [searchParams, extraKeys]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.get("page")) params.set("page", String(page));
    if (!params.get("limit")) params.set("limit", String(limit));
    return params.toString();
  }, [searchParams, page, limit]);

  const setParams = useCallback(
    (updates: Record<string, string | number | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (val === null || val === undefined || val === "") {
          params.delete(key);
        } else {
          params.set(key, String(val));
        }
      }
      if (!params.has("limit")) params.set("limit", String(limit));
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams, limit]
  );

  const setPage = useCallback(
    (p: number) => setParams({ page: Math.max(1, p) }),
    [setParams]
  );

  const setLimit = useCallback(
    (l: number) => setParams({ limit: l, page: 1 }),
    [setParams]
  );

  return {
    page,
    limit,
    extras,
    queryString,
    setParams,
    setPage,
    setLimit,
    allowedLimits: ALLOWED_LIMITS,
  };
}
