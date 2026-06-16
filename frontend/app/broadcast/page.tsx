"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AppShell } from "@/components/layout/Sidebar";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toPersianDigits } from "@/lib/utils";

export default function BroadcastPage() {
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("all");
  const [count, setCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  useEffect(() => {
    api.get<{ count: number }>(`/broadcast/count?target=${target}`).then((r) => setCount(r.count));
  }, [target]);

  const send = async () => {
    if (!message.trim()) return;
    if (!confirm(`ارسال به ${toPersianDigits(count)} نفر؟`)) return;
    setSending(true);
    try {
      const r = await api.post<{ sent: number; failed: number }>("/broadcast/send", { message, target });
      setResult(r);
      toast.success(`✅ ${toPersianDigits(r.sent)} پیام ارسال شد`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-6">📢 پیام همگانی</h1>
      <Card className="max-w-2xl">
        <CardTitle className="mb-4">دریافت‌کنندگان</CardTitle>
        <div className="space-y-2 mb-6 text-sm">
          {[
            { key: "all", label: `همه کاربران (${toPersianDigits(count)} نفر)` },
            { key: "active", label: "کاربران دارای سرویس فعال" },
            { key: "inactive", label: "کاربران بدون سرویس" },
          ].map((o) => (
            <label key={o.key} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="target" checked={target === o.key} onChange={() => setTarget(o.key)} />
              {o.label}
            </label>
          ))}
        </div>
        <label className="text-sm text-text-secondary block mb-2">متن پیام (HTML)</label>
        <textarea
          className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[160px] mb-4"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="<b>اطلاعیه</b>"
        />
        <div className="rounded-lg border border-border bg-background p-3 mb-4 text-sm min-h-[60px]"
          dangerouslySetInnerHTML={{ __html: message || "<span class='text-text-muted'>پیش‌نمایش...</span>" }}
        />
        <Button onClick={send} disabled={sending}>{sending ? "در حال ارسال..." : "📤 ارسال فوری"}</Button>
        {result && (
          <p className="text-sm text-text-secondary mt-4">
            ارسال شده: {toPersianDigits(result.sent)} | ناموفق: {toPersianDigits(result.failed)}
          </p>
        )}
      </Card>
    </AppShell>
  );
}
