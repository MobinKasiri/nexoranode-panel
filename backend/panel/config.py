from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

DEFAULT_SHARED_DATA_DIR = Path("/data/plans")
DEFAULT_WRITABLE_PLANS_FILE = DEFAULT_SHARED_DATA_DIR / "plans.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://nexora:nexora@localhost:5432/nexorabot"
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480
    JWT_REFRESH_DAYS: int = 30

    INITIAL_ADMIN_USERNAME: str = "admin"
    INITIAL_ADMIN_PASSWORD: str = ""
    INITIAL_ADMIN_FULLNAME: str = "مدیر"

    XUI_HOST: str = "https://p.nexoranode.xyz:2057"
    XUI_PATH: str = "/F9Ax1FO5Oh7yWLk8Ww"
    XUI_USERNAME: str = ""
    XUI_PASSWORD: str = ""
    XUI_TOKEN: str | None = None
    XUI_SUB_BASE_URL: str = "https://sub.manchesterchocolates.ir/s/"
    XUI_SUB_CLASH_BASE_URL: str = ""
    XUI_INBOUND_FILTER: str = ""
    XUI_START_AFTER_FIRST_USE: bool = True
    XUI_DEFAULT_DURATION_DAYS: int = 30
    NODE_SYNC_ENABLED: bool = False
    NODE_SSH_USER: str = "root"
    NODE_SSH_PORT: int = 22
    NODE_SSH_IDENTITY: str = ""

    BOT_TOKEN: str = ""
    BOT_API_URL: str = "https://api.telegram.org/bot"

    FRONTEND_URL: str = "https://manage.nexoranode.xyz"
    # Shared with bot container /app/data (host: .../app/data → /data/plans in panel)
    BOT_DATA_DIR: str = "/data/plans"
    PLANS_FILE: str = "/data/plans/plans.json"
    BOT_ROOT: str = "/bot"

    REFERRAL_BONUS_TOMAN: int = 50000
    REFERRAL_FRIEND_BONUS_TOMAN: int = 0
    QUANTITY_MAX: int = 20

    CARD_NUMBER: str = ""
    CARD_OWNER: str = ""
    CARD_BANK: str = ""

    CSRF_SECRET: str = "csrf-change-me"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def resolve_shared_data_dir(settings: Settings | None = None) -> Path:
    """Directory shared with the bot (/app/data on host bind mount)."""
    settings = settings or get_settings()
    configured = Path(settings.BOT_DATA_DIR)
    if configured.is_absolute():
        return configured
    return DEFAULT_SHARED_DATA_DIR


def resolve_plans_write_path(settings: Settings | None = None) -> Path:
    """Canonical writable plans.json — same file the bot reads."""
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

    if configured.is_absolute():
        return configured

    return resolve_shared_data_dir(settings) / "plans.json"


def _maintenance_bot_candidates(settings: Settings) -> list[Path]:
    root = Path(settings.BOT_ROOT)
    return [
        root / "app" / "data" / "maintenance.json",
        root / "maintenance.json",
    ]


def mirror_maintenance_to_bot(
    state: dict,
    settings: Settings | None = None,
) -> dict:
    """After panel save, copy maintenance.json to bot-side paths when writable."""
    settings = settings or get_settings()
    canonical = resolve_shared_data_dir(settings) / "maintenance.json"
    shared_mount = False
    try:
        if canonical.resolve() == (resolve_shared_data_dir(settings) / "maintenance.json").resolve():
            shared_mount = True
    except OSError:
        shared_mount = str(canonical).endswith("/data/plans/maintenance.json")

    mirrored: list[str] = []
    skipped: list[str] = []

    for bot_p in _maintenance_bot_candidates(settings):
        if _same_path(bot_p, canonical):
            mirrored.append(str(bot_p))
            continue
        if _mirror_plans_data(state, bot_p):
            mirrored.append(str(bot_p))
            logger.info("Mirrored maintenance to bot path %s", bot_p)
        elif _plans_content_matches(canonical, bot_p):
            mirrored.append(str(bot_p))
        else:
            skipped.append(str(bot_p))

    return {
        "canonical": str(canonical),
        "mirrored": mirrored,
        "skipped": skipped,
        "shared_mount": shared_mount,
    }


