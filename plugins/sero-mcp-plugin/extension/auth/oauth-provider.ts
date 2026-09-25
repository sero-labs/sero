import { randomUUID } from 'node:crypto';
import type {
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client';
import type { McpOAuthConfig } from '../config/types';
import {
  clearOAuthClientInfo,
  clearOAuthCredentials,
  clearOAuthDiscoveryState,
  clearOAuthFlowState,
  clearOAuthTokens,
  readOAuthClientInfo,
  readOAuthDiscoveryState,
  readOAuthFlowState,
  readOAuthTokens,
  writeOAuthClientInfo,
  writeOAuthDiscoveryState,
  writeOAuthFlowState,
  writeOAuthTokens,
} from './storage';

const DEFAULT_OAUTH_CALLBACK_PORT = 19876;
const OAUTH_CALLBACK_PATH = '/mcp/oauth/callback';

export interface McpOAuthCallbacks {
  onRedirect: (url: URL) => void | Promise<void>;
}

export interface McpOAuthProviderOptions {
  /** True for a sign-in flow: saved tokens then belong to a new principal. A token refresh keeps the principal. */
  newAuthorization?: boolean;
}

/**
 * URL of Sero's published Client ID Metadata Document. While it is unset,
 * Sero registers with Dynamic Client Registration. A client ID in the server
 * config takes precedence over both.
 */
export const CLIENT_METADATA_URL: string | undefined = undefined;

export function getOAuthCallbackUrl(): string {
  return `http://127.0.0.1:${DEFAULT_OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`;
}

export class McpOAuthProvider implements OAuthClientProvider {
  constructor(
    private readonly serverName: string,
    private readonly serverUrl: string,
    private readonly config: McpOAuthConfig,
    private readonly callbacks: McpOAuthCallbacks,
    private readonly options: McpOAuthProviderOptions = {},
  ) {}

  readonly clientMetadataUrl = CLIENT_METADATA_URL;

  private get usesClientCredentials(): boolean {
    return this.config.grantType === 'client_credentials';
  }

  get redirectUrl(): string | undefined {
    return this.usesClientCredentials ? undefined : getOAuthCallbackUrl();
  }

  get clientMetadata(): OAuthClientMetadata {
    if (this.usesClientCredentials) {
      return {
        client_name: 'Sero MCP',
        redirect_uris: [],
        grant_types: ['client_credentials'],
        token_endpoint_auth_method: this.config.clientSecret ? 'client_secret_post' : 'none',
      };
    }

    return {
      redirect_uris: [getOAuthCallbackUrl()],
      client_name: 'Sero MCP',
      client_uri: 'https://github.com/mariozechner/sero',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this.config.clientSecret ? 'client_secret_post' : 'none',
    };
  }

  async clientInformation(): Promise<StoredOAuthClientInformation | undefined> {
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      };
    }

    const saved = await readOAuthClientInfo(this.serverName, this.serverUrl);
    const expiresAt = saved?.client.client_secret_expires_at;
    if (!saved || (expiresAt && expiresAt < Date.now() / 1000)) {
      return undefined;
    }
    return saved.client;
  }

  async saveClientInformation(client: StoredOAuthClientInformation): Promise<void> {
    await writeOAuthClientInfo(this.serverName, { client, serverUrl: this.serverUrl });
  }

  async tokens(): Promise<StoredOAuthTokens | undefined> {
    const saved = await readOAuthTokens(this.serverName, this.serverUrl);
    if (!saved) {
      return undefined;
    }
    return {
      ...saved.tokens,
      expires_in: saved.expiresAt ? Math.max(0, Math.floor(saved.expiresAt - Date.now() / 1000)) : undefined,
    };
  }

  async saveTokens(tokens: StoredOAuthTokens): Promise<void> {
    const previous = this.options.newAuthorization ? null : await readOAuthTokens(this.serverName, this.serverUrl);
    await writeOAuthTokens(this.serverName, {
      tokens,
      expiresAt: tokens.expires_in ? Date.now() / 1000 + tokens.expires_in : undefined,
      serverUrl: this.serverUrl,
      principalId: previous?.principalId ?? randomUUID(),
    });
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    await writeOAuthDiscoveryState(this.serverName, state, this.serverUrl);
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return readOAuthDiscoveryState(this.serverName, this.serverUrl);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (this.usesClientCredentials) {
      throw new Error('redirectToAuthorization is not used for client_credentials flow');
    }
    await this.callbacks.onRedirect(authorizationUrl);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await writeOAuthFlowState(this.serverName, {
      codeVerifier,
      serverUrl: this.serverUrl,
    });
  }

  async codeVerifier(): Promise<string> {
    if (this.usesClientCredentials) {
      throw new Error('codeVerifier is not used for client_credentials flow');
    }
    const flowState = await readOAuthFlowState(this.serverName);
    if (!flowState?.codeVerifier) {
      throw new Error(`No code verifier saved for MCP server: ${this.serverName}`);
    }
    return flowState.codeVerifier;
  }

  /** The SDK asks for the state once per sign-in. Sero creates it and keeps it to check the callback. */
  async state(): Promise<string> {
    if (this.usesClientCredentials) {
      throw new Error('state is not used for client_credentials flow');
    }
    const state = randomUUID();
    await writeOAuthFlowState(this.serverName, {
      oauthState: state,
      serverUrl: this.serverUrl,
    });
    return state;
  }

  async invalidateCredentials(type: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    switch (type) {
      case 'all':
        await clearOAuthCredentials(this.serverName);
        return;
      case 'client':
        await clearOAuthClientInfo(this.serverName);
        return;
      case 'discovery':
        await clearOAuthDiscoveryState(this.serverName);
        return;
      case 'verifier':
        await clearOAuthFlowState(this.serverName);
        return;
      case 'tokens':
        await clearOAuthTokens(this.serverName);
        await clearOAuthFlowState(this.serverName);
    }
  }

  prepareTokenRequest(scope?: string): URLSearchParams | undefined {
    if (!this.usesClientCredentials) {
      return undefined;
    }

    const params = new URLSearchParams({ grant_type: 'client_credentials' });
    const requestedScope = scope ?? this.config.scope;
    if (requestedScope) {
      params.set('scope', requestedScope);
    }
    return params;
  }
}
