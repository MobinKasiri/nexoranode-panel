"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { formatToman, toPersianDigits } from "@/lib/utils";

export interface PlanItem {
  id: string;
  gb: number;
  days: number;
  price: number;
  per_gb: number;
  emoji: string;
  recommended?: boolean;
}

export interface LocationItem {
  flag: string;
  name: string;
}

export interface TierData {
  name: string;
  emoji: string;
  shop_subtitle?: string;
  shop_footer?: string;
  locations?: LocationItem[];
  plans: PlanItem[];
}

export type PlansData = Record<string, TierData>;

interface PlansEditorProps {
  data: PlansData;
  onChange: (data: PlansData) => void;
  onSave: () => void;
  saving?: boolean;
  canWrite?: boolean;
}

function makePlanId(tierId: string, gb: number, days: number) {
  return `${tierId}_${gb}g_${days}d`;
}

function uniquePlanId(tierId: string, gb: number, days: number, existingIds: Set<string>) {
  let candidateGb = gb;
  let id = makePlanId(tierId, candidateGb, days);
  let attempts = 0;
  while (existingIds.has(id) && attempts < 50) {
    candidateGb += 5;
    id = makePlanId(tierId, candidateGb, days);
    attempts += 1;
  }
  if (existingIds.has(id)) {
    id = `${tierId}_plan_${Date.now()}`;
  }
  return { id, gb: candidateGb };
}

function formatLocationsPreview(locations: LocationItem[] | undefined) {
  if (!locations?.length) return "—";
  return locations.map((l) => `${l.flag} ${l.name}`.trim()).join(" · ");
}

function buildShopPreview(tier: TierData) {
  const title = `${tier.emoji || "🌍"} ${tier.name || ""}`.trim();
  const subtitle = tier.shop_subtitle || "یک اشتراک — همه سرورها فعال می‌شوند:";
  const locs = formatLocationsPreview(tier.locations);
  const footer = tier.shop_footer || "👇 پلن مورد نظر را انتخاب کنید:";
  return { title, subtitle, locs, footer };
}

