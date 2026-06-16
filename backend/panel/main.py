from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import select

from panel.auth.router import limiter, router as auth_router
from panel.config import ensure_bot_path, get_settings
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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_initial_admin()
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
        allow_origins=[cfg.FRONTEND_URL, "http://localhost:3000"],
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
        return {"status": "ok"}

    return app


app = create_app()
