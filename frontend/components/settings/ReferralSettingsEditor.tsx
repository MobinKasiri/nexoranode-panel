"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Gift, ImagePlus, Save } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type ReferralData = {
   referrer_bonus_toman: number;
   friend_welcome: {
      type: "discount_percent" | "wallet_toman";
      percent: number;
      toman: number;
      valid_days: number;
   };
   texts: Record<string, string>;
   images?: Record<string, string>;
   image_urls?: Record<string, string | null>;
};

const TEXT_FIELDS: { key: string; label: string; hint: string }[] = [
   {
      key: "landing_no_stats",
      label: "متن صفحه دعوت (قبل از اولین خرید زیرمجموعه)",
      hint: "متغیرها: {ref_bonus} {friend_gift} {ref_link}",
   },
   {
      key: "landing_with_stats",
      label: "متن صفحه دعوت (با آمار)",
      hint: "متغیرها: {ref_bonus} {friend_gift} {ref_link} {count} {purchases} {total_revenue}",
   },
   {
      key: "ready_post",
      label: "متن پست آماده (همراه تصویر فوروارد)",
      hint: "متغیرها: {ref_link} {friend_gift}",
   },
   {
      key: "share_dialog",
      label: "متن اشتراک‌گذاری لینک",
      hint: "در پنجره Share تلگرام نمایش داده می‌شود",
   },
   {
      key: "friend_welcome",
      label: "پیام هدیه به کاربر دعوت‌شده",
      hint: "متغیرها: {code} {friend_gift}",
   },
];

