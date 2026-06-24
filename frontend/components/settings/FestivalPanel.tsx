"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Calendar, PartyPopper, RefreshCw, Save, Users } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn, toPersianDigits } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";

type DeliveryMode = "on_start" | "at_purchase";

type FestivalState = {
  enabled: boolean;
  is_active: boolean;
  campaign_id: string | null;
  title: string;
  max_users: number;
  discount_percent: number | null;
  discount_amount: number | null;
  valid_days: number;
  code_prefix: string;
  delivery_mode: DeliveryMode;
  new_users_only: boolean;
  starts_at: string | null;
  ends_at: string | null;
  granted_count: number;
  remaining_slots: number;
  recipients: {
    slot: number;
    user_id: number;
    username: string | null;
    full_name: string | null;
    code: string;
    granted_at: string;
  }[];
  delivery_modes: { key: DeliveryMode; label: string }[];
  texts: {
    welcome_granted?: string;
    welcome_pending?: string;
    purchase_hint?: string;
  };
};

const DISCOUNT_TYPE = [
  { key: "percent", label: "درصدی" },
  { key: "amount", label: "مبلغ ثابت (تومان)" },
] as const;

export function FestivalPanel() {
  const { admin } = useAuth();
  const canWrite = hasPermission(admin, "discounts", "write");
  const [state, setState] = useState<FestivalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [title, setTitle] = useState("جشنواره ویژه");
  const [maxUsers, setMaxUsers] = useState("20");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountPercent, setDiscountPercent] = useState("50");
  const [discountAmount, setDiscountAmount] = useState("");
  const [validDays, setValidDays] = useState("14");
  const [codePrefix, setCodePrefix] = useState("JSH");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("on_start");
  const [newUsersOnly, setNewUsersOnly] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [textGranted, setTextGranted] = useState("");
  const [textPending, setTextPending] = useState("");
  const [textPurchase, setTextPurchase] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get<FestivalState>("/settings/festival")
      .then((d) => {
        setState(d);
        setTitle(d.title || "جشنواره ویژه");
        setMaxUsers(String(d.max_users));
        if (d.discount_amount) {
          setDiscountType("amount");
          setDiscountAmount(String(d.discount_amount));
        } else {
          setDiscountType("percent");
          setDiscountPercent(String(d.discount_percent ?? 50));
        }
        setValidDays(String(d.valid_days));
        setCodePrefix(d.code_prefix || "JSH");
        setDeliveryMode(d.delivery_mode);
        setNewUsersOnly(d.new_users_only);
        setStartsAt(d.starts_at ? d.starts_at.slice(0, 16) : "");
        setEndsAt(d.ends_at ? d.ends_at.slice(0, 16) : "");
        setTextGranted(d.texts?.welcome_granted || "");
        setTextPending(d.texts?.welcome_pending || "");
        setTextPurchase(d.texts?.purchase_hint || "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "خطا"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const previewGranted = useMemo(() => {
    const pct = discountType === "percent" ? `${discountPercent}٪` : `${Number(discountAmount || 0).toLocaleString("fa-IR")} تومان`;
    return (textGranted || state?.texts?.welcome_granted || "")
      .replace(/\{title\}/g, title)
      .replace(/\{code\}/g, "JSHABC123")
      .replace(/\{slot\}/g, "۱")
      .replace(/\{discount_label\}/g, pct)
      .replace(/\{valid_days\}/g, validDays);
  }, [textGranted, state, title, discountType, discountPercent, discountAmount, validDays]);

  const buildPayload = (enabled: boolean, startNew = false) => ({
    enabled,
    title: title.trim(),
    max_users: parseInt(maxUsers, 10) || 20,
    discount_percent: discountType === "percent" ? parseInt(discountPercent, 10) || null : null,
    discount_amount: discountType === "amount" ? parseInt(discountAmount, 10) || null : null,
    valid_days: parseInt(validDays, 10) || 14,
    code_prefix: codePrefix.trim().toUpperCase(),
    delivery_mode: deliveryMode,
    new_users_only: newUsersOnly,
    starts_at: startsAt || null,
    ends_at: endsAt || null,
    start_new_campaign: startNew,
    texts: {
      welcome_granted: textGranted.trim() || undefined,
      welcome_pending: textPending.trim() || undefined,
      purchase_hint: textPurchase.trim() || undefined,
    },
  });

  const save = async (enabled: boolean) => {
    if (!canWrite) return;
    setSaving(true);
    try {
      const d = await api.put<FestivalState>("/settings/festival", buildPayload(enabled));
      setState(d);
      toast.success(enabled ? "جشنواره فعال شد" : "تنظیمات ذخیره شد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const resetCampaign = async () => {
    if (!canWrite) return;
    if (!confirm("جشنواره جدید شروع شود؟ شمارنده از صفر reset می‌شود (کدهای قبلی همچنان معتبرند).")) return;
    setResetting(true);
    try {
      const d = await api.post<FestivalState>("/settings/festival/reset");
      setState(d);
      toast.success("جشنواره جدید شروع شد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setResetting(false);
    }
  };

  if (loading || !state) {
    return <Card className="p-8 text-center text-text-muted">در حال بارگذاری…</Card>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 max-w-6xl">
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <PartyPopper size={18} />
              جشنواره — تخفیف کاربران اول
            </CardTitle>
            <Badge status={state.is_active ? "active" : "inactive"}>
              {state.is_active ? "فعال" : state.enabled ? "زمان‌بندی" : "غیرفعال"}
            </Badge>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            به <b>{toPersianDigits(maxUsers)}</b> کاربر اولی که ربات را استارت می‌کنند، کد تخفیف
            اختصاصی داده می‌شود.
          </p>

          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-background/60 border border-border/60 text-sm">
            <div>
              <span className="text-text-muted">دریافت‌شده</span>
              <p className="font-semibold">{toPersianDigits(state.granted_count)}</p>
            </div>
            <div>
              <span className="text-text-muted">باقی‌مانده</span>
              <p className="font-semibold">{toPersianDigits(state.remaining_slots)}</p>
            </div>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">عنوان جشنواره</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">تعداد کاربران</label>
              <Input type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} className="font-latin" disabled={!canWrite} />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">اعتبار کد (روز)</label>
              <Input type="number" min={1} value={validDays} onChange={(e) => setValidDays(e.target.value)} className="font-latin" disabled={!canWrite} />
            </div>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-2">نوع تخفیف</label>
            <div className="flex gap-2 mb-2">
              {DISCOUNT_TYPE.map((t) => (
                <Button key={t.key} type="button" size="sm" variant={discountType === t.key ? "default" : "outline"} onClick={() => setDiscountType(t.key)} disabled={!canWrite}>
                  {t.label}
                </Button>
              ))}
            </div>
            {discountType === "percent" ? (
              <Input type="number" min={1} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} className="font-latin" disabled={!canWrite} placeholder="مثلاً 50" />
            ) : (
              <Input type="number" min={1} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} className="font-latin" disabled={!canWrite} placeholder="مثلاً 50000" />
            )}
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">پیشوند کد</label>
            <Input value={codePrefix} onChange={(e) => setCodePrefix(e.target.value.toUpperCase())} maxLength={8} className="font-latin uppercase" disabled={!canWrite} />
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-2">نحوه نمایش به کاربر</label>
            <div className="space-y-2">
              {(state.delivery_modes || []).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => setDeliveryMode(m.key)}
                  className={cn(
                    "w-full text-right rounded-lg border px-3 py-2.5 text-sm transition-colors",
                    deliveryMode === m.key ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={newUsersOnly} onChange={(e) => setNewUsersOnly(e.target.checked)} disabled={!canWrite} className="rounded" />
            فقط کاربران جدید (اولین /start)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1 flex items-center gap-1"><Calendar size={14} /> شروع (اختیاری)</label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="font-latin" disabled={!canWrite} />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1 flex items-center gap-1"><Calendar size={14} /> پایان (اختیاری)</label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="font-latin" disabled={!canWrite} />
            </div>
          </div>

          {canWrite && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => save(true)} disabled={saving}>
                <Save size={16} className="ml-1" />
                {saving ? "…" : "فعال‌سازی / ذخیره"}
              </Button>
              {state.enabled && (
                <Button variant="outline" onClick={() => save(false)} disabled={saving}>
                  غیرفعال کردن
                </Button>
              )}
              <Button variant="ghost" onClick={resetCampaign} disabled={resetting}>
                <RefreshCw size={16} className="ml-1" />
                جشنواره جدید
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-3">
          <CardTitle className="text-base flex items-center gap-2"><Users size={18} /> دریافت‌کنندگان</CardTitle>
          {state.recipients.length === 0 ? (
            <p className="text-sm text-text-muted">هنوز کسی جایزه نگرفته.</p>
          ) : (
            <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
              {state.recipients.map((r) => (
                <li key={r.user_id} className="flex justify-between gap-2 border-b border-border/40 pb-2">
                  <span>#{toPersianDigits(r.slot)} — {r.full_name || r.username || r.user_id}</span>
                  <code className="text-xs">{r.code}</code>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="p-6 space-y-3">
          <CardTitle className="text-base">پیام‌ها (HTML)</CardTitle>
          <p className="text-xs text-text-muted">متغیرها: {"{title}"} {"{code}"} {"{slot}"} {"{discount_label}"} {"{valid_days}"}</p>
          <div>
            <label className="text-xs text-text-muted block mb-1">بعد از /start — ارسال مستقیم کد</label>
            <textarea className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[100px]" value={textGranted} onChange={(e) => setTextGranted(e.target.value)} disabled={!canWrite} placeholder="خالی = پیش‌فرض سیستم" />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">بعد از /start — اطلاع در زمان خرید</label>
            <textarea className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[100px]" value={textPending} onChange={(e) => setTextPending(e.target.value)} disabled={!canWrite} />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">مرحله خرید — نمایش کد</label>
            <textarea className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[100px]" value={textPurchase} onChange={(e) => setTextPurchase(e.target.value)} disabled={!canWrite} />
          </div>
        </Card>

        <Card className="p-6">
          <CardTitle className="text-base mb-3">پیش‌نمایش — ارسال کد بعد از /start</CardTitle>
          <div className="rounded-xl border border-border bg-background/60 p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: previewGranted.replace(/\n/g, "<br/>") }} />
        </Card>
      </div>
    </div>
  );
}
