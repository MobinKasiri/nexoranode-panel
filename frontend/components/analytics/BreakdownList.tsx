import Link from "next/link";
import { cn, formatToman, toPersianDigits } from "@/lib/utils";

const BAR_COLORS = [
  "from-primary/80 to-primary/40",
  "from-success/80 to-success/40",
  "from-info/80 to-info/40",
  "from-warning/80 to-warning/40",
  "from-danger/80 to-danger/40",
];

export type BreakdownRow = {
  key: string;
  label: string;
  value: number;
  sublabel?: string;
  href?: string;
};

export function BreakdownList({
  items,
  valueFormatter = (n) => formatToman(n),
  emptyLabel = "داده‌ای نیست",
  showRank = true,
}: {
  items: BreakdownRow[];
  valueFormatter?: (n: number) => string;
  emptyLabel?: string;
  showRank?: boolean;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);

  if (!items.length) {
    return <p className="text-text-muted text-sm py-6 text-center">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item, idx) => {
        const pct = Math.max(4, (item.value / max) * 100);
        const color = BAR_COLORS[idx % BAR_COLORS.length];
        const content = (
          <>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                {showRank && (
                  <span className="text-[10px] font-bold text-text-muted w-5 h-5 rounded-md bg-background flex items-center justify-center shrink-0">
                    {toPersianDigits(idx + 1)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-xs text-text-muted truncate">{item.sublabel}</p>
                  )}
                </div>
              </div>
              <span className="text-sm font-semibold whitespace-nowrap">{valueFormatter(item.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-border/80 overflow-hidden">
              <div
                className={cn("h-full rounded-full bg-gradient-to-l transition-all duration-500", color)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        );

        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className="block rounded-lg p-2 -mx-2 hover:bg-surface-hover transition-colors">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