export function ReferralSettingsEditor() {
   const [data, setData] = useState<ReferralData | null>(null);
   const [saving, setSaving] = useState(false);
   const [uploading, setUploading] = useState<string | null>(null);

   const load = () => {
      api.get<ReferralData>("/settings/referral")
         .then(setData)
         .catch((e) => toast.error(e instanceof Error ? e.message : "خطا در بارگذاری"));
   };

   useEffect(() => {
      load();
   }, []);

   const save = async () => {
      if (!data) return;
      setSaving(true);
      try {
         await api.put("/settings/referral", {
            referrer_bonus_toman: data.referrer_bonus_toman,
            friend_welcome: data.friend_welcome,
            texts: data.texts,
            images: data.images || {},
         });
         toast.success("تنظیمات دعوت ذخیره شد");
         load();
      } catch (e) {
         toast.error(e instanceof Error ? e.message : "خطا در ذخیره");
      } finally {
         setSaving(false);
      }
   };

   const uploadImage = async (slot: "landing" | "ready_post", file: File) => {
      setUploading(slot);
      try {
         const form = new FormData();
         form.append("slot", slot);
         form.append("file", file);
         const res = await fetch("/api/settings/referral/image", {
            method: "POST",
            credentials: "include",
            body: form,
         });
         if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || "Upload failed");
         }
         toast.success("تصویر آپلود شد");
         load();
      } catch (e) {
         toast.error(e instanceof Error ? e.message : "خطا در آپلود");
      } finally {
         setUploading(null);
      }
   };

   if (!data) {
      return <Card className="p-8 text-center text-text-muted">در حال بارگذاری تنظیمات دعوت…</Card>;
   }

   return (
      <div className="space-y-6">
         <Card className="p-6 space-y-4">
            <CardTitle className="flex items-center gap-2">
               <Gift size={20} />
               پاداش‌ها
            </CardTitle>
            <div className="grid sm:grid-cols-2 gap-4">
               <div>
                  <label className="text-xs text-text-muted block mb-1">
                     پاداش معرف (هر خرید زیرمجموعه) — تومان
                  </label>
                  <Input
                     type="number"
                     className="font-latin"
                     value={data.referrer_bonus_toman}
                     onChange={(e) =>
                        setData({
                           ...data,
                           referrer_bonus_toman: parseInt(e.target.value, 10) || 0,
                        })
                     }
                  />
               </div>
               <div>
                  <label className="text-xs text-text-muted block mb-1">
                     نوع هدیه کاربر دعوت‌شده
                  </label>
                  <select
                     className="flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                     value={data.friend_welcome.type}
                     onChange={(e) =>
                        setData({
                           ...data,
                           friend_welcome: {
                              ...data.friend_welcome,
                              type: e.target.value as "discount_percent" | "wallet_toman",
                           },
                        })
                     }
                  >
                     <option value="discount_percent">کد تخفیف درصدی</option>
                     <option value="wallet_toman">اعتبار کیف پول (تومان)</option>
                  </select>
               </div>
               {data.friend_welcome.type === "discount_percent" ? (
                  <>
                     <div>
                        <label className="text-xs text-text-muted block mb-1">درصد تخفیف</label>
                        <Input
                           type="number"
                           className="font-latin"
                           value={data.friend_welcome.percent}
                           onChange={(e) =>
                              setData({
                                 ...data,
                                 friend_welcome: {
                                    ...data.friend_welcome,
                                    percent: parseInt(e.target.value, 10) || 0,
                                 },
                              })
                           }
                        />
                     </div>
                     <div>
                        <label className="text-xs text-text-muted block mb-1">
                           اعتبار کد (روز)
                        </label>
                        <Input
                           type="number"
                           className="font-latin"
                           value={data.friend_welcome.valid_days}
                           onChange={(e) =>
                              setData({
                                 ...data,
                                 friend_welcome: {
                                    ...data.friend_welcome,
                                    valid_days: parseInt(e.target.value, 10) || 1,
                                 },
                              })
                           }
                        />
                     </div>
                  </>
               ) : (
                  <div>
                     <label className="text-xs text-text-muted block mb-1">مبلغ هدیه — تومان</label>
                     <Input
                        type="number"
                        className="font-latin"
                        value={data.friend_welcome.toman}
                        onChange={(e) =>
                           setData({
                              ...data,
                              friend_welcome: {
                                 ...data.friend_welcome,
                                 toman: parseInt(e.target.value, 10) || 0,
                              },
                           })
                        }
                     />
                  </div>
               )}
            </div>
         </Card>

         <Card className="p-6 space-y-4">
            <CardTitle className="flex items-center gap-2">
               <ImagePlus size={20} />
               تصاویر
            </CardTitle>
            {(["landing", "ready_post"] as const).map((slot) => (
               <div
                  key={slot}
                  className="flex flex-col sm:flex-row gap-3 items-start sm:items-center border border-border/60 rounded-lg p-3"
               >
                  <div className="flex-1">
                     <p className="text-sm font-medium">
                        {slot === "landing" ? "تصویر صفحه دعوت" : "تصویر پست آماده فوروارد"}
                     </p>
                     <p className="text-xs text-text-muted mt-0.5">{data.images?.[slot] || "—"}</p>
                  </div>
                  {data.image_urls?.[slot] && (
                     <img
                        src={`/api${data.image_urls[slot]}`}
                        alt=""
                        className="h-16 w-16 object-cover rounded-lg border border-border"
                     />
                  )}
                  <label className="cursor-pointer inline-flex">
                     <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                           const f = e.target.files?.[0];
                           if (f) uploadImage(slot, f);
                           e.target.value = "";
                        }}
                     />
                     <span
                        className={`inline-flex items-center justify-center h-9 px-3 rounded-lg border border-border text-sm ${
                           uploading === slot ? "opacity-50" : "hover:bg-surface-hover"
                        }`}
                     >
                        {uploading === slot ? "در حال آپلود…" : "آپلود تصویر"}
                     </span>
                  </label>
               </div>
            ))}
         </Card>

         <Card className="p-6 space-y-4">
            <CardTitle>متن‌ها (HTML مجاز — مثلاً &lt;b&gt; و &lt;code&gt;)</CardTitle>
            {TEXT_FIELDS.map((field) => (
               <div key={field.key}>
                  <label className="text-sm font-medium block mb-1">{field.label}</label>
                  <p className="text-xs text-text-muted mb-1.5">{field.hint}</p>
                  <textarea
                     className="w-full min-h-[120px] rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-left direction-ltr"
                     dir="rtl"
                     value={data.texts[field.key] || ""}
                     onChange={(e) =>
                        setData({
                           ...data,
                           texts: { ...data.texts, [field.key]: e.target.value },
                        })
                     }
                  />
               </div>
            ))}
            <Button onClick={save} disabled={saving}>
               <Save size={16} className="ml-2" />
               {saving ? "در حال ذخیره…" : "ذخیره تنظیمات دعوت"}
            </Button>
         </Card>
      </div>
   );
}
