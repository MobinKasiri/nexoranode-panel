from __future__ import annotations

from datetime import datetime

from panel.services.datetime_utils import parse_optional_datetime


def test_parse_optional_datetime_none():
    assert parse_optional_datetime(None) is None
    assert parse_optional_datetime("") is None
    assert parse_optional_datetime("   ") is None


def test_parse_optional_datetime_naive():
    assert parse_optional_datetime("2026-06-22T23:59") == datetime(2026, 6, 22, 23, 59)


def test_parse_optional_datetime_z_suffix():
    dt = parse_optional_datetime("2026-06-22T20:29:00.000Z")
    assert dt == datetime(2026, 6, 22, 20, 29)


def test_parse_optional_datetime_offset():
    dt = parse_optional_datetime("2026-06-22T23:59:00+03:30")
    assert dt == datetime(2026, 6, 22, 20, 29)
