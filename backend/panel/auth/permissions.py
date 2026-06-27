from __future__ import annotations

from typing import Literal

PermissionLevel = Literal["none", "read", "write"]

SECTIONS: tuple[str, ...] = (
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
)

# Sections that cannot be granted above read (or none for settings_admins).
READ_ONLY_SECTIONS: frozenset[str] = frozenset({"settings_payment"})

LEVEL_RANK = {"none": 0, "read": 1, "write": 2}

ROLE_PRESETS: dict[str, dict[str, PermissionLevel]] = {
    "visitor": {
        "dashboard": "read",
        "users": "read",
        "transactions": "read",
        "configs": "read",
        "reports": "read",
        "discounts": "read",
        "broadcast": "none",
        "settings_plans": "none",
        "settings_referral": "none",
        "settings_festival": "read",
        "settings_maintenance": "none",
        "settings_payment": "read",
        "settings_admins": "none",
        "activity": "read",
    },
    "reporter": {
        "dashboard": "read",
        "users": "read",
        "transactions": "read",
        "configs": "read",
        "reports": "read",
        "discounts": "read",
        "broadcast": "none",
        "settings_plans": "none",
        "settings_referral": "none",
        "settings_festival": "read",
        "settings_maintenance": "none",
        "settings_payment": "read",
        "settings_admins": "none",
        "activity": "read",
    },
    "agent_transactions": {
        "dashboard": "read",
        "users": "read",
        "transactions": "write",
        "configs": "read",
        "reports": "read",
        "discounts": "read",
        "broadcast": "none",
        "settings_plans": "none",
        "settings_referral": "none",
        "settings_festival": "read",
        "settings_maintenance": "none",
        "settings_payment": "read",
        "settings_admins": "none",
        "activity": "read",
    },
    "agent_users": {
        "dashboard": "read",
        "users": "write",
        "transactions": "read",
        "configs": "read",
        "reports": "read",
        "discounts": "none",
        "broadcast": "none",
        "settings_plans": "none",
        "settings_referral": "none",
        "settings_festival": "none",
        "settings_maintenance": "none",
        "settings_payment": "read",
        "settings_admins": "none",
        "activity": "read",
    },
    "agent_configs": {
        "dashboard": "read",
        "users": "read",
        "transactions": "read",
        "configs": "write",
        "reports": "read",
        "discounts": "none",
        "broadcast": "none",
        "settings_plans": "none",
        "settings_referral": "none",
        "settings_festival": "none",
        "settings_maintenance": "none",
        "settings_payment": "read",
        "settings_admins": "none",
        "activity": "read",
    },
}

SECTION_LABELS_FA: dict[str, str] = {
    "dashboard": "داشبورد",
    "users": "کاربران",
    "transactions": "تراکنش‌ها",
    "configs": "سرویس‌ها",
    "reports": "گزارش‌ها",
    "discounts": "تخفیف‌ها",
    "broadcast": "پیام همگانی",
    "settings_plans": "پلن‌ها",
    "settings_referral": "دعوت دوستان",
    "settings_festival": "جشنواره",
    "settings_maintenance": "تعمیر ربات",
    "settings_payment": "پرداخت (فقط خواندن)",
    "settings_admins": "مدیران (سوپرادمین)",
    "activity": "فعالیت‌ها",
}

PRESET_LABELS_FA: dict[str, str] = {
    "visitor": "بازدیدکننده",
    "reporter": "گزارش‌گیر",
    "agent_transactions": "اپراتور تراکنش",
    "agent_users": "اپراتور کاربران",
    "agent_configs": "اپراتور سرویس‌ها",
    "custom": "سفارشی",
}


def empty_permissions() -> dict[str, PermissionLevel]:
    return {s: "none" for s in SECTIONS}


def permissions_from_preset(preset: str) -> dict[str, PermissionLevel]:
    base = empty_permissions()
    if preset in ROLE_PRESETS:
        base.update(ROLE_PRESETS[preset])
    return base


