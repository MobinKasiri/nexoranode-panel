from __future__ import annotations

import html
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
        self,
        chat_id: int,
        text: str,
        *,
        parse_mode: str = "HTML",
        disable_web_page_preview: bool = True,
        reply_markup: dict | None = None,
    ) -> bool:
        if not self.token:
            logger.warning("BOT_TOKEN not set, skipping send_message")
            return False
        url = f"{self.base}/sendMessage"
        payload: dict = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": disable_web_page_preview,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        logger.warning("Telegram sendMessage HTTP %s: %s", resp.status, body[:300])
                    return resp.status == 200
        except Exception:
            logger.exception("Failed to send Telegram message to %s", chat_id)
            return False

    async def send_photo(
        self,
        chat_id: int,
        photo_bytes: bytes,
        caption: str = "",
        *,
        parse_mode: str = "HTML",
        filename: str = "photo.jpg",
    ) -> bool:
        if not self.token:
            logger.warning("BOT_TOKEN not set, skipping send_photo")
            return False
        url = f"{self.base}/sendPhoto"
        form = aiohttp.FormData()
        form.add_field("chat_id", str(chat_id))
        if caption:
            form.add_field("caption", caption)
            form.add_field("parse_mode", parse_mode)
        form.add_field(
            "photo",
            photo_bytes,
            filename=filename,
            content_type=_media_type_for_path(filename),
        )
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=form) as resp:
                    return resp.status == 200
        except Exception:
            logger.exception("Failed to send Telegram photo to %s", chat_id)
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

    async def send_config_granted(
        self,
        *,
        chat_id: int,
        service_name: str,
        plan_gb: int,
        plan_days: int,
        subscription_url: str,
        expiry_text: str,
        inbound_remarks: list[str] | None = None,
        admin_note: str | None = None,
        is_active: bool = True,
    ) -> bool:
        """Notify user that an admin created a VPN config for them."""
        status_line = "✅ فعال" if is_active else "⏸ غیرفعال"
        inbounds = " · ".join(inbound_remarks or []) or "همه لوکیشن‌های فعال"

        parts = [
            "🎁 <b>سرویس v2ray  برای شما فعال شد</b>",
            "",
            "یک کانفیگ جدید از طرف پشتیبانی برای حساب شما ایجاد شده است.",
        ]

        if admin_note and admin_note.strip():
            parts.extend(
                [
                    "",
                    f"💬 <b>پیام پشتیبانی:</b>",
                    f"<i>{html.escape(admin_note.strip())}</i>",
                ]
            )

        parts.extend(
            [
                "",
                "━━━━━━━━━━━━━━━━",
                f"📛 <b>نام سرویس:</b> <code>{html.escape(service_name)}</code>",
                f"📦 <b>حجم:</b> {plan_gb} گیگ  ·  <b>مدت:</b> {plan_days} روز",
                f"📅 <b>انقضا:</b> {html.escape(expiry_text)}",
                f"🌐 <b>لوکیشن‌ها:</b> {html.escape(inbounds)}",
                f"🔘 <b>وضعیت:</b> {status_line}",
                "",
                "🔗 <b>لینک اشتراک (همه سرورها):</b>",
                f"<code>{html.escape(subscription_url)}</code>",
                "",
                "💡 لینک را در برنامه VPN وارد کنید یا از دکمه‌های زیر استفاده کنید.",
                "از منوی ربات → «مدیریت کانفیگ‌ها» هم می‌توانید جزئیات را ببینید.",
            ]
        )

        reply_markup = {
            "inline_keyboard": [
                [
                    {
                        "text": "📋 کپی لینک اشتراک",
                        "copy_text": {"text": subscription_url},
                    }
                ],
                [{"text": "🔗 باز کردن لینک", "url": subscription_url}],
            ]
        }
        return await self.send_message(
            chat_id,
            "\n".join(parts),
            reply_markup=reply_markup,
        )

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
