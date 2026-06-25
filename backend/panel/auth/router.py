from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from panel.auth.dependencies import get_current_admin
from panel.auth.permissions import admin_to_dict
from panel.auth.security import (
    authenticate_admin,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from panel.config import get_settings
from panel.db.models import AdminUser
from panel.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


class LoginRequest(BaseModel):
    username: str
    password: str


class AdminOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    role_preset: str = "custom"
    permissions: dict[str, str] = {}
    is_superadmin: bool = False


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    admin: AdminOut


def _admin_out(admin: AdminUser) -> AdminOut:
    data = admin_to_dict(admin)
    return AdminOut(**data)


def _cookie_secure(request: Request) -> bool:
    override = os.getenv("COOKIE_SECURE", "").strip().lower()
    if override in {"0", "false", "no", "off"}:
        return False
    if override in {"1", "true", "yes", "on"}:
        return True
    forwarded = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    if forwarded:
        return forwarded == "https"
    return request.url.scheme == "https"


def _set_auth_cookies(request: Request, response: Response, access: str, refresh: str) -> None:
    settings = get_settings()
    secure = _cookie_secure(request)
    response.set_cookie(
        "access_token", access, httponly=True, secure=secure, samesite="lax",
        max_age=settings.JWT_EXPIRE_MINUTES * 60, path="/",
    )
    response.set_cookie(
        "refresh_token", refresh, httponly=True, secure=secure, samesite="lax",
        max_age=settings.JWT_REFRESH_DAYS * 86400, path="/",
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/15minutes")
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    admin = await authenticate_admin(session, body.username, body.password)
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="اطلاعات ورود نادرست است",
        )
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="حساب مدیر مسدود یا غیرفعال است",
        )
    access = create_access_token({"sub": admin.username, "role": admin.role})
    refresh = create_refresh_token({"sub": admin.username})
    _set_auth_cookies(request, response, access, refresh)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        admin=_admin_out(admin),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    token = request.cookies.get("refresh_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        body = await request.json() if request.headers.get("content-type") == "application/json" else {}
        token = body.get("refresh_token") if isinstance(body, dict) else None
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    from panel.auth.security import get_admin_by_username

    admin = await get_admin_by_username(session, username=payload["sub"])
    if not admin or not admin.is_active:
        raise HTTPException(status_code=401, detail="حساب مدیر مسدود یا غیرفعال است")

    access = create_access_token({"sub": admin.username, "role": admin.role})
    new_refresh = create_refresh_token({"sub": admin.username})
    _set_auth_cookies(request, response, access, new_refresh)
    return TokenResponse(
        access_token=access,
        refresh_token=new_refresh,
        admin=_admin_out(admin),
    )


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"success": True}


@router.get("/me", response_model=AdminOut)
async def me(admin: AdminUser = Depends(get_current_admin)) -> AdminOut:
    return _admin_out(admin)
