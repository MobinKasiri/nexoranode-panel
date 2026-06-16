from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://nexora:nexora@localhost:5432/nexorabot"
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480
    JWT_REFRESH_DAYS: int = 30

    INITIAL_ADMIN_USERNAME: str = "admin"
    INITIAL_ADMIN_PASSWORD: str = ""
    INITIAL_ADMIN_FULLNAME: str = "مدیر نکسورانود"

    XUI_HOST: str = "https://p.nexoranode.xyz:2087"
    XUI_PATH: str = "/CC6AiFGmYY4ZWVRf08"
    XUI_USERNAME: str = ""
    XUI_PASSWORD: str = ""
    XUI_TOKEN: str | None = None
    XUI_SUB_BASE_URL: str = "https://s.nexoranode.xyz:2096/s/"
    XUI_WS_INBOUND_NAME: str = "NX-WS"
    XUI_REALITY_INBOUND_NAME: str = "NX-Reality"
    XUI_START_AFTER_FIRST_USE: bool = True
    XUI_DEFAULT_DURATION_DAYS: int = 30

    BOT_TOKEN: str = ""
    BOT_API_URL: str = "https://api.telegram.org/bot"

    FRONTEND_URL: str = "https://manage.nexoranode.xyz"
    # Writable path inside the panel container (mount host plans.json here in docker-compose)
    PLANS_FILE: str = "/data/plans.json"
    BOT_ROOT: str = "/bot"

    REFERRAL_BONUS_TOMAN: int = 8000
    REFERRAL_FRIEND_BONUS_TOMAN: int = 5000
    QUANTITY_MAX: int = 20

    CARD_NUMBER: str = ""
    CARD_OWNER: str = ""
    CARD_BANK: str = ""

    CSRF_SECRET: str = "csrf-change-me"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def _plans_bot_candidates(settings: Settings) -> list[Path]:
    root = Path(settings.BOT_ROOT)
    return [
        root / "app" / "data" / "plans.json",
        root / "plans.json",
    ]


def resolve_plans_read_path(settings: Settings | None = None) -> Path | None:
    """Return the best existing plans.json path for reading."""
    settings = settings or get_settings()
    write_path = Path(settings.PLANS_FILE)
    if write_path.exists():
        return write_path
    for candidate in _plans_bot_candidates(settings):
        if candidate.exists():
            return candidate
    return None


def ensure_plans_file(settings: Settings | None = None) -> Path:
    """Ensure writable plans.json exists; seed from bot read-only copy if needed."""
    settings = settings or get_settings()
    path = Path(settings.PLANS_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return path
    for src in _plans_bot_candidates(settings):
        if src.exists():
            path.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
            return path
    path.write_text("{}", encoding="utf-8")
    return path


def load_plans(settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    path = resolve_plans_read_path(settings)
    if not path:
        return {}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def save_plans(data: dict, settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    path = ensure_plans_file(settings)
    tmp = Path(f"{path}.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=3)
        fh.write("\n")
    tmp.replace(path)
    return path


def get_plan(plan_id: str, settings: Settings | None = None) -> dict | None:
    tiers = load_plans(settings)
    for tier in tiers.values():
        for plan in tier.get("plans", []):
            if plan.get("id") == plan_id:
                return {**plan, "tier_name": tier.get("name", "")}
    return None


def ensure_bot_path() -> None:
    settings = get_settings()
    bot_root = Path(settings.BOT_ROOT)
    if bot_root.exists() and str(bot_root) not in os.sys.path:
        os.sys.path.insert(0, str(bot_root))
