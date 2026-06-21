from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.audit import log_action
from panel.services.maintenance import (
    MAINTENANCE_PRESETS,
    disable_maintenance,
    enable_maintenance,
    public_maintenance_state,
)

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


class EnableMaintenanceBody(BaseModel):
    enabled: bool
    reason: str = "maintenance"
    duration_minutes: int = Field(default=60, ge=1, le=24 * 7)
    custom_message: str | None = None


@router.get("")
async def get_maintenance(_admin: AdminUser = Depends(get_current_admin)):
    return public_maintenance_state()


@router.put("")
async def update_maintenance(
    body: EnableMaintenanceBody,
    admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
):
    if body.enabled:
        state = enable_maintenance(
            reason=body.reason,
            duration_minutes=body.duration_minutes,
            custom_message=body.custom_message,
            admin_id=admin.id,
        )
        await log_action(
            session,
            admin.id,
            "maintenance_on",
            target_type="maintenance",
            target_id=body.reason,
            details=f"{body.duration_minutes}m",
        )
    else:
        state = disable_maintenance(admin.id)
        await log_action(session, admin.id, "maintenance_off", target_type="maintenance")

    return state


@router.get("/presets")
async def maintenance_presets(_admin: AdminUser = Depends(get_current_admin)):
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
