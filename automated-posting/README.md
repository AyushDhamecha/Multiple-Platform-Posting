# Automated Multi-Platform Posting System

A concise **FastAPI** application that validates a short announcement (max 200 characters, exactly one valid CTA link) and publishes it concurrently across **5 independent third-party platforms**.

## Integrated Platforms

1. **Bluesky** (`https://bsky.social/xrpc/com.atproto.repo.createRecord`) — Public AT Protocol post with clickable CTA link facets via handle and App Password.
2. **Telegram** (`https://api.telegram.org/bot<token>/sendMessage`) — Telegram Bot API dispatch to a public channel (`@channel_username`, returning a `t.me` link) or private chat/group ID.
3. **GitHub Gist** (`https://api.github.com/gists`) — Public Markdown gist via Personal Access Token (`gist` scope).
4. **Dev.to** (`https://dev.to/api/articles`) — Public developer community post via Forem `api-key`.
5. **Mastodon** (`https://{MASTODON_INSTANCE}/api/v1/statuses`) — Public federated status post via Bearer token.

## Setup & Installation

```bash
cd automated-posting
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Fill in your API credentials inside `.env` (never commit `.env`).

## Running the Server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 4000
```

Interactive Swagger documentation is available at:

- **Swagger UI:** `http://localhost:4000/docs`
- **ReDoc:** `http://localhost:4000/redoc`

## Sample Request

```bash
curl -X POST http://localhost:4000/posting \
  -H "Content-Type: application/json" \
  -d '{"message": "Check out our latest business platform and grow your online visibility. https://example.com"}'
```

## Sample Response

```json
{
  "success": true,
  "results": [
    {
      "platform": "Bluesky",
      "status": "success",
      "posted_url": "https://bsky.app/profile/handle.bsky.social/post/3lbxyz",
      "public_access": true,
      "date": "2026-11-17",
      "time": "10:30:00",
      "error": null
    },
    {
      "platform": "Dev.to",
      "status": "failed",
      "posted_url": null,
      "public_access": false,
      "date": null,
      "time": null,
      "error": "Missing credentials: DEVTO_API_KEY is not configured"
    }
  ]
}
```

## Running Tests

```bash
pytest -v
```
