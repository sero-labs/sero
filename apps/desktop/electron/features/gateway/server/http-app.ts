import http from 'http';
import type { Duplex } from 'stream';
import { DEV_PROXY_PREFIX, handleDevProxyRequest, handleDevProxyUpgrade, type DevProxyDeps } from './devserver-proxy';
import { tryServeGrabScript } from './grab-script';
import { tryServeStaticFile } from './static-files';

type WebChatHtmlProvider = () => string;

interface GatewayHttpServerOptions {
  staticRoot: string;
  /** Preview listener ports — allowed as frame sources for the SPA. */
  previewPort: number;
  previewTlsPort: number;
  getWebChatHtml: () => WebChatHtmlProvider | null;
  getProxyDeps: () => DevProxyDeps;
  upgradeWebSocket: (
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void;
}

function setGatewaySecurityHeaders(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  previewPort: number,
  previewTlsPort: number,
): void {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Dev-server previews are framed from their own origin (same host,
  // preview port — direct or tailnet TLS mapping) so the sandboxed iframe
  // can use allow-same-origin without sharing the SPA's origin. Derive
  // that origin from the request host.
  const hostname = (req.headers.host ?? '').split(':')[0];
  const previewSrc = hostname
    ? ` http://${hostname}:${previewPort} https://${hostname}:${previewPort}` +
      ` https://${hostname}:${previewTlsPort}`
    : '';
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; " +
      `frame-src 'self'${previewSrc}`,
  );
}

async function serveDevProxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: DevProxyDeps,
): Promise<void> {
  try {
    const handled = await handleDevProxyRequest(req, res, deps);
    if (!handled) {
      res.writeHead(404);
      res.end('Not Found');
    }
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(err instanceof Error ? err.message : 'Dev proxy error');
  }
}

export function createGatewayHttpServer(options: GatewayHttpServerOptions): http.Server {
  const server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    const pathname = rawUrl.split('?')[0];
    const isProxyRequest = pathname.startsWith(DEV_PROXY_PREFIX);

    if (!isProxyRequest) {
      setGatewaySecurityHeaders(req, res, options.previewPort, options.previewTlsPort);
    }

    if (isProxyRequest) {
      void serveDevProxy(req, res, options.getProxyDeps());
      return;
    }

    const webChatHtml = options.getWebChatHtml();
    if (pathname === '/basic' && webChatHtml) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(webChatHtml());
      return;
    }
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (tryServeGrabScript(pathname, res)) return;

    if (tryServeStaticFile(pathname, res, options.staticRoot)) return;

    res.writeHead(404);
    res.end('Not Found');
  });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path.startsWith(DEV_PROXY_PREFIX)) {
      void handleDevProxyUpgrade(req, socket, head, options.getProxyDeps()).catch(() => {
        socket.destroy();
      });
      return;
    }
    options.upgradeWebSocket(req, socket, head);
  });

  return server;
}

/**
 * Dedicated listener for dev-server previews. Serves only the `/p/...`
 * proxy routes (plus the grab script they inject) so previews live on
 * their own origin — the preview iframe can then use allow-same-origin
 * without becoming same-origin with the web-remote SPA.
 */
export function createPreviewHttpServer(
  options: Pick<GatewayHttpServerOptions, 'getProxyDeps'>,
): http.Server {
  const server = http.createServer((req, res) => {
    const pathname = (req.url ?? '/').split('?')[0];
    if (pathname.startsWith(DEV_PROXY_PREFIX)) {
      void serveDevProxy(req, res, options.getProxyDeps());
      return;
    }
    if (tryServeGrabScript(pathname, res)) return;
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path.startsWith(DEV_PROXY_PREFIX)) {
      void handleDevProxyUpgrade(req, socket, head, options.getProxyDeps()).catch(() => {
        socket.destroy();
      });
      return;
    }
    socket.destroy();
  });

  return server;
}
