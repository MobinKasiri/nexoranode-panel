"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AdminProfile } from "@/lib/permissions";

let cached: AdminProfile | null = null;

export function useAuth() {
  const [admin, setAdmin] = useState<AdminProfile | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) {
      setAdmin(cached);
      setLoading(false);
      return;
    }
    api
      .me()
      .then((me) => {
        cached = me;
        setAdmin(me);
      })
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
  }, []);

  const refresh = async () => {
    const me = await api.me();
    cached = me;
    setAdmin(me);
    return me;
  };

  return { admin, loading, refresh };
}

export function clearAuthCache() {
  cached = null;
}
