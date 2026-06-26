"use client";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toPersianDigits } from "@/lib/utils";

export function LimitField({
  label,
  hint,
  value,
  unlimited,
  onValueChange,
  onUnlimitedChange,
}: {
  label: string;
  hint?: string;
  value: string;
  unlimited: boolean;
  onValueChange: (v: string) => void;
  onUnlimitedChange: (v: boolean) => void;
}) {
  return (
    <div>
      <label className="text-xs text-text-muted block mb-1.5">{label}</label>
      {hint && <p className="text-[11px] text-text-muted mb-2">{hint}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="number"
          min={1}
          value={value}
          disabled={unlimited}
          onChange={(e) => onValueChange(e.target.value)}
          className="font-latin w-32"
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox checked={unlimited} onCheckedChange={(c) => onUnlimitedChange(c === true)} />
          نامحدود
        </label>
      </div>
    </div>
  );
}

export function formatLimit(n: number): string {
  return n <= 0 ? "نامحدود" : toPersianDigits(n);
}

export function limitToApi(value: string, unlimited: boolean): number {
  if (unlimited) return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
