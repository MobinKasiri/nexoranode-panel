"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Search, X } from "lucide-react";
import { AppShell } from "@/components/layout/Sidebar";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { toPersianDigits } from "@/lib/utils";
import type { UserItem } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";

export default function BroadcastPage() {
  const { admin } = useAuth();
  const canWrite = hasPermission(admin, "broadcast", "write");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("all");
  const [count, setCount] = useState(0);
  const [countLoading, setCountLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<UserItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCountLoading(true);
    const params = new URLSearchParams({ target });
    if (target === "specific" && selectedUsers.length) {
      params.set("user_ids", JSON.stringify(selectedUsers.map((u) => u.tg_id)));
    }
    api
      .get<{ count: number }>(`/broadcast/count?${params}`)
      .then((r) => setCount(r.count))
      .finally(() => setCountLoading(false));
  }, [target, selectedUsers]);

  useEffect(() => {
    if (!userSearch.trim()) {
      setUserResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<{ items: UserItem[] }>(`/users?search=${encodeURIComponent(userSearch)}&limit=10`)
        .then((r) => setUserResults(r.items))
        .catch(() => setUserResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch]);

  const onPhotoChange = (file: File | null) => {
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const send = async () => {
    if (!message.trim() && !photo) return;
    if (target === "specific" && !selectedUsers.length) {
      toast.error("حداقل یک کاربر انتخاب کنید");
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append("message", message);
      form.append("target", target);
      if (target === "specific") {
        form.append("user_ids", JSON.stringify(selectedUsers.map((u) => u.tg_id)));
      }
      if (photo) form.append("photo", photo);

      const res = await fetch("/api/broadcast/send", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Request failed");
      }
      const r = (await res.json()) as { sent: number; failed: number };
      setResult(r);
      toast.success(`${toPersianDigits(r.sent)} پیام ارسال شد`);
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSending(false);
    }
  };

  const targets = [
    { key: "all", label: "همه کاربران" },
    { key: "active", label: "کاربران با سرویس فعال" },
    { key: "inactive", label: "کاربران بدون سرویس" },
    { key: "specific", label: "کاربران مشخص" },
  ];

  const toggleUser = (u: UserItem) => {
    setSelectedUsers((prev) =>
      prev.some((x) => x.tg_id === u.tg_id)
        ? prev.filter((x) => x.tg_id !== u.tg_id)
        : [...prev, u]
    );
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-10 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 mb-6 bg-background/95 backdrop-blur border-b border-border">
        <p className="text-sm text-text-muted">گیرندگان انتخاب‌شده</p>
        <p className="text-3xl font-bold text-primary tabular-nums">
          {countLoading ? "…" : toPersianDigits(count.toLocaleString("fa-IR"))}
        </p>
      </div>

      <h1 className="text-2xl font-bold mb-6">پیام همگانی</h1>
      <Card className="max-w-2xl">
        <CardTitle className="mb-4">مخاطبان</CardTitle>
        <div className="space-y-2 mb-6 text-sm">
          {targets.map((o) => (
            <label key={o.key} className="flex items-center gap-3 cursor-pointer py-1">
              <Checkbox checked={target === o.key} onCheckedChange={() => setTarget(o.key)} />
              {o.label}
            </label>
          ))}
        </div>

        {target === "specific" && (
          <div className="mb-6">
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              انتخاب کاربران ({toPersianDigits(selectedUsers.length)})
            </Button>
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedUsers.map((u) => (
                  <span
                    key={u.tg_id}
                    className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-1 text-xs"
                  >
                    {u.full_name || u.username}
                    <button type="button" onClick={() => toggleUser(u)}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="text-sm text-text-secondary block mb-2">تصویر (اختیاری)</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPhotoChange(e.target.files?.[0] || null)}
        />
        <div className="flex gap-2 mb-4">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            انتخاب تصویر
          </Button>
          {photo && (
            <Button size="sm" variant="ghost" onClick={() => onPhotoChange(null)}>
              حذف تصویر
            </Button>
          )}
        </div>
        {photoPreview && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview URL
          <img src={photoPreview} alt="preview" className="max-h-40 rounded-lg mb-4 border border-border" />
        )}

        <label className="text-sm text-text-secondary block mb-2">متن پیام (HTML)</label>
        <textarea
          className="w-full rounded-lg border border-border bg-background p-3 text-sm min-h-[160px] mb-4 font-latin"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="<b>اعلان</b>"
        />
        <div
          className="rounded-lg border border-border bg-background p-3 mb-4 text-sm min-h-[60px]"
          dangerouslySetInnerHTML={{ __html: message || "<span class='text-text-muted'>پیش‌نمایش…</span>" }}
        />
        {canWrite && (
          <Button onClick={() => setConfirmOpen(true)} disabled={sending || (!message.trim() && !photo)}>
            {sending ? "در حال ارسال…" : "ارسال"}
          </Button>
        )}
        {result && (
          <p className="text-sm text-text-secondary mt-4 tabular-nums">
            ارسال موفق: {toPersianDigits(result.sent)} | ناموفق: {toPersianDigits(result.failed)}
          </p>
        )}
      </Card>

      <Modal open={pickerOpen} onOpenChange={setPickerOpen} title="انتخاب کاربران" className="max-w-lg">
        <div className="search-input-wrap mb-3">
          <Search size={16} />
          <Input
            placeholder="جستجو..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
          />
        </div>
        <ul className="max-h-64 overflow-y-auto divide-y divide-border">
          {userResults.map((u) => (
            <li key={u.tg_id}>
              <label className="flex items-center gap-3 py-2 cursor-pointer">
                <Checkbox
                  checked={selectedUsers.some((x) => x.tg_id === u.tg_id)}
                  onCheckedChange={() => toggleUser(u)}
                />
                <span>{u.full_name}</span>
                <span className="text-text-muted text-xs font-latin">@{u.username || u.tg_id}</span>
              </label>
            </li>
          ))}
        </ul>
        <Button className="mt-4 w-full" onClick={() => setPickerOpen(false)}>
          تایید ({toPersianDigits(selectedUsers.length)})
        </Button>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تایید ارسال پیام"
        confirmLabel="ارسال"
        loading={sending}
        onConfirm={send}
        description={
          <p>
            این پیام برای <strong>{toPersianDigits(count.toLocaleString("fa-IR"))}</strong> کاربر ارسال شود؟
          </p>
        }
      />
    </AppShell>
  );
}
