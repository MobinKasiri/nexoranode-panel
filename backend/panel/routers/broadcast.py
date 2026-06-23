from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import require_permission
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


async def _dispatch_broadcast(
    session: AsyncSession,
    admin: AdminUser,
    message: str,
    target: str,
    user_ids: list[int] | None,
    photo_bytes: bytes | None,
    photo_filename: str,
) -> dict:
    users = await _get_target_users(session, target, user_ids)
    tg = TelegramService()
    sent = 0
    failed = 0
    for user in users:
        try:
            if photo_bytes:
                ok = await tg.send_photo(
                    user.tg_id,
                    photo_bytes,
                    caption=message,
                    filename=photo_filename,
                )
            else:
                ok = await tg.send_message(user.tg_id, message)
            if ok:
                sent += 1
            else:
                failed += 1
        except Exception:
            failed += 1
        await asyncio.sleep(0.05)

    action = "broadcast_photo" if photo_bytes else "broadcast"
    await log_action(
        session,
        admin.id,
        action,
        details=f"sent={sent} failed={failed} target={target}",
    )
    return {"sent": sent, "failed": failed, "total": len(users)}


@router.post("/send")
async def send_broadcast(
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("broadcast", "write")),
    message: str = Form(""),
    target: str = Form("all"),
    user_ids: str | None = Form(None),
    photo: UploadFile | None = File(None),
):
    parsed_ids: list[int] | None = None
    if user_ids:
        try:
            raw = json.loads(user_ids)
            if isinstance(raw, list):
                parsed_ids = [int(x) for x in raw]
        except (json.JSONDecodeError, TypeError, ValueError):
            parsed_ids = None

    photo_bytes: bytes | None = None
    photo_filename = "photo.jpg"
    if photo and photo.filename:
        photo_bytes = await photo.read()
        photo_filename = photo.filename

    if not message.strip() and not photo_bytes:
        return {"sent": 0, "failed": 0, "total": 0, "error": "message or photo required"}

    return await _dispatch_broadcast(
        session, admin, message, target, parsed_ids, photo_bytes, photo_filename
    )


@router.post("/send-json")
async def send_broadcast_json(
    body: BroadcastBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("broadcast", "write")),
):
    return await _dispatch_broadcast(
        session, admin, body.message, body.target, body.user_ids, None, "photo.jpg"
    )


@router.get("/count")
async def broadcast_count(
    target: str = "all",
    user_ids: str | None = None,
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("broadcast", "read")),
):
    parsed_ids: list[int] | None = None
    if user_ids:
        try:
            raw = json.loads(user_ids)
            if isinstance(raw, list):
                parsed_ids = [int(x) for x in raw]
        except (json.JSONDecodeError, TypeError, ValueError):
            parsed_ids = None
    users = await _get_target_users(session, target, parsed_ids)
    return {"count": len(users)}
