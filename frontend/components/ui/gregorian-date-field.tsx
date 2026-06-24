"use client";

import { Calendar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, toPersianDigits } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  min?: string;
};

function addDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatPersianPreview(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return toPersianDigits(
    d.toLocaleDateString("fa-IR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  );
}

const PRESETS = [
  { label: "۷ روز", days: 7 },
  { label: "۳۰ روز", days: 30 },
  { label: "۹۰ روز", days: 90 },
  { label: "۱ سال", days: 365 },
] as const;

export function GregorianDateField({ value, onChange, disabled, className, min }: Props) {
  const preview = formatPersianPreview(value);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-background/40 p-3 space-y-3 transition-opacity",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-primary">تاریخ انقضا</p>
          <p className="text-xs text-text-muted mt-0.5">تقویم میلادی — برای پنل ۳X-UI</p>
        </div>
        {value && !disabled && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-text-muted shrink-0"
            onClick={() => onChange("")}
          >
            <X size={14} className="ml-1" />
            پاک
          </Button>
        )}
      </div>

      <div className="relative">
        <Calendar
          size={18}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/80 pointer-events-none z-10"
        />
        <input
          type="date"
          value={value}
          min={min ?? today}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "date-field-input flex h-11 w-full rounded-lg border border-border bg-surface",
            "px-3 py-2 pr-11 text-sm text-text-primary",
            "focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/50",
            "disabled:cursor-not-allowed"
          )}
        />
      </div>

      {!disabled && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.days}
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => onChange(addDaysFromToday(preset.days))}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      <p className="text-xs text-text-muted leading-relaxed min-h-[1.25rem]">
        {disabled
          ? "با «شروع پس از اولین اتصال»، تاریخ ثابت ندارید — مدت از اولین اتصال کاربر شمارش می‌شود."
          : preview
            ? `معادل شمسی: ${preview}`
            : "تاریخی انتخاب نشده — از دکمه‌های سریع یا تقویم استفاده کنید."}
      </p>
    </div>
  );
}
