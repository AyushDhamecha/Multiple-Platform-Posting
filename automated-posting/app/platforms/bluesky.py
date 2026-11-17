from datetime import datetime, timezone
import httpx
from app.config import settings
from app.platforms.base import BasePlatform
from app.schemas import PlatformResult


def _build_link_facets(text: str, cta_url: str) -> list[dict]:
    """Compute UTF-8 byte offsets for the CTA URL so Bluesky renders a clickable link."""
    idx = text.find(cta_url)
    if idx == -1:
        return []
    byte_start = len(text[:idx].encode("utf-8"))
    byte_end = byte_start + len(cta_url.encode("utf-8"))
    return [
        {
            "index": {"byteStart": byte_start, "byteEnd": byte_end},
            "features": [{"$type": "app.bsky.richtext.facet#link", "uri": cta_url}],
        }
    ]


class BlueskyPlatform(BasePlatform):
    name = "Bluesky"
    public_access = True

    async def post(self, message: str, cta_url: str, client: httpx.AsyncClient) -> PlatformResult:
        handle = settings.bluesky_handle.lstrip("@")
        if not handle or not settings.bluesky_app_password:
            return self.failure_result(
                "Missing credentials: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be configured"
            )

        try:
            session_resp = await client.post(
                "https://bsky.social/xrpc/com.atproto.server.createSession",
                json={"identifier": handle, "password": settings.bluesky_app_password},
            )
            if session_resp.status_code >= 400:
                detail = session_resp.json().get("message", session_resp.text)
                return self.failure_result(f"Auth HTTP {session_resp.status_code}: {detail}")

            session = session_resp.json()
            did = session["did"]
            resolved_handle = session.get("handle", handle)
            access_jwt = session["accessJwt"]

            record: dict = {
                "$type": "app.bsky.feed.post",
                "text": message,
                "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
            facets = _build_link_facets(message, cta_url)
            if facets:
                record["facets"] = facets

            post_resp = await client.post(
                "https://bsky.social/xrpc/com.atproto.repo.createRecord",
                headers={"Authorization": f"Bearer {access_jwt}"},
                json={
                    "repo": did,
                    "collection": "app.bsky.feed.post",
                    "record": record,
                },
            )
            if post_resp.status_code >= 400:
                detail = post_resp.json().get("message", post_resp.text)
                return self.failure_result(f"HTTP {post_resp.status_code}: {detail}")

            rkey = post_resp.json()["uri"].rsplit("/", 1)[-1]
            return self.success_result(f"https://bsky.app/profile/{resolved_handle}/post/{rkey}")
        except Exception as exc:
            return self.failure_result(f"Bluesky error: {exc}")
