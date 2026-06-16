import { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="mb-4 rounded-full bg-surface-hover p-4 text-text-muted">
          <Icon size={28} />
        </div>
      )}
      <p className="text-text-primary font-medium">{title}</p>
      {description && <p className="text-text-muted text-sm mt-1 max-w-sm">{description}</p>}
    </div>
  );
}
