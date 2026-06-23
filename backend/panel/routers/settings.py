from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import require_permission, require_superadmin
from panel.auth.permissions import (
    PRESET_LABELS_FA,
    ROLE_PRESETS,
    SECTION_LABELS_FA,
    SECTIONS,
    admin_to_dict,
    merge_permissions,
)
from panel.auth.security import hash_password
from panel.config import get_settings, load_payment_info, load_plans, plans_diagnostics, save_plans
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])


class CreateAdminBody(BaseModel):
    username: str
    password: str
    full_name: str = ""
    role_preset: str = "visitor"
    permissions: dict[str, str] | None = None


class UpdateAdminBody(BaseModel):
    full_name: str | None = None
    role_preset: str | None = None
    permissions: dict[str, str] | None = None
    password: str | None = Field(default=None, min_length=6)


@router.get("/permissions-meta")
async def permissions_meta(
    _admin: AdminUser = Depends(require_superadmin),
):
    return {
        "sections": SECTIONS,
        "section_labels": SECTION_LABELS_FA,
        "presets": list(ROLE_PRESETS.keys()) + ["custom"],
        "preset_labels": PRESET_LABELS_FA,
    }


@router.get("/plans")
async def get_plans(_admin: AdminUser = Depends(require_permission("settings_plans", "read"))):
    try:
        data = load_plans()
        if not data:
            raise HTTPException(
                503,
                "فایل قیمت‌ها یافت نشد. مسیر PLANS_DIR_HOST را در docker-compose بررسی کنید.",
            )
        return data
    except HTTPException:
        raise
    except OSError as exc:
        logger.exception("Failed to load plans")
        raise HTTPException(500, f"خطا در بارگذاری قیمت‌ها: {exc}") from exc


@router.get("/plans/debug")
async def get_plans_debug(_admin: AdminUser = Depends(require_permission("settings_plans", "read"))):
    return plans_diagnostics()


@router.put("/plans")
async def update_plans(
    data: dict,
    admin: AdminUser = Depends(require_permission("settings_plans", "write")),
    session: AsyncSession = Depends(get_db),
):
    if not isinstance(data, dict) or not data:
        raise HTTPException(400, "ساختار قیمت‌ها نامعتبر است")
    for tier_id, tier in data.items():
        if not isinstance(tier, dict):
            raise HTTPException(400, f"دسته «{tier_id}» نامعتبر است")
        plans = tier.get("plans")
        if not isinstance(plans, list):
            raise HTTPException(400, f"پلن‌های دسته «{tier_id}» نامعتبر است")
        for plan in plans:
            if not isinstance(plan, dict) or not plan.get("id"):
                raise HTTPException(400, "هر پلن باید شناسه (id) داشته باشد")

    try:
        path, sync = save_plans(data)
    except PermissionError as exc:
        logger.error("Cannot write plans file (read-only?): %s", exc)
        raise HTTPException(
            503,
            "فایل قیمت‌ها قابل نوشتن نیست. مسیر PLANS_FILE را در docker-compose به‌صورت read-write mount کنید.",
        ) from exc
    except OSError as exc:
        logger.exception("Failed to save plans.json")
        raise HTTPException(500, f"خطا در ذخیره قیمت‌ها: {exc}") from exc

    await log_action(session, admin.id, "update_plans", target_type="settings", target_id=str(path))
    plan_count = sum(len(t.get("plans", [])) for t in data.values() if isinstance(t, dict))
    return {
        "success": True,
        "path": str(path),
        "plan_count": plan_count,
        "bot_sync": sync,
    }


@router.get("/payment")
async def get_payment(_admin: AdminUser = Depends(require_permission("settings_payment", "read"))):
    info = load_payment_info()
    note = "تغییرات پرداخت از طریق فایل .env انجام می‌شود"
    if not info["card_number"]:
        note = (
            "شماره کارت تنظیم نشده. CARD_NUMBER را در .env پنل یا .env ربات "
            "(/opt/nexoranode-bot/.env) قرار دهید."
        )
    return {**info, "note": note}


@router.get("/system")
async def get_system(_admin: AdminUser = Depends(require_permission("dashboard", "read"))):
    s = get_settings()
    return {
        "referral_bonus_toman": s.REFERRAL_BONUS_TOMAN,
        "referral_friend_bonus_toman": s.REFERRAL_FRIEND_BONUS_TOMAN,
        "quantity_max": s.QUANTITY_MAX,
    }


