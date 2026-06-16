from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.config import ensure_bot_path
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.audit import log_action
from panel.services.telegram import TelegramService

router = APIRouter(prefix="/broadcast", tags=["broadcast"])


class BroadcastBody(BaseModel):
    message: str
    target: str = "all"
    user_ids: list[int] | None = None


async def _get_target_users(session: AsyncSession, target: str, user_ids: list[int] | None):
    ensure_bot_path()
    from app.db.models import User, VPNConfig

    if target == "specific" and user_ids:
        users = []
        for uid in user_ids:
            u = await User.get(session, uid)
            if u and not u.is_banned:
                users.append(u)
        return users

    result = await session.execute(select(User).where(User.is_banned.is_(False)))
    all_users = list(result.scalars().all())

    if target == "all":
        return all_users

    active_ids = set(
        (await session.execute(
            select(VPNConfig.user_id).where(VPNConfig.is_active.is_(True)).distinct()
        )).scalars().all()
    )
    if target == "active":
        return [u for u in all_users if u.tg_id in active_ids]
    if target == "inactive":
        return [u for u in all_users if u.tg_id not in active_ids]
    return all_users


@router.post("/send")
async def send_broadcast(
    body: BroadcastBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    users = await _get_target_users(session, body.target, body.user_ids)
    tg = TelegramService()
    sent = 0
    failed = 0
    for user in users:
        try:
            ok = await tg.send_message(user.tg_id, body.message)
            if ok:
                sent += 1
            else:
                failed += 1
        except Exception:
            failed += 1
        await asyncio.sleep(0.05)
    await log_action(
        session, admin.id, "broadcast",
        details=f"sent={sent} failed={failed} target={body.target}",
    )
    return {"sent": sent, "failed": failed, "total": len(users)}


@router.get("/count")
async def broadcast_count(
    target: str = "all",
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    users = await _get_target_users(session, target, None)
    return {"count": len(users)}
