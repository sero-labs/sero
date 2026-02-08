import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Globe,
  ExternalLink,
  Loader2,
  CircleAlert,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { useProjectStore } from '../../stores/project-store';

interface Props {
  projectId: string;
  panelId: string;
}

const COMMON_PORTS = [5173, 3000, 8080, 4321, 8000, 4200, 3001];

export function PreviewPanel({ projectId }: Props) {
  const project = useProjectStore((s) => s.projects.get(projectId));
  const webviewRef = useRef<HTMLWebViewElement | null>(null);
  const [url, setUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedPort, setDetectedPort] = useState<number | null>(null);

  const containerIp = project?.ipAddress;

  // Auto-detect running dev server by probing common ports
  useEffect(() => {
    if (!containerIp || url) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function probe() {
      for (const port of COMMON_PORTS) {
        if (cancelled) return;
        try {
          await fetch(`http://${containerIp}:${port}/`, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: AbortSignal.timeout(800),
          });
          if (!cancelled) {
            setDetectedPort(port);
            const fullUrl = `http://${containerIp}:${port}`;
            setUrl(fullUrl);
            setInputUrl(fullUrl);
            return;
          }
        } catch {
          // Port not open
        }
      }
      if (!cancelled) timer = setTimeout(probe, 5000);
    }

    timer = setTimeout(probe, 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [containerIp, url]);

  const navigate = useCallback((targetUrl: string) => {
    if (!targetUrl) return;
    let normalized = targetUrl;
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `http://${normalized}`;
    }
    setUrl(normalized);
    setInputUrl(normalized);
    setError(null);
    setIsLoading(true);
  }, []);

  const handleUrlSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    navigate(inputUrl);
  }, [inputUrl, navigate]);

  const handleRefresh = useCallback(() => {
    if (url) (webviewRef.current as any)?.reload?.();
  }, [url]);

  const handleBack = useCallback(() => {
    (webviewRef.current as any)?.goBack?.();
  }, []);

  const handleForward = useCallback(() => {
    (webviewRef.current as any)?.goForward?.();
  }, []);

  const handleOpenExternal = useCallback(() => {
    if (url) window.open(url, '_blank');
  }, [url]);

  // Webview event handlers
  useEffect(() => {
    const wv = webviewRef.current as any;
    if (!wv) return;

    const onStartLoading = () => setIsLoading(true);
    const onStopLoading = () => setIsLoading(false);
    const onFailLoad = (e: any) => {
      setIsLoading(false);
      if (e.errorCode !== -3) setError(`Failed to load: ${e.errorDescription || 'Unknown error'}`);
    };
    const onDidNavigate = (e: any) => setInputUrl(e.url);

    wv.addEventListener('did-start-loading', onStartLoading);
    wv.addEventListener('did-stop-loading', onStopLoading);
    wv.addEventListener('did-fail-load', onFailLoad);
    wv.addEventListener('did-navigate', onDidNavigate);
    wv.addEventListener('did-navigate-in-page', onDidNavigate);

    return () => {
      wv.removeEventListener('did-start-loading', onStartLoading);
      wv.removeEventListener('did-stop-loading', onStopLoading);
      wv.removeEventListener('did-fail-load', onFailLoad);
      wv.removeEventListener('did-navigate', onDidNavigate);
      wv.removeEventListener('did-navigate-in-page', onDidNavigate);
    };
  }, [url]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-base)]">
      {/* ── Toolbar ────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0">
        <TooltipProvider>
          {/* Nav buttons */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={handleBack}>
                  <ArrowLeft className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={handleForward}>
                  <ArrowRight className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Forward</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={handleRefresh}>
                  {isLoading
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <RefreshCw className="size-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </div>

          {/* URL bar */}
          <form className="flex-1 min-w-0" onSubmit={handleUrlSubmit}>
            <Input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder={containerIp ? `http://${containerIp}:3000` : 'Waiting for container...'}
              spellCheck={false}
              className="h-6 text-xs font-mono bg-[var(--bg-base)] border-[var(--border-subtle)] focus-visible:border-[var(--border-focus)]"
            />
          </form>

          {/* Port quick-switch */}
          {containerIp && (
            <div className="flex items-center gap-0.5 shrink-0">
              {COMMON_PORTS.slice(0, 4).map((port) => (
                <Button
                  key={port}
                  variant={url.includes(`:${port}`) ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => navigate(`http://${containerIp}:${port}`)}
                  className="font-mono text-[10px] px-1.5 h-5"
                >
                  :{port}
                </Button>
              ))}
            </div>
          )}

          {/* External link */}
          {url && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={handleOpenExternal}>
                  <ExternalLink className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in browser</TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {url ? (
          <>
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-ignore — webview is Electron-specific */}
            <webview
              ref={webviewRef as any}
              src={url}
              className="w-full h-full border-none"
              {...{ allowpopups: 'true' } as any}
            />
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg-surface)]">
                <CircleAlert className="size-8 text-destructive" />
                <p className="text-sm text-destructive max-w-xs text-center">{error}</p>
                <Button variant="outline" size="sm" onClick={() => navigate(url)}>
                  Retry
                </Button>
              </div>
            )}
          </>
        ) : (
          <PreviewEmptyState
            containerIp={containerIp}
            detectedPort={detectedPort}
            onNavigate={navigate}
          />
        )}
      </div>
    </div>
  );
}

/* ── Empty state (extracted for readability) ────────────────── */

function PreviewEmptyState({
  containerIp,
  detectedPort,
  onNavigate,
}: {
  containerIp: string | undefined;
  detectedPort: number | null;
  onNavigate: (url: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-4">
      <div className="rounded-full bg-[var(--bg-elevated)] p-4">
        <Globe className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Preview</p>
        {containerIp ? (
          <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed">
            {detectedPort
              ? `Connecting to port ${detectedPort}…`
              : 'Start a dev server in the terminal and it will appear here automatically.'}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Waiting for container to start…</p>
        )}
      </div>
      {containerIp && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
          {COMMON_PORTS.slice(0, 4).map((port) => (
            <Badge
              key={port}
              variant="outline"
              className="cursor-pointer font-mono text-[10px] hover:bg-[var(--bg-elevated)] transition-colors"
              onClick={() => onNavigate(`http://${containerIp}:${port}`)}
            >
              Try :{port}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
