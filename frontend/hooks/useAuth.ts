"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AdminProfile } from "@/lib/permissions";

let cached: AdminProfile | null = null;

const TOKEN_KEY = "panel_access_token";

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAuthCache(admin: AdminProfile | null, accessToken?: string) {
  cached = admin;
  if (typeof window === "undefined") return;
  if (accessToken) {
    sessionStorage.setItem(TOKEN_KEY, accessToken);
  }
  if (!admin) {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

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
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}
