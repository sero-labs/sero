/**
 * DevServerPreview — renders a dev server URL in a sandboxed iframe
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

import { useCallback, useRef, useState } from 'react';
import { Globe, RefreshCw, ExternalLink } from 'lucide-react';

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

  const displayHost = (() => {
    try {
      const u = new URL(currentUrl);
      return `${u.hostname}:${u.port || (u.protocol === 'https:' ? '443' : '80')}`;
    } catch {
      return currentUrl;
    }
  })();

  return (
    <div className="flex h-full flex-col bg-[var(--bg-base)]">
      {/* Navigation bar */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5">
        <Globe className="size-3.5 shrink-0 text-[var(--text-muted)]" />
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleNavigate}
          className="flex-1 bg-[var(--bg-elevated)] rounded px-2 py-1 text-xs text-[var(--text-primary)] border border-[var(--border-subtle)] outline-none focus:border-[var(--accent)] transition-colors"
          spellCheck={false}
        />
        <button
          onClick={handleReload}
          className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] transition-colors"
          title="Reload"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          onClick={handleOpenExternal}
          className="flex size-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] transition-colors"
          title="Open in browser"
        >
          <ExternalLink className="size-3.5" />
        </button>
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
          {displayHost}
        </span>
      </div>

      {/* Sandboxed iframe — allow-scripts + allow-same-origin for HMR,
          allow-forms + allow-popups for app functionality. */}
      <iframe
        ref={iframeRef}
        src={currentUrl}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
        referrerPolicy="no-referrer"
        title={`Dev Server: ${displayHost}`}
        className="flex-1 w-full border-0"
      />
    </div>
  );
}
