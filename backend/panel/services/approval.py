from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from panel.config import ensure_bot_path, get_plan, get_settings
from panel.db.models import AdminUser
from panel.services.audit import log_action
from panel.services.bot_admin_sync import sync_tx_processed_from_panel
from panel.services.telegram import TelegramService
from panel.services.xui import get_vpn_service

logger = logging.getLogger(__name__)


class ApprovalError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


async def _credit_referrer(session: AsyncSession, user) -> None:
    try:
        ensure_bot_path()
        from app.bot.services.referral_reward import credit_referrer_for_purchase
        from panel.config import resolve_shared_data_dir

        await credit_referrer_for_purchase(
            session, user, data_dir=resolve_shared_data_dir(get_settings())
        )
    except Exception:
        logger.exception("Referrer credit failed for user %s (non-fatal)", user.tg_id)


async def _approve_renew(
    session: AsyncSession,
    tx,
    tx_id: int,
    user,
    panel_admin: AdminUser,
    telegram: TelegramService,
) -> dict:
    from app.db.models import Transaction, VPNConfig
    from app.db.models.transaction import TX_CONFIRMED

    try:
        intent = json.loads(tx.admin_note or "{}")
    except json.JSONDecodeError:
        intent = {}

    config_id = int(intent.get("config_id") or tx.config_id or 0)
    cfg = await VPNConfig.get(session, config_id) if config_id else None
    if not cfg or cfg.user_id != user.tg_id:
        raise ApprovalError("سرویس برای تمدید یافت نشد", 400)

    plan = get_plan(intent.get("plan_id", tx.plan_id or ""))
    if not plan:
        raise ApprovalError("پلن یافت نشد", 400)

    vpn = await get_vpn_service()
    try:
        cfg = await vpn.renew_one(
            session,
            cfg,
            plan_id=plan["id"],
            plan_gb=int(plan["gb"]),
            plan_days=int(plan["days"]),
        )
    except Exception as e:
        logger.exception("VPN renew failed for tx=%s config=%s", tx_id, config_id)
        raise ApprovalError(f"خطا در تمدید سرویس: {e}", 500) from e

    processed_at = datetime.utcnow()
    claimed = await Transaction.claim_if_pending(
        session,
        tx_id,
        status=TX_CONFIRMED,
        confirmed_at=processed_at,
        config_id=cfg.id,
    )
    if not claimed:
        raise ApprovalError("این تراکنش قبلاً پردازش شده است", 409)

    await sync_tx_processed_from_panel(
        session,
        tx_id,
        panel_admin=panel_admin,
        action="approved",
        processed_at=processed_at.replace(tzinfo=timezone.utc),
    )

    notified = False
    try:
        notified = await telegram.send_renew_success(user.tg_id, cfg, plan)
    except Exception:
        logger.exception("Renew success notify failed for tx=%s", tx_id)

    try:
        await log_action(
            session,
            panel_admin.id,
            "approve_renew",
            target_type="transaction",
            target_id=str(tx_id),
            details="notified" if notified else "notify_failed",
        )
    except Exception:
        logger.exception("Audit log failed for renew approve tx=%s", tx_id)

    return {
        "success": True,
        "type": "renew",
        "config_id": cfg.id,
        "notified": notified,
    }


