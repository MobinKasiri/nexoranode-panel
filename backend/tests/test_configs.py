from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from httpx import AsyncClient

from panel.services.config_ops import sync_all_configs, toggle_config


@pytest.mark.asyncio
async def test_toggle_config_not_found(mock_session: AsyncMock):
    mock_vpn = MagicMock()
    mock_vpn.get = AsyncMock(return_value=None)
    with patch("panel.services.config_ops.ensure_bot_path"), patch(
        "app.db.models.VPNConfig", mock_vpn
    ):
        with pytest.raises(HTTPException) as exc:
            await toggle_config(mock_session, 99, admin_id=1)
        assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_toggle_config_xui_error(mock_session: AsyncMock):
    config = MagicMock()
    config.id = 1
    config.is_active = True

    vpn = AsyncMock()
    vpn.set_enabled = AsyncMock(side_effect=RuntimeError("panel down"))

    mock_vpn_cls = MagicMock()
    mock_vpn_cls.get = AsyncMock(return_value=config)

    with patch("panel.services.config_ops.ensure_bot_path"), patch(
        "app.db.models.VPNConfig", mock_vpn_cls
    ), patch(
        "panel.services.config_ops.require_vpn_service", AsyncMock(return_value=vpn)
    ):
        with pytest.raises(HTTPException) as exc:
            await toggle_config(mock_session, 1, admin_id=1)
        assert exc.value.status_code == 502


@pytest.mark.asyncio
async def test_toggle_config_success(mock_session: AsyncMock):
    config = MagicMock()
    config.id = 1
    config.is_active = True

    updated = MagicMock()
    updated.is_active = False

    vpn = AsyncMock()
    vpn.set_enabled = AsyncMock()

    mock_vpn_cls = MagicMock()
    mock_vpn_cls.get = AsyncMock(side_effect=[config, updated])

    with patch("panel.services.config_ops.ensure_bot_path"), patch(
        "app.db.models.VPNConfig", mock_vpn_cls
    ), patch(
        "panel.services.config_ops.require_vpn_service", AsyncMock(return_value=vpn)
    ), patch("panel.services.config_ops.log_action", AsyncMock()):
        result = await toggle_config(mock_session, 1, admin_id=1)
        assert result["is_active"] is False


@pytest.mark.asyncio
async def test_sync_all_partial_failure(mock_session: AsyncMock):
    c1 = MagicMock(id=1)
    c2 = MagicMock(id=2)

    exec_result = MagicMock()
    exec_result.scalars.return_value.all.return_value = [c1, c2]
    mock_session.execute = AsyncMock(return_value=exec_result)

    vpn = AsyncMock()

    async def _refresh(session, cfg):
        if cfg.id == 2:
            raise RuntimeError("fail")

    vpn.refresh_traffic = AsyncMock(side_effect=_refresh)

    with patch("panel.services.config_ops.ensure_bot_path"), patch(
        "app.db.models.VPNConfig", MagicMock()
    ), patch(
        "panel.services.config_ops.require_vpn_service", AsyncMock(return_value=vpn)
    ), patch("panel.services.config_ops.log_action", AsyncMock()):
        result = await sync_all_configs(mock_session, admin_id=1)
        assert result["synced"] == 1
        assert result["total"] == 2
        assert len(result["failed"]) == 1


@pytest.mark.asyncio
async def test_delete_config_endpoint_queues(client: AsyncClient):
    config = MagicMock()
    config.id = 5

    mock_vpn_cls = MagicMock()
    mock_vpn_cls.get = AsyncMock(return_value=config)

    with patch("panel.routers.configs.ensure_bot_path"), patch(
        "app.db.models.VPNConfig", mock_vpn_cls
    ):
        resp = await client.delete("/configs/5")
        assert resp.status_code == 202
        assert resp.json()["queued"] is True


@pytest.mark.asyncio
async def test_delete_config_endpoint_not_found(client: AsyncClient):
    mock_vpn_cls = MagicMock()
    mock_vpn_cls.get = AsyncMock(return_value=None)

    with patch("panel.routers.configs.ensure_bot_path"), patch(
        "app.db.models.VPNConfig", mock_vpn_cls
    ):
        resp = await client.delete("/configs/404")
        assert resp.status_code == 404
