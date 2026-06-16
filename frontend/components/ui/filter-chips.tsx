import { cn } from "@/lib/utils";

export interface FilterOption {
  key: string;
  label: string;
  badge?: number;
}

export function FilterChips({
  options,
  value,
  onChange,
}: {
  options: FilterOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={cn(
            "px-3 py-2 rounded-lg text-sm border transition-colors min-h-[40px]",
            value === opt.key
              ? "bg-primary/15 border-primary text-primary font-medium"
              : "border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          )}
        >
          {opt.label}
          {opt.badge != null && opt.badge > 0 && (
            <span className="mr-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-warning/20 text-warning text-xs">
              {opt.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
