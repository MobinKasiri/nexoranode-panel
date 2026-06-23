"use client";

import { useEffect, useRef } from "react";

/**
 * When filter values change, reset table page to 1 in the URL.
 * Does NOT run on unrelated URL updates (e.g. page/limit alone).
 */
export function useFilterPageReset(
  filters: Record<string, string>,
  setParams: (updates: Record<string, string | number | null | undefined>) => void
) {
  const prev = useRef<Record<string, string>>({});
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      prev.current = { ...filters };
      return;
    }

    const changed = Object.keys(filters).some(
      (key) => prev.current[key] !== filters[key]
    );
    prev.current = { ...filters };
    if (!changed) return;

    const updates: Record<string, string | number | null | undefined> = { page: 1 };
    for (const [key, val] of Object.entries(filters)) {
      updates[key] = val || null;
    }
    setParams(updates);
  }, [filters, setParams]);
}
