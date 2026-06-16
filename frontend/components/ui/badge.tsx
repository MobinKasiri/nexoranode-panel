import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  pending: "bg-warning/20 text-warning",
  confirmed: "bg-success/20 text-success",
  rejected: "bg-danger/20 text-danger",
  active: "bg-success/20 text-success",
  inactive: "bg-text-muted/20 text-text-muted",
};

const labels: Record<string, string> = {
  pending: "در انتظار",
  confirmed: "تایید شده",
  rejected: "رد شده",
  active: "فعال",
};

export function Badge({ status, children }: { status: string; children?: React.ReactNode }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", variants[status] || variants.inactive)}>
      {children || labels[status] || status}
    </span>
  );
}
