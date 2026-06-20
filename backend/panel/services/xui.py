from __future__ import annotations

import logging
import os

from panel.config import ensure_bot_path, get_settings

logger = logging.getLogger(__name__)

_xui_service = None
_inbound_ids: list[int] | None = None
_vpn_service = None


def _parse_inbound_filter() -> tuple[str, ...]:
    raw = os.environ.get("XUI_INBOUND_FILTER", "").strip()
    if not raw:
        return ()
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def _xui_config():
    ensure_bot_path()
    from app.config import XUIConfig

    settings = get_settings()
    return XUIConfig(
        HOST=settings.XUI_HOST,
        PATH=settings.XUI_PATH,
        USERNAME=settings.XUI_USERNAME,
        PASSWORD=settings.XUI_PASSWORD,
        TOKEN=settings.XUI_TOKEN,
        SUB_BASE_URL=settings.XUI_SUB_BASE_URL,
        INBOUND_FILTER=_parse_inbound_filter(),
        START_AFTER_FIRST_USE=settings.XUI_START_AFTER_FIRST_USE,
        DEFAULT_DURATION_DAYS=settings.XUI_DEFAULT_DURATION_DAYS,
    )


async def _refresh_inbound_ids() -> list[int]:
    global _inbound_ids
    xui = await get_xui_service()
    _inbound_ids = await xui.enabled_inbound_ids(filter_names=_parse_inbound_filter())
    return _inbound_ids


async def get_xui_service():
    global _xui_service
    ensure_bot_path()
    from app.bot.services.xui_api import XUIApiService

    if _xui_service is not None:
        return _xui_service

    config = _xui_config()
    _xui_service = XUIApiService(config)
    if config.TOKEN:
        _xui_service._logged_in = True
    else:
        await _xui_service.login()
    return _xui_service


async def get_vpn_service():
    global _vpn_service, _inbound_ids
    ensure_bot_path()
    from app.bot.services.vpn import VPNService

    if _vpn_service is not None:
        return _vpn_service

    settings = get_settings()
    xui = await get_xui_service()
    if _inbound_ids is None:
        _inbound_ids = await xui.enabled_inbound_ids(filter_names=_parse_inbound_filter())
        logger.info("Panel VPN bootstrap — inbound ids=%s", _inbound_ids)

    _vpn_service = VPNService(
        xui,
        _inbound_ids,
        settings.XUI_SUB_BASE_URL,
        start_after_first_use=settings.XUI_START_AFTER_FIRST_USE,
        default_duration_days=settings.XUI_DEFAULT_DURATION_DAYS,
        refresh_inbound_ids=_refresh_inbound_ids,
    )
    return _vpn_service


async def get_server_health() -> dict:
    try:
        xui = await get_xui_service()
        status = await xui.get_server_status()
        ram_pct = (status.mem_current / status.mem_total * 100) if status.mem_total else 0
        uptime_sec = status.uptime
        days = uptime_sec // 86400
        hours = (uptime_sec % 86400) // 3600
        return {
            "cpu_percent": round(status.cpu, 1),
            "ram_used_gb": round(status.mem_current / (1024**3), 2),
            "ram_total_gb": round(status.mem_total / (1024**3), 2),
            "ram_percent": round(ram_pct, 1),
            "disk_used_gb": 0,
            "disk_total_gb": 0,
            "disk_percent": 0,
            "xray_status": "running" if status.xray_state == "running" else "stopped",
            "uptime": f"{days} days {hours} hours",
            "active_connections": 0,
        }
    except Exception as e:
        logger.exception("Server health fetch failed")
        return {
            "cpu_percent": 0,
            "ram_used_gb": 0,
            "ram_total_gb": 0,
            "ram_percent": 0,
            "disk_used_gb": 0,
            "disk_total_gb": 0,
            "disk_percent": 0,
            "xray_status": "unknown",
            "uptime": "—",
            "active_connections": 0,
            "error": str(e),
        }
