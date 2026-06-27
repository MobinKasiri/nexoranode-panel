from __future__ import annotations

from datetime import datetime, timedelta
from io import BytesIO

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import require_permission
from panel.config import ensure_bot_path, get_plan
from panel.db.models import AdminUser
from panel.db.session import get_db

router = APIRouter(prefix="/reports", tags=["reports"])

PAYMENT_METHOD_LABELS = {
    "wallet": "کیف پول",
    "card": "کارت به کارت",
}

TX_TYPE_LABELS = {
    "purchase": "خرید سرویس",
    "renew": "تمدید سرویس",
    "wallet_topup": "شارژ کیف پول",
    "referral": "پاداش معرف",
    "refund": "استرداد",
    "admin_credit": "اعتبار مدیر",
}


def _parse_range(from_date: str | None, to_date: str | None) -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    if to_date:
        end = datetime.strptime(to_date, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, microsecond=999999
        )
    if from_date:
        start = datetime.strptime(from_date, "%Y-%m-%d").replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    else:
        start = (end - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
    if start > end:
        start, end = end.replace(hour=0, minute=0, second=0, microsecond=0), end
    return start, end


def _confirmed_revenue_filters(q, start: datetime, end: datetime, Transaction):
    from app.db.models.transaction import TX_CONFIRMED

    return (
        q.where(Transaction.status == TX_CONFIRMED)
        .where(Transaction.amount > 0)
        .where(Transaction.confirmed_at >= start)
        .where(Transaction.confirmed_at <= end)
    )


@router.get("/summary")
async def reports_summary(
    from_date: str | None = None,
    to_date: str | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("reports", "read")),
):
    ensure_bot_path()
    from app.db.models import Transaction, User
    from app.db.models.transaction import TX_CONFIRMED, TX_REJECTED

    start, end = _parse_range(from_date, to_date)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total_rev = (
        await session.execute(
            _confirmed_revenue_filters(
                select(func.coalesce(func.sum(Transaction.amount), 0)),
                start,
                end,
                Transaction,
            )
        )
    ).scalar_one()

    tx_count = (
        await session.execute(
            _confirmed_revenue_filters(
                select(func.count(Transaction.id)),
                start,
                end,
                Transaction,
            )
        )
    ).scalar_one()

    today_rev = int(await Transaction.today_revenue(session))

    days = max(1, (end.date() - start.date()).days + 1)
    avg_daily = int(int(total_rev) / days)
    avg_ticket = int(int(total_rev) / max(1, int(tx_count)))

    rejected_amount = (
        await session.execute(
            select(func.coalesce(func.sum(Transaction.payment_amount), 0))
            .where(Transaction.status == TX_REJECTED)
            .where(Transaction.created_at >= start)
            .where(Transaction.created_at <= end)
        )
    ).scalar_one()

    rejected_count = (
        await session.execute(
            select(func.count(Transaction.id))
            .where(Transaction.status == TX_REJECTED)
            .where(Transaction.created_at >= start)
            .where(Transaction.created_at <= end)
        )
    ).scalar_one()

    pending_count = (
        await session.execute(
            select(func.count(Transaction.id))
            .where(Transaction.status == "pending")
            .where(Transaction.created_at >= start)
            .where(Transaction.created_at <= end)
        )
    ).scalar_one()

    new_users = (
        await session.execute(
            select(func.count(User.tg_id))
            .where(User.created_at >= start)
            .where(User.created_at <= end)
        )
    ).scalar_one()

    processed = int(tx_count) + int(rejected_count)
    confirmation_rate = round(int(tx_count) / processed * 100) if processed else 100

    return {
        "from_date": start.date().isoformat(),
        "to_date": end.date().isoformat(),
        "total_revenue": int(total_rev),
        "month_revenue": int(total_rev),
        "today_revenue": today_rev,
        "avg_daily": avg_daily,
        "avg_ticket": avg_ticket,
        "transaction_count": int(tx_count),
        "rejected_amount": int(rejected_amount or 0),
        "rejected_count": int(rejected_count),
        "pending_count": int(pending_count),
        "new_users": int(new_users),
        "confirmation_rate": confirmation_rate,
        "is_today_in_range": start <= today_start <= end,
    }


@router.get("/charts/timeline")
async def revenue_timeline(
    from_date: str | None = None,
    to_date: str | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("reports", "read")),
):
    ensure_bot_path()
    from app.db.models import Transaction, User

    start, end = _parse_range(from_date, to_date)

    result = await session.execute(
        _confirmed_revenue_filters(
            select(
                func.date(Transaction.confirmed_at).label("day"),
                func.coalesce(func.sum(Transaction.amount), 0).label("revenue"),
                func.count(Transaction.id).label("transactions"),
            ),
            start,
            end,
            Transaction,
        ).group_by(func.date(Transaction.confirmed_at))
    )
    rev_map = {str(r.day): {"revenue": int(r.revenue), "transactions": r.transactions} for r in result.all()}

    user_result = await session.execute(
        select(
            func.date(User.created_at).label("day"),
            func.count(User.tg_id).label("count"),
        )
        .where(User.created_at >= start)
        .where(User.created_at <= end)
        .group_by(func.date(User.created_at))
    )
    user_map = {str(r.day): r.count for r in user_result.all()}

    items = []
    cursor = start.date()
    end_date = end.date()
    while cursor <= end_date:
        day = cursor.isoformat()
        row = rev_map.get(day, {"revenue": 0, "transactions": 0})
        items.append({
            "date": day,
            "revenue": row["revenue"],
            "transactions": row["transactions"],
            "new_users": user_map.get(day, 0),
        })
        cursor += timedelta(days=1)

    return {"items": items, "from_date": start.date().isoformat(), "to_date": end.date().isoformat()}


