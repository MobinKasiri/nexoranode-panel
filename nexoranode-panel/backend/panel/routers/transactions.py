from __future__ import annotations

from datetime import datetime, timedelta
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from panel.auth.dependencies import get_current_admin
from panel.config import ensure_bot_path, get_plan
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.approval import ApprovalError, approve_transaction, reject_transaction
from panel.services.telegram import TelegramService

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _ensure_bot():
    ensure_bot_path()
    from app.db.models import Transaction, User
    from app.db.models.transaction import TX_PENDING

    return Transaction, User, TX_PENDING


class RejectBody(BaseModel):
    reason: str | None = None


def _tx_to_dict(tx, user=None, plan=None) -> dict:
    return {
        "id": tx.id,
        "user_id": tx.user_id,
        "amount": tx.amount,
        "payment_amount": tx.payment_amount,
        "type": tx.type,
        "description": tx.description,
        "plan_id": tx.plan_id,
        "quantity": tx.quantity,
        "service_name": tx.service_name,
        "payment_method": tx.payment_method,
        "has_receipt": bool(tx.payment_receipt),
        "discount_code": tx.discount_code,
        "discount_amount": tx.discount_amount,
        "status": tx.status,
        "created_at": tx.created_at.isoformat() if tx.created_at else None,
        "confirmed_at": tx.confirmed_at.isoformat() if tx.confirmed_at else None,
        "user": {
            "tg_id": user.tg_id,
            "username": user.username,
            "full_name": user.full_name,
            "balance": user.balance,
        }
        if user
        else None,
        "plan": plan,
    }


@router.get("")
async def list_transactions(
    status: str | None = None,
    search: str | None = None,
    tx_type: str | None = Query(None, alias="type"),
    from_date: str | None = None,
    to_date: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    Transaction, User, _ = _ensure_bot()
    q = select(Transaction).options(selectinload(Transaction.user)).order_by(Transaction.created_at.desc())

    if status:
        q = q.where(Transaction.status == status)
    if tx_type:
        q = q.where(Transaction.type == tx_type)
    if from_date:
        q = q.where(Transaction.created_at >= datetime.fromisoformat(from_date))
    if to_date:
        q = q.where(Transaction.created_at <= datetime.fromisoformat(to_date))
    if search:
        like = f"%{search}%"
        q = (
            select(Transaction)
            .join(User)
            .options(selectinload(Transaction.user))
            .where(
                or_(
                    User.full_name.ilike(like),
                    User.username.ilike(like),
                    Transaction.service_name.ilike(like),
                )
            )
            .order_by(Transaction.created_at.desc())
        )
        if status:
            q = q.where(Transaction.status == status)
        if tx_type:
            q = q.where(Transaction.type == tx_type)
        if from_date:
            q = q.where(Transaction.created_at >= datetime.fromisoformat(from_date))
        if to_date:
            q = q.where(Transaction.created_at <= datetime.fromisoformat(to_date))

    count_q = select(func.count()).select_from(q.subquery())
    total = (await session.execute(count_q)).scalar_one()

    offset = (page - 1) * limit
    result = await session.execute(q.offset(offset).limit(limit))
    rows = result.scalars().all()

    items = []
    for tx in rows:
        user = tx.user
        plan = get_plan(tx.plan_id or "") if tx.plan_id else None
        items.append(_tx_to_dict(tx, user, plan))

    pending_count = (
        await session.execute(
            select(func.count()).select_from(Transaction).where(Transaction.status == "pending")
        )
    ).scalar_one()

    return {"items": items, "total": total, "page": page, "limit": limit, "pending_count": pending_count}


@router.get("/export")
async def export_transactions(
    status: str | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    from openpyxl import Workbook

    Transaction, User, _ = _ensure_bot()
    q = select(Transaction).options(selectinload(Transaction.user)).order_by(Transaction.created_at.desc())
    if status:
        q = q.where(Transaction.status == status)
    result = await session.execute(q.limit(5000))
    rows = result.scalars().all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Transactions"
    ws.append(["ID", "User", "Type", "Amount", "Method", "Status", "Date"])
    for tx in rows:
        user = tx.user
        name = user.full_name if user else ""
        ws.append([
            tx.id,
            name,
            tx.type,
            tx.payment_amount or tx.amount,
            tx.payment_method,
            tx.status,
            tx.created_at.isoformat() if tx.created_at else "",
        ])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=transactions.xlsx"},
    )


@router.get("/{tx_id}")
async def get_transaction(
    tx_id: int,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    Transaction, User, _ = _ensure_bot()
    tx = await Transaction.get(session, tx_id)
    if not tx:
        raise HTTPException(404, "تراکنش یافت نشد")
    user = await User.get(session, tx.user_id)
    plan = get_plan(tx.plan_id or "") if tx.plan_id else None

    import json

    intent = {}
    try:
        intent = json.loads(tx.admin_note or "{}")
    except json.JSONDecodeError:
        pass

    purchase_count = 0
    if user:
        from app.db.models.transaction import TX_CONFIRMED, TX_PURCHASE

        purchase_count = (
            await session.execute(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.user_id == user.tg_id)
                .where(Transaction.type == TX_PURCHASE)
                .where(Transaction.status == TX_CONFIRMED)
            )
        ).scalar_one()

    data = _tx_to_dict(tx, user, plan)
    data["intent"] = intent
    data["admin_note"] = tx.admin_note
    data["user_purchase_count"] = purchase_count
    return data


@router.get("/{tx_id}/receipt")
async def get_receipt(
    tx_id: int,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    Transaction, _, _ = _ensure_bot()
    tx = await Transaction.get(session, tx_id)
    if not tx or not tx.payment_receipt:
        raise HTTPException(404, "رسید یافت نشد")

    tg = TelegramService()
    result = await tg.get_file_bytes(tx.payment_receipt)
    if not result:
        raise HTTPException(404, "دانلود رسید ناموفق")
    content, media = result
    return Response(content=content, media_type=media)


@router.post("/{tx_id}/approve")
async def approve(
    tx_id: int,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    try:
        return await approve_transaction(session, tx_id, admin.id)
    except ApprovalError as e:
        raise HTTPException(e.status_code, e.message) from e


@router.post("/{tx_id}/reject")
async def reject(
    tx_id: int,
    body: RejectBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    try:
        return await reject_transaction(session, tx_id, admin.id, body.reason)
    except ApprovalError as e:
        raise HTTPException(e.status_code, e.message) from e
