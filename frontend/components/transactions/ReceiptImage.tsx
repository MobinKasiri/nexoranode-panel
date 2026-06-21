"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  txId: number;
  alt?: string;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
};

export function ReceiptImage({ txId, alt = "رسید", className, onClick }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      setError(null);
      setSrc(null);
      try {
        const blob = await api.fetchBlob(`/transactions/${txId}/receipt`);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "بارگذاری رسید ناموفق");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [txId]);

  if (error) {
    return (
      <p className="text-danger text-sm rounded-lg border border-danger/30 bg-danger/5 p-3">
        {error}
      </p>
    );
  }

  if (!src) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onClick={onClick} />
  );
}
