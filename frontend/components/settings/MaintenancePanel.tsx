"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Calendar, Clock, MessageSquare, Wrench } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn, formatDate, remainingPersianFromIso, toPersianDigits } from "@/lib/utils";

type MaintenanceState = {
  enabled: boolean;
  reason: string;
  custom_message?: string | null;
  default_offline_message?: string | null;
  message: string | null;
  default_message?: string;
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

type TimeMode = "preset" | "minutes" | "datetime";

function combineDateTime(date: string, time: string) {
  if (!date) return "";
  return `${date}T${time || "23:59"}`;
}

function previewRemaining(
  timeMode: TimeMode,
  duration: number,
  customHours: string,
  customMinutes: string,
  endDateTime: string
): string | null {
  if (timeMode === "datetime" && endDateTime) {
    return remainingPersianFromIso(endDateTime);
  }
  let total = duration;
  if (timeMode === "minutes") {
    const h = parseInt(customHours, 10) || 0;
    const m = parseInt(customMinutes, 10) || 0;
    total = h * 60 + m;
    if (total < 1) return null;
  }
  if (total < 60) return `${toPersianDigits(total)} دقیقه`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (mins) return `${toPersianDigits(hours)} ساعت و ${toPersianDigits(mins)} دقیقه`;
  return `${toPersianDigits(hours)} ساعت`;
}

export function MaintenancePanel({ canWrite = true }: { canWrite?: boolean }) {
  const [state, setState] = useState<MaintenanceState | null>(null);
  const [reason, setReason] = useState("updating");
  const [duration, setDuration] = useState(60);
  const [timeMode, setTimeMode] = useState<TimeMode>("preset");
  const [customHours, setCustomHours] = useState("1");
  const [customMinutes, setCustomMinutes] = useState("0");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [defaultOfflineDraft, setDefaultOfflineDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingOffline, setSavingOffline] = useState(false);
  const [savingPlanned, setSavingPlanned] = useState(false);

  const endDateTime = combineDateTime(endDate, endTime);

  const load = () => {
    setLoading(true);
    api
      .get<MaintenanceState>("/maintenance")
      .then((d) => {
        setState(d);
        if (d.reason) setReason(d.reason);
        if (d.custom_message) setCustomMessage(d.custom_message);
        setDefaultOfflineDraft(d.default_offline_message || "");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const presetText = state?.presets[reason] || state?.presets.maintenance || "";
  const plannedPreviewBase = customMessage.trim() || presetText;
  const offlinePreview =
    defaultOfflineDraft.trim() || state?.default_message || "";

  const previewRemainingText = useMemo(
    () => previewRemaining(timeMode, duration, customHours, customMinutes, endDateTime),
    [timeMode, duration, customHours, customMinutes, endDateTime]
  );

  const buildPlannedPayload = () => {
    const payload: {
      enabled: boolean;
      reason: string;
      custom_message?: string | null;
      duration_minutes?: number;
      ends_at?: string;
    } = {
      enabled: true,
      reason,
      custom_message: customMessage.trim() || null,
    };

    if (timeMode === "datetime") {
      if (!endDateTime) throw new Error("تاریخ و ساعت پایان را وارد کنید");
      payload.ends_at = endDateTime;
    } else if (timeMode === "minutes") {
      const h = parseInt(customHours, 10) || 0;
      const m = parseInt(customMinutes, 10) || 0;
      const total = h * 60 + m;
      if (total < 1) throw new Error("مدت زمان باید حداقل ۱ دقیقه باشد");
      payload.duration_minutes = total;
    } else {
      payload.duration_minutes = duration;
    }
    return payload;
  };

  const saveOfflineDefault = async () => {
    setSavingOffline(true);
    try {
      const d = await api.put<MaintenanceState>("/maintenance/offline-default", {
        default_offline_message: defaultOfflineDraft.trim() || null,
      });
      setState(d);
      toast.success("پیام پیش‌فرض بروزرسانی ذخیره شد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSavingOffline(false);
    }
  };

  const enablePlanned = async () => {
    setSavingPlanned(true);
    try {
      const payload = buildPlannedPayload();
      const d = await api.put<MaintenanceState>("/maintenance", payload);
      setState(d);
      toast.success("حالت تعمیر برنامه‌ریزی‌شده فعال شد — همه کاربران این پیام را می‌بینند");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSavingPlanned(false);
    }
  };

  const disablePlanned = async () => {
    setSavingPlanned(true);
    try {
      const d = await api.put<MaintenanceState>("/maintenance", { enabled: false });
      setState(d);
      toast.success("حالت تعمیر غیرفعال شد — ربات اصلی دوباره پاسخ می‌دهد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSavingPlanned(false);
    }
  };

  if (loading || !state) {
    return <Card className="p-8 text-center text-text-muted">در حال بارگذاری…</Card>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 max-w-6xl">
      <div className="space-y-6">
        {/* Scenario 1 */}
        <Card>
          <CardTitle className="mb-2 flex items-center gap-2 text-base">
            <MessageSquare size={18} />
            ۱ — پیام هنگام بروزرسانی ناگهانی
          </CardTitle>
          <p className="text-sm text-text-muted mb-4 leading-relaxed">
            وقتی حالت تعمیر را فعال <b>نکرده‌اید</b> ولی ربات اصلی موقتاً خاموش است
            (deploy، restart، خطا)، این پیام به کاربران نمایش داده می‌شود.
          </p>
          <textarea
            className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[120px]"
            value={defaultOfflineDraft}
            onChange={(e) => setDefaultOfflineDraft(e.target.value)}
            placeholder="خالی = پیام پیش‌فرض سیستم. HTML مجاز است."
          />
          <div className="flex flex-wrap gap-2 mt-3">
            {canWrite && (
              <>
                <Button onClick={saveOfflineDefault} disabled={savingOffline} size="sm">
                  {savingOffline ? "…" : "ذخیره پیام پیش‌فرض"}
                </Button>
                {defaultOfflineDraft.trim() && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setDefaultOfflineDraft("")}
                  >
                    بازگشت به پیش‌فرض سیستم
                  </Button>
                )}
              </>
            )}
          </div>
        </Card>

        {/* Scenario 2 */}
        <Card>
          <CardTitle className="mb-2 flex items-center gap-2 text-base">
            <Wrench size={18} />
            ۲ — حالت تعمیر برنامه‌ریزی‌شده
          </CardTitle>
          <p className="text-sm text-text-muted mb-4 leading-relaxed">
            برای توقف عمدی سرویس (توسعه ۲ ساعته، فروش متوقف، بروزرسانی بزرگ) این حالت را
            فعال کنید. تا زمان پایان، <b>همه کاربران</b> فقط این پیام را می‌بینند — ربات
            اصلی پاسخ نمی‌دهد.
          </p>

          {state.enabled ? (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-warning">حالت تعمیر فعال است</span>
                <Badge status="pending">فعال</Badge>
              </div>
              {state.remaining && (
                <p className="text-sm text-text-secondary">باقی‌مانده: {state.remaining}</p>
              )}
              {state.ends_at && (
                <p className="text-xs text-text-muted">تا {formatDate(state.ends_at)}</p>
              )}
              {state.message && (
                <div
                  className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: state.message.replace(/\n/g, "<br/>") }}
                />
              )}
              {canWrite && (
                <Button variant="danger" onClick={disablePlanned} disabled={savingPlanned}>
                  {savingPlanned ? "…" : "غیرفعال کردن — بازگشت به ربات اصلی"}
                </Button>
              )}
            </div>
          ) : (
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
                <label className="text-xs text-text-muted block mb-1.5">پیام سفارشی (اختیاری)</label>
                <textarea
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[100px]"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="خالی = متن پیش‌فرض دلیل انتخاب‌شده"
                />
              </div>

              <div>
                <label className="text-xs text-text-muted block mb-2">مدت زمان</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Button type="button" size="sm" variant={timeMode === "preset" ? "default" : "outline"} onClick={() => setTimeMode("preset")}>گزینه‌های آماده</Button>
                  <Button type="button" size="sm" variant={timeMode === "minutes" ? "default" : "outline"} onClick={() => setTimeMode("minutes")}>مدت دلخواه</Button>
                  <Button type="button" size="sm" variant={timeMode === "datetime" ? "default" : "outline"} onClick={() => setTimeMode("datetime")}>تاریخ دقیق</Button>
                </div>
                {timeMode === "preset" && (
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map((d) => (
                      <Button key={d.minutes} type="button" size="sm" variant={duration === d.minutes ? "default" : "outline"} onClick={() => setDuration(d.minutes)}>{d.label}</Button>
                    ))}
                  </div>
                )}
                {timeMode === "minutes" && (
                  <div className="grid grid-cols-2 gap-3 max-w-xs">
                    <div>
                      <label className="text-xs text-text-muted block mb-1">ساعت</label>
                      <Input type="number" min={0} max={168} value={customHours} onChange={(e) => setCustomHours(e.target.value)} className="font-latin" />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted block mb-1">دقیقه</label>
                      <Input type="number" min={0} max={59} value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} className="font-latin" />
                    </div>
                  </div>
                )}
                {timeMode === "datetime" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                    <div>
                      <label className="text-xs text-text-muted block mb-1">تاریخ پایان</label>
                      <div className="relative">
                        <Calendar size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="font-latin pr-10" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-text-muted block mb-1">ساعت پایان</label>
                      <div className="relative">
                        <Clock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={!endDate} className="font-latin pr-10" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {canWrite && (
                <Button onClick={enablePlanned} disabled={savingPlanned}>
                  {savingPlanned ? "…" : "فعال‌سازی حالت تعمیر"}
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardTitle className="mb-3 text-base">پیش‌نمایش — بروزرسانی ناگهانی</CardTitle>
          <p className="text-xs text-text-muted mb-3">وقتی حالت تعمیر OFF است و ربات اصلی down است</p>
          <div
            className="rounded-xl border border-border bg-background/60 p-4 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: offlinePreview.replace(/\n/g, "<br/>") }}
          />
        </Card>

        <Card>
          <CardTitle className="mb-3 text-base">پیش‌نمایش — تعمیر برنامه‌ریزی‌شده</CardTitle>
          <p className="text-xs text-text-muted mb-3">وقتی حالت تعمیر ON است</p>
          <div
            className="rounded-xl border border-border bg-background/60 p-4 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{
              __html:
                plannedPreviewBase.replace(/\n/g, "<br/>") +
                (previewRemainingText ? `<br/><br/>⏱ زمان تقریبی: <b>${previewRemainingText}</b>` : ""),
            }}
          />
        </Card>
      </div>
    </div>
  );
}
