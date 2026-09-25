import {
  AuthorizationServerMismatchError,
  IssuerMismatchError,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from '@modelcontextprotocol/client';
import { createMcpClient } from '../manager/client-factory';
import type { McpServerConfig } from '../config/types';
import { clearOAuthFlowState, readOAuthFlowState } from './storage';
import { McpOAuthProvider } from './oauth-provider';

interface PendingAuthSession {
  serverName: string;
  serverUrl: string;
  authUrl: string;
  expectedState?: string;
  transport: StreamableHTTPClientTransport;
}

export interface StartOAuthResult {
  status: 'pending' | 'authenticated';
  authUrl?: string;
}

export class McpOAuthCoordinator {
  private readonly pendingSessions = new Map<string, PendingAuthSession>();

  async startAuth(serverName: string, definition: McpServerConfig): Promise<StartOAuthResult> {
    const serverUrl = definition.url?.trim();
    if (!serverUrl) {
      throw new Error(`Server "${serverName}" does not have an HTTP URL for OAuth authentication.`);
    }

    await this.cancelAuth(serverName);
    await clearOAuthFlowState(serverName);

    let capturedAuthUrl = '';
    const authProvider = new McpOAuthProvider(
      serverName,
      serverUrl,
      definition.oauth || {},
      { onRedirect: async (url) => { capturedAuthUrl = url.toString(); } },
      { newAuthorization: true },
    );

    const transport = new StreamableHTTPClientTransport(new URL(serverUrl), { authProvider });
    const client = createMcpClient(`sero-mcp-auth-${serverName}`);
    let keepTransportOpen = false;

    try {
      await client.connect(transport);
      return { status: 'authenticated' };
    } catch (error) {
      if (error instanceof UnauthorizedError && capturedAuthUrl) {
        const flowState = await readOAuthFlowState(serverName);
        this.pendingSessions.set(serverName, {
          serverName,
          serverUrl,
          authUrl: capturedAuthUrl,
          expectedState: flowState?.oauthState,
          transport,
        });
        keepTransportOpen = true;
        return {
          status: 'pending',
          authUrl: capturedAuthUrl,
        };
      }
      throw error;
    } finally {
      await client.close().catch(() => {});
      if (!keepTransportOpen) {
        await transport.close().catch(() => {});
      }
    }
  }

  async completeAuth(serverName: string, callbackUrl: string): Promise<void> {
    const session = this.pendingSessions.get(serverName);
    if (!session) {
      throw new Error(`No pending OAuth flow exists for server "${serverName}".`);
    }

    const parsed = parseOAuthCallbackUrl(callbackUrl, session.expectedState);
    try {
      // The full query lets the SDK check `iss` against the expected issuer before the code exchange.
      await session.transport.finishAuth(parsed.searchParams);
    } catch (error) {
      if (error instanceof IssuerMismatchError || error instanceof AuthorizationServerMismatchError) {
        // The callback text may come from an attacker, so it is never shown.
        throw new Error(ISSUER_MISMATCH_MESSAGE);
      }
      throw error;
    } finally {
      this.pendingSessions.delete(serverName);
      await clearOAuthFlowState(serverName);
      await session.transport.close().catch(() => {});
    }
  }

  async cancelAuth(serverName: string): Promise<void> {
    const session = this.pendingSessions.get(serverName);
    this.pendingSessions.delete(serverName);
    await clearOAuthFlowState(serverName);
    if (session) {
      await session.transport.close().catch(() => {});
    }
  }

  async cancelAll(): Promise<void> {
    await Promise.all([...this.pendingSessions.keys()].map((serverName) => this.cancelAuth(serverName)));
  }
}

export const ISSUER_MISMATCH_MESSAGE = 'Sign-in stopped: the reply came from an unexpected authorization server. Sign in again.';

// RFC 6749 section 4.1.2.1 error codes. Any other value is not shown.
const KNOWN_OAUTH_ERRORS = new Set([
  'invalid_request', 'unauthorized_client', 'access_denied', 'unsupported_response_type',
  'invalid_scope', 'server_error', 'temporarily_unavailable',
]);

/**
 * Checks the callback `state` first, then the `error` parameter. Only a known
 * error code is shown; `error_description` and other callback text never are.
 */
export function parseOAuthCallbackUrl(callbackUrl: string, expectedState?: string): { code: string; searchParams: URLSearchParams } {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new Error('The OAuth callback URL was invalid.');
  }

  if (expectedState && parsed.searchParams.get('state') !== expectedState) {
    throw new Error('The OAuth callback state did not match the pending authorization request.');
  }

  const error = parsed.searchParams.get('error');
  if (error) {
    throw new Error(KNOWN_OAUTH_ERRORS.has(error) ? `OAuth authorization failed: ${error}` : 'OAuth authorization failed.');
  }

  const code = parsed.searchParams.get('code');
  if (!code) {
    throw new Error('The OAuth callback did not include an authorization code.');
  }

  return { code, searchParams: parsed.searchParams };
}
