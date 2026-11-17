from datetime import datetime, timezone
import httpx
from app.config import settings
from app.platforms.base import BasePlatform
from app.schemas import PlatformResult


class TelegramPlatform(BasePlatform):
    name = "Telegram"
    public_access = True

    async def post(self, message: str, cta_url: str, client: httpx.AsyncClient) -> PlatformResult:
        if not settings.telegram_bot_token or not settings.telegram_chat_id:
            return self.failure_result(
                "Missing credentials: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be configured"
            )

        try:
            url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
            resp = await client.post(
                url,
                json={"chat_id": settings.telegram_chat_id, "text": message},
            )
            data = resp.json()
            if resp.status_code >= 400 or not data.get("ok"):
                detail = data.get("description", resp.text)
                return self.failure_result(f"HTTP {resp.status_code}: {detail}")

            result = data["result"]
            chat = result.get("chat", {})
            username = chat.get("username")
            is_public_channel = bool(username and chat.get("type") in ("channel", "supergroup"))
            posted_url = f"https://t.me/{username}/{result['message_id']}" if is_public_channel else None

            now = datetime.now(timezone.utc)
            return PlatformResult(
                platform=self.name,
                status="success",
                posted_url=posted_url,
                public_access=is_public_channel,
                date=now.strftime("%Y-%m-%d"),
                time=now.strftime("%H:%M:%S"),
                error=None,
            )
        except Exception as exc:
            return self.failure_result(f"Telegram error: {exc}")