@router.get("/admins")
async def list_admins(
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_superadmin),
):
    try:
        result = await session.execute(select(AdminUser).order_by(AdminUser.created_at))
        admins = result.scalars().all()
    except Exception as exc:
        logger.exception("Failed to list admins")
        raise HTTPException(
            503,
            "خطا در اتصال به پایگاه داده. DATABASE_URL و شبکه Docker را بررسی کنید.",
        ) from exc
    return {"items": [admin_to_dict(a) for a in admins]}


@router.post("/admins")
async def create_admin(
    body: CreateAdminBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_superadmin),
):
    existing = await session.execute(
        select(AdminUser).where(AdminUser.username == body.username)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "نام کاربری تکراری است")

    preset = body.role_preset if body.role_preset in ROLE_PRESETS or body.role_preset == "custom" else "visitor"
    perms = merge_permissions(preset, body.permissions)
    perms.pop("settings_admins", None)

    new_admin = AdminUser(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name or body.username,
        role="admin",
        role_preset=preset,
        permissions=perms,
    )
    session.add(new_admin)
    await session.commit()
    await session.refresh(new_admin)
    await log_action(session, admin.id, "create_admin", target_type="admin", target_id=body.username)
    return {"success": True, "id": new_admin.id, "admin": admin_to_dict(new_admin)}


@router.patch("/admins/{admin_id}")
async def update_admin(
    admin_id: int,
    body: UpdateAdminBody,
    session: AsyncSession = Depends(get_db),
    superadmin: AdminUser = Depends(require_superadmin),
):
    result = await session.execute(select(AdminUser).where(AdminUser.id == admin_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "ادمین یافت نشد")
    if target.role == "superadmin":
        raise HTTPException(409, "ویرایش سوپرادمین مجاز نیست")

    if body.full_name is not None:
        target.full_name = body.full_name
    if body.password:
        target.password_hash = hash_password(body.password)
    if body.role_preset is not None or body.permissions is not None:
        preset = body.role_preset or target.role_preset or "custom"
        if preset not in ROLE_PRESETS and preset != "custom":
            preset = "custom"
        perms = merge_permissions(preset, body.permissions or target.permissions)
        perms["settings_admins"] = "none"
        target.role_preset = preset
        target.permissions = perms

    await session.commit()
    await log_action(
        session,
        superadmin.id,
        "update_admin_permissions",
        target_type="admin",
        target_id=target.username,
    )
    return {"success": True, "admin": admin_to_dict(target)}


@router.patch("/admins/{admin_id}/ban")
async def ban_admin(
    admin_id: int,
    session: AsyncSession = Depends(get_db),
    superadmin: AdminUser = Depends(require_superadmin),
):
    result = await session.execute(select(AdminUser).where(AdminUser.id == admin_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "ادمین یافت نشد")
    if target.id == superadmin.id:
        raise HTTPException(409, "نمی‌توانید خودتان را مسدود کنید")
    if target.role == "superadmin":
        raise HTTPException(409, "مسدودسازی سوپرادمین مجاز نیست")

    target.is_active = False
    target.banned_at = datetime.utcnow()
    target.banned_by_id = superadmin.id
    await session.commit()
    await log_action(session, superadmin.id, "ban_admin", target_type="admin", target_id=target.username)
    return {"success": True}


@router.patch("/admins/{admin_id}/unban")
async def unban_admin(
    admin_id: int,
    session: AsyncSession = Depends(get_db),
    superadmin: AdminUser = Depends(require_superadmin),
):
    result = await session.execute(select(AdminUser).where(AdminUser.id == admin_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "ادمین یافت نشد")
    if target.role == "superadmin":
        raise HTTPException(409, "عملیات روی سوپرادمین مجاز نیست")

    target.is_active = True
    target.banned_at = None
    target.banned_by_id = None
    await session.commit()
    await log_action(session, superadmin.id, "unban_admin", target_type="admin", target_id=target.username)
    return {"success": True}


@router.delete("/admins/{admin_id}")
async def remove_admin(
    admin_id: int,
    session: AsyncSession = Depends(get_db),
    superadmin: AdminUser = Depends(require_superadmin),
):
    result = await session.execute(select(AdminUser).where(AdminUser.id == admin_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "ادمین یافت نشد")
    if target.id == superadmin.id:
        raise HTTPException(409, "نمی‌توانید خودتان را حذف کنید")
    if target.role == "superadmin":
        raise HTTPException(409, "حذف سوپرادمین مجاز نیست")
    target.is_active = False
    await session.commit()
    await log_action(
        session,
        superadmin.id,
        "remove_admin",
        target_type="admin",
        target_id=target.username,
    )
    return {"success": True}
