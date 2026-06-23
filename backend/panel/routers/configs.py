from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import require_permission
from panel.config import ensure_bot_path
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.config_ops import (
    CreateConfigBody,
    UpdateConfigBody,
    create_config_admin,
    delete_config_background,
    enrich_config,
    list_inbounds,
    sync_all_configs,
    toggle_config,
    update_config_admin,
)

logger = logging.getLogger(__name__)

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
    _admin: AdminUser = Depends(require_permission("configs", "read")),
):
    ensure_bot_path()
    from app.db.models import VPNConfig

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
        items.append(await enrich_config(session, c))
    return {"items": items, "total": total, "page": page, "limit": limit}


@router.get("/inbounds")
async def get_inbounds(
    _admin: AdminUser = Depends(require_permission("configs", "read")),
):
    return {"items": await list_inbounds()}


@router.post("")
async def create_config(
    body: CreateConfigBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("configs", "write")),
):
    try:
        return await create_config_admin(session, admin.id, body)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("create_config failed")
        raise HTTPException(500, f"خطا در ایجاد سرویس: {exc}") from exc


@router.patch("/{config_id}")
async def update_config(
    config_id: int,
    body: UpdateConfigBody,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("configs", "write")),
):
    return await update_config_admin(session, admin.id, config_id, body)


@router.post("/{config_id}/toggle")
async def toggle_config_endpoint(
    config_id: int,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("configs", "write")),
):
    return await toggle_config(session, config_id, admin.id)


@router.delete("/{config_id}", status_code=202)
async def delete_config_endpoint(
    config_id: int,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("configs", "write")),
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
    admin: AdminUser = Depends(require_permission("configs", "write")),
):
    return await sync_all_configs(session, admin.id)
