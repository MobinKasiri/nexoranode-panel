"use client";

import { useMemo } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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

export function PlansEditor({ data, onChange, onSave, saving }: PlansEditorProps) {
  const tiers = useMemo(() => Object.entries(data), [data]);

  const updateTier = (tierId: string, patch: Partial<TierData>) => {
    onChange({ ...data, [tierId]: { ...data[tierId], ...patch } });
  };

  const updatePlan = (tierId: string, planIndex: number, patch: Partial<PlanItem>) => {
    const tier = data[tierId];
    const plans = tier.plans.map((p, i) => {
      if (i !== planIndex) return p;
      const next = { ...p, ...patch };
      if ("price" in patch || "gb" in patch) {
        next.per_gb = next.gb > 0 ? Math.round(next.price / next.gb) : 0;
      }
      return next;
    });
    onChange({ ...data, [tierId]: { ...tier, plans } });
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
                <Input
                  value={tier.name}
                  onChange={(e) => updateTier(tierId, { name: e.target.value })}
                />
              </div>
            </div>
            <span className="text-xs text-text-muted font-latin">ID: {tierId}</span>
          </div>

          <div className="space-y-3">
            {tier.plans.map((plan, idx) => (
              <div
                key={plan.id}
                className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-4 rounded-lg bg-background/60 border border-border/60"
              >
                <div className="sm:col-span-3">
                  <label className="text-xs text-text-muted block mb-1.5">پلن</label>
                  <p className="text-sm font-medium">
                    {plan.emoji && <span className="ml-1">{plan.emoji}</span>}
                    {toPersianDigits(plan.gb)} گیگ / {toPersianDigits(plan.days)} روز
                  </p>
                  <p className="text-xs text-text-muted font-latin mt-0.5">{plan.id}</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-text-muted block mb-1.5">حجم (GB)</label>
                  <Input
                    type="number"
                    min={1}
                    value={plan.gb}
                    onChange={(e) => updatePlan(tierId, idx, { gb: parseInt(e.target.value, 10) || 0 })}
                    className="font-latin"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-text-muted block mb-1.5">مدت (روز)</label>
                  <Input
                    type="number"
                    min={1}
                    value={plan.days}
                    onChange={(e) => updatePlan(tierId, idx, { days: parseInt(e.target.value, 10) || 0 })}
                    className="font-latin"
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
                    className="font-latin"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-text-muted block mb-1.5">هر گیگ</label>
                  <p className="text-sm text-text-secondary py-2.5">{formatToman(plan.per_gb)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <div className="flex justify-end sticky bottom-4 z-10">
        <Button onClick={onSave} disabled={saving} className="shadow-lg shadow-primary/20">
          <Save size={16} className="ml-2" />
          {saving ? "در حال ذخیره..." : "ذخیره قیمت‌ها"}
        </Button>
      </div>
    </div>
  );
}
