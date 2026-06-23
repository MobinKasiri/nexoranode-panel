from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import require_permission
from panel.auth.permissions import ACTION_LABELS
from panel.config import ensure_bot_path
from panel.db.models import AdminUser, AuditLog
from panel.db.session import get_db

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def dashboard_stats(
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("dashboard", "read")),
):
    ensure_bot_path()
    from app.db.models import Transaction, User, VPNConfig

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)

    total_users = await User.count(session)
    today_users = await User.today_count(session)
    yesterday_users = (
        await session.execute(
            select(func.count())
            .select_from(User)
            .where(User.created_at >= yesterday_start, User.created_at < today_start)
        )
    ).scalar_one()

    active_configs = await VPNConfig.count_active(session)
    today_rev = int(await Transaction.today_revenue(session))
    pending = await Transaction.count_pending(session)

    yesterday_rev = (
        await session.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0))
            .where(Transaction.status == "confirmed")
            .where(Transaction.amount > 0)
            .where(Transaction.type.in_(["purchase", "wallet_topup"]))
            .where(Transaction.confirmed_at >= yesterday_start)
            .where(Transaction.confirmed_at < today_start)
        )
    ).scalar_one()

    rev_change = 0
    if yesterday_rev:
        rev_change = round((today_rev - int(yesterday_rev)) / int(yesterday_rev) * 100)

    return {
        "total_users": total_users,
        "today_users": today_users,
        "users_change": today_users - int(yesterday_users or 0),
        "active_configs": active_configs,
        "today_revenue": today_rev,
        "revenue_change_pct": rev_change,
        "pending_payments": pending,
    }


@router.get("/revenue-chart")
async def revenue_chart(
    days: int = 30,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("dashboard", "read")),
):
    ensure_bot_path()
    from app.db.models import Transaction, User

    start = datetime.utcnow() - timedelta(days=days)
    result = await session.execute(
        select(
            func.date(Transaction.confirmed_at).label("day"),
            func.coalesce(func.sum(Transaction.amount), 0).label("revenue"),
            func.count(Transaction.id).label("count"),
        )
        .where(Transaction.status == "confirmed")
        .where(Transaction.amount > 0)
        .where(Transaction.confirmed_at >= start)
        .group_by(func.date(Transaction.confirmed_at))
        .order_by(func.date(Transaction.confirmed_at))
    )
    revenue_rows = result.all()

    user_result = await session.execute(
        select(
            func.date(User.created_at).label("day"),
            func.count(User.tg_id).label("count"),
        )
        .where(User.created_at >= start)
        .group_by(func.date(User.created_at))
    )
    user_map = {str(r.day): r.count for r in user_result.all()}

    data = []
    for row in revenue_rows:
        day = str(row.day)
        data.append({
            "date": day,
            "revenue": int(row.revenue),
            "transactions": row.count,
            "new_users": user_map.get(day, 0),
        })
    return {"items": data, "days": days}


@router.get("/activity")
async def recent_activity(
    limit: int = Query(10, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("dashboard", "read")),
):
    ensure_bot_path()
    from app.db.models import Transaction, User

    tx_result = await session.execute(
        select(Transaction)
        .order_by(Transaction.created_at.desc())
        .limit(limit)
    )
    txs = tx_result.scalars().all()

    events = []
    for tx in txs:
        user = await User.get(session, tx.user_id)
        uname = f"@{user.username}" if user and user.username else str(tx.user_id)
        if tx.status == "confirmed":
            events.append({
                "type": "approved",
                "text": f"پرداخت تایید شد — {uname} — {tx.payment_amount:,} تومان",
                "at": tx.confirmed_at.isoformat() if tx.confirmed_at else tx.created_at.isoformat(),
                "created_at": tx.confirmed_at.isoformat() if tx.confirmed_at else tx.created_at.isoformat(),
            })
        elif tx.status == "rejected":
            events.append({
                "type": "rejected",
                "text": f"پرداخت رد شد — {uname}",
                "at": tx.created_at.isoformat(),
                "created_at": tx.created_at.isoformat(),
            })
        elif tx.status == "pending":
            events.append({
                "type": "pending",
                "text": f"پرداخت جدید — {uname} — {tx.payment_amount:,} تومان",
                "at": tx.created_at.isoformat(),
                "created_at": tx.created_at.isoformat(),
            })

    audit_result = await session.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(limit, 20))
    )
    for log in audit_result.scalars().all():
        label = ACTION_LABELS.get(log.action, log.action)
        events.append({
            "type": "audit",
            "text": f"{label} — {log.target_id or ''}",
            "at": log.created_at.isoformat(),
            "created_at": log.created_at.isoformat(),
        })

    events.sort(key=lambda x: x["at"], reverse=True)
    return {"items": events[:limit]}
