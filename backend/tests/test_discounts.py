from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import MagicMock

from panel.routers.discount import _discount_status


def test_discount_status_active():
    code = MagicMock(is_active=True, expires_at=None, used_count=0, max_uses=10)
    assert _discount_status(code, datetime.utcnow()) == "active"


def test_discount_status_expired():
    code = MagicMock(
        is_active=True,
        expires_at=datetime.utcnow() - timedelta(hours=1),
        used_count=0,
        max_uses=10,
    )
    assert _discount_status(code, datetime.utcnow()) == "expired"


def test_discount_status_exhausted():
    code = MagicMock(is_active=True, expires_at=None, used_count=10, max_uses=10)
    assert _discount_status(code, datetime.utcnow()) == "exhausted"


def test_discount_status_disabled():
    code = MagicMock(is_active=False, expires_at=None, used_count=0, max_uses=10)
    assert _discount_status(code, datetime.utcnow()) == "disabled"
