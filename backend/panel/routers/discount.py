from __future__ import annotations

import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.config import ensure_bot_path
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.audit import log_action

router = APIRouter(prefix="/discounts", tags=["discounts"])


class CreateDiscountBody(BaseModel):
    code: str
    discount_percent: int | None = None
    discount_amount: int | None = None
    max_uses: int = 100
    expires_at: str | None = None


@router.get("")
async def list_discounts(
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import DiscountCode

    result = await session.execute(select(DiscountCode).order_by(DiscountCode.created_at.desc()))
    codes = result.scalars().all()
    now = datetime.utcnow()
    items = []
    for c in codes:
        expired = c.expires_at and c.expires_at < now
        active = c.is_active and not expired and c.used_count < c.max_uses
        items.append({
            "id": c.id,
            "code": c.code,
            "discount_percent": c.discount_percent,
            "discount_amount": c.discount_amount,
            "used_count": c.used_count,
            "max_uses": c.max_uses,
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            "is_active": active,
            "raw_active": c.is_active,
        })
    return {"items": items}


@router.post("")
async def create_discount(
    body: CreateDiscountBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import DiscountCode

    expires = datetime.fromisoformat(body.expires_at) if body.expires_at else None
    code = await DiscountCode.create(
        session,
        code=body.code.upper().strip(),
        discount_percent=body.discount_percent,
        discount_amount=body.discount_amount,
        max_uses=body.max_uses,
        expires_at=expires,
        created_by=admin.id,
    )
    await log_action(session, admin.id, "create_discount", target_type="discount", target_id=code.code)
    return {"success": True, "id": code.id}


@router.get("/random")
async def random_code(_admin: AdminUser = Depends(get_current_admin)):
    return {"code": secrets.token_hex(4).upper()}


@router.delete("/{code_id}")
async def delete_discount(
    code_id: int,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import DiscountCode

    ok = await DiscountCode.deactivate(session, code_id)
    if not ok:
        raise HTTPException(404)
    await log_action(session, admin.id, "delete_discount", target_type="discount", target_id=str(code_id))
    return {"success": True}


@router.get("/{code_id}/stats")
async def discount_stats(
    code_id: int,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import DiscountCode, DiscountUsage, User

    result = await session.execute(select(DiscountCode).where(DiscountCode.id == code_id))
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404)
    result = await session.execute(
        select(DiscountUsage).where(DiscountUsage.code_id == code_id).order_by(DiscountUsage.used_at.desc())
    )
    usages = result.scalars().all()
    items = []
    for u in usages:
        user = await User.get(session, u.user_id)
        items.append({
            "user_id": u.user_id,
            "username": user.username if user else None,
            "full_name": user.full_name if user else None,
            "used_at": u.used_at.isoformat(),
        })
    return {"code": code.code, "usages": items, "used_count": code.used_count}
