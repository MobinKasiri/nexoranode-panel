from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

DEFAULT_WRITABLE_PLANS_FILE = Path("/data/plans/plans.json")


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
    # Leave empty to attach new clients to ALL enabled panel inbounds (multi-location).
    # Optional comma-separated inbound remarks, e.g. "🇩🇪 NX AC,🇵🇱 PL-N1"
    XUI_INBOUND_FILTER: str = ""
    XUI_START_AFTER_FIRST_USE: bool = True
    XUI_DEFAULT_DURATION_DAYS: int = 30

    BOT_TOKEN: str = ""
    BOT_API_URL: str = "https://api.telegram.org/bot"

    FRONTEND_URL: str = "https://manage.nexoranode.xyz"
    PLANS_FILE: str = "/data/plans/plans.json"
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


def resolve_plans_write_path(settings: Settings | None = None) -> Path:
    """Always return a writable path; never write under the read-only /bot mount."""
    settings = settings or get_settings()
    configured = Path(settings.PLANS_FILE)
    configured_str = str(configured)

    if configured_str.startswith("/bot"):
        return DEFAULT_WRITABLE_PLANS_FILE

    try:
        bot_root = str(Path(settings.BOT_ROOT).resolve())
        if configured_str.startswith(bot_root):
            return DEFAULT_WRITABLE_PLANS_FILE
    except OSError:
        pass

    return configured


def _plans_bot_candidates(settings: Settings) -> list[Path]:
    root = Path(settings.BOT_ROOT)
    return [
        root / "app" / "data" / "plans.json",
        root / "plans.json",
    ]


def _plans_read_candidates(settings: Settings) -> list[Path]:
    """Ordered list of paths to try when loading plans (bot copy first)."""
    seen: set[str] = set()
    paths: list[Path] = []

    for path in [*_plans_bot_candidates(settings), resolve_plans_write_path(settings)]:
        key = str(path)
        if key not in seen:
            seen.add(key)
            paths.append(path)

    return paths


def _parse_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, raw = line.partition("=")
        val = raw.strip().strip('"').strip("'")
        values[key.strip()] = val
    return values


def load_payment_info(settings: Settings | None = None) -> dict[str, str]:
    """Payment card info — panel .env first, then bot .env on the shared /bot mount."""
    settings = settings or get_settings()
    card = settings.CARD_NUMBER
    owner = settings.CARD_OWNER
    bank = settings.CARD_BANK

    if not (card and owner):
        bot_env = _parse_env_file(Path(settings.BOT_ROOT) / ".env")
        card = card or bot_env.get("CARD_NUMBER", "")
        owner = owner or bot_env.get("CARD_OWNER", "")
        bank = bank or bot_env.get("CARD_BANK", "")

    return {
        "card_number": card,
        "card_owner": owner,
        "card_bank": bank,
    }


def _read_plans_file(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict) and data:
            return data
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not read plans from %s: %s", path, exc)
    return None


def resolve_plans_read_path(settings: Settings | None = None) -> Path | None:
    settings = settings or get_settings()
    for path in _plans_read_candidates(settings):
        if _read_plans_file(path) is not None:
            return path
    return None


def _first_readable_plans(settings: Settings) -> tuple[Path | None, dict]:
    for path in _plans_read_candidates(settings):
        data = _read_plans_file(path)
        if data is not None:
            return path, data
    return None, {}


def ensure_plans_file(settings: Settings | None = None) -> Path:
    """Ensure writable plans.json exists; seed from bot read-only copy if needed."""
    settings = settings or get_settings()
    path = resolve_plans_write_path(settings)

    if path.is_dir():
        raise OSError(
            f"{path} is a directory (bad Docker bind mount). "
            "Mount the app/data directory instead of plans.json file."
        )

    existing = _read_plans_file(path)
    if existing:
        return path

    path.parent.mkdir(parents=True, exist_ok=True)

    src_path, src_data = _first_readable_plans(settings)
    if src_path and src_path != path and src_data:
        logger.info("Seeding plans from %s -> %s", src_path, path)
        with path.open("w", encoding="utf-8") as fh:
            json.dump(src_data, fh, ensure_ascii=False, indent=3)
            fh.write("\n")
        return path

    # Writable file missing/empty — copy from bot path even if it equals write path candidate
    for src in _plans_bot_candidates(settings):
        src_data = _read_plans_file(src)
        if src_data:
            logger.info("Seeding plans from bot path %s -> %s", src, path)
            with path.open("w", encoding="utf-8") as fh:
                json.dump(src_data, fh, ensure_ascii=False, indent=3)
                fh.write("\n")
            return path

    if not path.exists():
        path.write_text("{}\n", encoding="utf-8")
    return path


def load_plans(settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    _, data = _first_readable_plans(settings)
    return data


def save_plans(data: dict, settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    path = ensure_plans_file(settings)

    if path.is_dir():
        raise OSError(f"{path} is a directory — fix PLANS_DIR_HOST mount in docker-compose")

    tmp = path.parent / f".{path.name}.tmp"
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


def plans_diagnostics(settings: Settings | None = None) -> dict:
    """Debug info for troubleshooting mount/path issues."""
    settings = settings or get_settings()
    write_path = resolve_plans_write_path(settings)
    read_path = resolve_plans_read_path(settings)
    return {
        "plans_file_env": settings.PLANS_FILE,
        "write_path": str(write_path),
        "write_exists": write_path.exists(),
        "write_is_file": write_path.is_file(),
        "write_is_dir": write_path.is_dir(),
        "read_path": str(read_path) if read_path else None,
        "candidates": [
            {
                "path": str(p),
                "exists": p.exists(),
                "is_file": p.is_file(),
                "is_dir": p.is_dir(),
                "readable": _read_plans_file(p) is not None,
            }
            for p in _plans_read_candidates(settings)
        ],
    }
