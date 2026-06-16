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
}

export interface TierData {
  name: string;
  emoji: string;
  plans: PlanItem[];
}

export type PlansData = Record<string, TierData>;

interface PlansEditorProps {
  data: PlansData;
  onChange: (data: PlansData) => void;
  onSave: () => void;
  saving?: boolean;
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

export function PlansEditor({ data, onChange, onSave, saving }: PlansEditorProps) {
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

  return (
    <div className="space-y-6">
      {tiers.map(([tierId, tier]) => (
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
                <label className="text-xs text-text-muted block mb-1">نام دسته</label>
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
      ))}

      <div className="flex justify-end sticky bottom-4 z-10">
        <Button onClick={onSave} disabled={saving} className="shadow-lg shadow-primary/20">
          <Save size={16} className="ml-2" />
          {saving ? "در حال ذخیره..." : "ذخیره قیمت‌ها"}
        </Button>
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
  );
}
