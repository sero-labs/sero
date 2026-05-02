import http from 'http';
import type { Duplex } from 'stream';
import { DEV_PROXY_PREFIX, handleDevProxyRequest, handleDevProxyUpgrade, type DevProxyDeps } from './devserver-proxy';
import { tryServeStaticFile } from './static-files';

type WebChatHtmlProvider = () => string;

interface GatewayHttpServerOptions {
  staticRoot: string;
  getWebChatHtml: () => WebChatHtmlProvider | null;
  getProxyDeps: () => DevProxyDeps;
  upgradeWebSocket: (
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void;
}

function setGatewaySecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    // frame-src 'self' lets the SPA iframe /p/... previews on the same origin.
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-src 'self'",
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

    if (!isProxyRequest) setGatewaySecurityHeaders(res);

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