def normalize_permissions(perms: dict[str, PermissionLevel]) -> dict[str, PermissionLevel]:
    out = dict(perms)
    out["settings_admins"] = "none"
    for key in READ_ONLY_SECTIONS:
        if out.get(key) == "write":
            out[key] = "read"
    return out


def merge_permissions(
    preset: str,
    overrides: dict[str, str] | None,
) -> dict[str, PermissionLevel]:
    perms = permissions_from_preset(preset) if preset != "custom" else empty_permissions()
    if overrides:
        for key, val in overrides.items():
            if key in SECTIONS and val in LEVEL_RANK:
                perms[key] = val  # type: ignore[assignment]
    return normalize_permissions(perms)


def is_superadmin(admin) -> bool:
    return getattr(admin, "role", "") == "superadmin"


def admin_permissions(admin) -> dict[str, PermissionLevel]:
    if is_superadmin(admin):
        return {s: "write" for s in SECTIONS}
    raw = getattr(admin, "permissions", None) or {}
    perms = empty_permissions()
    for key, val in raw.items():
        if key in SECTIONS and val in LEVEL_RANK:
            perms[key] = val  # type: ignore[assignment]
    return normalize_permissions(perms)


def has_permission(admin, section: str, level: str = "read") -> bool:
    if is_superadmin(admin):
        return True
    if section == "settings_admins":
        return False
    required = LEVEL_RANK.get(level, 1)
    actual = LEVEL_RANK.get(admin_permissions(admin).get(section, "none"), 0)
    return actual >= required


ACTION_LABELS: dict[str, str] = {
    "create_discount": "ایجاد کد تخفیف",
    "delete_discount": "حذف کد تخفیف",
    "deactivate_discount": "غیرفعال‌سازی تخفیف",
    "festival_on": "فعال‌سازی جشنواره",
    "festival_off": "غیرفعال‌سازی جشنواره",
    "festival_reset": "شروع جشنواره جدید",
    "maintenance_on": "فعال‌سازی حالت تعمیر",
    "maintenance_off": "غیرفعال‌سازی حالت تعمیر",
    "update_plans": "بروزرسانی پلن‌ها",
    "create_admin": "ایجاد مدیر",
    "remove_admin": "حذف مدیر",
    "update_admin_permissions": "بروزرسانی دسترسی مدیر",
    "ban_admin": "مسدودسازی مدیر",
    "unban_admin": "رفع مسدودیت مدیر",
    "create_config": "ایجاد سرویس",
    "notify_config_created": "اطلاع‌رسانی سرویس به کاربر",
    "update_config": "ویرایش سرویس",
    "toggle_config": "تغییر وضعیت سرویس",
    "delete_config": "حذف سرویس",
    "sync_configs": "همگام‌سازی سرویس‌ها",
    "broadcast": "پیام همگانی",
    "broadcast_photo": "پیام همگانی با تصویر",
    "patch_discount": "ویرایش کد تخفیف",
    "update_referral_settings": "بروزرسانی دعوت دوستان",
    "upload_referral_image": "آپلود تصویر دعوت",
    "maintenance_offline_default": "بروزرسانی پیام آفلاین",
    "adjust_balance": "تغییر موجودی کاربر",
    "send_message": "ارسال پیام به کاربر",
    "ban_user": "مسدودسازی کاربر",
    "unban_user": "رفع مسدودیت کاربر",
    "approve_wallet_topup": "تایید شارژ کیف پول",
    "approve_purchase": "تایید خرید",
    "approve_renew": "تایید تمدید",
    "reject_transaction": "رد تراکنش",
}


def admin_to_dict(admin) -> dict:
    return {
        "id": admin.id,
        "username": admin.username,
        "full_name": admin.full_name,
        "role": admin.role,
        "role_preset": getattr(admin, "role_preset", None) or "custom",
        "permissions": admin_permissions(admin),
        "is_superadmin": is_superadmin(admin),
        "is_active": admin.is_active,
        "banned_at": admin.banned_at.isoformat() if getattr(admin, "banned_at", None) else None,
        "last_login": admin.last_login.isoformat() if admin.last_login else None,
        "created_at": admin.created_at.isoformat() if getattr(admin, "created_at", None) else None,
    }
