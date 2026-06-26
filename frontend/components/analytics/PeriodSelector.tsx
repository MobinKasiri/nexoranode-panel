"use client";

import { FilterChips } from "@/components/ui/filter-chips";
import { Input } from "@/components/ui/input";
import type { ReportPeriod } from "@/lib/report-range";
import { toPersianDigits } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { key: "7d", label: "۷ روز" },
  { key: "30d", label: "۳۰ روز" },
  { key: "90d", label: "۹۰ روز" },
  { key: "month", label: "این ماه" },
  { key: "custom", label: "سفارشی" },
];

export function PeriodSelector({
  period,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: {
  period: ReportPeriod;
  onPeriodChange: (p: ReportPeriod) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <FilterChips
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(k) => onPeriodChange(k as ReportPeriod)}
      />
      {period === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-surface/50 p-3">
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted">از تاریخ</label>
            <Input
              type="date"
              className="date-field-input font-latin w-40"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted">تا تاریخ</label>
            <Input
              type="date"
              className="date-field-input font-latin w-40"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
            />
          </div>
        </div>
      )}
      {period !== "custom" && customFrom && customTo && (
        <p className="text-xs text-text-muted">
          بازه: {toPersianDigits(customFrom)} — {toPersianDigits(customTo)}
        </p>
      )}
    </div>
  );
}
