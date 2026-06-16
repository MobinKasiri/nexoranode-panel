from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.auth.security import hash_password
from panel.config import get_settings, load_plans, save_plans
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])


class CreateAdminBody(BaseModel):
    username: str
    password: str
    full_name: str = ""


@router.get("/plans")
async def get_plans(_admin: AdminUser = Depends(get_current_admin)):
    return load_plans()


@router.put("/plans")
async def update_plans(
    data: dict,
    admin: AdminUser = Depends(get_current_admin),
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
        path = save_plans(data)
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
    return {"success": True, "path": str(path)}


@router.get("/payment")
async def get_payment(_admin: AdminUser = Depends(get_current_admin)):
    s = get_settings()
    return {
        "card_number": s.CARD_NUMBER,
        "card_owner": s.CARD_OWNER,
        "card_bank": s.CARD_BANK,
        "note": "تغییرات پرداخت از طریق فایل .env انجام می‌شود",
    }


@router.get("/system")
async def get_system(_admin: AdminUser = Depends(get_current_admin)):
    s = get_settings()
    return {
        "referral_bonus_toman": s.REFERRAL_BONUS_TOMAN,
        "referral_friend_bonus_toman": s.REFERRAL_FRIEND_BONUS_TOMAN,
        "quantity_max": s.QUANTITY_MAX,
    }


@router.get("/admins")
async def list_admins(
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    result = await session.execute(select(AdminUser).order_by(AdminUser.created_at))
    admins = result.scalars().all()
    return {
        "items": [
            {
                "id": a.id,
                "username": a.username,
                "full_name": a.full_name,
                "role": a.role,
                "is_active": a.is_active,
                "last_login": a.last_login.isoformat() if a.last_login else None,
            }
            for a in admins
        ]
    }


@router.post("/admins")
async def create_admin(
    body: CreateAdminBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    existing = await session.execute(
        select(AdminUser).where(AdminUser.username == body.username)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "نام کاربری تکراری است")
    new_admin = AdminUser(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name or body.username,
        role="admin",
    )
    session.add(new_admin)
    await session.commit()
    await log_action(session, admin.id, "create_admin", target_type="admin", target_id=body.username)
    return {"success": True, "id": new_admin.id}
