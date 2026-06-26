export type PermissionLevel = "none" | "read" | "write";

export type SectionKey =
  | "dashboard"
  | "users"
  | "transactions"
  | "configs"
  | "reports"
  | "discounts"
  | "broadcast"
  | "settings_plans"
  | "settings_referral"
  | "settings_festival"
  | "settings_maintenance"
  | "settings_payment"
  | "settings_admins"
  | "activity";

export const SECTIONS: SectionKey[] = [
  "dashboard",
  "users",
  "transactions",
  "configs",
  "reports",
  "discounts",
  "broadcast",
  "settings_plans",
  "settings_referral",
  "settings_festival",
  "settings_maintenance",
  "settings_payment",
  "settings_admins",
  "activity",
];

/** Max grantable level per section in the admin access table. */
export const SECTION_MAX_LEVEL: Partial<Record<SectionKey, PermissionLevel>> = {
  settings_payment: "read",
  settings_admins: "none",
};

export const SECTION_LABELS: Record<SectionKey, string> = {
  dashboard: "داشبورد",
  users: "کاربران",
  transactions: "تراکنش‌ها",
  configs: "سرویس‌ها",
  reports: "گزارش‌ها",
  discounts: "تخفیف‌ها",
  broadcast: "پیام همگانی",
  settings_plans: "پلن‌ها",
  settings_referral: "دعوت دوستان",
  settings_festival: "جشنواره",
  settings_maintenance: "تعمیر ربات",
  settings_payment: "پرداخت (فقط خواندن)",
  settings_admins: "مدیران (سوپرادمین)",
  activity: "فعالیت‌ها",
};

export const PRESET_LABELS: Record<string, string> = {
  visitor: "بازدیدکننده",
  reporter: "گزارش‌گیر",
  agent_transactions: "اپراتور تراکنش",
  agent_users: "اپراتور کاربران",
  agent_configs: "اپراتور سرویس‌ها",
  custom: "سفارشی",
};

const presetBase = () =>
  Object.fromEntries(SECTIONS.map((s) => [s, "none"])) as Record<SectionKey, PermissionLevel>;

export const ROLE_PRESETS: Record<string, Record<SectionKey, PermissionLevel>> = {
  visitor: {
    ...presetBase(),
    dashboard: "read", users: "read", transactions: "read", configs: "read",
    reports: "read", discounts: "read", settings_festival: "read",
    settings_payment: "read", activity: "read",
  },
  reporter: {
    ...presetBase(),
    dashboard: "read", users: "read", transactions: "read", configs: "read",
    reports: "read", discounts: "read", settings_festival: "read",
    settings_payment: "read", activity: "read",
  },
  agent_transactions: {
    ...presetBase(),
    dashboard: "read", users: "read", transactions: "write", configs: "read",
    reports: "read", discounts: "read", settings_festival: "read",
    settings_payment: "read", activity: "read",
  },
  agent_users: {
    ...presetBase(),
    dashboard: "read", users: "write", transactions: "read", configs: "read",
    reports: "read", settings_payment: "read", activity: "read",
  },
  agent_configs: {
    ...presetBase(),
    dashboard: "read", users: "read", transactions: "read", configs: "write",
    reports: "read", settings_payment: "read", activity: "read",
  },
};

export function permissionsFromPreset(preset: string): Record<SectionKey, PermissionLevel> {
  const base = presetBase();
  if (ROLE_PRESETS[preset]) Object.assign(base, ROLE_PRESETS[preset]);
  return base;
}

export const ROUTE_SECTION: Record<string, SectionKey> = {
  "/dashboard": "dashboard",
  "/users": "users",
  "/transactions": "transactions",
  "/configs": "configs",
  "/reports": "reports",
  "/discounts": "discounts",
  "/broadcast": "broadcast",
  "/plans": "settings_plans",
  "/referral": "settings_referral",
  "/festival": "settings_festival",
  "/maintenance": "settings_maintenance",
  "/settings": "settings_payment",
  "/activity": "activity",
};

const LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  read: 1,
  write: 2,
};

export interface AdminProfile {
  id: number;
  username: string;
  full_name: string;
  role: string;
  role_preset: string;
  permissions: Record<string, PermissionLevel>;
  is_superadmin: boolean;
  is_active?: boolean;
  banned_at?: string | null;
  last_login?: string | null;
  created_at?: string | null;
}

export function hasPermission(
  admin: AdminProfile | null,
  section: SectionKey,
  level: PermissionLevel = "read"
): boolean {
  if (!admin) return false;
  if (admin.is_superadmin) return true;
  if (section === "settings_admins") return false;
  const required = LEVEL_RANK[level];
  const actual = LEVEL_RANK[admin.permissions?.[section] || "none"];
  return actual >= required;
}

export function canAccessRoute(admin: AdminProfile | null, pathname: string): boolean {
  if (!admin) return false;
  if (admin.is_superadmin) return true;
  const base = "/" + pathname.split("/").filter(Boolean)[0];
  if (base === "/admins") return admin.is_superadmin;
  const section = ROUTE_SECTION[base];
  if (!section) return true;
  return hasPermission(admin, section, "read");
}

export function canAccessSearchResult(
  admin: AdminProfile | null,
  kind: "users" | "configs" | "transactions"
): boolean {
  if (!admin) return false;
  if (admin.is_superadmin) return true;
  const map: Record<string, SectionKey> = {
    users: "users",
    configs: "configs",
    transactions: "transactions",
  };
  return hasPermission(admin, map[kind], "read");
}
