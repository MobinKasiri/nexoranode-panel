"""Read receipt images saved by the bot under /bot/app/data/receipts/."""
from __future__ import annotations

from pathlib import Path

from panel.config import get_settings


def _media_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".gif":
        return "image/gif"
    return "image/jpeg"


def _receipt_search_dirs() -> list[Path]:
    settings = get_settings()
    dirs = [
        Path(settings.BOT_ROOT) / "app" / "data" / "receipts",
        Path("/data/plans/receipts"),
    ]
    seen: set[str] = set()
    out: list[Path] = []
    for d in dirs:
        key = str(d)
        if key not in seen:
            seen.add(key)
            out.append(d)
    return out


def find_local_receipt(tx_id: int) -> tuple[Path, str] | None:
    for base in _receipt_search_dirs():
        for name in (f"{tx_id}.jpg", f"{tx_id}.jpeg", f"{tx_id}.png", f"{tx_id}.webp"):
            path = base / name
            if path.is_file() and path.stat().st_size > 0:
                return path, _media_type(path)
    return None
