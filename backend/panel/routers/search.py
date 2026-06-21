from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.config import ensure_bot_path
from panel.db.models import AdminUser
from panel.db.session import get_db

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def global_search(
    q: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import User, VPNConfig
    from app.db.models.transaction import TX_PENDING, Transaction

    like = f"%{q.strip()}%"
    users_q = select(User).where(
        or_(User.full_name.ilike(like), User.username.ilike(like))
    ).limit(5)
    if q.strip().isdigit():
        users_q = select(User).where(User.tg_id == int(q.strip())).limit(5)

    users = (await session.execute(users_q)).scalars().all()

    configs = (
        await session.execute(
            select(VPNConfig)
            .where(or_(VPNConfig.service_name.ilike(like), VPNConfig.panel_email.ilike(like)))
            .limit(5)
        )
    ).scalars().all()

    txs = (
        await session.execute(
            select(Transaction)
            .where(Transaction.status == TX_PENDING)
            .where(Transaction.service_name.ilike(like))
            .limit(5)
        )
    ).scalars().all()

    return {
        "users": [
            {"tg_id": u.tg_id, "username": u.username, "full_name": u.full_name}
            for u in users
        ],
        "configs": [
            {"id": c.id, "service_name": c.service_name, "user_id": c.user_id}
            for c in configs
        ],
        "transactions": [
            {"id": t.id, "service_name": t.service_name, "user_id": t.user_id, "status": t.status}
            for t in txs
        ],
    }
