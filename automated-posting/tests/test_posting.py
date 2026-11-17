from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.schemas import PlatformResult

client = TestClient(app)


def test_rejects_message_over_200_characters() -> None:
    long_message = ("A" * 185) + " https://example.com"
    resp = client.post("/posting", json={"message": long_message})
    assert resp.status_code == 422


def test_rejects_message_without_cta_link() -> None:
    resp = client.post("/posting", json={"message": "Launch announcement without any link."})
    assert resp.status_code == 422


def test_rejects_message_with_multiple_cta_links() -> None:
    resp = client.post(
        "/posting",
        json={"message": "Visit https://example.com and https://docs.example.com today."},
    )
    assert resp.status_code == 422


def test_rejects_invalid_url_format() -> None:
    resp = client.post("/posting", json={"message": "Broken link http://invalidhost"})
    assert resp.status_code == 422


def test_publishes_independently_when_one_platform_fails() -> None:
    with (
        patch("app.platforms.bluesky.BlueskyPlatform.post", new=AsyncMock(return_value=PlatformResult(
            platform="Bluesky", status="success", posted_url="https://bsky.app/profile/user.bsky.social/post/1",
            public_access=True, date="2026-11-17", time="10:00:00", error=None,
        ))),
        patch("app.platforms.telegram.TelegramPlatform.post", new=AsyncMock(return_value=PlatformResult(
            platform="Telegram", status="success", posted_url="https://t.me/mychannel/10",
            public_access=True, date="2026-11-17", time="10:00:00", error=None,
        ))),
        patch("app.platforms.github_gist.GitHubGistPlatform.post", new=AsyncMock(return_value=PlatformResult(
            platform="GitHub Gist", status="success", posted_url="https://gist.github.com/test/1",
            public_access=True, date="2026-11-17", time="10:00:00", error=None,
        ))),
        patch("app.platforms.devto.DevToPlatform.post", new=AsyncMock(return_value=PlatformResult(
            platform="Dev.to", status="failed", posted_url=None,
            public_access=False, date=None, time=None, error="Authentication failed",
        ))),
        patch("app.platforms.mastodon.MastodonPlatform.post", new=AsyncMock(return_value=PlatformResult(
            platform="Mastodon", status="success", posted_url="https://mastodon.social/@user/1",
            public_access=True, date="2026-11-17", time="10:00:00", error=None,
        ))),
    ):
        resp = client.post(
            "/posting",
            json={"message": "Check out our latest platform and grow online. https://example.com"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert len(body["results"]) == 5
    devto = next(item for item in body["results"] if item["platform"] == "Dev.to")
    assert devto["status"] == "failed"
    assert devto["error"] == "Authentication failed"
