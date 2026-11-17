import asyncio
import httpx
from app.config import settings
from app.platforms.base import BasePlatform
from app.platforms.bluesky import BlueskyPlatform
from app.platforms.devto import DevToPlatform
from app.platforms.github_gist import GitHubGistPlatform
from app.platforms.mastodon import MastodonPlatform
from app.platforms.telegram import TelegramPlatform
from app.schemas import PlatformResult, PostingResponse, extract_valid_urls


PLATFORMS: list[BasePlatform] = [
    BlueskyPlatform(),
    TelegramPlatform(),
    GitHubGistPlatform(),
    DevToPlatform(),
    MastodonPlatform(),
]


async def _dispatch_one(
    platform: BasePlatform,
    message: str,
    cta_url: str,
    client: httpx.AsyncClient,
) -> PlatformResult:
    try:
        return await platform.post(message, cta_url, client)
    except Exception as exc:
        return platform.failure_result(f"Unexpected error: {exc}")


async def publish_message(message: str) -> PostingResponse:
    cta_url = extract_valid_urls(message)[0]

    async with httpx.AsyncClient(timeout=settings.request_timeout) as client:
        results = await asyncio.gather(
            *(_dispatch_one(platform, message, cta_url, client) for platform in PLATFORMS)
        )

    any_success = any(item.status == "success" for item in results)
    return PostingResponse(success=any_success, results=list(results))
