"""VPN config operations with XUI error mapping for the admin panel."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.config import ensure_bot_path
from panel.db.session import async_session
from panel.services.audit import log_action
from panel.services.xui import get_vpn_service

logger = logging.getLogger(__name__)


def _xui_http_error(exc: Exception) -> HTTPException:
    ensure_bot_path()
    from app.bot.services.xui_api import XUIError, XUINotFound

    if isinstance(exc, XUINotFound):
        return HTTPException(404, getattr(exc, "persian", "سرویس در پنل یافت نشد"))
    if isinstance(exc, XUIError):
        return HTTPException(502, getattr(exc, "persian", "خطا در ارتباط با پنل VPN"))
    logger.exception("Unexpected VPN config error")
    return HTTPException(502, "خطا در عملیات سرویس VPN")


async def require_vpn_service():
    try:
        return await get_vpn_service()
    except Exception as exc:
        logger.exception("VPN service unavailable")
        raise HTTPException(503, "اتصال به پنل VPN برقرار نیست") from exc


async def toggle_config(
    session: AsyncSession, config_id: int, admin_id: int
) -> dict[str, Any]:
    ensure_bot_path()
    from app.db.models import VPNConfig

    config = await VPNConfig.get(session, config_id)
    if not config:
        raise HTTPException(404, "سرویس یافت نشد")

    vpn = await require_vpn_service()
    new_active = not config.is_active
    try:
        await vpn.set_enabled(session, config, new_active)
    except Exception as exc:
        raise _xui_http_error(exc) from exc

    refreshed = await VPNConfig.get(session, config_id)
    await log_action(
        session, admin_id, "toggle_config", target_type="config", target_id=str(config_id)
    )
    return {"success": True, "is_active": refreshed.is_active if refreshed else new_active}


async def delete_config_background(config_id: int, admin_id: int) -> None:
    """Run panel delete (includes 5s disable delay) outside the request thread."""
    async with async_session() as session:
        ensure_bot_path()
        from app.db.models import VPNConfig

        config = await VPNConfig.get(session, config_id)
        if not config:
            logger.warning("delete_config_background: config %s gone", config_id)
            return
        vpn = await require_vpn_service()
        try:
            await vpn.delete(session, config)
            await log_action(
                session,
                admin_id,
                "delete_config",
                target_type="config",
                target_id=str(config_id),
            )
        except Exception:
            logger.exception("Background delete failed for config %s", config_id)


async def sync_all_configs(session: AsyncSession, admin_id: int) -> dict[str, Any]:
    ensure_bot_path()
    from app.bot.services.xui_api import XUIError
    from app.db.models import VPNConfig

    vpn = await require_vpn_service()
    result = await session.execute(select(VPNConfig).where(VPNConfig.is_active.is_(True)))
    configs = result.scalars().all()

    synced = 0
    failed: list[dict[str, Any]] = []
    for c in configs:
        try:
            await vpn.refresh_traffic(session, c)
            synced += 1
        except XUIError as exc:
            failed.append({"id": c.id, "reason": getattr(exc, "persian", str(exc))})
        except Exception as exc:
            failed.append({"id": c.id, "reason": str(exc)})

    await log_action(session, admin_id, "sync_configs", details=f"synced={synced} failed={len(failed)}")
    return {"success": True, "synced": synced, "total": len(configs), "failed": failed}
