from __future__ import annotations

from datetime import datetime, timezone


def parse_optional_datetime(value: str | None) -> datetime | None:
    """Parse ISO datetime from API/JS (handles trailing Z and offsets)."""
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt
