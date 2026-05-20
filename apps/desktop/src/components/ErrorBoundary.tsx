import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, Copy, Check } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

// Dev-time hazard: when Vite re-optimizes deps (lockfile churn, new transitive
// imports, restart) the hashed chunk filenames under node_modules/.vite/deps/
// rotate. Already-loaded pages still hold the old URLs and 404 on the next
// lazy() render. We detect that specific failure mode so we can recover by
// reloading the page rather than crashing the whole region permanently.
function isDynamicImportError(error: Error): boolean {
  if (error.name === 'ChunkLoadError') return true;
  const msg = `${error.message}`.toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('importing a module script failed')
  );
}

const CHUNK_RELOAD_MARKER_PARAM = 'seroChunkReload';

function hasChunkReloadMarker(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return new URL(window.location.href).searchParams.has(CHUNK_RELOAD_MARKER_PARAM);
  } catch {
    return true;
  }
}

function reloadWithChunkMarker(): void {
  if (typeof window === 'undefined') return;
  void (async () => {
    await window.sero?.shell.clearRendererCache().catch(() => undefined);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(CHUNK_RELOAD_MARKER_PARAM, Date.now().toString());
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  })();
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Label shown in the fallback UI to identify which region crashed. */
  region?: string;
  /**
   * Compact mode renders a minimal inline fallback instead of a centered card.
   * Useful for sidebar-sized panels where space is limited.
   */
  compact?: boolean;
  /** Optional callback invoked when an error is caught. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  copied: boolean;
}

/**
 * React error boundary that catches render errors and displays a recoverable
 * fallback UI instead of a blank screen. Place around major shell regions
 * (sidebar, active app, chat panel) so a crash in one area doesn't take down
 * the entire app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.region ? `:${this.props.region}` : ''}]`, error, errorInfo);
    this.props.onError?.(error, errorInfo);

    if (isDynamicImportError(error) && !hasChunkReloadMarker()) {
      // Defer past the current render so React's commit phase finishes cleanly
      // before navigation tears the document down. The URL marker survives the
      // reload without using renderer storage, so a persistent failure falls
      // through to the manual reload UI instead of looping.
      setTimeout(reloadWithChunkMarker, 0);
    }
  }

  private handleRetry = () => {
    this.setState({ error: null, copied: false });
  };

  private handleReload = () => {
    const { error } = this.state;
    if (error && isDynamicImportError(error)) {
      reloadWithChunkMarker();
      return;
    }
    if (typeof window !== 'undefined') window.location.reload();
  };

  private handleCopy = () => {
    const { error } = this.state;
    if (!error) return;
    const text = `${error.name}: ${error.message}\n${error.stack ?? ''}`;
    void copyTextToClipboard(text).then((ok) => {
      if (!ok) return;
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const { error, copied } = this.state;
    const { region, compact } = this.props;
    const isChunkError = isDynamicImportError(error);

    if (compact) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
          <AlertTriangle className="size-5 text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-muted)]">
            {isChunkError
              ? 'Stale module — reload to recover'
              : region
                ? `${region} crashed`
                : 'Something went wrong'}
          </p>
          {isChunkError ? (
            <Button variant="ghost" size="xs" onClick={this.handleReload}>
              <RefreshCw className="size-3" />
              Reload
            </Button>
          ) : (
            <Button variant="ghost" size="xs" onClick={this.handleRetry}>
              <RotateCcw className="size-3" />
              Retry
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-base)] p-6">
        <div className="flex max-w-lg flex-col gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--text-danger)]" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[var(--text-default)]">
                {isChunkError
                  ? 'Stale module detected'
                  : region
                    ? `${region} crashed`
                    : 'Something went wrong'}
              </h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {isChunkError
                  ? 'A dynamically loaded module failed to fetch. This usually means dependencies were re-bundled. Reload to recover.'
                  : 'An unhandled error occurred. You can retry to recover, or copy the error details for debugging.'}
              </p>
            </div>
          </div>

          <pre className="max-h-40 overflow-auto rounded-md bg-[var(--bg-inset)] p-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
            {error.name}: {error.message}
            {error.stack && (
              <>
                {'\n'}
                {error.stack
                  .split('\n')
                  .slice(1, 8)
                  .join('\n')}
              </>
            )}
          </pre>

          <div className="flex items-center gap-2">
            {isChunkError ? (
              <Button variant="outline" size="sm" onClick={this.handleReload}>
                <RefreshCw className="size-3.5" />
                Reload
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={this.handleRetry}>
                <RotateCcw className="size-3.5" />
                Retry
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={this.handleCopy}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy error'}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
