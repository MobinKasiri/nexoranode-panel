"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Wrench } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn, formatDate, toPersianDigits } from "@/lib/utils";

type MaintenanceState = {
  enabled: boolean;
  reason: string;
  message: string | null;
  ends_at: string | null;
  remaining: string | null;
  presets: Record<string, string>;
};

const REASONS = [
  { key: "developing", label: "توسعه و تغییرات" },
  { key: "updating", label: "بروزرسانی ربات" },
  { key: "servers", label: "بروزرسانی سرورها" },
  { key: "bugfix", label: "رفع باگ" },
  { key: "maintenance", label: "غیرفعال موقت" },
];

const DURATIONS = [
  { minutes: 30, label: "۳۰ دقیقه" },
  { minutes: 60, label: "۱ ساعت" },
  { minutes: 120, label: "۲ ساعت" },
  { minutes: 240, label: "۴ ساعت" },
];

export function MaintenancePanel() {
  const [state, setState] = useState<MaintenanceState | null>(null);
  const [reason, setReason] = useState("developing");
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<MaintenanceState>("/maintenance")
      .then((d) => {
        setState(d);
        if (d.reason) setReason(d.reason);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const enable = async () => {
    setSaving(true);
    try {
      const d = await api.put<MaintenanceState>("/maintenance", {
        enabled: true,
        reason,
        duration_minutes: duration,
      });
      setState(d);
      toast.success("حالت تعمیر فعال شد — ربات برای کاربران غیرفعال است");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const disable = async () => {
    setSaving(true);
    try {
      const d = await api.put<MaintenanceState>("/maintenance", { enabled: false });
      setState(d);
      toast.success("ربات برای کاربران فعال شد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !state) {
    return <Card className="p-8 text-center text-text-muted">در حال بارگذاری…</Card>;
  }

  const preview = state.presets[reason] || state.presets.maintenance;

  return (
    <div className="grid gap-6 lg:grid-cols-2 max-w-5xl">
      <Card>
        <CardTitle className="mb-4 flex items-center gap-2">
          <Wrench size={18} />
          حالت تعمیر / توسعه ربات
        </CardTitle>

        {state.enabled ? (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 mb-6">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-medium text-warning">ربات برای کاربران غیرفعال است</span>
              <Badge status="pending">فعال</Badge>
            </div>
            {state.remaining && (
              <p className="text-sm text-text-secondary">زمان باقی‌مانده: {state.remaining}</p>
            )}
            {state.ends_at && (
              <p className="text-xs text-text-muted mt-1">تا {formatDate(state.ends_at)}</p>
            )}
            <Button variant="danger" className="mt-4" onClick={disable} disabled={saving}>
              {saving ? "…" : "فعال‌سازی ربات"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-text-muted mb-6">ربات در حال حاضر برای همه کاربران فعال است.</p>
        )}

        {!state.enabled && (
          <div className="space-y-5">
            <div>
              <label className="text-xs text-text-muted block mb-2">دلیل</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setReason(r.key)}
                    className={cn(
                      "text-right rounded-lg border px-3 py-2.5 text-sm transition-colors",
                      reason === r.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted block mb-2">مدت زمان</label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <Button
                    key={d.minutes}
                    type="button"
                    size="sm"
                    variant={duration === d.minutes ? "default" : "outline"}
                    onClick={() => setDuration(d.minutes)}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>

            <Button onClick={enable} disabled={saving} className="w-full sm:w-auto">
              {saving ? "در حال فعال‌سازی…" : `غیرفعال کردن ربات (${toPersianDigits(duration)} دقیقه)`}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle className="mb-4">پیش‌نمایش پیام کاربران</CardTitle>
        <div
          className="rounded-xl border border-border bg-background/60 p-4 text-sm leading-relaxed whitespace-pre-line"
          dangerouslySetInnerHTML={{
            __html: preview.replace(/\n/g, "<br/>") + (duration ? `<br/><br/>⏱ زمان تقریبی: <b>${DURATIONS.find((d) => d.minutes === duration)?.label || ""}</b>` : ""),
          }}
        />
        <p className="text-xs text-text-muted mt-4">
          مدیران تلگرام (BOT_ADMINS) همچنان می‌توانند از ربات استفاده کنند.
        </p>
      </Card>
    </div>
  );
}
