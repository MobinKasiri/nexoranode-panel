"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import type { UserItem, VPNConfigItem } from "@/types";

interface Inbound {
  id: number;
  remark: string;
  protocol: string;
  port: number;
}

interface ClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config?: VPNConfigItem | null;
  onSaved: () => void;
  canWrite: boolean;
  canEdit?: boolean;
}

function randomHex(n: number) {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomUuid() {
  return crypto.randomUUID();
}

export function ClientModal({ open, onOpenChange, config, onSaved, canWrite, canEdit }: ClientModalProps) {
  const isEdit = Boolean(config);
  const allowSave = isEdit ? Boolean(canEdit) : canWrite;
  const [tab, setTab] = useState<"basics" | "credentials">("basics");
  const [inbounds, setInbounds] = useState<Inbound[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedUserLabel, setSelectedUserLabel] = useState("");
  const [notifyUser, setNotifyUser] = useState(true);
  const [userMessage, setUserMessage] = useState("");

  const defaultUserMessage =
    "سلام! یک سرویس VPN جدید برای شما فعال شد. جزئیات و لینک اشتراک در پیام زیر است.";

  const [form, setForm] = useState({
    user_id: 0,
    service_name: "",
    plan_gb: 50,
    plan_days: 30,
    limit_ip: 0,
    enable: true,
    start_after_first_use: true,
    expiry_date: "",
    comment: "",
    inbound_ids: [] as number[],
    uuid: "",
    sub_id: "",
  });

  useEffect(() => {
    if (!open) return;
    api.get<{ items: Inbound[] }>("/configs/inbounds").then((r) => setInbounds(r.items)).catch(() => {});
    if (config) {
      setSelectedUserLabel("");
      setNotifyUser(false);
      setUserMessage("");
      setForm({
        user_id: config.user_id,
        service_name: config.service_name,
        plan_gb: config.plan_gb,
        plan_days: config.plan_days,
        limit_ip: config.limit_ip || 0,
        enable: config.is_active,
        start_after_first_use: !config.expiry_date,
        expiry_date: config.expiry_date ? config.expiry_date.slice(0, 10) : "",
        comment: config.comment || config.service_name,
        inbound_ids: config.inbound_ids || [],
        uuid: config.panel_uuid || "",
        sub_id: config.subscription_id || "",
      });
    } else {
      setSelectedUserLabel("");
      setNotifyUser(true);
      setUserMessage(defaultUserMessage);
      setForm({
        user_id: 0,
        service_name: `user${Math.floor(Math.random() * 900000 + 100000)}`,
        plan_gb: 50,
        plan_days: 30,
        limit_ip: 0,
        enable: true,
        start_after_first_use: true,
        expiry_date: "",
        comment: "",
        inbound_ids: [],
        uuid: randomUuid(),
        sub_id: randomHex(12),
      });
    }
  }, [open, config]);

  useEffect(() => {
    if (!userSearch.trim() || isEdit) return;
    const t = setTimeout(() => {
      api
        .get<{ items: UserItem[] }>(`/users?search=${encodeURIComponent(userSearch)}&limit=8`)
        .then((r) => setUserResults(r.items))
        .catch(() => setUserResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch, isEdit]);

  useEffect(() => {
    if (inbounds.length && !isEdit && form.inbound_ids.length === 0) {
      setForm((f) => ({ ...f, inbound_ids: inbounds.map((i) => i.id) }));
    }
  }, [inbounds, isEdit, form.inbound_ids.length]);

  const toggleInbound = (id: number) => {
    setForm((f) => ({
      ...f,
      inbound_ids: f.inbound_ids.includes(id)
        ? f.inbound_ids.filter((x) => x !== id)
        : [...f.inbound_ids, id],
    }));
  };

  const save = async () => {
    if (!allowSave) return;
    if (!isEdit && !form.user_id) {
      toast.error("کاربر تلگرام الزامی است");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && config) {
        await api.patch(`/configs/${config.id}`, {
          plan_gb: form.plan_gb,
          plan_days: form.plan_days,
          inbound_ids: form.inbound_ids,
          limit_ip: form.limit_ip,
          enable: form.enable,
          start_after_first_use: form.start_after_first_use,
          expiry_date: form.start_after_first_use ? null : form.expiry_date || null,
          comment: form.comment,
          sub_id: form.sub_id,
        });
        toast.success("ذخیره شد");
      } else {
        const res = await api.post<{ notified?: boolean }>("/configs", {
          user_id: form.user_id,
          service_name: form.service_name,
          plan_gb: form.plan_gb,
          plan_days: form.plan_days,
          inbound_ids: form.inbound_ids,
          limit_ip: form.limit_ip,
          enable: form.enable,
          start_after_first_use: form.start_after_first_use,
          expiry_date: form.start_after_first_use ? null : form.expiry_date || null,
          comment: form.comment,
          uuid: form.uuid,
          sub_id: form.sub_id,
          notify_user: notifyUser,
          user_message: notifyUser && userMessage.trim() ? userMessage.trim() : null,
        });
        if (notifyUser) {
          if (res.notified) {
            toast.success("سرویس ایجاد شد و به کاربر در ربات اطلاع داده شد");
          } else {
            toast.error("سرویس ایجاد شد اما ارسال پیام تلگرام ناموفق بود");
          }
        } else {
          toast.success("سرویس ایجاد شد");
        }
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "ویرایش سرویس" : "افزودن سرویس"}
      className="max-w-2xl"
      footer={
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving || !allowSave}>
            {saving ? "در حال ذخیره…" : isEdit ? "ذخیره" : "ایجاد"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
        </div>
      }
    >
      <div className="flex gap-2 mb-4">
        {(["basics", "credentials"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === t ? "bg-primary text-white" : "bg-surface-hover"}`}
          >
            {t === "basics" ? "اصلی" : "اعتبارنامه"}
          </button>
        ))}
      </div>

      {tab === "basics" && (
        <div className="space-y-3 text-sm">
          {!isEdit && (
            <div>
              <label className="text-text-muted block mb-1">کاربر تلگرام *</label>
              <Input
                placeholder="جستجو نام / یوزر / آیدی"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              {userResults.length > 0 && (
                <ul className="mt-1 border border-border rounded-lg divide-y max-h-32 overflow-y-auto">
                  {userResults.map((u) => (
                    <li key={u.tg_id}>
                      <button
                        type="button"
                        className="w-full text-right px-3 py-2 hover:bg-surface-hover text-sm"
                        onClick={() => {
                          setForm((f) => ({ ...f, user_id: u.tg_id }));
                          setSelectedUserLabel(u.full_name || u.username || String(u.tg_id));
                          setUserSearch(u.full_name || u.username || String(u.tg_id));
                          setUserResults([]);
                        }}
                      >
                        {u.full_name} @{u.username || u.tg_id}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {form.user_id > 0 && (
                <p className="text-xs text-primary mt-1">
                  انتخاب شده: {selectedUserLabel || form.user_id}
                  <span className="font-latin text-text-muted mr-2">({form.user_id})</span>
                </p>
              )}
            </div>
          )}
          {!isEdit && form.user_id > 0 && (
            <div className="rounded-xl border border-border/80 bg-background/50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">اطلاع‌رسانی در ربات تلگرام</p>
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <Checkbox
                    checked={notifyUser}
                    onCheckedChange={(c) => setNotifyUser(Boolean(c))}
                  />
                  ارسال پیام به کاربر
                </label>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                پس از ایجاد سرویس، پیامی با جزئیات کانفیگ و لینک اشتراک (همراه دکمه کپی) برای کاربر
                ارسال می‌شود.
              </p>
              <div>
                <label className="text-text-muted text-xs block mb-1.5">
                  پیام شخصی پشتیبانی (اختیاری)
                </label>
                <textarea
                  className="w-full min-h-[88px] rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y disabled:opacity-50"
                  placeholder={defaultUserMessage}
                  value={userMessage}
                  disabled={!notifyUser}
                  onChange={(e) => setUserMessage(e.target.value)}
                />
              </div>
            </div>
          )}
          {!isEdit && (
            <div>
              <label className="text-text-muted block mb-1">نام سرویس (email)</label>
              <Input
                className="font-latin"
                value={form.service_name}
                onChange={(e) => setForm({ ...form, service_name: e.target.value.toLowerCase() })}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-text-muted block mb-1">ترافیک (GB)</label>
              <Input
                type="number"
                className="font-latin"
                value={form.plan_gb}
                onChange={(e) => setForm({ ...form, plan_gb: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
            <div>
              <label className="text-text-muted block mb-1">مدت (روز)</label>
              <Input
                type="number"
                className="font-latin"
                value={form.plan_days}
                onChange={(e) => setForm({ ...form, plan_days: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
            <div>
              <label className="text-text-muted block mb-1">محدودیت IP</label>
              <Input
                type="number"
                className="font-latin"
                value={form.limit_ip}
                onChange={(e) => setForm({ ...form, limit_ip: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
            <div>
              <label className="text-text-muted block mb-1">انقضا (میلادی)</label>
              <Input
                type="date"
                className="font-latin"
                disabled={form.start_after_first_use}
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={form.start_after_first_use}
              onCheckedChange={(c) => setForm({ ...form, start_after_first_use: Boolean(c) })}
            />
            شروع پس از اولین اتصال
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={form.enable}
              onCheckedChange={(c) => setForm({ ...form, enable: Boolean(c) })}
            />
            فعال
          </label>
          <Input
            placeholder="توضیح"
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-text-muted">Inboundها</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, inbound_ids: inbounds.map((i) => i.id) }))}
                >
                  همه
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, inbound_ids: [] }))}
                >
                  پاک
                </Button>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
              {inbounds.map((ib) => (
                <label key={ib.id} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={form.inbound_ids.includes(ib.id)}
                    onCheckedChange={() => toggleInbound(ib.id)}
                  />
                  <span className="font-latin">
                    {ib.remark || ib.id} ({ib.protocol}:{ib.port})
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "credentials" && (
        <div className="space-y-3">
          <FieldWithRefresh
            label="UUID"
            value={form.uuid}
            onChange={(v) => setForm({ ...form, uuid: v })}
            onRefresh={() => setForm({ ...form, uuid: randomUuid() })}
          />
          <FieldWithRefresh
            label="Subscription ID"
            value={form.sub_id}
            onChange={(v) => setForm({ ...form, sub_id: v })}
            onRefresh={() => setForm({ ...form, sub_id: randomHex(12) })}
          />
        </div>
      )}
    </Modal>
  );
}

function FieldWithRefresh({
  label,
  value,
  onChange,
  onRefresh,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div>
      <label className="text-text-muted text-sm block mb-1">{label}</label>
      <div className="flex gap-2">
        <Input className="font-latin flex-1" value={value} onChange={(e) => onChange(e.target.value)} />
        <Button type="button" size="icon" variant="outline" onClick={onRefresh} aria-label="تولید مجدد">
          <RefreshCw size={16} />
        </Button>
      </div>
    </div>
  );
}
