from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.security import decode_token, get_admin_by_username
from panel.db.models import AdminUser
from panel.db.session import get_db


async def get_current_admin(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> AdminUser:
    token = None
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    admin = await get_admin_by_username(session, username)
    if not admin or not admin.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive admin")
    return admin


async def require_superadmin(
    admin: AdminUser = Depends(get_current_admin),
) -> AdminUser:
    if admin.role != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "فقط سوپرادمین مجاز است")
    return admin
