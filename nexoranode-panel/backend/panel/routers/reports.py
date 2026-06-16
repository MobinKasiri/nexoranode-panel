from __future__ import annotations

from datetime import datetime, timedelta
from io import BytesIO

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.config import ensure_bot_path, get_plan, load_plans
from panel.db.models import AdminUser
from panel.db.session import get_db

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary")
async def reports_summary(
    from_date: str | None = None,
    to_date: str | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import Transaction
    from app.db.models.transaction import TX_CONFIRMED

    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    month_rev = (
        await session.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0))
            .where(Transaction.status == TX_CONFIRMED)
            .where(Transaction.amount > 0)
            .where(Transaction.confirmed_at >= month_start)
        )
    ).scalar_one()

    today_rev = int(await Transaction.today_revenue(session))
    days_in_month = max(1, (now - month_start).days + 1)
    avg_daily = int(int(month_rev) / days_in_month)

    rejected = (
        await session.execute(
            select(func.coalesce(func.sum(Transaction.payment_amount), 0))
            .where(Transaction.status == "rejected")
            .where(Transaction.confirmed_at >= month_start)
        )
    ).scalar_one()

    return {
        "month_revenue": int(month_rev),
        "today_revenue": today_rev,
        "avg_daily": avg_daily,
        "rejected_amount": int(rejected or 0),
    }


@router.get("/charts/plans")
async def sales_by_plan(
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import Transaction

    result = await session.execute(
        select(Transaction.plan_id, func.count(Transaction.id))
        .where(Transaction.status == "confirmed")
        .where(Transaction.type == "purchase")
        .group_by(Transaction.plan_id)
    )
    data = []
    for plan_id, count in result.all():
        plan = get_plan(plan_id or "") if plan_id else None
        label = f"{plan['gb']}GB" if plan else (plan_id or "unknown")
        data.append({"plan_id": plan_id, "label": label, "count": count})
    return {"items": data}


@router.get("/charts/payment-methods")
async def payment_methods(
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import Transaction

    result = await session.execute(
        select(Transaction.payment_method, func.count(Transaction.id))
        .where(Transaction.status == "confirmed")
        .group_by(Transaction.payment_method)
    )
    return {"items": [{"method": m or "unknown", "count": c} for m, c in result.all()]}


@router.get("/charts/top-users")
async def top_users(
    limit: int = Query(10, le=50),
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import Transaction, User

    result = await session.execute(
        select(Transaction.user_id, func.sum(Transaction.amount).label("total"))
        .where(Transaction.status == "confirmed")
        .where(Transaction.amount > 0)
        .group_by(Transaction.user_id)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(limit)
    )
    items = []
    for uid, total in result.all():
        user = await User.get(session, uid)
        items.append({
            "user_id": uid,
            "username": user.username if user else None,
            "full_name": user.full_name if user else None,
            "total": int(total),
        })
    return {"items": items}


@router.get("/export")
async def export_report(
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    from openpyxl import Workbook

    ensure_bot_path()
    from app.db.models import Transaction, User

    wb = Workbook()
    ws = wb.active
    ws.title = "Transactions"
    ws.append(["ID", "User", "Amount", "Type", "Status", "Date"])
    result = await session.execute(
        select(Transaction).order_by(Transaction.created_at.desc()).limit(5000)
    )
    for tx in result.scalars().all():
        user = await User.get(session, tx.user_id)
        ws.append([
            tx.id,
            user.full_name if user else "",
            tx.payment_amount or tx.amount,
            tx.type,
            tx.status,
            tx.created_at.isoformat() if tx.created_at else "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=report.xlsx"},
    )
