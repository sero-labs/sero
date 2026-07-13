/**
 * DevServerPreview, renders a dev server URL in a sandboxed iframe
 * inside the editor panel.
 *
 * Tab paths use the convention `devserver://<url>` (e.g.
 * `devserver://http://192.168.64.5:3000`). This component strips the
 * prefix and loads the URL in an iframe with broad sandbox permissions
 * so JS frameworks (React HMR, Vite, etc.) work correctly.
 *
 * Unlike HtmlPreview (blob: URL, fully isolated), this component loads
 * a live URL so it needs `allow-same-origin` for HMR websockets and
 * `allow-forms` / `allow-popups` for full app functionality.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Globe, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';

/** Prefix used to identify dev server preview tabs in the editor. */
const DEV_SERVER_PREFIX = 'devserver://';

/** Check if a tab path represents a dev server preview. */
export function isDevServerTab(tabPath: string): boolean {
  return tabPath.startsWith(DEV_SERVER_PREFIX);
}

/** Extract the URL from a dev server tab path. */
function getDevServerUrl(tabPath: string): string {
  return tabPath.slice(DEV_SERVER_PREFIX.length);
}

interface Props {
  tabPath: string;
}

function isPrivateIpv4(hostname: string): boolean {
  if (hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('169.254.')) {
    return true;
  }
  return /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function canEmbedDevServerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (hostname.endsWith('.local')) return true;
    if (/^192\.168\.64\.\d{1,3}$/.test(hostname)) return true;
    return isPrivateIpv4(hostname);
  } catch {
    return false;
  }
}

export function DevServerPreview({ tabPath }: Props) {
  const url = getDevServerUrl(tabPath);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [urlInput, setUrlInput] = useState(url);

  const handleReload = useCallback(() => {
    if (iframeRef.current) {
      // Force reload by toggling src
      const src = iframeRef.current.src;
      iframeRef.current.src = '';
      requestAnimationFrame(() => {
        if (iframeRef.current) iframeRef.current.src = src;
      });
    }
  }, []);

  const handleNavigate = useCallback(() => {
    let target = urlInput.trim();
    if (!target) return;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `http://${target}`;
    }
    setCurrentUrl(target);
  }, [urlInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNavigate();
  }, [handleNavigate]);

  const handleOpenExternal = useCallback(() => {
    window.open(currentUrl, '_blank');
  }, [currentUrl]);

  const displayHost = useMemo(() => {
    try {
      const u = new URL(currentUrl);
      return `${u.hostname}:${u.port || (u.protocol === 'https:' ? '443' : '80')}`;
    } catch {
      return currentUrl;
    }
  }, [currentUrl]);

  const canEmbed = useMemo(() => canEmbedDevServerUrl(currentUrl), [currentUrl]);

  return (
    <div className="flex h-full flex-col bg-[var(--bg-base)]">
      {/* Navigation bar */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5">
        <Globe className="size-3.5 shrink-0 text-[var(--text-muted)]" />
        <input aria-label="Preview URL"
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleNavigate}
          className="flex-1 bg-[var(--bg-elevated)] rounded px-2 py-1 text-xs text-[var(--text-primary)] border border-[var(--border-subtle)] outline-none focus:border-[var(--accent)] transition-colors"
          spellCheck={false}
        />
        <button type="button"
          onClick={handleReload}
          className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] transition-colors"
          title="Reload"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button type="button"
          onClick={handleOpenExternal}
          className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] transition-colors"
          title="Open in browser"
        >
          <ExternalLink className="size-3.5" />
        </button>
        <span className="text-sm text-[var(--text-muted)] tabular-nums">
          {displayHost}
        </span>
      </div>

      {canEmbed ? (
        /* Sandboxed iframe, allow-scripts + allow-same-origin for HMR,
            allow-forms + allow-popups for app functionality. */
        <iframe
          ref={iframeRef}
          src={currentUrl}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
          referrerPolicy="no-referrer"
          title={`Dev Server: ${displayHost}`}
          className="flex-1 w-full border-0"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 text-center">
            <AlertTriangle className="mx-auto mb-3 size-6 text-amber-500" />
            <h3 className="mb-2 text-base font-medium text-[var(--text-primary)]">Open this URL in your browser</h3>
            <p className="mb-4 text-base text-[var(--text-muted)]">
              The preview pane only embeds local dev servers such as localhost, .local hosts, and private/container IPs.
              External URLs like Tailscale links can trigger frame-navigation security errors inside Electron.
            </p>
            <button type="button"
              onClick={handleOpenExternal}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-base text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              <ExternalLink className="size-4" />
              Open {displayHost}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
