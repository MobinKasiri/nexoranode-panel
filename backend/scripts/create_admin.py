#!/usr/bin/env python3
"""Create a panel admin user."""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from panel.auth.security import hash_password
from panel.db.models import AdminUser, Base
from panel.db.session import async_session, engine


async def main(username: str, password: str, fullname: str) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as session:
        result = await session.execute(select(AdminUser).where(AdminUser.username == username))
        existing = result.scalar_one_or_none()
        if existing:
            existing.password_hash = hash_password(password)
            existing.full_name = fullname
            await session.commit()
            print(f"Updated admin: {username}")
        else:
            admin = AdminUser(
                username=username,
                password_hash=hash_password(password),
                full_name=fullname,
                role="superadmin",
            )
            session.add(admin)
            await session.commit()
            print(f"Created admin: {username}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--fullname", default="مدیر")
    args = parser.parse_args()
    asyncio.run(main(args.username, args.password, args.fullname))
