import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';

export interface OAuthTestServer {
  /** The protected MCP endpoint. */
  url: string;
  issuer: string;
  /** Every request, as "METHOD path" with its form or JSON body. */
  requests: Array<{ path: string; method: string; body: string }>;
  /** Makes the resource metadata name another authorization server from now on. */
  switchAuthorizationServer(issuer: string): void;
  /** From now on, `tools/call` needs a token with this scope; other tokens get 403 insufficient_scope. */
  requireScopeForToolCalls(scope: string): void;
  close(): Promise<void>;
}

/**
 * A protected MCP endpoint with its own authorization server: resource
 * metadata, authorization server metadata (with `iss` support), dynamic client
 * registration and a token endpoint. Without `createMcpServer`, the MCP
 * endpoint always answers 401. With it, a request with an issued token reaches
 * that server. A test signs in with the code `scope:<scopes>`, and the token
 * for that code carries those scopes.
 */
export async function startOAuthTestServer(options: { createMcpServer?: () => McpServer } = {}): Promise<OAuthTestServer> {
  const requests: OAuthTestServer['requests'] = [];
  const tokenScopes = new Map<string, string[]>();
  const mcpHandler = options.createMcpServer ? toNodeHandler(createMcpHandler(options.createMcpServer)) : null;
  let requiredScope = '';
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
        const code = new URLSearchParams(body).get('code') ?? '';
        const scopes = code.startsWith('scope:') ? code.slice('scope:'.length).split(' ').filter(Boolean) : [];
        const token = `issued-token-${tokenScopes.size + 1}`;
        tokenScopes.set(token, scopes);
        return json(200, { access_token: token, token_type: 'Bearer', expires_in: 3600, scope: scopes.join(' ') });
      }
      const scopes = tokenScopes.get(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
      if (url.pathname === '/mcp' && mcpHandler && scopes) {
        const message = body ? JSON.parse(body) as { method?: string } : undefined;
        if (requiredScope && message?.method === 'tools/call' && !scopes.includes(requiredScope)) {
          res.writeHead(403, {
            'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${requiredScope}", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
          }).end();
          return;
        }
        void mcpHandler(req, res, message);
        return;
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
    requireScopeForToolCalls: (scope) => { requiredScope = scope; },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
