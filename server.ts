import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';

interface PlatformResult {
  platform: string;
  status: 'success' | 'failed';
  posted_url: string | null;
  public_access: boolean;
  date: string | null;
  time: string | null;
  error: string | null;
}

const URL_REGEX = /https?:\/\/[^\s<>"'\])]+/g;

function extractValidUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) ?? [];
  const valid: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,!?;:]+$/, '');
    try {
      const parsed = new URL(cleaned);
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.')) {
        valid.push(cleaned);
      }
    } catch {
      // Ignore malformed URLs
    }
  }
  return valid;
}

function nowStamp(): { date: string; time: string } {
  const iso = new Date().toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 19),
  };
}

function ok(platform: string, posted_url: string | null, public_access: boolean): PlatformResult {
  const { date, time } = nowStamp();
  return { platform, status: 'success', posted_url, public_access, date, time, error: null };
}

function fail(platform: string, error: string): PlatformResult {
  return { platform, status: 'failed', posted_url: null, public_access: false, date: null, time: null, error };
}

function buildBlueskyLinkFacets(text: string, ctaUrl: string) {
  const idx = text.indexOf(ctaUrl);
  if (idx === -1) return [];
  const byteStart = Buffer.byteLength(text.slice(0, idx), 'utf8');
  const byteEnd = byteStart + Buffer.byteLength(ctaUrl, 'utf8');
  return [
    {
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: ctaUrl }],
    },
  ];
}

