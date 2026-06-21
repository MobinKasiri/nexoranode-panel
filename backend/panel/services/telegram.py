from __future__ import annotations

import logging

import aiohttp

from panel.config import get_settings, resolve_bot_token

logger = logging.getLogger(__name__)


class TelegramService:
    def __init__(self) -> None:
        settings = get_settings()
        self.token = resolve_bot_token(settings)
        self.base = f"{settings.BOT_API_URL.rstrip('/')}{self.token}"

    async def send_message(
        self, chat_id: int, text: str, *, parse_mode: str = "HTML"
    ) -> bool:
        if not self.token:
            logger.warning("BOT_TOKEN not set, skipping send_message")
            return False
        url = f"{self.base}/sendMessage"
        payload = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    return resp.status == 200
        except Exception:
            logger.exception("Failed to send Telegram message to %s", chat_id)
            return False

    async def get_file_bytes(self, file_id: str) -> tuple[bytes, str] | None:
        if not self.token or not file_id:
            return None
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base}/getFile", params={"file_id": file_id}
                ) as resp:
                    data = await resp.json()
                if not data.get("ok"):
                    logger.warning(
                        "Telegram getFile failed for %s: %s",
                        file_id[:24],
                        data.get("description", data),
                    )
                    return None
                file_path = data["result"]["file_path"]
                async with session.get(
                    f"https://api.telegram.org/file/bot{self.token}/{file_path}"
                ) as photo_resp:
                    if photo_resp.status != 200:
                        logger.warning(
                            "Telegram file download HTTP %s for %s",
                            photo_resp.status,
                            file_id[:20],
                        )
                        return None
                    content = await photo_resp.read()
                    media = _media_type_for_path(file_path)
                    return content, media
        except Exception:
            logger.exception("Failed to download Telegram file %s", file_id)
            return None

    async def send_purchase_success(
        self, user_id: int, results: list, plan: dict
    ) -> None:
        plan_name = plan.get("tier_name", "VIP")
        if len(results) == 1:
            cfg = results[0].config if hasattr(results[0], "config") else results[0]
            expiry = (
                f"پس از اولین اتصال ({cfg.plan_days} روز)"
                if cfg.expiry_date is None
                else str(cfg.expiry_date.date())
            )
            text = (
                f"✅ <b>سرویس شما فعال شد!</b>\n\n"
                f"📛 نام: <code>{cfg.service_name}</code>\n"
                f"📦 پلن: {plan_name} {cfg.plan_gb}GB / {cfg.plan_days} روز\n"
                f"📅 انقضا: {expiry}\n\n"
                f"🔗 لینک اشتراک:\n<code>{cfg.subscription_url}</code>"
            )
        else:
            lines = []
            for r in results:
                cfg = r.config if hasattr(r, "config") else r
                lines.append(f"• <code>{cfg.service_name}</code>: {cfg.subscription_url}")
            text = (
                f"✅ <b>{len(results)} سرویس فعال شد!</b>\n\n" + "\n".join(lines)
            )
        await self.send_message(user_id, text)

    async def send_wallet_charged(self, user_id: int, balance: int) -> None:
        text = f"💰 موجودی شما شارژ شد.\n\nموجودی فعلی: <b>{balance:,}</b> تومان"
        await self.send_message(user_id, text)

    async def send_rejection(self, user_id: int, reason: str | None = None) -> None:
        reason_text = reason or "رسید پرداخت تایید نشد."
        text = f"❌ <b>پرداخت شما رد شد.</b>\n\nدلیل: {reason_text}"
        await self.send_message(user_id, text)


def _media_type_for_path(file_path: str) -> str:
    lower = file_path.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"
