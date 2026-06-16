import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[parseInt(d, 10)]);
}

export function formatToman(amount: number): string {
  return toPersianDigits(amount.toLocaleString("en-US")) + " ت";
}

export function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  return toPersianDigits(gb.toFixed(1)) + " GB";
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
  return toPersianDigits(
    d.toLocaleDateString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  );
}
