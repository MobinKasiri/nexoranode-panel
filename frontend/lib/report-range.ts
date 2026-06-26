export type ReportPeriod = "7d" | "30d" | "90d" | "month" | "custom";

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getReportRange(period: ReportPeriod, customFrom?: string, customTo?: string) {
  const to = new Date();
  const from = new Date();

  if (period === "7d") from.setDate(from.getDate() - 6);
  else if (period === "30d") from.setDate(from.getDate() - 29);
  else if (period === "90d") from.setDate(from.getDate() - 89);
  else if (period === "month") from.setDate(1);
  else if (period === "custom" && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }

  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export function reportQueryString(from: string, to: string): string {
  return `from_date=${from}&to_date=${to}`;
}
