from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import require_permission
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.audit import log_action
from panel.services.maintenance import (
    MAINTENANCE_PRESETS,
    disable_maintenance,
    enable_maintenance,
    load_maintenance,
    public_maintenance_state,
    save_default_offline_message,
)

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


class EnableMaintenanceBody(BaseModel):
    enabled: bool
    reason: str = "maintenance"
    duration_minutes: int | None = Field(default=None, ge=1, le=24 * 7 * 60)
    ends_at: str | None = None
    custom_message: str | None = None


class DefaultOfflineBody(BaseModel):
    default_offline_message: str | None = None


@router.get("/internal")
async def internal_maintenance_state():
    """Docker-internal endpoint for repair-bot gateway (no auth)."""
    return load_maintenance()


@router.get("")
async def get_maintenance(_admin: AdminUser = Depends(require_permission("settings_maintenance", "read"))):
    return public_maintenance_state()


@router.put("")
async def update_maintenance(
    body: EnableMaintenanceBody,
    admin: AdminUser = Depends(require_permission("settings_maintenance", "write")),
    session: AsyncSession = Depends(get_db),
):
    if body.enabled:
        if not body.duration_minutes and not body.ends_at:
            raise HTTPException(400, "مدت زمان یا تاریخ پایان الزامی است")
        try:
            state = enable_maintenance(
                reason=body.reason,
                duration_minutes=body.duration_minutes,
                ends_at=body.ends_at,
                custom_message=body.custom_message,
                admin_id=admin.id,
            )
        except ValueError as exc:
            msg = str(exc)
            if msg == "invalid ends_at":
                raise HTTPException(400, "تاریخ پایان نامعتبر است")
            if msg == "ends_at must be in the future":
                raise HTTPException(400, "تاریخ پایان باید در آینده باشد")
            raise HTTPException(400, "تنظیمات نامعتبر است")
        detail = body.ends_at or f"{body.duration_minutes}m"
        await log_action(
            session,
            admin.id,
            "maintenance_on",
            target_type="maintenance",
            target_id=body.reason,
            details=detail,
        )
    else:
        state = disable_maintenance(admin.id)
        await log_action(session, admin.id, "maintenance_off", target_type="maintenance")

    return state


@router.put("/offline-default")
async def update_offline_default(
    body: DefaultOfflineBody,
    admin: AdminUser = Depends(require_permission("settings_maintenance", "write")),
    session: AsyncSession = Depends(get_db),
):
    state = save_default_offline_message(body.default_offline_message, admin.id)
    await log_action(
        session,
        admin.id,
        "maintenance_offline_default",
        target_type="maintenance",
        details="updated",
    )
    return state


@router.get("/presets")
async def maintenance_presets(_admin: AdminUser = Depends(require_permission("settings_maintenance", "read"))):
    return {"items": [{"key": k, "label": _preset_label(k), "message": v} for k, v in MAINTENANCE_PRESETS.items()]}


def _preset_label(key: str) -> str:
    labels = {
        "developing": "توسعه و تغییرات",
        "updating": "بروزرسانی ربات",
        "servers": "بروزرسانی سرورها",
        "bugfix": "رفع باگ",
        "maintenance": "غیرفعال موقت",
    }
    return labels.get(key, key)
