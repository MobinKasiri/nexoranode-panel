from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import select, text

from panel.auth.router import limiter, router as auth_router
from panel.config import ensure_bot_path, ensure_plans_file, get_settings
from panel.db.models import AdminUser, Base
from panel.db.session import async_session, engine
from panel.auth.security import hash_password
from panel.routers import (
    broadcast,
    configs,
    dashboard,
    discount,
    reports,
    server,
    settings as settings_router,
    transactions,
    users,
)

logger = logging.getLogger(__name__)

_db_ready = False


async def _init_database() -> bool:
    """Create panel tables and seed admin. Retries until postgres is reachable."""
    global _db_ready
    for attempt in range(1, 31):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            await seed_initial_admin()
            _db_ready = True
            logger.info("Database connected.")
            return True
        except Exception as exc:
            _db_ready = False
            logger.warning("Database not ready (attempt %s/30): %s", attempt, exc)
            if attempt < 30:
                await asyncio.sleep(2)
    logger.error(
        "Database unavailable after 30 attempts. "
        "Check DATABASE_URL and DOCKER_NETWORK match bot/postgres."
    )
    return False


async def seed_initial_admin() -> None:
    settings = get_settings()
    if not settings.INITIAL_ADMIN_PASSWORD:
        return
    async with async_session() as session:
        result = await session.execute(
            select(AdminUser).where(AdminUser.username == settings.INITIAL_ADMIN_USERNAME)
        )
        if result.scalar_one_or_none():
            return
        admin = AdminUser(
            username=settings.INITIAL_ADMIN_USERNAME,
            password_hash=hash_password(settings.INITIAL_ADMIN_PASSWORD),
            full_name=settings.INITIAL_ADMIN_FULLNAME,
            role="superadmin",
        )
        session.add(admin)
        await session.commit()
        logger.info("Seeded initial admin: %s", settings.INITIAL_ADMIN_USERNAME)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_bot_path()
    try:
        plans_path = ensure_plans_file()
        logger.info("Plans file ready at %s", plans_path)
    except OSError as exc:
        logger.warning("Could not initialize plans file: %s", exc)
    await _init_database()
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(title="Nexoranode Admin API", version="1.0.0", lifespan=lifespan)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            cfg.FRONTEND_URL,
            "http://localhost:3000",
            "https://manage.nexoranode.xyz:2053",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(dashboard.router)
    app.include_router(transactions.router)
    app.include_router(users.router)
    app.include_router(configs.router)
    app.include_router(discount.router)
    app.include_router(broadcast.router)
    app.include_router(reports.router)
    app.include_router(server.router)
    app.include_router(settings_router.router)

    @app.get("/health")
    async def health():
        if not _db_ready:
            return {"status": "starting", "db": "connecting"}
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return {"status": "ok", "db": "ok"}
        except Exception as exc:
            logger.warning("Health DB check failed: %s", exc)
            return {"status": "degraded", "db": "error"}

    return app


app = create_app()
