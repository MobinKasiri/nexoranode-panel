const API_BASE = typeof window !== "undefined"
  ? "/api"
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = sessionStorage.getItem("panel_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatApiError(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: string }).msg);
        }
        return JSON.stringify(item);
      })
      .join(" — ");
  }
  return fallback;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: isFormData
      ? { ...authHeaders(), ...(options.headers || {}) }
      : {
          "Content-Type": "application/json",
          ...authHeaders(),
          ...(options.headers || {}),
        },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(formatApiError(err.detail, res.statusText || "Request failed"));
  }
  if (res.headers.get("content-type")?.includes("application/json")) {
    return res.json();
  }
  return res as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  login: (username: string, password: string) =>
    fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    }),

  logout: async () => {
    const { clearAuthCache } = await import("@/hooks/useAuth");
    clearAuthCache();
    return fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
  },

  me: () =>
    request<import("@/lib/permissions").AdminProfile>("/auth/me"),

  exportTransactions: (status?: string) => {
    const q = status ? `?status=${status}` : "";
    window.open(`${API_BASE}/transactions/export${q}`, "_blank");
  },

  /** Authenticated binary fetch (receipt images — img src cannot send cookies reliably). */
  fetchBlob: async (path: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(formatApiError(err.detail, res.statusText || "Request failed"));
    }
    return res.blob();
  },

  receiptUrl: (id: number) => `${API_BASE}/transactions/${id}/receipt`,
};
