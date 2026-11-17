import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Send } from 'lucide-react';

interface PlatformResult {
  platform: string;
  status: 'success' | 'failed';
  posted_url: string | null;
  public_access: boolean;
  date: string | null;
  time: string | null;
  error: string | null;
}

interface PostingResponse {
  success: boolean;
  results: PlatformResult[];
}

interface RepoFile {
  path: string;
  content: string;
}

const PRESETS = [
  {
    label: 'Valid CTA Post',
    text: 'Check out our latest business platform and grow your online visibility. https://example.com',
  },
  {
    label: 'Missing Link',
    text: 'Check out our latest business platform and grow your online visibility today.',
  },
  {
    label: 'Two Links',
    text: 'Visit https://example.com and read our docs at https://docs.example.com today.',
  },
  {
    label: 'Over 200 Chars',
    text: 'Grow your online visibility with our automated platform designed for teams building fast and reliable integrations across multiple channels every single day without manual overhead. https://example.com',
  },
];

const URL_REGEX = /https?:\/\/[^\s<>"'\])]+/g;

function detectUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) ?? [];
  return matches
    .map((raw) => raw.replace(/[.,!?;:]+$/, ''))
    .filter((cleaned) => {
      try {
        const u = new URL(cleaned);
        return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
      } catch {
        return false;
      }
    });
}

export default function App() {
  const [tab, setTab] = useState<'test' | 'code'>('test');
  const [message, setMessage] = useState(PRESETS[0].text);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [response, setResponse] = useState<PostingResponse | null>(null);
  const [showJson, setShowJson] = useState(false);

  const [repoFiles, setRepoFiles] = useState<RepoFile[]>([]);
  const [selectedPath, setSelectedPath] = useState('app/main.py');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/repo')
      .then((res) => res.json())
      .then((data: { files?: RepoFile[] }) => {
        if (data.files && data.files.length > 0) {
          setRepoFiles(data.files);
        }
      })
      .catch(() => {
        // Ignore if repo listing is unavailable
      });
  }, []);

  const trimmed = message.trim();
  const charCount = trimmed.length;
  const detectedUrls = useMemo(() => detectUrls(trimmed), [trimmed]);

  const activeFile = useMemo(
    () => repoFiles.find((f) => f.path === selectedPath) ?? repoFiles[0],
    [repoFiles, selectedPath]
  );

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setValidationError(null);

    try {
      const res = await fetch('/posting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResponse(null);
        setValidationError(data.detail || `Request failed with HTTP ${res.status}`);
      } else {
        setResponse(data as PostingResponse);
      }
    } catch (err) {
      setResponse(null);
      setValidationError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyFile() {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar: 3 zones */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            MultiPost API
          </span>

          <nav className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setTab('test')}
              className={`py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === 'test'
                  ? 'border-blue-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Test Endpoint
            </button>
            <button
              type="button"
              onClick={() => setTab('code')}
              className={`py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === 'code'
                  ? 'border-blue-600 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Python Code
            </button>
          </nav>

          <a
            href="/api/repo/download"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download Zip
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {tab === 'test' ? (
          <div className="space-y-8">
            {/* Title & Spec */}
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Automated Multi-Platform Posting
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                <span className="font-mono text-slate-700">POST /posting</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <span>Max 200 characters</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <span>1 valid CTA link</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <span>5 independent platforms</span>
              </p>
            </div>

            {/* Composer */}
            <form onSubmit={handlePublish} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="message-input" className="text-sm font-medium text-slate-800">
                  Message Payload
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setMessage(preset.text);
                        setValidationError(null);
                      }}
                      className="px-2.5 py-1 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                id="message-input"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter a short message with one CTA URL..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
                  <span className={charCount > 200 ? 'text-red-600 font-medium' : 'text-slate-500'}>
                    {charCount} / 200 chars
                  </span>
                  <span className="text-slate-300" aria-hidden="true">|</span>
                  <span className={detectedUrls.length === 1 ? 'text-emerald-700' : 'text-amber-700'}>
                    {detectedUrls.length === 1
                      ? '1 CTA URL detected'
                      : `${detectedUrls.length} CTA URLs detected (requires 1)`}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  {loading ? 'Publishing...' : 'Publish Message'}
                </button>
              </div>
            </form>

            {/* Validation Error */}
            {validationError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
                <span className="font-medium">Validation Error (HTTP 422): </span>
                {validationError}
              </div>
            )}

            {/* Results Section */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-sm">
                  <h2 className="font-semibold text-slate-900">Posting Results</h2>
                  {response && (
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      success: {String(response.success)} ·{' '}
                      {response.results.filter((r) => r.status === 'success').length}/{response.results.length} succeeded
                    </span>
                  )}
                </div>

                {response && (
                  <button
                    type="button"
                    onClick={() => setShowJson((v) => !v)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {showJson ? 'Table View' : 'Raw JSON'}
                  </button>
                )}
              </div>

              {loading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4, 5].map((row) => (
                    <div key={row} className="h-9 bg-slate-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : !response ? (
                <div className="px-6 py-12 text-center text-sm text-slate-500">
                  Submit a message above to dispatch live requests across Bluesky, Telegram, GitHub Gist, Dev.to, and Mastodon.
                </div>
              ) : showJson ? (
                <pre className="p-6 text-xs font-mono text-slate-800 bg-slate-50 overflow-x-auto leading-relaxed">
                  {JSON.stringify(response, null, 2)}
                </pre>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                        <th className="py-3 px-6">Platform</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Posted URL</th>
                        <th className="py-3 px-4">Public</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Time</th>
                        <th className="py-3 px-6">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {response.results.map((item) => (
                        <tr key={item.platform} className="hover:bg-slate-50/70">
                          <td className="py-3.5 px-6 font-medium text-slate-900 whitespace-nowrap">
                            {item.platform}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span
                              className={
                                item.status === 'success'
                                  ? 'text-emerald-700 font-medium'
                                  : 'text-red-600 font-medium'
                              }
                            >
                              {item.status === 'success' ? 'Success' : 'Failed'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 max-w-xs truncate">
                            {item.posted_url ? (
                              <a
                                href={item.posted_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-mono text-xs"
                              >
                                <span className="truncate max-w-[200px]">{item.posted_url}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                            {item.public_access ? 'Yes' : 'No'}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                            {item.date ?? '—'}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                            {item.time ?? '—'}
                          </td>
                          <td className="py-3.5 px-6 text-xs text-slate-600 max-w-xs truncate" title={item.error ?? ''}>
                            {item.error ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  FastAPI Python Codebase
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Run locally with{' '}
                  <code className="font-mono text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                    uvicorn app.main:app --host 0.0.0.0 --port 4000
                  </code>
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-4">
              <aside className="border-b md:border-b-0 md:border-r border-slate-200 p-3 space-y-1 bg-slate-50/50">
                {repoFiles.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono truncate transition-colors cursor-pointer ${
                      activeFile?.path === file.path
                        ? 'bg-white text-blue-600 font-medium border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {file.path}
                  </button>
                ))}
              </aside>

              <div className="md:col-span-3 flex flex-col min-w-0">
                <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-4">
                  <span className="text-xs font-mono text-slate-700 truncate">
                    automated-posting/{activeFile?.path}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyFile}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <pre className="p-5 text-xs font-mono text-slate-800 overflow-x-auto leading-relaxed max-h-[560px]">
                  {activeFile?.content ?? 'Loading files...'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
