from __future__ import annotations

from fastapi import APIRouter, Depends

from panel.auth.dependencies import require_permission
from panel.db.models import AdminUser
from panel.services.xui import get_server_health, xui_connection_status

router = APIRouter(prefix="/server", tags=["server"])


@router.get("/health")
async def server_health(_admin: AdminUser = Depends(require_permission("dashboard", "read"))):
    return await get_server_health()


@router.get("/xui")
async def xui_status(_admin: AdminUser = Depends(require_permission("configs", "read"))):
    return await xui_connection_status()
