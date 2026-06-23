from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from panel.auth.dependencies import get_current_admin, require_permission
from panel.auth.permissions import has_permission, merge_permissions
from panel.db.models import AdminUser


def _visitor_admin() -> MagicMock:
    admin = MagicMock(spec=AdminUser)
    admin.id = 2
    admin.username = "visitor"
    admin.role = "admin"
    admin.is_active = True
    admin.role_preset = "visitor"
    admin.permissions = merge_permissions("visitor", None)
    admin.banned_at = None
    admin.last_login = None
    return admin


@pytest.mark.asyncio
async def test_has_permission_visitor_cannot_write_users():
    admin = _visitor_admin()
    assert has_permission(admin, "users", "read") is True
    assert has_permission(admin, "users", "write") is False


@pytest.mark.asyncio
async def test_require_permission_blocks_visitor_write():
    dep = require_permission("users", "write")
    admin = _visitor_admin()
    with pytest.raises(HTTPException) as exc:
        await dep(admin=admin)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_superadmin_bypasses_permission():
    admin = MagicMock(spec=AdminUser)
    admin.role = "superadmin"
    assert has_permission(admin, "settings_admins", "write") is True


@pytest.mark.asyncio
async def test_banned_admin_fails_auth():
    from panel.auth.dependencies import get_current_admin

    admin = MagicMock(spec=AdminUser)
    admin.is_active = False
    admin.username = "banned"

    request = MagicMock()
    request.headers.get.return_value = "Bearer fake"
    request.cookies.get.return_value = None
    session = AsyncMock()

    with patch("panel.auth.dependencies.decode_token", return_value={"type": "access", "sub": "banned"}), patch(
        "panel.auth.dependencies.get_admin_by_username", AsyncMock(return_value=admin)
    ):
        with pytest.raises(HTTPException) as exc:
            await get_current_admin(request, session)
        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_activity_forces_admin_id_for_non_superadmin():
    from panel.routers.activity import list_activity

    visitor = _visitor_admin()
    session = AsyncMock()

    count_result = MagicMock()
    count_result.scalar_one.return_value = 0
    list_result = MagicMock()
    list_result.scalars.return_value.all.return_value = []

    session.execute = AsyncMock(side_effect=[count_result, list_result])

    out = await list_activity(
        page=1,
        limit=20,
        admin_id=999,
        action=None,
        from_date=None,
        to_date=None,
        session=session,
        admin=visitor,
    )
    assert out["total"] == 0
    assert out["items"] == []


@pytest.mark.asyncio
async def test_create_config_body_requires_valid_service_name():
    from pydantic import ValidationError

    from panel.services.config_ops import CreateConfigBody

    with pytest.raises(ValidationError):
        CreateConfigBody(user_id=123, service_name="ab", plan_gb=10, plan_days=30)
