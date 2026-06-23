"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toPersianDigits } from "@/lib/utils";

interface TablePaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  allowedLimits?: number[];
}

export function TablePagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  allowedLimits = [10, 20, 50, 100],
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/60 text-sm">
      <p className="text-text-muted tabular-nums">
        نمایش {toPersianDigits(start)}–{toPersianDigits(end)} از {toPersianDigits(total)}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-text-muted">
          <span>در صفحه</span>
          <select
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm font-latin"
            value={limit}
            onChange={(e) => onLimitChange(parseInt(e.target.value, 10))}
          >
            {allowedLimits.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="صفحه قبل"
          >
            <ChevronRight size={16} />
          </Button>
          <span className="px-2 tabular-nums font-latin min-w-[4rem] text-center">
            {page} / {totalPages}
          </span>
          <Button
            size="icon"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="صفحه بعد"
          >
            <ChevronLeft size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
