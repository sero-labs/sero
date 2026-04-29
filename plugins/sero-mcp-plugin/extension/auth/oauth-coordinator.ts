import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
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
    );

    const transport = new StreamableHTTPClientTransport(new URL(serverUrl), { authProvider });
    const client = new Client({ name: `sero-mcp-auth-${serverName}`, version: '0.1.0' });
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
      await session.transport.finishAuth(parsed.code);
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

export function parseOAuthCallbackUrl(callbackUrl: string, expectedState?: string): { code: string } {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new Error('The OAuth callback URL was invalid.');
  }

  const error = parsed.searchParams.get('error');
  if (error) {
    throw new Error(`OAuth authorization failed: ${error}`);
  }

  const code = parsed.searchParams.get('code');
  if (!code) {
    throw new Error('The OAuth callback did not include an authorization code.');
  }

  if (expectedState) {
    const returnedState = parsed.searchParams.get('state');
    if (returnedState !== expectedState) {
      throw new Error('The OAuth callback state did not match the pending authorization request.');
    }
  }

  return { code };
}
