"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, CreditCard, Users, Shield, Tag, BarChart3, Radio, LogOut, Menu, X,
  ChevronDown, Bell, Gift, PartyPopper, Wrench, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn, adminRoleLabel, toPersianDigits } from "@/lib/utils";
import { api } from "@/lib/api";
import { SearchCommand } from "@/components/layout/SearchCommand";
import { useAuth, clearAuthCache } from "@/hooks/useAuth";
import {
  canAccessRoute,
  hasPermission,
  type SectionKey,
} from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section: SectionKey;
  superadminOnly?: boolean;
};

type NavGroup = { id: string; label: string; items: NavItem[] };

const ALL_GROUPS: NavGroup[] = [
  {
    id: "main",
    label: "داشبورد",
    items: [{ href: "/dashboard", label: "نمای کلی", icon: LayoutDashboard, section: "dashboard" }],
  },
  {
    id: "access",
    label: "کاربران",
    items: [{ href: "/users", label: "کاربران", icon: Users, section: "users" }],
  },
  {
    id: "billing",
    label: "مالی",
    items: [
      { href: "/transactions", label: "تراکنش‌ها", icon: CreditCard, section: "transactions" },
      { href: "/reports", label: "گزارش‌ها", icon: BarChart3, section: "reports" },
      { href: "/discounts", label: "تخفیف‌ها", icon: Tag, section: "discounts" },
    ],
  },
  {
    id: "configs",
    label: "سرویس‌ها",
    items: [{ href: "/configs", label: "سرویس‌های VPN", icon: Shield, section: "configs" }],
  },
  {
    id: "manage",
    label: "مدیریت ربات",
    items: [
      { href: "/plans", label: "پلن‌ها", icon: Tag, section: "settings_plans" },
      { href: "/referral", label: "دعوت دوستان", icon: Gift, section: "settings_referral" },
      { href: "/festival", label: "جشنواره", icon: PartyPopper, section: "settings_festival" },
      { href: "/maintenance", label: "تعمیر ربات", icon: Wrench, section: "settings_maintenance" },
      { href: "/settings", label: "پرداخت", icon: CreditCard, section: "settings_payment" },
      { href: "/admins", label: "مدیران", icon: Shield, section: "settings_admins", superadminOnly: true },
    ],
  },
  {
    id: "comm",
    label: "ارتباطات",
    items: [{ href: "/broadcast", label: "پیام همگانی", icon: Radio, section: "broadcast" }],
  },
];

function filterGroups(admin: ReturnType<typeof useAuth>["admin"]) {
  if (!admin) return [];
  return ALL_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      if (item.superadminOnly) return admin.is_superadmin;
      return hasPermission(admin, item.section, "read");
    }),
  })).filter((g) => g.items.length > 0);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { admin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activityCount, setActivityCount] = useState(0);

  const groups = useMemo(() => filterGroups(admin), [admin]);
  const showSearch = hasPermission(admin, "dashboard", "read");

  useEffect(() => {
    if (!hasPermission(admin, "activity", "read")) return;
    const url = hasPermission(admin, "dashboard", "read")
      ? "/dashboard/activity?limit=20"
      : "/activity?limit=20";
    api.get<{ items: { at?: string; created_at?: string }[] }>(url).then((d) => {
      const dayAgo = Date.now() - 86400000;
      setActivityCount(
        d.items.filter((i) => {
          const ts = i.at || i.created_at;
          return ts && new Date(ts).getTime() > dayAgo;
        }).length
      );
    }).catch(() => setActivityCount(0));
  }, [pathname, admin]);

  const logout = async () => {
    clearAuthCache();
    document.cookie = "panel_token=; path=/; max-age=0";
    await api.logout();
    router.push("/login");
  };

  const toggleGroup = (id: string) => {
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  };

  const NavContent = () => (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-4 py-5 border-b border-border">
        <h1 className="text-lg font-bold text-primary">پنل NC VPN</h1>
        <p className="text-xs text-text-muted mt-0.5">پنل مدیریت</p>
        {showSearch && (
          <div className="mt-4">
            <SearchCommand />
          </div>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {groups.map((group) => {
          const isOpen = !collapsed[group.id];
          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center justify-between px-2 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted hover:text-text-primary"
              >
                {group.label}
                <ChevronDown size={14} className={cn("transition-transform", !isOpen && "-rotate-90")} />
              </button>
              {isOpen && (
                <div className="mt-1 space-y-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                          active
                            ? "bg-primary/15 text-primary font-medium"
                            : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                        )}
                      >
                        {active && (
                          <span className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-l bg-primary" />
                        )}
                        <Icon size={18} />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 p-3 border-t border-border space-y-2">
        {hasPermission(admin, "activity", "read") && (
          <Link
            href="/activity"
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              pathname.startsWith("/activity")
                ? "bg-primary/15 text-primary font-medium"
                : "text-text-secondary hover:bg-surface-hover"
            )}
          >
            <Bell size={18} />
            فعالیت‌ها
            {activityCount > 0 && (
              <span className="mr-auto rounded-full bg-primary px-2 py-0.5 text-xs text-white tabular-nums">
                {toPersianDigits(activityCount)}
              </span>
            )}
          </Link>
        )}
        {admin && (
          <div className="flex items-center gap-3 rounded-lg bg-background/80 border border-border px-3 py-2.5">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
              {(admin.full_name || admin.username).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{admin.full_name || admin.username}</p>
              <p className="text-xs text-text-muted">{adminRoleLabel(admin.role)}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-danger"
        >
          <LogOut size={18} /> خروج
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        aria-label="Menu"
        className="lg:hidden fixed top-4 right-4 z-40 p-2.5 rounded-xl bg-surface border border-border shadow-lg"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={20} />
      </button>
      <aside className="hidden lg:flex w-64 flex-col border-l border-border bg-surface h-screen fixed right-0 top-0 overflow-hidden">
        <NavContent />
      </aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-72 max-w-[85vw] bg-surface flex flex-col overflow-hidden">
            <button type="button" className="absolute left-4 top-4" onClick={() => setMobileOpen(false)}>
              <X size={20} />
            </button>
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace("/login");
      return;
    }
    if (!canAccessRoute(admin, pathname)) {
      router.replace("/dashboard");
    }
  }, [admin, loading, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-text-muted">
        در حال بارگذاری…
      </div>
    );
  }

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:mr-64 p-4 lg:p-8 pt-16 lg:pt-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
