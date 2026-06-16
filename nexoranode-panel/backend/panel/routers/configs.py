from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.config import ensure_bot_path
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.services.audit import log_action
from panel.services.xui import get_vpn_service

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
async def toggle_config(
    config_id: int,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import VPNConfig

    config = await VPNConfig.get(session, config_id)
    if not config:
        raise HTTPException(404)
    vpn = await get_vpn_service()
    await vpn.set_enabled(session, config, not config.is_active)
    await log_action(session, admin.id, "toggle_config", target_type="config", target_id=str(config_id))
    return {"success": True, "is_active": not config.is_active}


@router.delete("/{config_id}")
async def delete_config(
    config_id: int,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import VPNConfig

    config = await VPNConfig.get(session, config_id)
    if not config:
        raise HTTPException(404)
    vpn = await get_vpn_service()
    await vpn.delete(session, config)
    await log_action(session, admin.id, "delete_config", target_type="config", target_id=str(config_id))
    return {"success": True}


@router.post("/sync-all")
async def sync_all(
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    ensure_bot_path()
    from app.db.models import VPNConfig

    vpn = await get_vpn_service()
    result = await session.execute(select(VPNConfig).where(VPNConfig.is_active.is_(True)))
    configs = result.scalars().all()
    synced = 0
    for c in configs:
        try:
            await vpn.refresh_traffic(session, c)
            synced += 1
        except Exception:
            pass
    await log_action(session, admin.id, "sync_configs", details=str(synced))
    return {"success": True, "synced": synced, "total": len(configs)}
