/**
 * Minimal HTTP CONNECT proxy for container internet access.
 *
 * Runs on the host, bound to 0.0.0.0 so containers can reach it via
 * the gateway IP (e.g. 192.168.64.1). Containers set HTTP_PROXY/HTTPS_PROXY
 * to use this proxy for all outbound traffic.
 *
 * This works around security software (Bitdefender, etc.) that blocks
 * direct outbound TCP from the vmnet virtual network but allows traffic
 * originating from host processes.
 */

import * as http from 'http';
import * as net from 'net';

const DEFAULT_PORT = 19800;

export function handleProxyRequestError(
  res: Pick<http.ServerResponse, 'headersSent' | 'writableEnded' | 'destroyed' | 'writeHead' | 'end' | 'destroy'>,
  message = 'Proxy error',
): void {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(502);
  res.end(message);
}

export class ContainerHttpProxy {
  private server: http.Server | null = null;
  private port: number;
  /** The gateway IP containers use to reach the host. */
  private gatewayIp = '192.168.64.1';

  constructor(port = DEFAULT_PORT) {
    this.port = port;
  }

  /** Start the proxy. Resolves with the proxy URL for containers. */
  async start(): Promise<string> {
    if (this.server) return this.getProxyUrl();

    return new Promise((resolve, reject) => {
      const server = http.createServer((_req, res) => {
        // Plain HTTP requests — forward them
        res.writeHead(405);
        res.end('Use CONNECT for HTTPS');
      });

      // Handle CONNECT method (HTTPS tunneling)
      server.on('connect', (req, clientSocket, head) => {
        const [host, portStr] = (req.url ?? '').split(':');
        const port = parseInt(portStr, 10) || 443;

        const remoteSocket = net.connect(port, host, () => {
          clientSocket.write(
            'HTTP/1.1 200 Connection Established\r\n\r\n',
          );
          if (head.length > 0) remoteSocket.write(head);
          remoteSocket.pipe(clientSocket);
          clientSocket.pipe(remoteSocket);
        });

        remoteSocket.on('error', () => clientSocket.destroy());
        clientSocket.on('error', () => remoteSocket.destroy());
        remoteSocket.on('close', () => clientSocket.destroy());
        clientSocket.on('close', () => remoteSocket.destroy());
      });

      // Also handle plain HTTP GET/POST (for npm registry HTTP fallback)
      server.on('request', (req, res) => {
        if (!req.url || !req.url.startsWith('http://')) {
          res.writeHead(400);
          res.end('Bad request');
          return;
        }

        const url = new URL(req.url);
        const options: http.RequestOptions = {
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname + url.search,
          method: req.method,
          headers: { ...req.headers, host: url.host },
        };

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.on('error', () => {
            handleProxyRequestError(res);
          });
          proxyRes.pipe(res);
        });
        proxyReq.on('error', () => {
          handleProxyRequestError(res);
        });
        req.on('aborted', () => {
          proxyReq.destroy();
        });
        res.on('close', () => {
          proxyReq.destroy();
        });
        req.pipe(proxyReq);
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[http-proxy] Port ${this.port} in use, trying ${this.port + 1}`);
          this.port += 1;
          server.listen(this.port, '0.0.0.0');
        } else {
          reject(err);
        }
      });

      server.listen(this.port, '0.0.0.0', () => {
        console.log(`[http-proxy] Container proxy running on 0.0.0.0:${this.port}`);
        this.server = server;
        resolve(this.getProxyUrl());
      });
    });
  }

  /** Get the proxy URL that containers should use. */
  getProxyUrl(): string {
    return `http://${this.gatewayIp}:${this.port}`;
  }

  /** Stop the proxy. */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /** Whether the proxy is running. */
  get running(): boolean {
    return this.server !== null;
  }
}
