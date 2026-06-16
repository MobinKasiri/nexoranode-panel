"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CreditCard, Users, Shield, Tag, BarChart3, Radio, Settings, LogOut, Menu, X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
  { href: "/transactions", label: "تراکنش‌ها", icon: CreditCard },
  { href: "/users", label: "کاربران", icon: Users },
  { href: "/configs", label: "سرویس‌ها", icon: Shield },
  { href: "/discounts", label: "تخفیف‌ها", icon: Tag },
  { href: "/reports", label: "گزارش مالی", icon: BarChart3 },
  { href: "/broadcast", label: "پیام همگانی", icon: Radio },
  { href: "/settings", label: "تنظیمات", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logout = async () => {
    await api.logout();
    router.push("/login");
  };

  const NavContent = () => (
    <>
      <div className="px-4 py-6 border-b border-border">
        <h1 className="text-xl font-bold text-primary">Nexoranode</h1>
        <p className="text-xs text-text-muted mt-1">پنل مدیریت</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              pathname.startsWith(href) ? "bg-primary/20 text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-border">
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-danger">
          <LogOut size={18} /> خروج
        </button>
      </div>
    </>
  );

  return (
    <>
      <button className="lg:hidden fixed top-4 right-4 z-40 p-2 rounded-lg bg-surface border border-border" onClick={() => setMobileOpen(true)}>
        <Menu size={20} />
      </button>
      <aside className="hidden lg:flex w-64 flex-col border-l border-border bg-surface min-h-screen fixed right-0 top-0">
        <NavContent />
      </aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-64 bg-surface flex flex-col">
            <button className="absolute left-4 top-4" onClick={() => setMobileOpen(false)}><X size={20} /></button>
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:mr-64 p-4 lg:p-6 pt-16 lg:pt-6">{children}</main>
    </div>
  );
}
