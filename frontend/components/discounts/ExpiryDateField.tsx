"use client";

import { Calendar, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

function splitExpiry(value: string) {
  if (!value) return { date: "", time: "23:59" };
  const [date, time = "23:59"] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

function combineExpiry(date: string, time: string) {
  if (!date) return "";
  return `${date}T${time || "23:59"}`;
}

export function ExpiryDateField({ value, onChange, className }: Props) {
  const { date, time } = splitExpiry(value);

  const setDate = (nextDate: string) => onChange(combineExpiry(nextDate, time));
  const setTime = (nextTime: string) => onChange(combineExpiry(date, nextTime));

  const applyPreset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setSeconds(0, 0);
    const isoDate = d.toISOString().slice(0, 10);
    const isoTime = d.toTimeString().slice(0, 5);
    onChange(combineExpiry(isoDate, isoTime));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-text-muted block mb-1.5">تاریخ انقضا</label>
          <div className="relative">
            <Calendar size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="font-latin pr-10"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-text-muted block mb-1.5">ساعت</label>
          <div className="relative">
            <Clock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!date}
              className="font-latin pr-10"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => applyPreset(1)}>
          ۲۴ ساعت
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => applyPreset(7)}>
          ۷ روز
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => applyPreset(30)}>
          ۳۰ روز
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")} className="text-text-muted">
            <X size={14} className="ml-1" />
            بدون انقضا
          </Button>
        )}
      </div>

      <p className="text-xs text-text-muted">
        {value ? `تا ${formatDate(value)}` : "بدون تاریخ انقضا — کد تا زمان غیرفعال‌سازی معتبر است"}
      </p>
    </div>
  );
}
