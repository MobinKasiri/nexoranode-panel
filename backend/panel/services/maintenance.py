from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from panel.config import get_settings, resolve_shared_data_dir
from panel.services.datetime_utils import parse_optional_datetime

logger = logging.getLogger(__name__)

MAINTENANCE_FILENAME = "maintenance.json"

MAINTENANCE_PRESETS: dict[str, str] = {
    "developing": (
        "🔧 <b>ربات در حال توسعه است</b>\n\n"
        "در حال اضافه کردن قابلیت‌های جدید هستیم. لطفاً کمی بعد دوباره سر بزنید."
    ),
    "updating": (
        "⬆️ <b>بروزرسانی ربات</b>\n\n"
        "نسخه جدید ربات در حال نصب است. به‌زودی با امکانات بهتر برمی‌گردیم."
    ),
    "servers": (
        "🖥 <b>بروزرسانی سرورها</b>\n\n"
        "سرورها در حال ارتقا هستند تا اتصال پایدارتر و سریع‌تری داشته باشید."
    ),
    "bugfix": (
        "🛠 <b>رفع مشکل فنی</b>\n\n"
        "یک مشکل فنی شناسایی شده و در حال رفع آن هستیم. از صبر شما سپاسگزاریم."
    ),
    "maintenance": (
        "⏸ <b>غیرفعال موقت</b>\n\n"
        "ربات به‌صورت موقت غیرفعال شده است. لطفاً بعداً دوباره تلاش کنید."
    ),
}


def maintenance_file_path() -> Path:
    return resolve_shared_data_dir(get_settings()) / MAINTENANCE_FILENAME


def _default_state() -> dict[str, Any]:
    return {
        "enabled": False,
        "reason": "maintenance",
        "custom_message": None,
        "ends_at": None,
        "updated_at": None,
        "updated_by_admin_id": None,
    }


def load_maintenance() -> dict[str, Any]:
    path = maintenance_file_path()
    if not path.is_file():
        return _default_state()
    try:
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            return _default_state()
        state = {**_default_state(), **data}
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not read maintenance file %s: %s", path, exc)
        return _default_state()

    if state.get("enabled") and state.get("ends_at"):
        try:
            ends = datetime.fromisoformat(str(state["ends_at"]).replace("Z", "+00:00"))
            if ends.tzinfo:
                ends = ends.replace(tzinfo=None)
            if ends <= datetime.utcnow():
                state["enabled"] = False
        except ValueError:
            pass
    return state


def save_maintenance(state: dict[str, Any]) -> Path:
    path = maintenance_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.tmp"
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(state, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    tmp.replace(path)
    return path


def remaining_persian(ends_at: str | None) -> str | None:
    if not ends_at:
        return None
    try:
        ends = datetime.fromisoformat(ends_at.replace("Z", "+00:00"))
        if ends.tzinfo:
            ends = ends.replace(tzinfo=None)
        delta = ends - datetime.utcnow()
        if delta.total_seconds() <= 0:
            return None
        minutes = int(delta.total_seconds() // 60)
        if minutes < 60:
            return f"{minutes} دقیقه"
        hours = minutes // 60
        rem = minutes % 60
        if rem:
            return f"{hours} ساعت و {rem} دقیقه"
        return f"{hours} ساعت"
    except ValueError:
        return None


def build_user_message(state: dict[str, Any]) -> str:
    reason = state.get("reason") or "maintenance"
    base = state.get("custom_message") or MAINTENANCE_PRESETS.get(reason, MAINTENANCE_PRESETS["maintenance"])
    remaining = remaining_persian(state.get("ends_at"))
    if remaining:
        return f"{base}\n\n⏱ زمان تقریبی: <b>{remaining}</b>"
    return base


def public_maintenance_state() -> dict[str, Any]:
    state = load_maintenance()
    remaining = remaining_persian(state.get("ends_at"))
    return {
        "enabled": bool(state.get("enabled")),
        "reason": state.get("reason"),
        "custom_message": state.get("custom_message"),
        "message": build_user_message(state) if state.get("enabled") else None,
        "ends_at": state.get("ends_at"),
        "remaining": remaining,
        "updated_at": state.get("updated_at"),
        "presets": MAINTENANCE_PRESETS,
    }


def enable_maintenance(
    *,
    reason: str,
    duration_minutes: int | None = None,
    ends_at: str | None = None,
    custom_message: str | None,
    admin_id: int,
) -> dict[str, Any]:
    if reason not in MAINTENANCE_PRESETS:
        reason = "maintenance"

    end_dt: datetime | None = None
    if ends_at:
        end_dt = parse_optional_datetime(ends_at)
        if end_dt is None:
            raise ValueError("invalid ends_at")
        if end_dt <= datetime.utcnow():
            raise ValueError("ends_at must be in the future")
    elif duration_minutes is not None:
        end_dt = datetime.utcnow() + timedelta(minutes=max(1, duration_minutes))
    else:
        end_dt = datetime.utcnow() + timedelta(hours=1)

    state = {
        "enabled": True,
        "reason": reason,
        "custom_message": custom_message.strip() if custom_message else None,
        "ends_at": end_dt.replace(microsecond=0).isoformat(),
        "updated_at": datetime.utcnow().replace(microsecond=0).isoformat(),
        "updated_by_admin_id": admin_id,
    }
    save_maintenance(state)
    return public_maintenance_state()


def disable_maintenance(admin_id: int) -> dict[str, Any]:
    state = load_maintenance()
    state.update({
        "enabled": False,
        "updated_at": datetime.utcnow().replace(microsecond=0).isoformat(),
        "updated_by_admin_id": admin_id,
    })
    save_maintenance(state)
    return public_maintenance_state()
