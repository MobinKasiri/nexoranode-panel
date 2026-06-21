from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.config import ensure_bot_path
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.config_ops import (
    delete_config_background,
    sync_all_configs,
    toggle_config,
)

router = APIRouter(prefix="/configs", tags=["configs"])


class ExtendBody(BaseModel):
    days: int


@router.get("")
async def list_configs(
    status: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import User, VPNConfig

    q = select(VPNConfig).order_by(VPNConfig.created_at.desc())
    if status == "active":
        q = q.where(VPNConfig.is_active.is_(True))
    elif status == "expired":
        from datetime import datetime
        q = q.where(VPNConfig.expiry_date < datetime.utcnow())
    if search:
        like = f"%{search}%"
        q = q.where(or_(VPNConfig.service_name.ilike(like), VPNConfig.panel_email.ilike(like)))

    total = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    result = await session.execute(q.offset((page - 1) * limit).limit(limit))
    configs = result.scalars().all()

    items = []
    for c in configs:
        user = await User.get(session, c.user_id)
        items.append({
            "id": c.id,
            "service_name": c.service_name,
            "user_id": c.user_id,
            "username": user.username if user else None,
            "full_name": user.full_name if user else None,
            "plan_gb": c.plan_gb,
            "plan_days": c.plan_days,
            "traffic_used_bytes": c.traffic_used_bytes,
            "traffic_limit_bytes": c.traffic_limit_bytes,
            "expiry_date": c.expiry_date.isoformat() if c.expiry_date else None,
            "is_active": c.is_active,
            "subscription_url": c.subscription_url,
        })
    return {"items": items, "total": total, "page": page, "limit": limit}


@router.post("/{config_id}/toggle")
async def toggle_config_endpoint(
    config_id: int,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    return await toggle_config(session, config_id, admin.id)


@router.delete("/{config_id}", status_code=202)
async def delete_config_endpoint(
    config_id: int,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import VPNConfig

    config = await VPNConfig.get(session, config_id)
    if not config:
        raise HTTPException(404, "سرویس یافت نشد")

    background_tasks.add_task(delete_config_background, config_id, admin.id)
    return {"success": True, "queued": True, "message": "حذف در پس‌زمینه انجام می‌شود"}


@router.post("/sync-all")
async def sync_all_endpoint(
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    return await sync_all_configs(session, admin.id)
