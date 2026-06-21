import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Western digits (0-9) — matches bot display. */
export function toPersianDigits(value: string | number): string {
  return String(value);
}

export function formatToman(amount: number): string {
  return amount.toLocaleString("en-US") + " T";
}

export function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  return gb.toFixed(1) + " GB";
}

export function trafficPercent(used: number, limit: number): number {
  if (!limit) return 0;
  return Math.min(100, (used / limit) * 100);
}

export function trafficBarColor(pct: number): string {
  if (pct >= 80) return "bg-danger";
  if (pct >= 60) return "bg-warning";
  return "bg-success";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function discountStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: "فعال",
    expired: "منقضی",
    disabled: "غیرفعال",
    exhausted: "تمام شده",
  };
  return map[status] || status;
}
