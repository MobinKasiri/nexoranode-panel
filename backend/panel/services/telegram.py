from __future__ import annotations

import html
import json
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
        reply_markup: dict | None = None,
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
        if reply_markup:
            form.add_field("reply_markup", json.dumps(reply_markup))
        form.add_field(
            "photo",
            photo_bytes,
            filename=filename,
            content_type=_media_type_for_path(filename),
        )
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=form) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        logger.warning("Telegram sendPhoto HTTP %s: %s", resp.status, body[:300])
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
    ) -> bool:
        from panel.config import ensure_bot_path
        from panel.services.xui import get_vpn_service

        ensure_bot_path()
        try:
            vpn = await get_vpn_service()
        except Exception:
            vpn = None

        plan_name = plan.get("tier_name", "VIP")
        if len(results) == 1:
            cfg = results[0].config if hasattr(results[0], "config") else results[0]
            expiry = (
                f"هنوز شروع نشده — شروع {cfg.plan_days} روز پس از اولین اتصال"
                if cfg.expiry_date is None
                else str(cfg.expiry_date.date())
            )
            sub_url = (
                vpn.sub_url(cfg.subscription_id) if vpn else cfg.subscription_url
            )
            caption = self._service_activated_caption(
                name=cfg.service_name,
                plan_name=plan_name,
                gb=cfg.plan_gb,
                days=cfg.plan_days,
                expiry=expiry,
                sub_url=sub_url,
            )
            try:
                from panel.utils.qr import make_qr_png

                return await self.send_photo(
                    user_id,
                    make_qr_png(sub_url),
                    caption=caption,
                    filename="qr.png",
                    reply_markup=self._service_activated_keyboard(sub_url),
                )
            except Exception:
                logger.exception("send_photo failed for user %s — falling back to text", user_id)
                return await self.send_message(
                    user_id,
                    caption,
                    reply_markup=self._service_activated_keyboard(sub_url),
                )

        lines = []
        for r in results:
            cfg = r.config if hasattr(r, "config") else r
            url = (
                vpn.sub_url(cfg.subscription_id) if vpn else cfg.subscription_url
            )
            lines.append(f"• <code>{html.escape(cfg.service_name)}</code>: {url}")
        text = f"✅ <b>{len(results)} سرویس فعال شد!</b>\n\n" + "\n".join(lines)
        return await self.send_message(user_id, text)

    @staticmethod
    def _service_activated_caption(
        *,
        name: str,
        plan_name: str,
        gb: int,
        days: int,
        expiry: str,
        sub_url: str,
    ) -> str:
        return (
            "🎉 <b>سرویس شما فعال شد!</b>\n\n"
            "━━━━━━━━━━━━━━━━\n"
            f"🏷️ <b>نام سرویس:</b> <code>{html.escape(name)}</code>\n"
            f"📦 <b>پلن:</b> {html.escape(plan_name)} — {gb} گیگ | {days} روز\n"
            f"⏳ <b>وضعیت:</b> {html.escape(expiry)}\n"
            "━━━━━━━━━━━━━━━━\n\n"
            "📱 QR کد را اسکن کنید یا لینک را کپی کنید:\n"
            f"<code>{html.escape(sub_url)}</code>\n\n"
            "💡 لینک را در برنامه VPN وارد کنید تا همه لوکیشن‌ها و سرورها خودکار اضافه شوند."
        )

    @staticmethod
    def _service_activated_keyboard(sub_url: str) -> dict:
        return {
            "inline_keyboard": [
                [
                    {
                        "text": "📋 کپی لینک اشتراک",
                        "copy_text": {"text": sub_url},
                    },
                    {"text": "🔗 باز کردن لینک", "url": sub_url},
                ],
                [{"text": "📂 مدیریت کانفیگ‌ها", "callback_data": "menu:configs"}],
                [{"text": "🏠 منوی اصلی", "callback_data": "main_menu"}],
            ]
        }

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
        from panel.utils.qr import make_qr_png

        caption = self._service_activated_caption(
            name=service_name,
            plan_name="VIP",
            gb=plan_gb,
            days=plan_days,
            expiry=expiry_text,
            sub_url=subscription_url,
        )
        if admin_note and admin_note.strip():
            caption = (
                "🎁 <b>سرویس v2ray برای شما فعال شد</b>\n\n"
                f"💬 <b>پیام پشتیبانی:</b> <i>{html.escape(admin_note.strip())}</i>\n\n"
                + caption.split("\n\n", 1)[-1]
            )
        return await self.send_photo(
            chat_id,
            make_qr_png(subscription_url),
            caption=caption,
            filename="qr.png",
            reply_markup=self._service_activated_keyboard(subscription_url),
        )

    async def send_wallet_charged(self, user_id: int, balance: int) -> None:
        text = f"💰 موجودی شما شارژ شد.\n\nموجودی فعلی: <b>{balance:,}</b> تومان"
        await self.send_message(user_id, text)

    async def send_rejection(self, user_id: int, reason: str | None = None) -> None:
        reason_text = reason or "رسید پرداخت تایید نشد."
        text = f"❌ <b>پرداخت شما رد شد.</b>\n\nدلیل: {reason_text}"
        await self.send_message(user_id, text)

    async def send_renew_success(self, user_id: int, cfg, plan: dict) -> bool:
        """Notify user after panel-approved renewal (same sub link, extended quota)."""
        from panel.config import ensure_bot_path
        from panel.services.xui import get_vpn_service

        ensure_bot_path()
        from app.bot.i18n import fa as bot_fa
        from app.bot.utils.jalali import to_jalali
        from app.bot.utils.persian import to_persian_digits

        try:
            vpn = await get_vpn_service()
        except Exception:
            vpn = None

        expiry = bot_fa.CONFIG_NOT_STARTED
        if cfg.expiry_date:
            expiry = to_jalali(cfg.expiry_date)

        sub_url = vpn.sub_url(cfg.subscription_id) if vpn else cfg.subscription_url
        text = bot_fa.RENEW_SUCCESS.format(
            name=cfg.service_name,
            gb=to_persian_digits(plan.get("gb", 0)),
            days=to_persian_digits(plan.get("days", 0)),
            expiry=expiry,
            sub_url=sub_url,
        )
        return await self.send_message(
            user_id,
            text,
            reply_markup={
                "inline_keyboard": [
                    [{"text": "📂 مدیریت کانفیگ‌ها", "callback_data": "menu:configs"}],
                    [{"text": "🏠 منوی اصلی", "callback_data": "main_menu"}],
                ]
            },
        )


def _media_type_for_path(file_path: str) -> str:
    lower = file_path.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"
