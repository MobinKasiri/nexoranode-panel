"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "تایید",
  cancelLabel = "انصراف",
  loading = false,
  destructive = false,
  onConfirm,
}: Props) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title}>
      <div className="text-text-secondary text-sm mb-6 space-y-2">{description}</div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? "danger" : "default"}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? "در حال انجام..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