@router.get("/charts/plans")
async def sales_by_plan(
    from_date: str | None = None,
    to_date: str | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("reports", "read")),
):
    ensure_bot_path()
    from app.db.models import Transaction

    start, end = _parse_range(from_date, to_date)

    result = await session.execute(
        select(
            Transaction.plan_id,
            func.count(Transaction.id).label("count"),
            func.coalesce(func.sum(Transaction.amount), 0).label("revenue"),
        )
        .where(Transaction.status == "confirmed")
        .where(Transaction.type == "purchase")
        .where(Transaction.confirmed_at >= start)
        .where(Transaction.confirmed_at <= end)
        .group_by(Transaction.plan_id)
        .order_by(func.sum(Transaction.amount).desc())
    )
    data = []
    for plan_id, count, revenue in result.all():
        plan = get_plan(plan_id or "") if plan_id else None
        label = f"{plan['gb']}GB" if plan else (plan_id or "نامشخص")
        data.append({
            "plan_id": plan_id,
            "label": label,
            "count": count,
            "revenue": int(revenue),
        })
    return {"items": data}


@router.get("/charts/payment-methods")
async def payment_methods(
    from_date: str | None = None,
    to_date: str | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("reports", "read")),
):
    ensure_bot_path()
    from app.db.models import Transaction

    start, end = _parse_range(from_date, to_date)

    result = await session.execute(
        select(
            Transaction.payment_method,
            func.count(Transaction.id).label("count"),
            func.coalesce(func.sum(Transaction.amount), 0).label("revenue"),
        )
        .where(Transaction.status == "confirmed")
        .where(Transaction.confirmed_at >= start)
        .where(Transaction.confirmed_at <= end)
        .group_by(Transaction.payment_method)
        .order_by(func.sum(Transaction.amount).desc())
    )
    return {
        "items": [
            {
                "method": m or "unknown",
                "label": PAYMENT_METHOD_LABELS.get(m or "", m or "نامشخص"),
                "count": c,
                "revenue": int(rev),
            }
            for m, c, rev in result.all()
        ]
    }


@router.get("/charts/types")
async def transaction_types(
    from_date: str | None = None,
    to_date: str | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("reports", "read")),
):
    ensure_bot_path()
    from app.db.models import Transaction

    start, end = _parse_range(from_date, to_date)

    result = await session.execute(
        select(
            Transaction.type,
            func.count(Transaction.id).label("count"),
            func.coalesce(func.sum(Transaction.amount), 0).label("revenue"),
        )
        .where(Transaction.status == "confirmed")
        .where(Transaction.confirmed_at >= start)
        .where(Transaction.confirmed_at <= end)
        .group_by(Transaction.type)
        .order_by(func.sum(Transaction.amount).desc())
    )
    return {
        "items": [
            {
                "type": t or "unknown",
                "label": TX_TYPE_LABELS.get(t or "", t or "نامشخص"),
                "count": c,
                "revenue": int(rev),
            }
            for t, c, rev in result.all()
        ]
    }


@router.get("/charts/top-users")
async def top_users(
    limit: int = Query(10, le=50),
    from_date: str | None = None,
    to_date: str | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("reports", "read")),
):
    ensure_bot_path()
    from app.db.models import Transaction, User

    start, end = _parse_range(from_date, to_date)

    result = await session.execute(
        select(Transaction.user_id, func.sum(Transaction.amount).label("total"))
        .where(Transaction.status == "confirmed")
        .where(Transaction.amount > 0)
        .where(Transaction.confirmed_at >= start)
        .where(Transaction.confirmed_at <= end)
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
            "transaction_count": (
                await session.execute(
                    select(func.count(Transaction.id))
                    .where(Transaction.user_id == uid)
                    .where(Transaction.status == "confirmed")
                    .where(Transaction.confirmed_at >= start)
                    .where(Transaction.confirmed_at <= end)
                )
            ).scalar_one(),
        })
    return {"items": items}


@router.get("/export")
async def export_report(
    from_date: str | None = None,
    to_date: str | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("reports", "read")),
):
    from openpyxl import Workbook

    ensure_bot_path()
    from app.db.models import Transaction, User

    start, end = _parse_range(from_date, to_date)

    wb = Workbook()
    ws = wb.active
    ws.title = "Transactions"
    ws.append(["ID", "User", "Amount", "Type", "Status", "Method", "Date"])
    result = await session.execute(
        select(Transaction)
        .where(Transaction.created_at >= start)
        .where(Transaction.created_at <= end)
        .order_by(Transaction.created_at.desc())
        .limit(10000)
    )
    for tx in result.scalars().all():
        user = await User.get(session, tx.user_id)
        ws.append([
            tx.id,
            user.full_name if user else "",
            tx.payment_amount or tx.amount,
            tx.type,
            tx.status,
            tx.payment_method or "",
            tx.created_at.isoformat() if tx.created_at else "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"report_{start.date()}_{end.date()}.xlsx"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
