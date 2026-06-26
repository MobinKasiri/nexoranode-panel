"""Resolve who processed a transaction (bot sync meta or panel audit log)."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from panel.config import ensure_bot_path
from panel.db.models import AdminUser, AuditLog
from panel.services.datetime_utils import to_api_iso

_TX_ACTIONS = ("approve_purchase", "approve_wallet_topup", "reject_transaction")


def _action_from_audit(action: str) -> str:
    if action == "reject_transaction":
        return "rejected"
    return "approved"


def _action_from_meta(action: str | None) -> str:
    return action if action in ("approved", "rejected") else "approved"


def processed_info_from_tx(tx) -> dict[str, Any] | None:
    if not tx or tx.status == "pending":
        return None

    if tx.bot_admin_notify:
        try:
            meta = json.loads(tx.bot_admin_notify)
            processed = meta.get("processed") if isinstance(meta, dict) else None
            if processed:
                by_tg_id = int(processed.get("by_tg_id") or 0)
                return {
                    "name": processed.get("by_name") or "—",
                    "username": processed.get("by_username"),
                    "action": _action_from_meta(processed.get("action")),
                    "at": processed.get("at"),
                    "source": "telegram" if by_tg_id else "panel",
                }
        except json.JSONDecodeError:
            pass

    if tx.confirmed_at:
        return {
            "name": None,
            "username": None,
            "action": "approved" if tx.status == "confirmed" else "rejected",
            "at": to_api_iso(tx.confirmed_at),
            "source": None,
        }
    return {
        "name": None,
        "username": None,
        "action": "rejected" if tx.status == "rejected" else "approved",
        "at": to_api_iso(tx.created_at),
        "source": None,
    }


async def enrich_processed_info(
    session: AsyncSession,
    tx,
    info: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Fill missing processor name from panel audit log when sync meta is absent."""
    if not info or tx.status == "pending":
        return None

    if info.get("name"):
        return info

    result = await session.execute(
        select(AuditLog)
        .where(AuditLog.target_type == "transaction")
        .where(AuditLog.target_id == str(tx.id))
        .where(AuditLog.action.in_(_TX_ACTIONS))
        .order_by(AuditLog.created_at.desc())
        .limit(1)
    )
    log = result.scalar_one_or_none()
    if not log:
        return info

    admin = await session.get(AdminUser, log.admin_id)
    info = dict(info)
    info["action"] = _action_from_audit(log.action)
    info["at"] = to_api_iso(log.created_at) if log.created_at else info.get("at")
    info["source"] = "panel"
    if admin:
        info["name"] = admin.full_name or admin.username
        info["username"] = admin.username
    return info
