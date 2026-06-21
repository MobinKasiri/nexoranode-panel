from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.config import ensure_bot_path
from panel.db.models import AdminUser, AuditLog
from panel.db.session import get_db
from panel.services.audit import log_action
from panel.services.telegram import TelegramService

router = APIRouter(prefix="/users", tags=["users"])


class AddBalanceBody(BaseModel):
    amount: int
    note: str | None = None


class AdjustBalanceBody(BaseModel):
    amount: int = Field(..., description="Positive to add, negative to subtract")
    note: str = Field(..., min_length=2)


class MessageBody(BaseModel):
    text: str = Field(..., min_length=1)


@router.get("")
async def list_users(
    search: str | None = None,
    filter: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import User, VPNConfig
    from app.db.models.transaction import TX_CONFIRMED, TX_PURCHASE, Transaction

    q = select(User).order_by(User.created_at.desc())
    if search:
        like = f"%{search}%"
        conditions = [
            User.full_name.ilike(like),
            User.username.ilike(like),
        ]
        if search.isdigit():
            conditions.append(User.tg_id == int(search))
        q = q.where(or_(*conditions))
    if filter == "banned":
        q = q.where(User.is_banned.is_(True))
    elif filter == "active":
        q = q.where(User.is_banned.is_(False))

    total = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    result = await session.execute(q.offset((page - 1) * limit).limit(limit))
    users = result.scalars().all()

    items = []
    for u in users:
        active = (
            await session.execute(
                select(func.count())
                .select_from(VPNConfig)
                .where(VPNConfig.user_id == u.tg_id, VPNConfig.is_active.is_(True))
            )
        ).scalar_one()
        purchases = (
            await session.execute(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.user_id == u.tg_id)
                .where(Transaction.type == TX_PURCHASE)
                .where(Transaction.status == TX_CONFIRMED)
            )
        ).scalar_one()
        items.append({
            "tg_id": u.tg_id,
            "username": u.username,
            "full_name": u.full_name,
            "balance": u.balance,
            "active_configs": active,
            "purchases": purchases,
            "is_banned": u.is_banned,
            "created_at": u.created_at.isoformat(),
        })

    return {"items": items, "total": total, "page": page, "limit": limit}


@router.get("/{tg_id}")
async def get_user(
    tg_id: int,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import Referral, User, VPNConfig
    from app.db.models.transaction import TX_CONFIRMED, TX_PURCHASE, TX_WALLET_TOPUP, Transaction

    user = await User.get(session, tg_id)
    if not user:
        raise HTTPException(404, "کاربر یافت نشد")

    configs = await VPNConfig.get_for_user(session, tg_id)
    txs = await Transaction.get_for_user(session, tg_id, limit=50)
    referrals = await Referral.list_for_referrer(session, tg_id)

    spend_result = await session.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(Transaction.user_id == tg_id)
        .where(Transaction.status == TX_CONFIRMED)
        .where(Transaction.type.in_([TX_PURCHASE, TX_WALLET_TOPUP]))
        .where(Transaction.amount > 0)
    )
    total_spend = int(spend_result.scalar_one() or 0)

    return {
        "tg_id": user.tg_id,
        "username": user.username,
        "full_name": user.full_name,
        "balance": user.balance,
        "is_banned": user.is_banned,
        "referral_code": user.referral_code,
        "referred_by": user.referred_by,
        "created_at": user.created_at.isoformat(),
        "total_spend": total_spend,
        "configs": [
            {
                "id": c.id,
                "service_name": c.service_name,
                "plan_gb": c.plan_gb,
                "plan_days": c.plan_days,
                "traffic_used_bytes": c.traffic_used_bytes,
                "traffic_limit_bytes": c.traffic_limit_bytes,
                "expiry_date": c.expiry_date.isoformat() if c.expiry_date else None,
                "is_active": c.is_active,
                "subscription_url": c.subscription_url,
            }
            for c in configs
        ],
        "transactions": [
            {
                "id": t.id,
                "amount": t.amount,
                "payment_amount": t.payment_amount,
                "type": t.type,
                "status": t.status,
                "created_at": t.created_at.isoformat(),
            }
            for t in txs
        ],
        "referrals": [
            {
                "referred_id": r.referred_id,
                "purchase_count": r.purchase_count,
                "total_bonus_given": r.total_bonus_given,
            }
            for r in referrals
        ],
    }


@router.get("/{tg_id}/audit")
async def user_audit_log(
    tg_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    tg_str = str(tg_id)
    q = (
        select(AuditLog)
        .where(AuditLog.target_type == "user", AuditLog.target_id == tg_str)
        .order_by(AuditLog.created_at.desc())
    )
    total = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    result = await session.execute(q.offset((page - 1) * limit).limit(limit))
    logs = result.scalars().all()
    return {
        "items": [
            {
                "id": log.id,
                "action": log.action,
                "admin_id": log.admin_id,
                "details": log.details,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("/{tg_id}/adjust-balance")
async def adjust_balance(
    tg_id: int,
    body: AdjustBalanceBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.bot.services.wallet import credit
    from app.db.models import User
    from app.db.models.transaction import TX_ADMIN_CREDIT

    user = await User.get(session, tg_id)
    if not user:
        raise HTTPException(404, "کاربر یافت نشد")
    if body.amount == 0:
        raise HTTPException(400, "مبلغ نمی‌تواند صفر باشد")
    if body.amount < 0 and user.balance + body.amount < 0:
        raise HTTPException(400, "موجودی کافی نیست")

    await credit(session, tg_id, body.amount, body.note, tx_type=TX_ADMIN_CREDIT)
    user = await User.get(session, tg_id)
    if body.amount > 0:
        tg = TelegramService()
        await tg.send_wallet_charged(tg_id, user.balance if user else 0)
    await log_action(
        session,
        admin.id,
        "adjust_balance",
        target_type="user",
        target_id=str(tg_id),
        details=f"{body.amount}:{body.note}",
    )
    return {"success": True, "balance": user.balance if user else 0}


@router.post("/{tg_id}/message")
async def send_user_message(
    tg_id: int,
    body: MessageBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import User

    user = await User.get(session, tg_id)
    if not user:
        raise HTTPException(404, "کاربر یافت نشد")
    tg = TelegramService()
    ok = await tg.send_message(tg_id, body.text)
    if not ok:
        raise HTTPException(502, "ارسال پیام تلگرام ناموفق")
    await log_action(
        session,
        admin.id,
        "send_message",
        target_type="user",
        target_id=str(tg_id),
        details=body.text[:200],
    )
    return {"success": True}


@router.post("/{tg_id}/add-balance")
async def add_balance(
    tg_id: int,
    body: AddBalanceBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    note = body.note or "شارژ توسط ادمین"
    return await adjust_balance(
        tg_id,
        AdjustBalanceBody(amount=body.amount, note=note),
        session,
        admin,
    )


@router.post("/{tg_id}/ban")
async def ban_user(
    tg_id: int,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import User

    ok = await User.update(session, tg_id, is_banned=True)
    if not ok:
        raise HTTPException(404, "کاربر یافت نشد")
    await log_action(session, admin.id, "ban_user", target_type="user", target_id=str(tg_id))
    return {"success": True}


@router.post("/{tg_id}/unban")
async def unban_user(
    tg_id: int,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import User

    ok = await User.update(session, tg_id, is_banned=False)
    if not ok:
        raise HTTPException(404, "کاربر یافت نشد")
    await log_action(session, admin.id, "unban_user", target_type="user", target_id=str(tg_id))
    return {"success": True}
