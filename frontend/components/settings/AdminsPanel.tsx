"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import {
  PRESET_LABELS,
  SECTIONS,
  SECTION_LABELS,
  permissionsFromPreset,
  type AdminProfile,
  type PermissionLevel,
  type SectionKey,
} from "@/lib/permissions";
import { cn, formatDate } from "@/lib/utils";

type AdminRow = AdminProfile;

interface PermissionsMeta {
  sections: SectionKey[];
  section_labels: Record<string, string>;
  presets: string[];
  preset_labels: Record<string, string>;
}

export function AdminsPanel() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [meta, setMeta] = useState<PermissionsMeta | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"ban" | "unban" | "delete" | null>(null);

  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    full_name: "",
    role_preset: "visitor",
  });
  const [editPreset, setEditPreset] = useState("visitor");
  const [editPerms, setEditPerms] = useState<Record<string, PermissionLevel>>({});
  const [editName, setEditName] = useState("");

  const selected = admins.find((a) => a.id === selectedId) || null;

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<{ items: AdminRow[] }>("/settings/admins"),
      api.get<PermissionsMeta>("/settings/permissions-meta"),
    ])
      .then(([a, m]) => {
        setAdmins(a.items);
        setMeta(m);
        setSelectedId((prev) => {
          if (prev) return prev;
          if (!a.items.length) return null;
          const first = a.items.find((x) => x.role !== "superadmin") || a.items[0];
          return first.id;
        });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "خطا"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected || selected.role === "superadmin") return;
    setEditPreset(selected.role_preset || "custom");
    setEditPerms({ ...selected.permissions });
    setEditName(selected.full_name || "");
  }, [selected]);

  const setPerm = (section: SectionKey, level: PermissionLevel) => {
    setEditPerms((p) => ({ ...p, [section]: level }));
    setEditPreset("custom");
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
      setCreateForm({ username: "", password: "", full_name: "", role_preset: "visitor" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const saveSelected = async () => {
    if (!selected || selected.role === "superadmin") return;
    setSaving(true);
    try {
      await api.patch(`/settings/admins/${selected.id}`, {
        full_name: editName,
        role_preset: editPreset,
        permissions: editPerms,
      });
      toast.success("ذخیره شد");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const runConfirm = async () => {
    if (!selected || !confirmAction) return;
    setSaving(true);
    try {
      if (confirmAction === "ban") {
        await api.patch(`/settings/admins/${selected.id}/ban`, {});
        toast.success("مدیر مسدود شد");
      } else if (confirmAction === "unban") {
        await api.patch(`/settings/admins/${selected.id}/unban`, {});
        toast.success("مسدودیت برداشته شد");
      } else {
        await api.delete(`/settings/admins/${selected.id}`);
        toast.success("مدیر حذف شد");
        setSelectedId(null);
      }
      setConfirmAction(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: string) => {
    setEditPreset(preset);
    if (preset !== "custom") {
      setEditPerms(permissionsFromPreset(preset));
    }
  };

  if (loading) return <Card className="p-8 text-center text-text-muted">در حال بارگذاری…</Card>;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(240px,1fr)_minmax(320px,2fr)]">
      <Card>
        <CardTitle className="mb-4">مدیران</CardTitle>
        <ul className="divide-y divide-border/60 max-h-[480px] overflow-y-auto">
          {admins.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={cn(
                  "w-full text-right py-3 px-2 rounded-lg transition-colors",
                  selectedId === a.id ? "bg-primary/10" : "hover:bg-surface-hover"
                )}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{a.full_name || a.username}</span>
                  {a.role === "superadmin" ? (
                    <Badge status="confirmed">سوپرادمین</Badge>
                  ) : (
                    <Badge status={a.is_active ? "pending" : "rejected"}>
                      {PRESET_LABELS[a.role_preset] || a.role_preset}
                    </Badge>
                  )}
                  {!a.is_active && a.role !== "superadmin" && (
                    <Badge status="rejected">مسدود</Badge>
                  )}
                </div>
                <p className="text-xs text-text-muted font-latin mt-0.5">@{a.username}</p>
                {a.last_login && (
                  <p className="text-xs text-text-muted mt-1">آخرین ورود: {formatDate(a.last_login)}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-6">
        {selected && selected.role !== "superadmin" ? (
          <Card>
            <CardTitle className="mb-4">ویرایش — {selected.username}</CardTitle>
            <div className="space-y-4">
              <Input
                placeholder="نام نمایشی"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <div>
                <label className="text-sm text-text-muted block mb-2">نقش پیش‌فرض</label>
                <select
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={editPreset}
                  onChange={(e) => applyPreset(e.target.value)}
                >
                  {(meta?.presets || Object.keys(PRESET_LABELS)).map((p) => (
                    <option key={p} value={p}>
                      {PRESET_LABELS[p] || p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto">
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
                        {(["none", "read", "write"] as PermissionLevel[]).map((level) => (
                          <td key={level} className="text-center">
                            <input
                              type="radio"
                              name={`perm-${section}`}
                              checked={(editPerms[section] || "none") === level}
                              onChange={() => setPerm(section, level)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveSelected} disabled={saving}>
                  ذخیره دسترسی‌ها
                </Button>
                {selected.is_active ? (
                  <Button variant="danger" onClick={() => setConfirmAction("ban")}>
                    مسدود
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setConfirmAction("unban")}>
                    رفع مسدودیت
                  </Button>
                )}
                <Button variant="danger" onClick={() => setConfirmAction("delete")}>
                  حذف
                </Button>
              </div>
            </div>
          </Card>
        ) : selected?.role === "superadmin" ? (
          <Card className="p-6 text-text-muted text-sm">
            سوپرادمین از طریق `.env` مدیریت می‌شود و دسترسی کامل دارد.
          </Card>
        ) : null}

        <Card>
          <CardTitle className="mb-4">افزودن مدیر</CardTitle>
          <div className="space-y-3 max-w-md">
            <Input
              placeholder="نام کاربری"
              className="font-latin"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
            />
            <Input
              type="password"
              placeholder="رمز عبور"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            />
            <Input
              placeholder="نام نمایشی"
              value={createForm.full_name}
              onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
            />
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
            <Button onClick={createAdmin} disabled={saving}>
              ایجاد مدیر
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={
          confirmAction === "ban"
            ? "مسدودسازی مدیر"
            : confirmAction === "unban"
              ? "رفع مسدودیت"
              : "حذف مدیر"
        }
        destructive={confirmAction !== "unban"}
        confirmLabel={confirmAction === "unban" ? "رفع مسدودیت" : "تایید"}
        loading={saving}
        onConfirm={runConfirm}
        description={<p>این عملیات در لاگ فعالیت ثبت می‌شود.</p>}
      />
    </div>
  );
}
