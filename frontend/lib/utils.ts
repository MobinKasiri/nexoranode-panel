import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[parseInt(d, 10)]);
}

export function formatToman(amount: number): string {
  return `${toPersianDigits(amount.toLocaleString("fa-IR"))} تومان`;
}

export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return `${toPersianDigits(gb.toFixed(1))} گیگ`;
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

/** Parse ISO datetime from panel API. Naive values are UTC (DB stores UTC). */
export function parseApiDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const raw = iso.trim();
  if (!raw) return null;

  // Date-only fields (expiry etc.) — avoid UTC midnight shifting the calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let normalized = raw;
  if (/T/.test(normalized) && !/[zZ]|[+-]\d{2}(:\d{2})?$/.test(normalized)) {
    normalized = `${normalized}Z`;
  }

  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string | null | undefined): string {
  const d = parseApiDate(iso);
  if (!d) return "—";
  return toPersianDigits(
    d.toLocaleString("fa-IR", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
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

export function remainingPersianFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = parseApiDate(iso);
  if (!d) return null;
  const delta = d.getTime() - Date.now();
  if (delta <= 0) return null;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 60) return `${toPersianDigits(minutes)} دقیقه`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem) return `${toPersianDigits(hours)} ساعت و ${toPersianDigits(rem)} دقیقه`;
  return `${toPersianDigits(hours)} ساعت`;
}

export function adminRoleLabel(role: string): string {
  const map: Record<string, string> = {
    superadmin: "مدیر کل",
    admin: "مدیر",
  };
  return map[role] || role;
}
