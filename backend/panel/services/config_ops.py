from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from panel.config import ensure_bot_path
from panel.db.session import async_session
from panel.services.audit import log_action
from panel.services.telegram import TelegramService
from panel.services.xui import get_vpn_service, get_xui_service, require_xui_service

logger = logging.getLogger(__name__)

GB = 1024 ** 3


class CreateConfigBody(BaseModel):
    user_id: int = Field(..., description="Telegram user id")
    service_name: str = Field(..., min_length=3, max_length=30)
    plan_gb: int = Field(..., ge=0)
    plan_days: int = Field(..., ge=0)
    inbound_ids: list[int] | None = None
    limit_ip: int = 0
    enable: bool = True
    start_after_first_use: bool | None = None
    expiry_date: str | None = None
    comment: str = ""
    uuid: str | None = None
    sub_id: str | None = None
    plan_id: str = "panel_manual"
    notify_user: bool = True
    user_message: str | None = Field(None, max_length=1000)


class UpdateConfigBody(BaseModel):
    plan_gb: int | None = None
    plan_days: int | None = None
    inbound_ids: list[int] | None = None
    limit_ip: int | None = None
    enable: bool | None = None
    start_after_first_use: bool | None = None
    expiry_date: str | None = None
    comment: str | None = None
    sub_id: str | None = None


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
    except HTTPException:
        raise
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
    from sqlalchemy import select

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


async def list_inbounds() -> list[dict[str, Any]]:
    xui = await require_xui_service()
    inbounds = await xui.list_inbounds()
    return [
        {
            "id": ib.id,
            "remark": ib.remark,
            "protocol": ib.protocol,
            "port": ib.port,
            "enable": ib.enable,
        }
        for ib in inbounds
        if ib.enable
    ]


async def enrich_config(session: AsyncSession, config) -> dict[str, Any]:
    ensure_bot_path()
    from app.db.models import User

    user = await User.get(session, config.user_id)
    item: dict[str, Any] = {
        "id": config.id,
        "service_name": config.service_name,
        "user_id": config.user_id,
        "username": user.username if user else None,
        "full_name": user.full_name if user else None,
        "plan_gb": config.plan_gb,
        "plan_days": config.plan_days,
        "traffic_used_bytes": config.traffic_used_bytes,
        "traffic_limit_bytes": config.traffic_limit_bytes,
        "expiry_date": config.expiry_date.isoformat() if config.expiry_date else None,
        "is_active": config.is_active,
        "subscription_url": config.subscription_url,
        "panel_email": config.panel_email,
        "panel_uuid": config.panel_uuid,
        "subscription_id": config.subscription_id,
        "inbound_ids": [],
        "inbound_remarks": [],
        "comment": "",
        "limit_ip": 0,
    }
    try:
        xui = await get_xui_service()
        record = await xui.get_client(config.panel_email)
        item["inbound_ids"] = record.get("inboundIds") or []
        item["comment"] = record.get("comment") or config.service_name
        item["limit_ip"] = record.get("limitIp") or 0
        if record.get("expiryTime"):
            from app.bot.utils.jalali import ms_to_datetime
            dt = ms_to_datetime(int(record["expiryTime"]))
            if dt:
                item["expiry_date"] = dt.isoformat()
        traffic = await xui.get_client_traffic(config.panel_email)
        item["traffic_used_bytes"] = traffic.up + traffic.down
        item["traffic_limit_bytes"] = traffic.total
        inbounds = await xui.list_inbounds()
        remark_map = {ib.id: ib.remark for ib in inbounds}
        item["inbound_remarks"] = [remark_map.get(i, str(i)) for i in item["inbound_ids"]]
    except Exception:
        logger.debug("Could not enrich config %s from XUI", config.id, exc_info=True)
    return item


def _config_expiry_text(expiry_dt, plan_days: int, start_after_first_use: bool) -> str:
    ensure_bot_path()
    from app.bot.utils.jalali import to_jalali

    if start_after_first_use or expiry_dt is None:
        return f"شروع {plan_days} روز پس از اولین اتصال"
    return to_jalali(expiry_dt)


