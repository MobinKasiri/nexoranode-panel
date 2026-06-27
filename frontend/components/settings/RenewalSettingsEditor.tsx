"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Save } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type RenewalData = {
  discount_percent: number;
};

export function RenewalSettingsEditor({ canWrite = true }: { canWrite?: boolean }) {
  const [data, setData] = useState<RenewalData | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api
      .get<RenewalData>("/settings/renewal")
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "خطا در بارگذاری تخفیف تمدید"));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await api.put("/settings/renewal", {
        discount_percent: data.discount_percent,
      });
      toast.success("تخفیف تمدید ذخیره شد — ربات خودکار به‌روز می‌شود");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <Card className="p-6 text-center text-text-muted">
        در حال بارگذاری تنظیمات تمدید…
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <RefreshCw className="text-primary" size={20} />
        <CardTitle>تخفیف تمدید سرویس</CardTitle>
      </div>
      <p className="text-sm text-text-muted leading-relaxed">
        این درصد روی قیمت پلن هنگام «تمدید سرویس» در ربات اعمال می‌شود (خودکار — بدون کد).
        تغییرات بلافاصله در ربات و اعلان‌های انقضا/حجم اعمال می‌شوند.
      </p>
      <div className="max-w-xs">
        <Input
          label="درصد تخفیف تمدید"
          type="number"
          min={0}
          max={100}
          value={data.discount_percent}
          disabled={!canWrite}
          onChange={(e) =>
            setData({
              ...data,
              discount_percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
            })
          }
        />
        <p className="mt-1 text-xs text-text-muted">۰ تا ۱۰۰ — مثلاً ۱۰ یعنی ۱۰٪ تخفیف</p>
      </div>
      {canWrite && (
        <Button onClick={save} disabled={saving} className="gap-2">
          <Save size={16} />
          {saving ? "در حال ذخیره…" : "ذخیره تخفیف تمدید"}
        </Button>
      )}
    </Card>
  );
}