def _plans_bot_candidates(settings: Settings) -> list[Path]:
    root = Path(settings.BOT_ROOT)
    return [
        root / "app" / "data" / "plans.json",
        root / "plans.json",
    ]


def _plans_read_candidates(settings: Settings) -> list[Path]:
    """Writable shared path first — must match what the bot loads."""
    seen: set[str] = set()
    paths: list[Path] = []

    for path in [resolve_plans_write_path(settings), *_plans_bot_candidates(settings)]:
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


def resolve_bot_token(settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    token = (settings.BOT_TOKEN or "").strip()
    if token:
        return token
    bot_env = _parse_env_file(Path(settings.BOT_ROOT) / ".env")
    return (bot_env.get("BOT_TOKEN") or "").strip()


def _env_pick(settings: Settings, bot_env: dict[str, str], key: str, panel_val: str | None) -> str:
    val = (panel_val or "").strip()
    if val:
        return val
    return (bot_env.get(key) or "").strip()


def _normalize_xui_host(host: str) -> str:
    """Panel runs in Docker; bot .env may use 127.0.0.1 for co-located 3X-UI (port 2057)."""
    from urllib.parse import urlparse, urlunparse

    raw = (host or "").strip()
    if not raw:
        return raw
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    netloc = parsed.netloc
    # Legacy typo in examples — 3X-UI is on 2057, not 2087
    if parsed.port == 2087:
        logger.warning("XUI_HOST port 2087 is wrong for this stack — using 2057 (3X-UI panel)")
        netloc = netloc.replace(":2087", ":2057", 1)
    if parsed.hostname in ("127.0.0.1", "localhost"):
        netloc = netloc.replace(parsed.hostname, "host.docker.internal", 1)
    if netloc != parsed.netloc:
        return urlunparse(parsed._replace(netloc=netloc))
    return raw


def resolve_xui_settings(settings: Settings | None = None) -> dict:
    """Panel .env first, then bot /bot/.env (same as Telegram token fallback)."""
    settings = settings or get_settings()
    bot_env = _parse_env_file(Path(settings.BOT_ROOT) / ".env")
    token = _env_pick(settings, bot_env, "XUI_TOKEN", settings.XUI_TOKEN)
    inbound_filter = _env_pick(settings, bot_env, "XUI_INBOUND_FILTER", settings.XUI_INBOUND_FILTER)
    start_raw = _env_pick(settings, bot_env, "XUI_START_AFTER_FIRST_USE", "")
    if start_raw:
        start_after = start_raw.lower() in ("1", "true", "yes", "on")
    else:
        start_after = settings.XUI_START_AFTER_FIRST_USE
    days_raw = _env_pick(settings, bot_env, "XUI_DEFAULT_DURATION_DAYS", "")
    default_days = int(days_raw) if days_raw.isdigit() else settings.XUI_DEFAULT_DURATION_DAYS
    return {
        "HOST": _normalize_xui_host(
            _env_pick(settings, bot_env, "XUI_HOST", settings.XUI_HOST) or settings.XUI_HOST
        ),
        "PATH": _env_pick(settings, bot_env, "XUI_PATH", settings.XUI_PATH) or settings.XUI_PATH,
        "USERNAME": _env_pick(settings, bot_env, "XUI_USERNAME", settings.XUI_USERNAME),
        "PASSWORD": _env_pick(settings, bot_env, "XUI_PASSWORD", settings.XUI_PASSWORD),
        "TOKEN": token or None,
        "SUB_BASE_URL": _env_pick(settings, bot_env, "XUI_SUB_BASE_URL", settings.XUI_SUB_BASE_URL)
        or settings.XUI_SUB_BASE_URL,
        "SUB_CLASH_BASE_URL": _env_pick(
            settings, bot_env, "XUI_SUB_CLASH_BASE_URL", settings.XUI_SUB_CLASH_BASE_URL
        )
        or settings.XUI_SUB_CLASH_BASE_URL,
        "INBOUND_FILTER": tuple(
            p.strip() for p in inbound_filter.split(",") if p.strip()
        ),
        "START_AFTER_FIRST_USE": start_after,
        "DEFAULT_DURATION_DAYS": default_days,
        "NODE_SYNC_ENABLED": settings.NODE_SYNC_ENABLED,
        "NODE_SSH_USER": settings.NODE_SSH_USER,
        "NODE_SSH_PORT": settings.NODE_SSH_PORT,
        "NODE_SSH_IDENTITY": settings.NODE_SSH_IDENTITY,
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


def _same_path(a: Path, b: Path) -> bool:
    try:
        return a.resolve() == b.resolve()
    except OSError:
        return str(a) == str(b)


def _atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.tmp"
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=3)
        fh.write("\n")
        fh.flush()
        os.fsync(fh.fileno())
    tmp.replace(path)


def _mirror_plans_data(data: dict, target: Path) -> bool:
    """Copy plans to another path when it is a separate file and writable."""
    if not target.parent.exists() and not target.parent.parent.exists():
        return False
    try:
        if target.exists() and not os.access(target, os.W_OK):
            return False
        if target.parent.exists() and not os.access(target.parent, os.W_OK):
            return False
        _atomic_write_json(target, data)
        return True
    except OSError as exc:
        logger.warning("Could not mirror plans to %s: %s", target, exc)
        return False


def _plans_content_matches(a: Path, b: Path) -> bool:
    """Same JSON via shared host bind mount (panel rw path, bot ro path)."""
    try:
        return a.is_file() and b.is_file() and a.read_bytes() == b.read_bytes()
    except OSError:
        return False


def mirror_plans_to_bot(settings: Settings | None = None, data: dict | None = None) -> dict:
    """After panel save, ensure bot-side paths have the same JSON."""
    settings = settings or get_settings()
    canonical = resolve_plans_write_path(settings)
    payload = data if data is not None else (_read_plans_file(canonical) or {})

    if not payload:
        return {"mirrored": [], "skipped": [], "canonical": str(canonical), "in_sync": True}

    shared_dir = resolve_shared_data_dir(settings)
    try:
        canonical_resolved = canonical.resolve()
        shared_plans = (shared_dir / "plans.json").resolve()
        if canonical_resolved == shared_plans:
            # Bot container reads PLANS_FILE=/app/data/plans.json on the same host mount.
            return {
                "canonical": str(canonical),
                "mirrored": [str(canonical)],
                "skipped": [],
                "in_sync": True,
                "shared_mount": True,
            }
    except OSError:
        if str(canonical).endswith("/data/plans/plans.json"):
            return {
                "canonical": str(canonical),
                "mirrored": [str(canonical)],
                "skipped": [],
                "in_sync": True,
                "shared_mount": True,
            }

    mirrored: list[str] = []
    skipped: list[str] = []

    for bot_p in _plans_bot_candidates(settings):
        if _same_path(bot_p, canonical):
            mirrored.append(str(bot_p))
            continue
        if _mirror_plans_data(payload, bot_p):
            mirrored.append(str(bot_p))
            logger.info("Mirrored plans to bot path %s", bot_p)
        elif _plans_content_matches(canonical, bot_p):
            mirrored.append(str(bot_p))
            logger.info("Bot plans already match canonical via shared mount: %s", bot_p)
        else:
            skipped.append(str(bot_p))

    return {
        "canonical": str(canonical),
        "mirrored": mirrored,
        "skipped": skipped,
        "in_sync": len(skipped) == 0,
    }


def reconcile_plans_files(settings: Settings | None = None) -> dict:
    """On startup: merge panel + bot plans files if they diverged."""
    settings = settings or get_settings()
    canonical = resolve_plans_write_path(settings)
    canonical.parent.mkdir(parents=True, exist_ok=True)

    canonical_data = _read_plans_file(canonical)
    canonical_mtime = canonical.stat().st_mtime if canonical.is_file() else 0.0

    actions: list[str] = []
    warnings: list[str] = []

    for bot_p in _plans_bot_candidates(settings):
        if not bot_p.is_file():
            continue
        if _same_path(bot_p, canonical):
            actions.append(f"shared:{bot_p}")
            continue

        bot_data = _read_plans_file(bot_p)
        if not bot_data:
            continue

        bot_mtime = bot_p.stat().st_mtime

        if canonical_data:
            if bot_mtime > canonical_mtime:
                _atomic_write_json(canonical, bot_data)
                canonical_data = bot_data
                actions.append(f"pulled:{bot_p}->{canonical}")
            elif bot_mtime < canonical_mtime:
                if _mirror_plans_data(canonical_data, bot_p):
                    actions.append(f"pushed:{canonical}->{bot_p}")
                else:
                    warnings.append(
                        f"Bot plans at {bot_p} is older than panel file but not writable. "
                        f"Set PLANS_DIR_HOST to the bot app/data directory."
                    )
            else:
                actions.append(f"unchanged:{bot_p}")
        else:
            _atomic_write_json(canonical, bot_data)
            canonical_data = bot_data
            actions.append(f"seeded:{bot_p}->{canonical}")

    if not canonical_data:
        ensure_plans_file(settings)

    sync = mirror_plans_to_bot(settings, canonical_data or {})
    return {
        "canonical": str(canonical),
        "actions": actions,
        "warnings": warnings,
        **sync,
    }


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

    for src in _plans_read_candidates(settings):
        if _same_path(src, path):
            continue
        src_data = _read_plans_file(src)
        if src_data:
            logger.info("Seeding plans from %s -> %s", src, path)
            _atomic_write_json(path, src_data)
            return path

    for example in (
        path.parent / "plans.example.json",
        Path(settings.BOT_ROOT) / "app" / "data" / "plans.example.json",
    ):
        if example.is_file():
            ex_data = _read_plans_file(example)
            if ex_data:
                logger.info("Seeding plans from example %s -> %s", example, path)
                _atomic_write_json(path, ex_data)
                return path

    if not path.exists():
        path.write_text("{}\n", encoding="utf-8")
    return path


def load_plans(settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    _, data = _first_readable_plans(settings)
    return data


def save_plans(data: dict, settings: Settings | None = None) -> tuple[Path, dict]:
    settings = settings or get_settings()
    path = ensure_plans_file(settings)

    if path.is_dir():
        raise OSError(f"{path} is a directory — fix PLANS_DIR_HOST mount in docker-compose")

    _atomic_write_json(path, data)
    sync = mirror_plans_to_bot(settings, data)
    return path, sync


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
    from panel.bot_bridge.bootstrap import bootstrap_bot_xui_imports

    bootstrap_bot_xui_imports()


def plans_diagnostics(settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    write_path = resolve_plans_write_path(settings)
    read_path = resolve_plans_read_path(settings)
    bot_paths = _plans_bot_candidates(settings)

    def _path_info(p: Path) -> dict:
        info = {
            "path": str(p),
            "exists": p.exists(),
            "is_file": p.is_file(),
            "readable": _read_plans_file(p) is not None,
            "same_as_canonical": _same_path(p, write_path) if p.exists() or write_path.exists() else False,
        }
        if p.is_file():
            info["mtime"] = p.stat().st_mtime
        try:
            info["resolved"] = str(p.resolve())
        except OSError:
            info["resolved"] = str(p)
        return info

    return {
        "shared_data_dir": str(resolve_shared_data_dir(settings)),
        "plans_file_env": settings.PLANS_FILE,
        "bot_data_dir_env": settings.BOT_DATA_DIR,
        "write_path": str(write_path),
        "read_path": str(read_path) if read_path else None,
        "read_matches_write": _same_path(read_path, write_path) if read_path else False,
        "bot_plans_path": str(bot_paths[0]),
        "paths_in_sync": all(
            _same_path(write_path, p) or not p.is_file() or _same_path(write_path, p)
            for p in bot_paths
        ),
        "candidates": [_path_info(p) for p in _plans_read_candidates(settings)],
    }
