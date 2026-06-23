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
  "settings_maintenance",
  "settings_payment",
  "settings_admins",
  "activity",
];

export const SECTION_LABELS: Record<SectionKey, string> = {
  dashboard: "داشبورد",
  users: "کاربران",
  transactions: "تراکنش‌ها",
  configs: "سرویس‌ها",
  reports: "گزارش‌ها",
  discounts: "تخفیف‌ها",
  broadcast: "پیام همگانی",
  settings_plans: "تنظیمات — پلن‌ها",
  settings_maintenance: "تنظیمات — تعمیر",
  settings_payment: "تنظیمات — پرداخت",
  settings_admins: "تنظیمات — مدیران",
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

export const ROLE_PRESETS: Record<string, Record<SectionKey, PermissionLevel>> = {
  visitor: {
    dashboard: "read", users: "read", transactions: "read", configs: "read",
    reports: "read", discounts: "read", broadcast: "none",
    settings_plans: "none", settings_maintenance: "none", settings_payment: "read",
    settings_admins: "none", activity: "read",
  },
  reporter: {
    dashboard: "read", users: "read", transactions: "read", configs: "read",
    reports: "read", discounts: "read", broadcast: "none",
    settings_plans: "none", settings_maintenance: "none", settings_payment: "read",
    settings_admins: "none", activity: "read",
  },
  agent_transactions: {
    dashboard: "read", users: "read", transactions: "write", configs: "read",
    reports: "read", discounts: "read", broadcast: "none",
    settings_plans: "none", settings_maintenance: "none", settings_payment: "read",
    settings_admins: "none", activity: "read",
  },
  agent_users: {
    dashboard: "read", users: "write", transactions: "read", configs: "read",
    reports: "read", discounts: "none", broadcast: "none",
    settings_plans: "none", settings_maintenance: "none", settings_payment: "read",
    settings_admins: "none", activity: "read",
  },
  agent_configs: {
    dashboard: "read", users: "read", transactions: "read", configs: "write",
    reports: "read", discounts: "none", broadcast: "none",
    settings_plans: "none", settings_maintenance: "none", settings_payment: "read",
    settings_admins: "none", activity: "read",
  },
};

export function permissionsFromPreset(preset: string): Record<SectionKey, PermissionLevel> {
  const base = Object.fromEntries(SECTIONS.map((s) => [s, "none"])) as Record<SectionKey, PermissionLevel>;
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
  "/settings": "settings_plans",
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
  const section = ROUTE_SECTION[base];
  if (!section) return true;
  if (base === "/settings") {
    return (
      hasPermission(admin, "settings_plans", "read") ||
      hasPermission(admin, "settings_maintenance", "read") ||
      hasPermission(admin, "settings_payment", "read")
    );
  }
  return hasPermission(admin, section, "read");
}
