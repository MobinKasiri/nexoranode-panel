"use client";

import { Copy } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface CopyableValueProps {
  value: string | number | null | undefined;
  className?: string;
  label?: string;
}

export function CopyableValue({ value, className, label }: CopyableValueProps) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!text) return <span className="text-text-muted">—</span>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("کپی شد");
    } catch {
      toast.error("کپی ناموفق");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="کلیک برای کپی"
      className={cn(
        "group inline-flex items-center gap-1.5 font-latin tabular-nums text-left hover:text-primary transition-colors",
        className
      )}
    >
      {label ? <span className="sr-only">{label}</span> : null}
      <span>{text}</span>
      <Copy size={14} className="opacity-0 group-hover:opacity-60 shrink-0" />
    </button>
  );
}
