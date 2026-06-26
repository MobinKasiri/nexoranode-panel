"""Sync bot Telegram admin messages after panel approve/reject."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Literal

from aiogram import Bot
from sqlalchemy.ext.asyncio import AsyncSession

from panel.config import ensure_bot_path, get_settings, resolve_bot_token
from panel.db.models import AdminUser

logger = logging.getLogger(__name__)

Action = Literal["approved", "rejected"]


def _notify_config():
    """Minimal bot config for tx_admin_notify (ADMINS, DEV_ID, ADMIN_CHAT_ID)."""
    admins: list[int] = []
    raw = os.environ.get("BOT_ADMINS", "")
    for part in raw.split(","):
        part = part.strip()
        if part:
            try:
                admins.append(int(part))
            except ValueError:
                logger.warning("Invalid BOT_ADMINS entry: %r", part)

    dev_id = int(os.environ.get("BOT_DEV_ID", "0") or 0)
    admin_chat_id = int(os.environ.get("ADMIN_CHAT_ID", "0") or 0)

    return SimpleNamespace(
        bot=SimpleNamespace(ADMINS=admins, DEV_ID=dev_id),
        payment=SimpleNamespace(ADMIN_CHAT_ID=admin_chat_id),
    )


def panel_admin_actor(admin: AdminUser):
    ensure_bot_path()
    from app.bot.services.tx_admin_notify import AdminActor

    return AdminActor(
        tg_id=0,
        name=admin.full_name or admin.username,
        username=admin.username,
    )


async def sync_tx_processed_from_panel(
    session: AsyncSession,
    tx_id: int,
    *,
    panel_admin: AdminUser,
    action: Action,
    processed_at: datetime | None = None,
) -> None:
    """Update all bot admin Telegram messages after panel approve/reject."""
    token = resolve_bot_token(get_settings())
    if not token:
        logger.warning("TX %s: BOT_TOKEN missing — skipping bot admin message sync", tx_id)
        return

    ensure_bot_path()
    from app.bot.services.tx_admin_notify import sync_processed_views

    at = processed_at or datetime.now(tz=timezone.utc)
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)

    config = _notify_config()
    bot = Bot(token=token)
    try:
        await sync_processed_views(
            bot,
            session,
            config,
            tx_id,
            actor=panel_admin_actor(panel_admin),
            action=action,
            processed_at=at,
        )
    except Exception:
        logger.exception("TX %s: bot admin message sync failed", tx_id)
    finally:
        await bot.session.close()
