from __future__ import annotations

import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import require_permission, require_superadmin
from panel.config import ensure_bot_path
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.audit import log_action
from panel.services.datetime_utils import parse_optional_datetime

router = APIRouter(prefix="/discounts", tags=["discounts"])


def _is_unlimited(limit: int) -> bool:
    return limit <= 0


def _discount_status(code, now: datetime) -> str:
    if not code.is_active:
        return "disabled"
    if code.expires_at and code.expires_at < now:
        return "expired"
    if not _is_unlimited(code.max_uses) and code.used_count >= code.max_uses:
        return "exhausted"
    return "active"


def _validate_limit(value: int, label: str) -> int:
    if value < 0:
        raise HTTPException(400, f"{label} نمی‌تواند منفی باشد")
    return value


class CreateDiscountBody(BaseModel):
    code: str
    discount_percent: int | None = None
    discount_amount: int | None = None
    max_uses: int = Field(100, description="0 = unlimited overall")
    max_uses_per_user: int = Field(1, description="0 = unlimited per user")
    expires_at: str | None = None


class PatchDiscountBody(BaseModel):
    expires_at: str | None = None
    max_uses: int | None = None
    max_uses_per_user: int | None = None


def _code_to_dict(c, now: datetime) -> dict:
    return {
        "id": c.id,
        "code": c.code,
        "discount_percent": c.discount_percent,
        "discount_amount": c.discount_amount,
        "used_count": c.used_count,
        "max_uses": c.max_uses,
        "max_uses_per_user": getattr(c, "max_uses_per_user", 1),
        "expires_at": c.expires_at.isoformat() if c.expires_at else None,
        "is_active": _discount_status(c, now) == "active",
        "status": _discount_status(c, now),
        "raw_active": c.is_active,
    }


@router.get("")
async def list_discounts(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("discounts", "read")),
):
    ensure_bot_path()
    from app.db.models import DiscountCode

    q = select(DiscountCode).order_by(DiscountCode.created_at.desc())
    total = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    result = await session.execute(q.offset((page - 1) * limit).limit(limit))
    codes = result.scalars().all()
    now = datetime.utcnow()
    return {
        "items": [_code_to_dict(c, now) for c in codes],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("")
async def create_discount(
    body: CreateDiscountBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("discounts", "write")),
):
    ensure_bot_path()
    from app.db.models import DiscountCode

    if not body.discount_percent and not body.discount_amount:
        raise HTTPException(400, "درصد یا مبلغ تخفیف الزامی است")
    if body.discount_percent and body.discount_amount:
        raise HTTPException(400, "فقط یکی از درصد یا مبلغ را وارد کنید")

    max_uses = _validate_limit(body.max_uses, "حداکثر استفاده کل")
    max_uses_per_user = _validate_limit(body.max_uses_per_user, "حداکثر استفاده هر کاربر")

    try:
        expires = parse_optional_datetime(body.expires_at)
    except ValueError:
        raise HTTPException(400, "تاریخ انقضا نامعتبر است")

    try:
        code = await DiscountCode.create(
            session,
            code=body.code.upper().strip(),
            discount_percent=body.discount_percent,
            discount_amount=body.discount_amount,
            max_uses=max_uses,
            max_uses_per_user=max_uses_per_user,
            expires_at=expires,
            created_by=admin.id,
        )
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "این کد تخفیف قبلاً ثبت شده است")

    await log_action(session, admin.id, "create_discount", target_type="discount", target_id=code.code)
    return {"success": True, "id": code.id}


