import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/project-store';
import './PreviewPanel.css';

interface Props {
  projectId: string;
  panelId: string;
}

const COMMON_PORTS = [5173, 3000, 8080, 4321, 8000, 4200, 3001];

export function PreviewPanel({ projectId, panelId }: Props) {
  const project = useProjectStore((s) => s.projects.get(projectId));
  const webviewRef = useRef<HTMLWebViewElement | null>(null);
  const [url, setUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedPort, setDetectedPort] = useState<number | null>(null);

  const containerIp = project?.ipAddress;

  // Auto-detect running dev server by probing common ports.
  // Uses a slow poll to avoid spamming connection-refused errors.
  useEffect(() => {
    if (!containerIp || url) return; // Stop probing once we have a URL

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function probe() {
      for (const port of COMMON_PORTS) {
        if (cancelled) return;
        try {
          const resp = await fetch(`http://${containerIp}:${port}/`, {
            method: 'HEAD',
            mode: 'no-cors',           // Avoids CORS errors in console
            signal: AbortSignal.timeout(800),
          });
          // no-cors gives opaque response (status 0) but doesn't throw if server is up
          if (!cancelled) {
            setDetectedPort(port);
            const fullUrl = `http://${containerIp}:${port}`;
            setUrl(fullUrl);
            setInputUrl(fullUrl);
            return;
          }
        } catch {
          // Port not open — silently continue
        }
      }

      // Retry with backoff (5s between sweeps)
      if (!cancelled) {
        timer = setTimeout(probe, 5000);
      }
    }

    // Start probing after a short delay (give container time to boot)
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
    if (url) {
      const wv = webviewRef.current as any;
      wv?.reload?.();
    }
  }, [url]);

  const handleBack = useCallback(() => {
    const wv = webviewRef.current as any;
    wv?.goBack?.();
  }, []);

  const handleForward = useCallback(() => {
    const wv = webviewRef.current as any;
    wv?.goForward?.();
  }, []);

  // Webview event handlers
  useEffect(() => {
    const wv = webviewRef.current as any;
    if (!wv) return;

    const onStartLoading = () => setIsLoading(true);
    const onStopLoading = () => setIsLoading(false);
    const onFailLoad = (e: any) => {
      setIsLoading(false);
      if (e.errorCode !== -3) { // -3 is aborted navigation, ignore
        setError(`Failed to load: ${e.errorDescription || 'Unknown error'}`);
      }
    };
    const onDidNavigate = (e: any) => {
      setInputUrl(e.url);
    };

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
    <div className="preview-panel">
      {/* Browser chrome */}
      <div className="preview-toolbar">
        <div className="preview-nav">
          <button className="preview-nav-btn" onClick={handleBack} title="Back">←</button>
          <button className="preview-nav-btn" onClick={handleForward} title="Forward">→</button>
          <button className="preview-nav-btn" onClick={handleRefresh} title="Refresh">
            {isLoading ? '⏳' : '↻'}
          </button>
        </div>
        <form className="preview-url-form" onSubmit={handleUrlSubmit}>
          <input
            className="preview-url-input"
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder={containerIp ? `http://${containerIp}:3000` : 'Waiting for container...'}
            spellCheck={false}
          />
        </form>
        {containerIp && (
          <div className="preview-port-buttons">
            {COMMON_PORTS.slice(0, 4).map((port) => (
              <button
                key={port}
                className={`preview-port-btn ${url.includes(`:${port}`) ? 'active' : ''}`}
                onClick={() => navigate(`http://${containerIp}:${port}`)}
                title={`Port ${port}`}
              >
                :{port}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="preview-content">
        {url ? (
          <>
            {/* Electron webview tag for embedded browser */}
            <webview
              ref={webviewRef as any}
              src={url}
              className="preview-webview"
              /* @ts-ignore — webview is an Electron-specific element */
              allowpopups="true"
            />
            {error && (
              <div className="preview-error">
                <p>{error}</p>
                <button onClick={() => navigate(url)}>Retry</button>
              </div>
            )}
          </>
        ) : (
          <div className="preview-empty">
            <p className="preview-empty-title">🌐 Preview</p>
            {containerIp ? (
              <p className="preview-empty-hint">
                {detectedPort
                  ? `Connecting to port ${detectedPort}...`
                  : 'Start a dev server in the terminal, and it will appear here automatically.'}
              </p>
            ) : (
              <p className="preview-empty-hint">Waiting for container to start...</p>
            )}
            {containerIp && (
              <div className="preview-empty-ports">
                {COMMON_PORTS.slice(0, 4).map((port) => (
                  <button
                    key={port}
                    className="preview-empty-port-btn"
                    onClick={() => navigate(`http://${containerIp}:${port}`)}
                  >
                    Try :{port}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
