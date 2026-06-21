from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from panel.auth.dependencies import require_superadmin


@pytest.mark.asyncio
async def test_require_superadmin_blocks_admin():
    admin = MagicMock(role="admin")
    with pytest.raises(HTTPException) as exc:
        await require_superadmin(admin)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_superadmin_allows():
    admin = MagicMock(role="superadmin")
    result = await require_superadmin(admin)
    assert result is admin


@pytest.mark.asyncio
async def test_remove_admin_self_blocked():
    from panel.routers.settings import remove_admin

    superadmin = MagicMock(id=1, role="superadmin", username="root")
    target = MagicMock(id=1, role="superadmin", username="root", is_active=True)
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = target
    session.execute = AsyncMock(return_value=result)

    with pytest.raises(HTTPException) as exc:
        await remove_admin(1, session, superadmin)
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_remove_admin_superadmin_target_blocked():
    from panel.routers.settings import remove_admin

    superadmin = MagicMock(id=1, role="superadmin", username="root")
    target = MagicMock(id=2, role="superadmin", username="other", is_active=True)
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = target
    session.execute = AsyncMock(return_value=result)

    with pytest.raises(HTTPException) as exc:
        await remove_admin(2, session, superadmin)
    assert exc.value.status_code == 409