export function PlansEditor({ data, onChange, onSave, saving, canWrite = true }: PlansEditorProps) {
  const tiers = useMemo(() => Object.entries(data), [data]);
  const [deleteTarget, setDeleteTarget] = useState<{ tierId: string; index: number; label: string } | null>(null);

  const updateTier = (tierId: string, patch: Partial<TierData>) => {
    onChange({ ...data, [tierId]: { ...data[tierId], ...patch } });
  };

  const updatePlan = (tierId: string, planIndex: number, patch: Partial<PlanItem>) => {
    const tier = data[tierId];
    const existingIds = new Set(tier.plans.map((p) => p.id));

    const plans = tier.plans.map((p, i) => {
      if (i !== planIndex) return p;
      const next = { ...p, ...patch };

      if ("gb" in patch || "days" in patch) {
        const newId = makePlanId(tierId, next.gb, next.days);
        if (!existingIds.has(newId) || newId === p.id) {
          next.id = newId;
        }
      }

      if ("price" in patch || "gb" in patch) {
        next.per_gb = next.gb > 0 ? Math.round(next.price / next.gb) : 0;
      }

      return next;
    });

    onChange({ ...data, [tierId]: { ...tier, plans } });
  };

  const addPlan = (tierId: string) => {
    const tier = data[tierId];
    const existingIds = new Set(tier.plans.map((p) => p.id));
    const { id, gb } = uniquePlanId(tierId, 5, 30, existingIds);
    const newPlan: PlanItem = { id, gb, days: 30, price: 0, per_gb: 0, emoji: "" };
    onChange({ ...data, [tierId]: { ...tier, plans: [...tier.plans, newPlan] } });
    toast.success("پلن جدید اضافه شد");
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const { tierId, index } = deleteTarget;
    const tier = data[tierId];
    const plans = tier.plans.filter((_, i) => i !== index);
    onChange({ ...data, [tierId]: { ...tier, plans } });
    setDeleteTarget(null);
    toast.success("پلن حذف شد");
  };

  const updateLocation = (tierId: string, index: number, patch: Partial<LocationItem>) => {
    const tier = data[tierId];
    const locations = [...(tier.locations || [])];
    locations[index] = { ...locations[index], ...patch };
    updateTier(tierId, { locations });
  };

  const addLocation = (tierId: string) => {
    const tier = data[tierId];
    updateTier(tierId, {
      locations: [...(tier.locations || []), { flag: "🏳️", name: "کشور جدید" }],
    });
  };

  const removeLocation = (tierId: string, index: number) => {
    const tier = data[tierId];
    updateTier(tierId, {
      locations: (tier.locations || []).filter((_, i) => i !== index),
    });
  };

  return (
    <div className={!canWrite ? "pointer-events-none opacity-95" : undefined}>
    <div className="space-y-6">
      {tiers.map(([tierId, tier]) => {
        const preview = buildShopPreview(tier);
        return (
        <Card key={tierId}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 pb-4 border-b border-border">
            <div className="flex items-center gap-3 flex-1">
              <Input
                className="w-16 text-center text-lg"
                value={tier.emoji}
                onChange={(e) => updateTier(tierId, { emoji: e.target.value })}
                placeholder="🔥"
              />
              <div className="flex-1">
                <label className="text-xs text-text-muted block mb-1">نام دسته (عنوان در ربات)</label>
                <Input value={tier.name} onChange={(e) => updateTier(tierId, { name: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted font-latin">ID: {tierId}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => addPlan(tierId)}>
                <Plus size={16} className="ml-1.5" />
                افزودن پلن
              </Button>
            </div>
          </div>

          <div className="mb-6 p-4 rounded-xl border border-border/60 bg-background/40 space-y-4">
            <p className="text-sm font-medium">متن صفحه خرید در ربات</p>
            <div>
              <label className="text-xs text-text-muted block mb-1">زیرعنوان</label>
              <Input
                value={tier.shop_subtitle || ""}
                onChange={(e) => updateTier(tierId, { shop_subtitle: e.target.value })}
                placeholder="یک اشتراک — همه سرورها فعال می‌شوند:"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-text-muted">لوکیشن‌ها</label>
                <Button type="button" size="sm" variant="outline" onClick={() => addLocation(tierId)}>
                  <Plus size={14} className="ml-1" />
                  افزودن لوکیشن
                </Button>
              </div>
              <div className="space-y-2">
                {(tier.locations || []).length === 0 ? (
                  <p className="text-xs text-text-muted py-2">لوکیشنی تعریف نشده — دکمه بالا را بزنید</p>
                ) : (
                  (tier.locations || []).map((loc, locIdx) => (
                    <div key={locIdx} className="flex gap-2 items-center">
                      <Input
                        className="w-16 text-center"
                        value={loc.flag}
                        onChange={(e) => updateLocation(tierId, locIdx, { flag: e.target.value })}
                        placeholder="🇩🇪"
                      />
                      <Input
                        className="flex-1"
                        value={loc.name}
                        onChange={(e) => updateLocation(tierId, locIdx, { name: e.target.value })}
                        placeholder="آلمان"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-danger shrink-0"
                        onClick={() => removeLocation(tierId, locIdx)}
                        aria-label="حذف لوکیشن"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">متن پایین صفحه</label>
              <Input
                value={tier.shop_footer || ""}
                onChange={(e) => updateTier(tierId, { shop_footer: e.target.value })}
                placeholder="👇 پلن مورد نظر را انتخاب کنید:"
              />
            </div>
            <div className="rounded-lg border border-dashed border-border p-3 text-sm text-text-secondary leading-relaxed">
              <p className="font-medium text-text-primary">{preview.title}</p>
              <p className="mt-2">{preview.subtitle}</p>
              <p className="mt-1">{preview.locs}</p>
              <p className="mt-3 text-text-muted">{preview.footer}</p>
            </div>
          </div>

          <div className="space-y-3">
            {tier.plans.length === 0 ? (
              <p className="text-center text-text-muted text-sm py-8">پلنی وجود ندارد — دکمه «افزودن پلن» را بزنید</p>
            ) : (
              tier.plans.map((plan, idx) => (
                <div
                  key={`${plan.id}-${idx}`}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-4 rounded-lg bg-background/60 border border-border/60"
                >
                  <div className="sm:col-span-2">
                    <label className="text-xs text-text-muted block mb-1.5">ایموجی</label>
                    <Input
                      className="text-center"
                      value={plan.emoji}
                      onChange={(e) => updatePlan(tierId, idx, { emoji: e.target.value })}
                      placeholder="💎"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-text-muted block mb-1.5">حجم (گیگ)</label>
                    <Input
                      type="number"
                      min={1}
                      value={plan.gb}
                      onChange={(e) => updatePlan(tierId, idx, { gb: parseInt(e.target.value, 10) || 0 })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-text-muted block mb-1.5">مدت (روز)</label>
                    <Input
                      type="number"
                      min={1}
                      value={plan.days}
                      onChange={(e) => updatePlan(tierId, idx, { days: parseInt(e.target.value, 10) || 0 })}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-xs text-text-muted block mb-1.5">قیمت (تومان)</label>
                    <Input
                      type="number"
                      min={0}
                      step={1000}
                      value={plan.price}
                      onChange={(e) => updatePlan(tierId, idx, { price: parseInt(e.target.value, 10) || 0 })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-text-muted block mb-1.5">هر گیگ</label>
                    <p className="text-sm text-text-secondary py-2.5">{formatToman(plan.per_gb)}</p>
                  </div>
                  <div className="sm:col-span-1 flex sm:justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-danger hover:text-danger hover:bg-danger/10"
                      aria-label="حذف پلن"
                      onClick={() =>
                        setDeleteTarget({
                          tierId,
                          index: idx,
                          label: `${toPersianDigits(plan.gb)} گیگ / ${toPersianDigits(plan.days)} روز`,
                        })
                      }
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                  <div className="sm:col-span-12 -mt-1">
                    <p className="text-xs text-text-muted font-latin">{plan.id}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
        );
      })}

      <div className="flex justify-end sticky bottom-4 z-10">
        {canWrite && (
          <Button onClick={onSave} disabled={saving} className="shadow-lg shadow-primary/20">
            <Save size={16} className="ml-2" />
            {saving ? "در حال ذخیره..." : "ذخیره قیمت‌ها"}
          </Button>
        )}
      </div>

      <Modal open={deleteTarget !== null} onOpenChange={() => setDeleteTarget(null)} title="حذف پلن">
        <p className="text-text-secondary text-sm mb-4">
          آیا از حذف پلن «{deleteTarget?.label}» مطمئن هستید؟
        </p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={confirmDelete}>
            بله، حذف کن
          </Button>
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            انصراف
          </Button>
        </div>
      </Modal>
    </div>
    </div>
  );
}
