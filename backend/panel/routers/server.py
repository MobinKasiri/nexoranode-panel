from __future__ import annotations

from fastapi import APIRouter, Depends

from panel.auth.dependencies import get_current_admin
from panel.db.models import AdminUser
from panel.services.xui import get_server_health

router = APIRouter(prefix="/server", tags=["server"])


@router.get("/health")
async def server_health(_admin: AdminUser = Depends(get_current_admin)):
    return await get_server_health()