@router.patch("/{code_id}")
async def patch_discount(
    code_id: int,
    body: PatchDiscountBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("discounts", "write")),
):
    ensure_bot_path()
    from app.db.models import DiscountCode

    result = await session.execute(select(DiscountCode).where(DiscountCode.id == code_id))
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404, "کد یافت نشد")
    updates = {}
    if body.expires_at is not None:
        try:
            updates["expires_at"] = parse_optional_datetime(body.expires_at)
        except ValueError:
            raise HTTPException(400, "تاریخ انقضا نامعتبر است")
    if body.max_uses is not None:
        updates["max_uses"] = _validate_limit(body.max_uses, "حداکثر استفاده کل")
    if body.max_uses_per_user is not None:
        updates["max_uses_per_user"] = _validate_limit(body.max_uses_per_user, "حداکثر استفاده هر کاربر")
    if updates:
        for k, v in updates.items():
            setattr(code, k, v)
        await session.commit()
    await log_action(session, admin.id, "patch_discount", target_type="discount", target_id=str(code_id))
    return {"success": True}


@router.get("/random")
async def random_code(_admin: AdminUser = Depends(require_permission("discounts", "read"))):
    return {"code": secrets.token_hex(4).upper()}


@router.post("/{code_id}/deactivate")
async def deactivate_discount(
    code_id: int,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("discounts", "write")),
):
    """Disable a code (admins with discounts write)."""
    ensure_bot_path()
    from app.db.models import DiscountCode

    result = await session.execute(select(DiscountCode).where(DiscountCode.id == code_id))
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404, "کد یافت نشد")
    now = datetime.utcnow()
    if _discount_status(code, now) != "active":
        raise HTTPException(409, "فقط کدهای فعال قابل غیرفعال‌سازی هستند")
    ok = await DiscountCode.deactivate(session, code_id)
    if not ok:
        raise HTTPException(404)
    await log_action(session, admin.id, "deactivate_discount", target_type="discount", target_id=str(code_id))
    return {"success": True}


@router.delete("/{code_id}")
async def delete_discount(
    code_id: int,
    session: AsyncSession = Depends(get_db),
    superadmin: AdminUser = Depends(require_superadmin),
):
    """Permanently remove a discount code (superadmin only)."""
    ensure_bot_path()
    from app.db.models import DiscountCode

    result = await session.execute(select(DiscountCode).where(DiscountCode.id == code_id))
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404, "کد یافت نشد")

    code_label = code.code
    await session.delete(code)
    await session.commit()
    await log_action(
        session,
        superadmin.id,
        "delete_discount",
        target_type="discount",
        target_id=code_label,
    )
    return {"success": True, "deleted": True}


@router.get("/{code_id}/stats")
async def discount_stats(
    code_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("discounts", "read")),
):
    ensure_bot_path()
    from app.db.models import DiscountCode, DiscountUsage, Transaction, User
    from app.db.models.transaction import TX_CONFIRMED

    result = await session.execute(select(DiscountCode).where(DiscountCode.id == code_id))
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404)

    count_q = select(func.count()).select_from(DiscountUsage).where(DiscountUsage.code_id == code_id)
    total = (await session.execute(count_q)).scalar_one()

    result = await session.execute(
        select(DiscountUsage)
        .where(DiscountUsage.code_id == code_id)
        .order_by(DiscountUsage.used_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    usages = result.scalars().all()
    items = []
    for u in usages:
        user = await User.get(session, u.user_id)
        tx_result = await session.execute(
            select(Transaction)
            .where(Transaction.user_id == u.user_id)
            .where(Transaction.discount_code == code.code)
            .where(Transaction.status == TX_CONFIRMED)
            .where(Transaction.created_at >= u.used_at)
            .order_by(Transaction.created_at.asc())
            .limit(1)
        )
        tx = tx_result.scalar_one_or_none()
        items.append({
            "user_id": u.user_id,
            "username": user.username if user else None,
            "full_name": user.full_name if user else None,
            "used_at": u.used_at.isoformat(),
            "order_amount": tx.payment_amount or tx.amount if tx else None,
        })

    now = datetime.utcnow()
    return {
        "code": code.code,
        "discount_percent": code.discount_percent,
        "discount_amount": code.discount_amount,
        "status": _discount_status(code, now),
        "expires_at": code.expires_at.isoformat() if code.expires_at else None,
        "used_count": code.used_count,
        "max_uses": code.max_uses,
        "max_uses_per_user": getattr(code, "max_uses_per_user", 1),
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
    }
