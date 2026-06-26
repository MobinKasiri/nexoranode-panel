from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import require_permission
from panel.config import ensure_bot_path, resolve_shared_data_dir
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.audit import log_action
from panel.services.datetime_utils import parse_optional_datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings/festival", tags=["festival"])


class FestivalTextsBody(BaseModel):
    welcome_granted: str | None = None
    welcome_pending: str | None = None
    purchase_hint: str | None = None


class FestivalSettingsBody(BaseModel):
    enabled: bool = False
    title: str = "جشنواره ویژه"
    max_users: int = Field(default=20, ge=1, le=10000)
    discount_percent: int | None = Field(default=50, ge=1, le=100)
    discount_amount: int | None = Field(default=None, ge=1)
    valid_days: int = Field(default=14, ge=1, le=365)
    code_prefix: str = Field(default="JSH", max_length=8)
    delivery_mode: str = "on_start"
    new_users_only: bool = False
    starts_at: str | None = None
    ends_at: str | None = None
    texts: FestivalTextsBody | None = None
    start_new_campaign: bool = False


def _load_settings():
    ensure_bot_path()
    from app.bot.services.festival_settings import load_festival_settings, save_festival_settings

    data_dir = resolve_shared_data_dir()
    path = data_dir / "festival.json"
    if not path.is_file():
        save_festival_settings(load_festival_settings(data_dir), data_dir)
    return load_festival_settings(data_dir), data_dir


async def _campaign_stats(session: AsyncSession, campaign_id: str | None) -> dict:
    if not campaign_id:
        return {"granted_count": 0, "remaining": 0, "recipients": []}
    ensure_bot_path()
    from app.db.models import FestivalGrant, User

    count = await FestivalGrant.count_for_campaign(session, campaign_id)
    grants = await FestivalGrant.list_for_campaign(session, campaign_id, limit=20)
    recipients = []
    for g in grants:
        user = await User.get(session, g.user_id)
        recipients.append({
            "slot": g.slot_number,
            "user_id": g.user_id,
            "username": user.username if user else None,
            "full_name": user.full_name if user else None,
            "code": g.code,
            "granted_at": g.granted_at.isoformat(),
        })
    return {
        "granted_count": count,
        "recipients": recipients,
    }


def _public_state(data: dict, stats: dict) -> dict:
    max_users = int(data.get("max_users") or 20)
    granted = int(stats.get("granted_count") or 0)
    now = datetime.utcnow()
    active = bool(data.get("enabled")) and bool(data.get("campaign_id"))
    if active and data.get("starts_at"):
        try:
            starts = parse_optional_datetime(str(data["starts_at"]))
            if starts and now < starts:
                active = False
        except ValueError:
            pass
    if active and data.get("ends_at"):
        try:
            ends = parse_optional_datetime(str(data["ends_at"]))
            if ends and now > ends:
                active = False
        except ValueError:
            pass

    return {
        **data,
        "is_active": active,
        "granted_count": granted,
        "remaining_slots": max(0, max_users - granted),
        "recipients": stats.get("recipients") or [],
        "delivery_modes": [
            {"key": "on_start", "label": "ارسال کد بلافاصله بعد از /start"},
            {"key": "at_purchase", "label": "نمایش در مرحله خرید (کد تخفیف)"},
        ],
    }


@router.get("")
async def get_festival(
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("settings_festival", "read")),
):
    data, _ = _load_settings()
    stats = await _campaign_stats(session, data.get("campaign_id"))
    return _public_state(data, stats)


@router.put("")
async def update_festival(
    body: FestivalSettingsBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("settings_festival", "write")),
):
    ensure_bot_path()
    from app.bot.services.festival_settings import (
        DELIVERY_AT_PURCHASE,
        DELIVERY_ON_START,
        load_festival_settings,
        new_campaign_id,
        save_festival_settings,
    )

    if body.delivery_mode not in (DELIVERY_ON_START, DELIVERY_AT_PURCHASE):
        raise HTTPException(400, "نحوه نمایش تخفیف نامعتبر است")
    if not body.discount_percent and not body.discount_amount:
        raise HTTPException(400, "درصد یا مبلغ تخفیف الزامی است")
    if body.discount_percent and body.discount_amount:
        raise HTTPException(400, "فقط یکی از درصد یا مبلغ را وارد کنید")

    data_dir = resolve_shared_data_dir()
    current = load_festival_settings(data_dir)

    if body.start_new_campaign or (body.enabled and not current.get("campaign_id")):
        campaign_id = new_campaign_id()
    else:
        campaign_id = current.get("campaign_id")

    if not body.enabled:
        campaign_id = current.get("campaign_id")

    payload = {
        "enabled": body.enabled,
        "campaign_id": campaign_id if body.enabled else current.get("campaign_id"),
        "title": body.title.strip() or "جشنواره ویژه",
        "max_users": body.max_users,
        "discount_percent": body.discount_percent,
        "discount_amount": body.discount_amount,
        "valid_days": body.valid_days,
        "code_prefix": (body.code_prefix or "JSH").strip().upper()[:8],
        "delivery_mode": body.delivery_mode,
        "new_users_only": body.new_users_only,
        "starts_at": body.starts_at,
        "ends_at": body.ends_at,
        "texts": {**(current.get("texts") or {})},
    }

    if body.texts:
        for key in ("welcome_granted", "welcome_pending", "purchase_hint"):
            val = getattr(body.texts, key, None)
            if isinstance(val, str) and val.strip():
                payload["texts"][key] = val.strip()

    path = save_festival_settings(payload, data_dir)
    action = "festival_on" if body.enabled else "festival_off"
    await log_action(
        session,
        admin.id,
        action,
        target_type="festival",
        details=f"max={body.max_users} pct={body.discount_percent}",
    )

    stats = await _campaign_stats(session, payload.get("campaign_id"))
    return _public_state(payload, stats)


@router.post("/reset")
async def reset_festival_campaign(
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("settings_festival", "write")),
):
    """Start a fresh campaign (new campaign_id, counter resets)."""
    ensure_bot_path()
    from app.bot.services.festival_settings import (
        load_festival_settings,
        new_campaign_id,
        save_festival_settings,
    )

    data_dir = resolve_shared_data_dir()
    data = load_festival_settings(data_dir)
    data["campaign_id"] = new_campaign_id()
    data["enabled"] = True
    path = save_festival_settings(data, data_dir)
    await log_action(session, admin.id, "festival_reset", target_type="festival")
    stats = await _campaign_stats(session, data["campaign_id"])
    return _public_state(data, stats)


@router.get("/recipients")
async def festival_recipients(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_permission("settings_festival", "read")),
):
    data, _ = _load_settings()
    campaign_id = data.get("campaign_id")
    if not campaign_id:
        return {"items": [], "total": 0, "page": page, "limit": limit}

    ensure_bot_path()
    from app.db.models import FestivalGrant, User

    count_q = select(func.count()).select_from(FestivalGrant).where(
        FestivalGrant.campaign_id == campaign_id
    )
    total = (await session.execute(count_q)).scalar_one()
    grants = await FestivalGrant.list_for_campaign(
        session, campaign_id, limit=limit, offset=(page - 1) * limit
    )
    items = []
    for g in grants:
        user = await User.get(session, g.user_id)
        items.append({
            "slot": g.slot_number,
            "user_id": g.user_id,
            "username": user.username if user else None,
            "full_name": user.full_name if user else None,
            "code": g.code,
            "granted_at": g.granted_at.isoformat(),
        })
    return {"items": items, "total": total, "page": page, "limit": limit}
