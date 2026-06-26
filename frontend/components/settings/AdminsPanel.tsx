"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Eye, Lock, Pencil, Shield, Trash2, Unlock, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import {
  PRESET_LABELS,
  SECTIONS,
  SECTION_LABELS,
  SECTION_MAX_LEVEL,
  permissionsFromPreset,
  type AdminProfile,
  type PermissionLevel,
  type SectionKey,
} from "@/lib/permissions";
import { cn, formatDate, toPersianDigits } from "@/lib/utils";

type AdminRow = AdminProfile;

type ConfirmAction = "ban" | "unban" | "delete";

function PermissionsMatrix({
  editPerms,
  editPreset,
  onPresetChange,
  onPermChange,
}: {
  editPerms: Record<string, PermissionLevel>;
  editPreset: string;
  onPresetChange: (preset: string) => void;
  onPermChange: (section: SectionKey, level: PermissionLevel) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-text-muted block mb-2">نقش پیش‌فرض</label>
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={editPreset}
          onChange={(e) => onPresetChange(e.target.value)}
        >
          {Object.entries(PRESET_LABELS).map(([p, label]) => (
            <option key={p} value={p}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="data-table text-sm">
          <thead>
            <tr>
              <th>بخش</th>
              <th>بدون</th>
              <th>خواندن</th>
              <th>نوشتن</th>
            </tr>
          </thead>
          <tbody>
            {SECTIONS.filter((s) => s !== "settings_admins").map((section) => (
              <tr key={section}>
                <td>{SECTION_LABELS[section]}</td>
                {(["none", "read", "write"] as PermissionLevel[]).map((level) => {
                  const max = SECTION_MAX_LEVEL[section];
                  const disabled =
                    (max === "read" && level === "write") || (max === "none" && level !== "none");
                  return (
                    <td key={level} className="text-center">
                      <input
                        type="radio"
                        name={`perm-${section}`}
                        checked={(editPerms[section] || "none") === level}
                        disabled={disabled}
                        onChange={() => onPermChange(section, level)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminsPanel() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editAdmin, setEditAdmin] = useState<AdminRow | null>(null);
  const [viewAdmin, setViewAdmin] = useState<AdminRow | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ admin: AdminRow; action: ConfirmAction } | null>(
    null
  );

  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    full_name: "",
    role_preset: "visitor",
  });

  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPreset, setEditPreset] = useState("visitor");
  const [editPerms, setEditPerms] = useState<Record<string, PermissionLevel>>({});

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<{ items: AdminRow[] }>("/settings/admins")
      .then((a) => setAdmins(a.items))
      .catch((e) => toast.error(e instanceof Error ? e.message : "خطا"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!editAdmin) return;
    setEditName(editAdmin.full_name || "");
    setEditPassword("");
    setEditPreset(editAdmin.role_preset || "custom");
    setEditPerms({ ...editAdmin.permissions });
  }, [editAdmin]);

  const setPerm = (section: SectionKey, level: PermissionLevel) => {
    const max = SECTION_MAX_LEVEL[section];
    if (max === "none") return;
    if (max === "read" && level === "write") level = "read";
    setEditPerms((p) => ({ ...p, [section]: level }));
    setEditPreset("custom");
  };

  const applyPreset = (preset: string) => {
    setEditPreset(preset);
    if (preset !== "custom") {
      setEditPerms(permissionsFromPreset(preset));
    }
  };

  const resetCreateForm = () => {
    setCreateForm({ username: "", password: "", full_name: "", role_preset: "visitor" });
  };

  const createAdmin = async () => {
    if (!createForm.username || !createForm.password) {
      toast.error("نام کاربری و رمز عبور الزامی است");
      return;
    }
    setSaving(true);
    try {
      await api.post("/settings/admins", createForm);
      toast.success("مدیر ایجاد شد");
      resetCreateForm();
      setCreateOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editAdmin) return;
    setSaving(true);
    try {
      const body: {
        full_name: string;
        role_preset: string;
        permissions: Record<string, PermissionLevel>;
        password?: string;
      } = {
        full_name: editName,
        role_preset: editPreset,
        permissions: editPerms,
      };
      if (editPassword.trim()) body.password = editPassword;
      await api.patch(`/settings/admins/${editAdmin.id}`, body);
      toast.success("ذخیره شد");
      setEditAdmin(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const runConfirm = async () => {
    if (!confirmTarget) return;
    const { admin, action } = confirmTarget;
    setSaving(true);
    try {
      if (action === "ban") {
        await api.patch(`/settings/admins/${admin.id}/ban`, {});
        toast.success("مدیر مسدود شد");
      } else if (action === "unban") {
        await api.patch(`/settings/admins/${admin.id}/unban`, {});
        toast.success("مسدودیت برداشته شد");
      } else {
        await api.delete(`/settings/admins/${admin.id}`);
        toast.success("مدیر حذف شد");
      }
      setConfirmTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (a: AdminRow) =>
    a.role === "superadmin" ? "سوپرادمین" : PRESET_LABELS[a.role_preset] || a.role_preset;

  const confirmTitle =
    confirmTarget?.action === "ban"
      ? "مسدودسازی مدیر"
      : confirmTarget?.action === "unban"
        ? "رفع مسدودیت"
        : "حذف مدیر";

  const confirmDescription =
    confirmTarget?.action === "delete" ? (
      <p>
        مدیر <span className="font-latin font-medium">{confirmTarget.admin.username}</span> به‌طور کامل
        حذف می‌شود. این عملیات برگشت‌پذیر نیست.
      </p>
    ) : (
      <p>این عملیات در لاگ فعالیت ثبت می‌شود.</p>
    );

  return (
    <>
      <PageHeader
        title="مدیران"
        description="دسترسی‌ها و حساب‌های پنل مدیریت"
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus size={16} className="ml-2" />
            مدیر جدید
          </Button>
        }
      />

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : admins.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="مدیری ثبت نشده"
            description="با دکمه «مدیر جدید» اولین حساب را بسازید"
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>آیدی</th>
                <th>نام</th>
                <th>نقش</th>
                <th>وضعیت</th>
                <th>آخرین ورود</th>
                <th>تاریخ ایجاد</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isSuper = a.role === "superadmin";
                return (
                  <tr key={a.id} className={cn(!a.is_active && !isSuper && "opacity-60")}>
                    <td className="font-latin text-text-muted">{toPersianDigits(a.id)}</td>
                    <td>
                      <div className="font-medium">{a.full_name || a.username}</div>
                      <div className="text-xs text-text-muted font-latin">@{a.username}</div>
                    </td>
                    <td>
                      {isSuper ? (
                        <Badge status="confirmed">سوپرادمین</Badge>
                      ) : (
                        <Badge status="pending">{roleLabel(a)}</Badge>
                      )}
                    </td>
                    <td>
                      {isSuper ? (
                        <Badge status="confirmed">فعال</Badge>
                      ) : (
                        <Badge status={a.is_active ? "confirmed" : "rejected"}>
                          {a.is_active ? "فعال" : "مسدود"}
                        </Badge>
                      )}
                    </td>
                    <td className="text-text-secondary whitespace-nowrap text-sm">
                      {a.last_login ? formatDate(a.last_login) : "—"}
                    </td>
                    <td className="text-text-secondary whitespace-nowrap text-sm">
                      {a.created_at ? formatDate(a.created_at) : "—"}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {isSuper ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="مشاهده"
                            onClick={() => setViewAdmin(a)}
                          >
                            <Eye size={16} />
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="ویرایش"
                              onClick={() => setEditAdmin(a)}
                            >
                              <Pencil size={16} />
                            </Button>
                            {a.is_active ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="مسدودسازی"
                                onClick={() => setConfirmTarget({ admin: a, action: "ban" })}
                              >
                                <Lock size={16} />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="رفع مسدودیت"
                                onClick={() => setConfirmTarget({ admin: a, action: "unban" })}
                              >
                                <Unlock size={16} />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger hover:text-danger"
                              title="حذف"
                              onClick={() => setConfirmTarget({ admin: a, action: "delete" })}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) resetCreateForm();
        }}
        title="افزودن مدیر"
        className="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              انصراف
            </Button>
            <Button onClick={createAdmin} disabled={saving}>
              ایجاد مدیر
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-muted block mb-1.5">نام کاربری</label>
            <Input
              className="font-latin"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1.5">رمز عبور</label>
            <Input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1.5">نام نمایشی</label>
            <Input
              value={createForm.full_name}
              onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1.5">نقش پیش‌فرض</label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={createForm.role_preset}
              onChange={(e) => setCreateForm({ ...createForm, role_preset: e.target.value })}
            >
              {Object.entries(PRESET_LABELS)
                .filter(([k]) => k !== "custom")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </Modal>

      <Modal
        open={editAdmin !== null}
        onOpenChange={(o) => !o && setEditAdmin(null)}
        title={editAdmin ? `ویرایش — ${editAdmin.username}` : "ویرایش مدیر"}
        className="max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditAdmin(null)} disabled={saving}>
              انصراف
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              ذخیره تغییرات
            </Button>
          </div>
        }
      >
        {editAdmin && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-text-muted block mb-1.5">نام نمایشی</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1.5">رمز عبور جدید</label>
              <Input
                type="password"
                placeholder="خالی = بدون تغییر"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
            </div>
            <PermissionsMatrix
              editPerms={editPerms}
              editPreset={editPreset}
              onPresetChange={applyPreset}
              onPermChange={setPerm}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={viewAdmin !== null}
        onOpenChange={(o) => !o && setViewAdmin(null)}
        title="سوپرادمین"
        className="max-w-md"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setViewAdmin(null)}>
              بستن
            </Button>
          </div>
        }
      >
        {viewAdmin && (
          <div className="space-y-3 text-sm">
            <p className="text-text-muted">
              سوپرادمین از طریق متغیرهای محیطی (`.env`) مدیریت می‌شود و دسترسی کامل دارد. ویرایش یا
              حذف از پنل امکان‌پذیر نیست.
            </p>
            <dl className="grid gap-2 rounded-lg border border-border/60 p-4">
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">نام</dt>
                <dd className="font-medium">{viewAdmin.full_name || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">نام کاربری</dt>
                <dd className="font-latin">{viewAdmin.username}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">آخرین ورود</dt>
                <dd>{viewAdmin.last_login ? formatDate(viewAdmin.last_login) : "—"}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
        title={confirmTitle}
        destructive={confirmTarget?.action !== "unban"}
        confirmLabel={confirmTarget?.action === "unban" ? "رفع مسدودیت" : "تایید"}
        loading={saving}
        onConfirm={runConfirm}
        description={confirmDescription}
      />
    </>
  );
}
