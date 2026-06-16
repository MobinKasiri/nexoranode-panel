from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from panel.db.models import AuditLog

logger = logging.getLogger(__name__)


async def log_action(
    session: AsyncSession,
    admin_id: int,
    action: str,
    *,
    target_type: str | None = None,
    target_id: str | None = None,
    details: str | None = None,
) -> None:
    entry = AuditLog(
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
        created_at=datetime.utcnow(),
    )
    session.add(entry)
    await session.commit()
