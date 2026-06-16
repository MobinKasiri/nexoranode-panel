from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.config import ensure_bot_path
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.audit import log_action

router = APIRouter(prefix="/users", tags=["users"])


class AddBalanceBody(BaseModel):
    amount: int
    note: str | None = None


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
    from app.db.models.transaction import Transaction

    user = await User.get(session, tg_id)
    if not user:
        raise HTTPException(404, "کاربر یافت نشد")

    configs = await VPNConfig.get_for_user(session, tg_id)
    txs = await Transaction.get_for_user(session, tg_id, limit=50)
    referrals = await Referral.list_for_referrer(session, tg_id)

    return {
        "tg_id": user.tg_id,
        "username": user.username,
        "full_name": user.full_name,
        "balance": user.balance,
        "is_banned": user.is_banned,
        "referral_code": user.referral_code,
        "referred_by": user.referred_by,
        "created_at": user.created_at.isoformat(),
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


@router.post("/{tg_id}/add-balance")
async def add_balance(
    tg_id: int,
    body: AddBalanceBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.bot.services.wallet import credit
    from app.db.models import User
    from panel.services.telegram import TelegramService

    user = await User.get(session, tg_id)
    if not user:
        raise HTTPException(404, "کاربر یافت نشد")
    desc = body.note or "شارژ توسط ادمین"
    await credit(session, tg_id, body.amount, desc)
    user = await User.get(session, tg_id)
    tg = TelegramService()
    await tg.send_wallet_charged(tg_id, user.balance if user else 0)
    await log_action(session, admin.id, "add_balance", target_type="user", target_id=str(tg_id), details=str(body.amount))
    return {"success": True, "balance": user.balance if user else 0}


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
