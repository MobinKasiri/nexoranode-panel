import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  trend,
  trendLabel,
  accent = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  trend?: number;
  trendLabel?: string;
  accent?: "primary" | "success" | "warning" | "danger" | "info";
}) {
  const accentMap = {
    primary: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
    info: "bg-info/15 text-info",
  };

  const trendUp = trend != null && trend >= 0;

  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-text-muted text-xs font-medium">{label}</p>
          <p className="text-xl sm:text-2xl font-bold mt-1.5 truncate">{value}</p>
          {hint && <p className="text-xs text-text-secondary mt-1">{hint}</p>}
          {trend != null && (
            <div
              className={cn(
                "inline-flex items-center gap-1 mt-2 text-xs font-medium rounded-md px-2 py-0.5",
                trendUp ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
              )}
            >
              {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{trendLabel ?? `${Math.abs(trend)}%`}</span>
            </div>
          )}
        </div>
        <div className={cn("p-2.5 rounded-xl shrink-0", accentMap[accent])}>
          <Icon size={18} />
        </div>
      </div>
    </Card>
  );
}