async def _notify_config_created(
    body: CreateConfigBody,
    user_tg_id: int,
    item: dict[str, Any],
    expiry_dt,
    *,
    start_after_first_use: bool,
) -> bool:
    if not body.notify_user:
        return False
    sub_url = item.get("subscription_url")
    if not sub_url:
        return False
    expiry_text = _config_expiry_text(expiry_dt, body.plan_days, start_after_first_use)
    tg = TelegramService()
    return await tg.send_config_granted(
        chat_id=user_tg_id,
        service_name=item.get("service_name") or body.service_name,
        plan_gb=body.plan_gb,
        plan_days=body.plan_days,
        subscription_url=sub_url,
        expiry_text=expiry_text,
        inbound_remarks=item.get("inbound_remarks"),
        admin_note=body.user_message,
        is_active=bool(item.get("is_active", body.enable)),
    )


async def create_config_admin(
    session: AsyncSession, admin_id: int, body: CreateConfigBody
) -> dict[str, Any]:
    ensure_bot_path()
    from app.bot.services.xui_api import ClientAddPayload
    from app.bot.utils.jalali import add_days_ms, ms_to_datetime, start_after_first_use_ms
    from app.bot.utils.service_name import panel_email, validate
    from app.db.models import User, VPNConfig

    if not validate(body.service_name):
        raise HTTPException(400, "نام سرویس باید ۳–۳۰ کاراکتر انگلیسی کوچک یا عدد باشد")

    user = await User.get(session, body.user_id)
    if not user:
        raise HTTPException(404, "کاربر تلگرام یافت نشد")

    if await VPNConfig.name_exists(session, body.service_name):
        raise HTTPException(409, "نام سرویس تکراری است")

    vpn = await require_vpn_service()
    xui = vpn.xui
    email = panel_email(body.service_name)
    vless_uuid = body.uuid or str(uuid.uuid4())
    sub_id = body.sub_id or secrets.token_hex(12)
    total_bytes = body.plan_gb * GB
    days = body.plan_days or vpn.default_duration_days
    start_after = body.start_after_first_use if body.start_after_first_use is not None else vpn.start_after_first_use

    if body.expiry_date:
        expiry_dt = datetime.fromisoformat(body.expiry_date.replace("Z", "+00:00"))
        from app.bot.utils.jalali import datetime_to_ms
        expiry_ms = datetime_to_ms(expiry_dt)
    elif start_after:
        expiry_ms = start_after_first_use_ms(days)
        expiry_dt = None
    else:
        expiry_ms = add_days_ms(0, days)
        expiry_dt = ms_to_datetime(expiry_ms)

    inbound_ids = body.inbound_ids or await vpn._active_inbound_ids()

    payload = ClientAddPayload(
        email=email,
        uuid=vless_uuid,
        sub_id=sub_id,
        total_bytes=total_bytes,
        expiry_ms=expiry_ms,
        flow="",
        inbound_ids=inbound_ids,
        limit_ip=body.limit_ip,
        enable=body.enable,
        tg_id=user.tg_id,
        comment=body.comment or body.service_name,
    )

    try:
        await xui.add_client(payload)
        resolved_uuid = await xui.resolve_client_uuid(email, hint=vless_uuid)
        if not resolved_uuid:
            raise HTTPException(502, "پنل UUID برنگرداند")
        await xui.ensure_client_on_inbounds(email, resolved_uuid, inbound_ids)
    except HTTPException:
        raise
    except Exception as exc:
        raise _xui_http_error(exc) from exc

    sub_url = vpn.sub_url(sub_id)
    config = await VPNConfig.create(
        session,
        user_id=body.user_id,
        service_name=body.service_name,
        panel_email=email,
        panel_uuid=resolved_uuid,
        subscription_id=sub_id,
        subscription_url=sub_url,
        traffic_limit_bytes=total_bytes,
        traffic_used_bytes=0,
        expiry_date=expiry_dt,
        is_active=body.enable,
        plan_id=body.plan_id,
        plan_gb=body.plan_gb,
        plan_days=body.plan_days,
    )
    await log_action(
        session, admin_id, "create_config", target_type="config", target_id=str(config.id)
    )
    item = await enrich_config(session, config)
    notified = await _notify_config_created(
        body, user.tg_id, item, expiry_dt, start_after_first_use=start_after
    )
    if body.notify_user:
        details = "notified" if notified else "notify_failed"
        if body.user_message:
            details += f" msg={body.user_message[:120]}"
        await log_action(
            session,
            admin_id,
            "notify_config_created",
            target_type="user",
            target_id=str(user.tg_id),
            details=details,
        )
    return {**item, "notified": notified}


