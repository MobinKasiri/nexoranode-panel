from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from panel.auth.dependencies import get_current_admin
from panel.db.models import AdminUser
from panel.db.session import get_db
from panel.main import create_app


@pytest.fixture
def mock_admin() -> AdminUser:
    admin = MagicMock(spec=AdminUser)
    admin.id = 1
    admin.username = "testadmin"
    admin.role = "superadmin"
    admin.is_active = True
    return admin


@pytest.fixture
def mock_session() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
async def client(mock_admin: AdminUser, mock_session: AsyncMock):
    with patch("panel.main._init_database", AsyncMock(return_value=True)), patch(
        "panel.main.ensure_plans_file", return_value="/tmp/plans.json"
    ):
        app = create_app()

    async def _admin():
        return mock_admin

    async def _db():
        yield mock_session

    app.dependency_overrides[get_current_admin] = _admin
    app.dependency_overrides[get_db] = _db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
