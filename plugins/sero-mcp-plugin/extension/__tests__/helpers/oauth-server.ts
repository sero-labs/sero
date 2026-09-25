import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface OAuthTestServer {
  /** The protected MCP endpoint. */
  url: string;
  issuer: string;
  /** Every request, as "METHOD path" with its form or JSON body. */
  requests: Array<{ path: string; method: string; body: string }>;
  /** Makes the resource metadata name another authorization server from now on. */
  switchAuthorizationServer(issuer: string): void;
  close(): Promise<void>;
}

/**
 * A protected MCP endpoint with its own authorization server: resource
 * metadata, authorization server metadata (with `iss` support), dynamic client
 * registration and a token endpoint. The MCP endpoint always answers 401 for
 * requests without the issued token.
 */
export async function startOAuthTestServer(): Promise<OAuthTestServer> {
  const requests: OAuthTestServer['requests'] = [];
  let origin = '';
  let authorizationServer = '';
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const url = new URL(req.url ?? '/', origin);
      requests.push({ path: url.pathname, method: req.method ?? 'GET', body });
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
      };
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
        return json(200, { resource: `${origin}/mcp`, authorization_servers: [authorizationServer] });
      }
      if (url.pathname.startsWith('/.well-known/oauth-authorization-server') || url.pathname.startsWith('/.well-known/openid-configuration')) {
        return json(200, {
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          registration_endpoint: `${origin}/register`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
          authorization_response_iss_parameter_supported: true,
        });
      }
      if (url.pathname === '/register') {
        const metadata = JSON.parse(body || '{}');
        return json(201, { ...metadata, client_id: 'registered-client', client_id_issued_at: 1 });
      }
      if (url.pathname === '/token') {
        return json(200, { access_token: 'issued-token', token_type: 'Bearer', expires_in: 3600 });
      }
      if (url.pathname === '/mcp') {
        res.writeHead(401, {
          'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
        }).end();
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  authorizationServer = origin;
  return {
    url: `${origin}/mcp`,
    issuer: origin,
    requests,
    switchAuthorizationServer: (issuer) => { authorizationServer = issuer; },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
