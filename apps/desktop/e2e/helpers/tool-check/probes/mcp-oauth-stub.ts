/**
 * A local OAuth server for the `mcp_manager` auth actions.
 *
 * It follows the MCP authorization flow: the MCP endpoint answers 401 with
 * resource metadata, then authorization server metadata, dynamic client
 * registration and a token endpoint. Any authorization code gets a token. A
 * request with an issued token goes on to the HTTP fixture, so a signed-in
 * server really connects. The endpoints are those of the plugin's own test
 * helper (`plugins/sero-mcp-plugin/extension/__tests__/helpers/oauth-server.ts`).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface OAuthStub {
  /** The protected MCP endpoint. */
  url: string;
  /** The authorization server, which is the stub's own origin. */
  issuer: string;
  /** How many tokens the token endpoint has issued. */
  issuedTokens(): number;
}

const HOP_HEADERS = ['host', 'authorization', 'content-length', 'connection', 'transfer-encoding'];

let running: Promise<OAuthStub> | undefined;

/** Starts the stub once. `upstreamMcpUrl` is the MCP endpoint that signed-in requests reach. */
export function startOAuthStub(upstreamMcpUrl: string): Promise<OAuthStub> {
  running ??= listen(new URL(upstreamMcpUrl));
  return running;
}

async function listen(upstream: URL): Promise<OAuthStub> {
  const tokens = new Set<string>();
  let origin = '';
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url ?? '/', origin);
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
      };
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
        return json(200, { resource: `${origin}/mcp`, authorization_servers: [origin] });
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
        return json(201, { ...JSON.parse(body.toString('utf8') || '{}'), client_id: 'registered-client', client_id_issued_at: 1 });
      }
      if (url.pathname === '/token') {
        const token = `issued-token-${tokens.size + 1}`;
        tokens.add(token);
        return json(200, { access_token: token, token_type: 'Bearer', expires_in: 3600 });
      }
      if (url.pathname === '/mcp') {
        const bearer = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
        if (!tokens.has(bearer)) {
          res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` }).end();
          return;
        }
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => !HOP_HEADERS.includes(name)));
        const forwarded = http.request(upstream, { method: req.method, headers: { ...headers, 'content-length': body.length } }, (reply) => {
          res.writeHead(reply.statusCode ?? 502, reply.headers);
          reply.pipe(res);
        });
        forwarded.on('error', () => res.writeHead(502).end());
        forwarded.end(body);
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // The stub lives in the test worker, so it ends with the worker.
  server.unref();
  return { url: `${origin}/mcp`, issuer: origin, issuedTokens: () => tokens.size };
}
