import { cn, toPersianDigits } from "@/lib/utils";

export function ResourceGauge({
  label,
  value,
  unit,
  warnAt = 80,
  criticalAt = 90,
  detail,
}: {
  label: string;
  value: number;
  unit?: string;
  warnAt?: number;
  criticalAt?: number;
  detail?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  const tone =
    pct >= criticalAt ? "text-danger" : pct >= warnAt ? "text-warning" : "text-primary";
  const barTone =
    pct >= criticalAt ? "bg-danger" : pct >= warnAt ? "bg-warning" : "bg-primary";

  return (
    <div className="rounded-xl border border-border/60 bg-background/30 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm text-text-muted">{label}</span>
        <span className={cn("text-sm font-semibold tabular-nums", tone)}>
          {toPersianDigits(pct.toFixed(0))}
          {unit ?? "%"}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-border overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barTone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {detail && <p className="text-xs text-text-muted mt-2">{detail}</p>}
    </div>
  );
}

export function StatusPill({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/30 px-3 py-2.5">
      <span className="text-sm text-text-muted">{label}</span>
      <div className="text-left">
        <span className={cn("text-sm font-medium", ok ? "text-success" : "text-danger")}>
          {ok ? "● فعال" : "● متوقف"}
        </span>
        {detail && <p className="text-xs text-text-muted mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}
