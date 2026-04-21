import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@sero-ai/ui/components/ui/alert';
import { cn } from '@sero-ai/ui/lib/utils';
import { AlertCircle, LoaderCircle } from 'lucide-react';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://github.com',
  'https://login.microsoftonline.com',
  'https://login.live.com',
  'https://accounts.google.com',
  'https://auth.openai.com',
];

export interface McpAuthBrowserProps {
  src: string | null;
  className?: string;
  partition?: string;
  allowedOrigins?: string[];
  onBlockedNavigation?: (url: string) => void;
  onCallbackUrl?: (url: string) => void;
  onLoadStateChange?: (loading: boolean) => void;
  onLoadError?: (message: string) => void;
}

export function McpAuthBrowser({
  src,
  className,
  partition = 'persist:sero-mcp-auth',
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
  onBlockedNavigation,
  onCallbackUrl,
  onLoadStateChange,
  onLoadError,
}: McpAuthBrowserProps) {
  const webviewRef = useRef<HTMLWebViewElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizedAllowedOrigins = useMemo(() => {
    return allowedOrigins.map((origin) => normalizeOrigin(origin)).filter((origin): origin is string => !!origin);
  }, [allowedOrigins]);

  const initialUrl = useMemo(() => {
    if (!src) return null;
    try {
      const parsed = new URL(src);
      return isAllowedUrl(parsed, normalizedAllowedOrigins) ? parsed.toString() : null;
    } catch {
      return null;
    }
  }, [normalizedAllowedOrigins, src]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !initialUrl) return;

    const handleWillNavigate = (event: WebviewNavigationEvent) => {
      try {
        const parsed = new URL(event.url);
        if (isLoopbackUrl(parsed)) {
          event.preventDefault();
          setLoading(false);
          setError(null);
          onLoadStateChange?.(false);
          onCallbackUrl?.(event.url);
          return;
        }
        if (isAllowedUrl(parsed, normalizedAllowedOrigins)) return;
      } catch {
        // Invalid navigation attempts are blocked below.
      }

      event.preventDefault();
      setError(`Blocked navigation to ${event.url}`);
      onBlockedNavigation?.(event.url);
    };

    const handleDidStartLoading = () => {
      setLoading(true);
      setError(null);
      onLoadStateChange?.(true);
    };

    const handleDidStopLoading = () => {
      setLoading(false);
      onLoadStateChange?.(false);
    };

    const handleDidFailLoad = (event: WebviewLoadErrorEvent) => {
      const message = event.errorDescription || 'Auth page failed to load.';
      setError(message);
      setLoading(false);
      onLoadStateChange?.(false);
      onLoadError?.(message);
    };

    webview.addEventListener('will-navigate', handleWillNavigate);
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-fail-load', handleDidFailLoad);

    return () => {
      webview.removeEventListener('will-navigate', handleWillNavigate);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
    };
  }, [initialUrl, normalizedAllowedOrigins, onBlockedNavigation, onCallbackUrl, onLoadError, onLoadStateChange]);

  if (!src) {
    return <AuthBrowserPlaceholder message="Authentication session not started yet." className={className} />;
  }

  if (!initialUrl) {
    return (
      <AuthBrowserPlaceholder
        className={className}
        message="The requested authentication URL is invalid or outside the MCP auth allowlist."
      />
    );
  }

  return (
    <div className={cn('relative h-full min-h-0 w-full overflow-hidden rounded-xl border border-border bg-card', className)}>
      {loading && (
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          Loading authentication page…
        </div>
      )}

      {error && (
        <div className="absolute inset-x-3 top-3 z-10">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Authentication browser warning</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <webview
        ref={(node) => {
          webviewRef.current = node;
        }}
        src={initialUrl}
        partition={partition}
        allowpopups={false}
        webpreferences="contextIsolation=yes,nodeIntegration=no,javascript=yes"
        className="h-full w-full bg-background"
      />
    </div>
  );
}

function AuthBrowserPlaceholder({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center', className)}>
      <div className="max-w-md space-y-2">
        <div className="text-sm font-medium text-foreground">Embedded auth browser</div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function isAllowedUrl(url: URL, allowedOrigins: string[]): boolean {
  if (isLoopbackUrl(url)) {
    return true;
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    return false;
  }
  return allowedOrigins.includes(url.origin);
}

function isLoopbackUrl(url: URL): boolean {
  if (!['http:', 'https:'].includes(url.protocol)) {
    return false;
  }
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
}

export default McpAuthBrowser;