async def update_config_admin(
    session: AsyncSession, admin_id: int, config_id: int, body: UpdateConfigBody
) -> dict[str, Any]:
    ensure_bot_path()
    from app.bot.utils.jalali import add_days_ms, datetime_to_ms, ms_to_datetime, start_after_first_use_ms
    from app.db.models import VPNConfig

    config = await VPNConfig.get(session, config_id)
    if not config:
        raise HTTPException(404, "سرویس یافت نشد")

    vpn = await require_vpn_service()
    xui = vpn.xui

    try:
        traffic = await xui.get_client_traffic(config.panel_email)
        record = await xui.get_client(config.panel_email)
    except Exception as exc:
        raise _xui_http_error(exc) from exc

    total_bytes = body.plan_gb * GB if body.plan_gb is not None else traffic.total
    limit_ip = body.limit_ip if body.limit_ip is not None else (record.get("limitIp") or 0)
    enable = body.enable if body.enable is not None else config.is_active
    sub_id = body.sub_id or config.subscription_id
    comment = body.comment if body.comment is not None else (record.get("comment") or config.service_name)

    if body.expiry_date:
        expiry_dt = datetime.fromisoformat(body.expiry_date.replace("Z", "+00:00"))
        expiry_ms = datetime_to_ms(expiry_dt)
    elif body.start_after_first_use:
        days = body.plan_days if body.plan_days is not None else config.plan_days
        expiry_ms = start_after_first_use_ms(days or vpn.default_duration_days)
        expiry_dt = None
    elif body.plan_days is not None:
        expiry_ms = add_days_ms(0, body.plan_days)
        expiry_dt = ms_to_datetime(expiry_ms)
    else:
        expiry_ms = traffic.expiry_time
        expiry_dt = config.expiry_date

    try:
        await xui.update_client(
            config.panel_email,
            total_bytes=total_bytes,
            expiry_ms=expiry_ms,
            limit_ip=limit_ip,
            enable=enable,
            tg_id=config.user_id,
            sub_id=sub_id,
            comment=comment,
        )
        if body.inbound_ids is not None:
            current = set(record.get("inboundIds") or [])
            desired = set(body.inbound_ids)
            to_attach = list(desired - current)
            to_detach = list(current - desired)
            if to_attach:
                await xui.attach_client(config.panel_email, to_attach)
            if to_detach:
                await xui.detach_client(config.panel_email, to_detach)
    except Exception as exc:
        raise _xui_http_error(exc) from exc

    updates: dict[str, Any] = {}
    if body.plan_gb is not None:
        updates["plan_gb"] = body.plan_gb
        updates["traffic_limit_bytes"] = total_bytes
    if body.plan_days is not None:
        updates["plan_days"] = body.plan_days
    if body.enable is not None:
        updates["is_active"] = body.enable
    if body.sub_id:
        updates["subscription_id"] = sub_id
        updates["subscription_url"] = vpn.sub_url(sub_id)
    if body.expiry_date or body.start_after_first_use or body.plan_days is not None:
        updates["expiry_date"] = expiry_dt

    if updates:
        await VPNConfig.update(session, config_id, **updates)

    refreshed = await VPNConfig.get(session, config_id)
    await log_action(
        session, admin_id, "update_config", target_type="config", target_id=str(config_id)
    )
    return await enrich_config(session, refreshed)
