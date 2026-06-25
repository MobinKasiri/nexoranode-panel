from __future__ import annotations

import logging

from fastapi import HTTPException

from panel.config import ensure_bot_path, resolve_xui_settings

logger = logging.getLogger(__name__)

_xui_service = None
_inbound_ids: list[int] | None = None
_vpn_service = None


def reset_xui_cache() -> None:
    global _xui_service, _inbound_ids, _vpn_service
    _xui_service = None
    _inbound_ids = None
    _vpn_service = None


def _xui_config():
    ensure_bot_path()
    from panel.bot_bridge.xui_config import XUIConfig

    resolved = resolve_xui_settings()
    return XUIConfig(
        HOST=resolved["HOST"],
        PATH=resolved["PATH"],
        USERNAME=resolved["USERNAME"],
        PASSWORD=resolved["PASSWORD"],
        TOKEN=resolved["TOKEN"],
        SUB_BASE_URL=resolved["SUB_BASE_URL"],
        SUB_CLASH_BASE_URL=resolved.get("SUB_CLASH_BASE_URL", ""),
        INBOUND_FILTER=resolved["INBOUND_FILTER"],
        START_AFTER_FIRST_USE=resolved["START_AFTER_FIRST_USE"],
        DEFAULT_DURATION_DAYS=resolved["DEFAULT_DURATION_DAYS"],
    )


async def _refresh_inbound_ids() -> list[int]:
    global _inbound_ids
    xui = await get_xui_service()
    resolved = resolve_xui_settings()
    _inbound_ids = await xui.enabled_inbound_ids(filter_names=resolved["INBOUND_FILTER"])
    return _inbound_ids


async def get_xui_service():
    global _xui_service
    ensure_bot_path()
    from app.bot.services.xui_api import XUIApiService

    if _xui_service is not None:
        return _xui_service

    config = _xui_config()
    if not config.USERNAME and not config.PASSWORD and not config.TOKEN:
        raise RuntimeError(
            "XUI credentials missing — set XUI_USERNAME/XUI_PASSWORD or XUI_TOKEN "
            "in panel .env or bot /bot/.env"
        )

    try:
        _xui_service = XUIApiService(config)
        if config.TOKEN:
            _xui_service._logged_in = True
        else:
            await _xui_service.login()
        return _xui_service
    except Exception:
        reset_xui_cache()
        raise


async def require_xui_service():
    try:
        return await get_xui_service()
    except Exception as exc:
        logger.exception("XUI service unavailable")
        detail = "اتصال به پنل VPN برقرار نیست"
        msg = str(exc).lower()
        if "credentials missing" in msg or "xui_username" in msg:
            detail = (
                "اطلاعات ورود پنل VPN تنظیم نشده — "
                "XUI_USERNAME و XUI_PASSWORD را در .env ربات یا پنل قرار دهید"
            )
        elif "no enabled inbounds" in msg:
            detail = "هیچ inbound فعالی در پنل VPN یافت نشد"
        elif "connect" in msg or "network" in msg or "ssl" in msg:
            detail = (
                "پنل 3X-UI از داخل Docker در دسترس نیست — "
                "XUI_HOST را بررسی کنید (مثال: https://p.nexoranode.xyz:2057 یا "
                "https://127.0.0.1:2057 روی همان سرور)"
            )
        raise HTTPException(503, detail) from exc


async def get_vpn_service():
    global _vpn_service, _inbound_ids
    ensure_bot_path()
    from app.bot.services.vpn import VPNService

    if _vpn_service is not None:
        return _vpn_service

    resolved = resolve_xui_settings()
    xui = await require_xui_service()
    if _inbound_ids is None:
        _inbound_ids = await xui.enabled_inbound_ids(filter_names=resolved["INBOUND_FILTER"])
        logger.info("Panel VPN bootstrap — inbound ids=%s", _inbound_ids)

    _vpn_service = VPNService(
        xui,
        _inbound_ids,
        resolved["SUB_BASE_URL"],
        resolved.get("SUB_CLASH_BASE_URL", ""),
        start_after_first_use=resolved["START_AFTER_FIRST_USE"],
        default_duration_days=resolved["DEFAULT_DURATION_DAYS"],
        refresh_inbound_ids=_refresh_inbound_ids,
        node_sync_enabled=resolved["NODE_SYNC_ENABLED"],
        node_ssh_user=resolved["NODE_SSH_USER"],
        node_ssh_port=resolved["NODE_SSH_PORT"],
        node_ssh_identity=resolved["NODE_SSH_IDENTITY"],
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


async def xui_connection_status() -> dict:
    """Diagnostics for Settings / config ops (no secrets)."""
    resolved = resolve_xui_settings()
    has_creds = bool(resolved["USERNAME"] and resolved["PASSWORD"]) or bool(resolved["TOKEN"])
    out = {
        "host": resolved["HOST"],
        "path_set": bool(resolved["PATH"]),
        "has_credentials": has_creds,
        "connected": False,
        "inbound_count": 0,
        "error": None,
    }
    if not has_creds:
        out["error"] = "missing_credentials"
        return out
    try:
        xui = await get_xui_service()
        inbounds = await xui.list_inbounds()
        enabled = [ib for ib in inbounds if ib.enable]
        out["connected"] = True
        out["inbound_count"] = len(enabled)
    except Exception as exc:
        out["error"] = str(exc)
        reset_xui_cache()
    return out
