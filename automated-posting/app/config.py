import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    bluesky_handle: str = os.getenv("BLUESKY_HANDLE", "").strip()
    bluesky_app_password: str = os.getenv("BLUESKY_APP_PASSWORD", "").strip()
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    telegram_chat_id: str = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    github_gist_token: str = os.getenv("GITHUB_GIST_TOKEN", "").strip()
    devto_api_key: str = os.getenv("DEVTO_API_KEY", "").strip()
    mastodon_instance: str = os.getenv("MASTODON_INSTANCE", "mastodon.social").strip()
    mastodon_access_token: str = os.getenv("MASTODON_ACCESS_TOKEN", "").strip()
    request_timeout: float = float(os.getenv("REQUEST_TIMEOUT", "15.0"))


settings = Settings()
