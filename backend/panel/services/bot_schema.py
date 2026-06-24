"""Keep bot PostgreSQL schema in sync when alembic was not run after deploy."""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from panel.config import ensure_bot_path, get_settings

logger = logging.getLogger(__name__)

# Fallback if alembic cannot run (read-only mount, import error, etc.)
_COLUMN_PATCHES: tuple[tuple[str, str, str], ...] = (
    ("users", "channel_gate_passed", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("referrals", "friend_welcome_code", "VARCHAR(50)"),
)


def _run_alembic_upgrade() -> None:
    settings = get_settings()
    bot_root = Path(settings.BOT_ROOT)
    ini_path = bot_root / "app" / "db" / "alembic.ini"
    if not ini_path.is_file():
        logger.warning("Bot alembic.ini missing at %s", ini_path)
        return

    ensure_bot_path()
    os.environ["DATABASE_URL"] = settings.DATABASE_URL

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(ini_path))
    prev_cwd = os.getcwd()
    try:
        os.chdir(bot_root)
        command.upgrade(cfg, "head")
        logger.info("Bot database schema upgraded via alembic (head)")
    finally:
        os.chdir(prev_cwd)


async def _patch_missing_columns(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        for table, column, ddl in _COLUMN_PATCHES:
            exists = await conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = :t AND column_name = :c"
                ),
                {"t": table, "c": column},
            )
            if exists.scalar() is not None:
                continue
            await conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}")
            )
            logger.info("Patched missing column %s.%s", table, column)


async def ensure_bot_schema(engine: AsyncEngine) -> None:
    """Run bot alembic migrations, then apply any remaining column patches."""
    try:
        await asyncio.to_thread(_run_alembic_upgrade)
    except Exception as exc:
        logger.warning("Alembic upgrade failed (%s) — applying column patches", exc)
    try:
        await _patch_missing_columns(engine)
    except Exception as exc:
        logger.error("Bot schema patch failed: %s", exc)
        raise
