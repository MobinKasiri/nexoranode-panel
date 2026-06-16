from __future__ import annotations

import logging

from panel.config import ensure_bot_path, get_settings

logger = logging.getLogger(__name__)

_xui_service = None
_vpn_service = None
_ws_id: int | None = None
_reality_id: int | None = None


async def get_xui_service():
    global _xui_service, _ws_id, _reality_id
    ensure_bot_path()
    from app.bot.services.xui_api import XUIApiService
    from app.config import XUIConfig

    if _xui_service is not None:
        return _xui_service

    settings = get_settings()
    config = XUIConfig(
        HOST=settings.XUI_HOST,
        PATH=settings.XUI_PATH,
        USERNAME=settings.XUI_USERNAME,
        PASSWORD=settings.XUI_PASSWORD,
        TOKEN=settings.XUI_TOKEN,
        SUB_BASE_URL=settings.XUI_SUB_BASE_URL,
        WS_INBOUND_NAME=settings.XUI_WS_INBOUND_NAME,
        REALITY_INBOUND_NAME=settings.XUI_REALITY_INBOUND_NAME,
        START_AFTER_FIRST_USE=settings.XUI_START_AFTER_FIRST_USE,
        DEFAULT_DURATION_DAYS=settings.XUI_DEFAULT_DURATION_DAYS,
    )
    _xui_service = XUIApiService(config)
    if config.TOKEN:
        pass
    else:
        await _xui_service.login()
    _ws_id, _reality_id = await _xui_service.find_inbound_ids(
        ws_name=config.WS_INBOUND_NAME,
        reality_name=config.REALITY_INBOUND_NAME,
    )
    return _xui_service


async def get_vpn_service():
    global _vpn_service, _ws_id, _reality_id
    ensure_bot_path()
    from app.bot.services.vpn import VPNService

    if _vpn_service is not None:
        return _vpn_service

    xui = await get_xui_service()
    settings = get_settings()
    if _ws_id is None or _reality_id is None:
        _ws_id, _reality_id = await xui.find_inbound_ids(
            ws_name=settings.XUI_WS_INBOUND_NAME,
            reality_name=settings.XUI_REALITY_INBOUND_NAME,
        )
    _vpn_service = VPNService(
        xui,
        _ws_id,
        _reality_id,
        settings.XUI_SUB_BASE_URL,
        start_after_first_use=settings.XUI_START_AFTER_FIRST_USE,
        default_duration_days=settings.XUI_DEFAULT_DURATION_DAYS,
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
