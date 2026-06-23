from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import require_permission
from panel.auth.permissions import ACTION_LABELS, is_superadmin
from panel.db.models import AdminUser, AuditLog
from panel.db.session import get_db

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("")
async def list_activity(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin_id: int | None = None,
    action: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    session: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_permission("activity", "read")),
):
    q = select(AuditLog).order_by(AuditLog.created_at.desc())
    filter_admin_id = admin_id if is_superadmin(admin) else admin.id
    if filter_admin_id is not None:
        q = q.where(AuditLog.admin_id == filter_admin_id)
    if action:
        q = q.where(AuditLog.action == action)
    if from_date:
        try:
            start = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
            q = q.where(AuditLog.created_at >= start)
        except ValueError:
            pass
    if to_date:
        try:
            end = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
            q = q.where(AuditLog.created_at <= end)
        except ValueError:
            pass

    total = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    result = await session.execute(q.offset((page - 1) * limit).limit(limit))
    logs = result.scalars().all()

    admin_ids = {log.admin_id for log in logs}
    admin_map: dict[int, AdminUser] = {}
    if admin_ids:
        admins_result = await session.execute(
            select(AdminUser).where(AdminUser.id.in_(admin_ids))
        )
        for a in admins_result.scalars().all():
            admin_map[a.id] = a

    items = []
    for log in logs:
        actor = admin_map.get(log.admin_id)
        items.append({
            "id": log.id,
            "admin_id": log.admin_id,
            "admin_name": (actor.full_name or actor.username) if actor else str(log.admin_id),
            "admin_username": actor.username if actor else None,
            "action": log.action,
            "action_label": ACTION_LABELS.get(log.action, log.action),
            "target_type": log.target_type,
            "target_id": log.target_id,
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        })

    return {"items": items, "total": total, "page": page, "limit": limit}