async function postToBluesky(message: string, ctaUrl: string): Promise<PlatformResult> {
  const platform = 'Bluesky';
  const handle = process.env.BLUESKY_HANDLE?.trim().replace(/^@/, '');
  const appPassword = process.env.BLUESKY_APP_PASSWORD?.trim();
  if (!handle || !appPassword) {
    return fail(platform, 'Missing credentials: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be configured');
  }

  try {
    const sessionRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
      signal: AbortSignal.timeout(15000),
    });

    const sessionData = (await sessionRes.json()) as {
      did?: string;
      handle?: string;
      accessJwt?: string;
      message?: string;
    };
    if (!sessionRes.ok || !sessionData.accessJwt || !sessionData.did) {
      return fail(platform, `Auth HTTP ${sessionRes.status}: ${sessionData.message || 'Bluesky login failed'}`);
    }

    const facets = buildBlueskyLinkFacets(message, ctaUrl);
    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text: message,
      createdAt: new Date().toISOString(),
    };
    if (facets.length > 0) {
      record.facets = facets;
    }

    const postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionData.accessJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: sessionData.did,
        collection: 'app.bsky.feed.post',
        record,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const postData = (await postRes.json()) as { uri?: string; message?: string };
    if (!postRes.ok || !postData.uri) {
      return fail(platform, `HTTP ${postRes.status}: ${postData.message || 'Bluesky post failed'}`);
    }

    const rkey = postData.uri.split('/').pop();
    const resolvedHandle = sessionData.handle || handle;
    return ok(platform, `https://bsky.app/profile/${resolvedHandle}/post/${rkey}`, true);
  } catch (err) {
    return fail(platform, `Bluesky error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function postToTelegram(message: string): Promise<PlatformResult> {
  const platform = 'Telegram';
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!botToken || !chatId) {
    return fail(platform, 'Missing credentials: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be configured');
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id: number; chat?: { type?: string; username?: string } };
    };
    if (!res.ok || !data.ok || !data.result) {
      return fail(platform, `HTTP ${res.status}: ${data.description || 'Telegram request failed'}`);
    }

    const chat = data.result.chat;
    const isPublicChannel = Boolean(chat?.username && (chat.type === 'channel' || chat.type === 'supergroup'));
    const postedUrl = isPublicChannel ? `https://t.me/${chat?.username}/${data.result.message_id}` : null;
    return ok(platform, postedUrl, isPublicChannel);
  } catch (err) {
    return fail(platform, `Telegram error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function postToGitHubGist(message: string, ctaUrl: string): Promise<PlatformResult> {
  const platform = 'GitHub Gist';
  const token = process.env.GITHUB_GIST_TOKEN?.trim();
  if (!token) {
    return fail(platform, 'Missing credentials: GITHUB_GIST_TOKEN is not configured');
  }

  try {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'automated-posting-app',
      },
      body: JSON.stringify({
        description: message.slice(0, 100),
        public: true,
        files: {
          'announcement.md': { content: `${message}\n\nLearn more: ${ctaUrl}\n` },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json()) as { html_url?: string; message?: string };
    if (!res.ok || !data.html_url) {
      return fail(platform, `HTTP ${res.status}: ${data.message || 'GitHub Gist request failed'}`);
    }
    return ok(platform, data.html_url, true);
  } catch (err) {
    return fail(platform, `GitHub Gist error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function postToDevTo(message: string, ctaUrl: string): Promise<PlatformResult> {
  const platform = 'Dev.to';
  const apiKey = process.env.DEVTO_API_KEY?.trim();
  if (!apiKey) {
    return fail(platform, 'Missing credentials: DEVTO_API_KEY is not configured');
  }

  try {
    const stamp = Date.now().toString().slice(-6);
    const res = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        Accept: 'application/vnd.forem.api-v1+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        article: {
          title: `${message.slice(0, 55).trim()} (${stamp})`,
          body_markdown: `${message}\n\n[Visit Link](${ctaUrl})`,
          published: true,
          tags: ['news', 'announcement'],
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      return fail(platform, `HTTP ${res.status}: ${data.error || 'Dev.to request failed'}`);
    }
    return ok(platform, data.url, true);
  } catch (err) {
    return fail(platform, `Dev.to error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function normalizeMastodonHost(raw?: string): string {
  const value = (raw || 'mastodon.social').trim();
  if (!value) return 'mastodon.social';
  try {
    const parsed = new URL(value.startsWith('http') ? value : `https://${value}`);
    return parsed.hostname;
  } catch {
    return value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
}

async function postToMastodon(message: string): Promise<PlatformResult> {
  const platform = 'Mastodon';
  const token = process.env.MASTODON_ACCESS_TOKEN?.trim();
  const host = normalizeMastodonHost(process.env.MASTODON_INSTANCE);
  if (!token) {
    return fail(platform, 'Missing credentials: MASTODON_ACCESS_TOKEN is not configured');
  }

  try {
    const res = await fetch(`https://${host}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: message, visibility: 'public' }),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      return fail(platform, `HTTP ${res.status}: ${data.error || 'Mastodon request failed'}`);
    }
    return ok(platform, data.url, true);
  } catch (err) {
    const cause = err instanceof Error && err.cause ? ` (${String(err.cause)})` : '';
    return fail(platform, `Mastodon error [${host}]: ${err instanceof Error ? err.message : String(err)}${cause}`);
  }
}

function collectRepoFiles(dir: string, baseDir: string): { path: string; content: string }[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const files: { path: string; content: string }[] = [];

  for (const entry of entries) {
    if (entry.name === '__pycache__' || entry.name === '.venv' || entry.name === '.pytest_cache') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRepoFiles(fullPath, baseDir));
    } else {
      files.push({
        path: path.relative(baseDir, fullPath),
        content: fs.readFileSync(fullPath, 'utf-8'),
      });
    }
  }
  return files;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/posting', async (req, res) => {
    const raw = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!raw) {
      res.status(422).json({ detail: 'Message cannot be empty.' });
      return;
    }
    if (raw.length > 200) {
      res.status(422).json({ detail: 'Message must not exceed 200 characters.' });
      return;
    }

    const urls = extractValidUrls(raw);
    if (urls.length === 0) {
      res.status(422).json({ detail: 'Message must include exactly one valid CTA URL (http:// or https://).' });
      return;
    }
    if (urls.length > 1) {
      res.status(422).json({ detail: 'Message must contain only one CTA URL.' });
      return;
    }

    const ctaUrl = urls[0];
    const results = await Promise.all([
      postToBluesky(raw, ctaUrl),
      postToTelegram(raw),
      postToGitHubGist(raw, ctaUrl),
      postToDevTo(raw, ctaUrl),
      postToMastodon(raw),
    ]);

    const success = results.some((r) => r.status === 'success');
    res.json({ success, results });
  });

  app.get('/api/repo', (_req, res) => {
    const repoDir = path.resolve(process.cwd(), 'automated-posting');
    if (!fs.existsSync(repoDir)) {
      res.status(404).json({ error: 'Python project folder not found' });
      return;
    }
    res.json({ files: collectRepoFiles(repoDir, repoDir) });
  });

  app.get('/api/repo/download', async (_req, res) => {
    const repoDir = path.resolve(process.cwd(), 'automated-posting');
    if (!fs.existsSync(repoDir)) {
      res.status(404).json({ error: 'Python project folder not found' });
      return;
    }

    const zip = new JSZip();
    const root = zip.folder('automated-posting');
    for (const file of collectRepoFiles(repoDir, repoDir)) {
      root?.file(file.path, file.content);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="automated-posting.zip"');
    res.send(buffer);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(3000, '0.0.0.0', () => {
    console.log('Server running on http://localhost:3000');
  });
}

startServer();
