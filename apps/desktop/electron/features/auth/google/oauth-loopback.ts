import http from 'node:http';

import {
  LOOPBACK,
  TOKEN_URL,
  USERINFO_URL,
  getGoogleCredentials,
} from './config';
import type { GoogleTokenResponse } from './types';

export interface LoopbackServer {
  port: number;
  getCode: Promise<string>;
  server: http.Server;
}

export function startOAuthLoopbackServer(): Promise<LoopbackServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const getCode = new Promise<string>((ok, fail) => {
      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '/', `http://${LOOPBACK}`);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (code) {
          res.end('<html><head><script>window.close()</script></head><body><p>Signed in. You can close this tab.</p></body></html>');
          ok(code);
        } else {
          res.end(`<h2>Error</h2><p>${error ?? 'Unknown'}</p>`);
          fail(new Error(error ?? 'Authorization denied'));
        }
      });
    });

    server.listen(0, LOOPBACK, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Listen failed'));
        return;
      }
      resolve({ port: addr.port, getCode, server });
    });

    server.on('error', reject);
  });
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<GoogleTokenResponse> {
  const creds = getGoogleCredentials();
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Token exchange failed: ${resp.status} ${await resp.text()}`);
  }

  return (await resp.json()) as GoogleTokenResponse;
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string> {
  const resp = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Userinfo failed: ${resp.status}`);
  }

  return ((await resp.json()) as { email: string }).email;
}