async def approve_transaction(
    session: AsyncSession,
    tx_id: int,
    panel_admin: AdminUser,
    telegram: TelegramService | None = None,
) -> dict:
    ensure_bot_path()
    from app.db.models import Transaction, User
    from app.db.models.transaction import (
        TX_CONFIRMED,
        TX_PENDING,
        TX_PURCHASE,
        TX_RENEW,
        TX_WALLET_TOPUP,
    )
    from app.bot.utils.discount import record_usage

    telegram = telegram or TelegramService()
    tx = await Transaction.get(session, tx_id)
    if not tx:
        raise ApprovalError("تراکنش یافت نشد", 404)
    if tx.status != TX_PENDING:
        raise ApprovalError("این تراکنش قبلاً پردازش شده است", 409)

    user = await User.get(session, tx.user_id)
    if not user:
        raise ApprovalError("کاربر یافت نشد", 404)

    if tx.type == TX_WALLET_TOPUP:
        processed_at = datetime.utcnow()
        claimed = await Transaction.claim_if_pending(
            session,
            tx_id,
            status=TX_CONFIRMED,
            confirmed_at=processed_at,
        )
        if not claimed:
            raise ApprovalError("این تراکنش قبلاً پردازش شده است", 409)

        new_balance = user.balance + tx.amount
        await User.update(session, user.tg_id, balance=new_balance)

        await sync_tx_processed_from_panel(
            session,
            tx_id,
            panel_admin=panel_admin,
            action="approved",
            processed_at=processed_at.replace(tzinfo=timezone.utc),
        )

        try:
            await telegram.send_wallet_charged(user.tg_id, new_balance)
        except Exception:
            logger.exception("Wallet charge notify failed for tx=%s", tx_id)
        try:
            await log_action(
                session, panel_admin.id, "approve_wallet_topup",
                target_type="transaction", target_id=str(tx_id),
            )
        except Exception:
            logger.exception("Audit log failed for wallet approve tx=%s", tx_id)
        return {"success": True, "type": "wallet_topup"}

    if tx.type == TX_RENEW:
        return await _approve_renew(
            session,
            tx,
            tx_id,
            user,
            panel_admin,
            telegram,
        )

    if tx.type != TX_PURCHASE:
        raise ApprovalError("نوع تراکنش پشتیبانی نمی‌شود", 400)

    try:
        intent = json.loads(tx.admin_note or "{}")
    except json.JSONDecodeError:
        intent = {}

    plan = get_plan(intent.get("plan_id", tx.plan_id or ""))
    if not plan:
        raise ApprovalError("پلن یافت نشد", 400)

    names: list[str] = intent.get("service_names") or []
    if not names and tx.service_name:
        names = [tx.service_name]
    if not names:
        raise ApprovalError("نام سرویس مشخص نیست", 400)

    vpn = await get_vpn_service()
    try:
        results = await vpn.create_many(
            session,
            user_id=user.tg_id,
            plan_id=plan["id"],
            plan_gb=plan["gb"],
            plan_days=plan["days"],
            service_names=names,
            tg_id=user.tg_id,
        )
    except Exception as e:
        logger.exception("VPN create failed for tx=%s", tx_id)
        raise ApprovalError(f"خطا در ایجاد سرویس: {e}", 500) from e

    processed_at = datetime.utcnow()
    claimed = await Transaction.claim_if_pending(
        session,
        tx_id,
        status=TX_CONFIRMED,
        confirmed_at=processed_at,
        config_id=results[0].config.id if results else None,
    )
    if not claimed:
        raise ApprovalError("این تراکنش قبلاً پردازش شده است", 409)

    if intent.get("discount_id"):
        try:
            await record_usage(session, int(intent["discount_id"]), user.tg_id)
        except Exception:
            logger.exception("Failed to record discount usage for tx=%s", tx_id)

    await _credit_referrer(session, user)

    await sync_tx_processed_from_panel(
        session,
        tx_id,
        panel_admin=panel_admin,
        action="approved",
        processed_at=processed_at.replace(tzinfo=timezone.utc),
    )

    notified = False
    try:
        notified = await telegram.send_purchase_success(user.tg_id, results, plan)
    except Exception:
        logger.exception("Purchase success notify failed for tx=%s", tx_id)

    try:
        await log_action(
            session, panel_admin.id, "approve_purchase",
            target_type="transaction", target_id=str(tx_id),
            details="notified" if notified else "notify_failed",
        )
    except Exception:
        logger.exception("Audit log failed for purchase approve tx=%s", tx_id)

    return {
        "success": True,
        "type": "purchase",
        "configs_created": len(results),
        "notified": notified,
    }


async def reject_transaction(
    session: AsyncSession,
    tx_id: int,
    panel_admin: AdminUser,
    reason: str | None = None,
    telegram: TelegramService | None = None,
) -> dict:
    ensure_bot_path()
    from app.db.models import Transaction
    from app.db.models.transaction import TX_PENDING, TX_REJECTED, TX_RENEW

    telegram = telegram or TelegramService()
    tx = await Transaction.get(session, tx_id)
    if not tx:
        raise ApprovalError("تراکنش یافت نشد", 404)
    if tx.status != TX_PENDING:
        raise ApprovalError("این تراکنش قبلاً پردازش شده است", 409)

    claimed = await Transaction.claim_if_pending(session, tx_id, status=TX_REJECTED)
    if not claimed:
        raise ApprovalError("این تراکنش قبلاً پردازش شده است", 409)

    processed_at = datetime.now(tz=timezone.utc)
    await sync_tx_processed_from_panel(
        session,
        tx_id,
        panel_admin=panel_admin,
        action="rejected",
        processed_at=processed_at,
    )

    try:
        if tx.type == TX_RENEW:
            from app.bot.i18n import fa as bot_fa

            reason_text = reason or "رسید پرداخت تایید نشد."
            text = bot_fa.RENEW_REJECTED.format(reason=reason_text)
            await telegram.send_message(tx.user_id, text)
        else:
            await telegram.send_rejection(tx.user_id, reason)
    except Exception:
        logger.exception("Reject notify failed for tx=%s", tx_id)
    try:
        await log_action(
            session, panel_admin.id, "reject_transaction",
            target_type="transaction", target_id=str(tx_id),
            details=reason,
        )
    except Exception:
        logger.exception("Audit log failed for reject tx=%s", tx_id)
    return {"success": True}
