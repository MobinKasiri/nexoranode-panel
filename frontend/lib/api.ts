const API_BASE = typeof window !== "undefined"
  ? "/api"
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
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
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  login: (username: string, password: string) =>
    fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    }),

  logout: () => fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }),

  me: () => request<{ id: number; username: string; full_name: string; role: string }>("/auth/me"),

  exportTransactions: (status?: string) => {
    const q = status ? `?status=${status}` : "";
    window.open(`${API_BASE}/transactions/export${q}`, "_blank");
  },

  /** Authenticated binary fetch (receipt images — img src cannot send cookies reliably). */
  fetchBlob: async (path: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Request failed");
    }
    return res.blob();
  },

  receiptUrl: (id: number) => `${API_BASE}/transactions/${id}/receipt`,
};
