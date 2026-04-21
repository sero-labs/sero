import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { McpOAuthConfig } from '../config/types';
import {
  clearOAuthClientInfo,
  clearOAuthCredentials,
  clearOAuthFlowState,
  clearOAuthTokens,
  readOAuthClientInfo,
  readOAuthFlowState,
  readOAuthTokens,
  writeOAuthClientInfo,
  writeOAuthFlowState,
  writeOAuthTokens,
} from './storage';

const DEFAULT_OAUTH_CALLBACK_PORT = 19876;
const OAUTH_CALLBACK_PATH = '/mcp/oauth/callback';

export interface McpOAuthCallbacks {
  onRedirect: (url: URL) => void | Promise<void>;
}

export function getOAuthCallbackUrl(): string {
  return `http://127.0.0.1:${DEFAULT_OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`;
}

export class McpOAuthProvider implements OAuthClientProvider {
  constructor(
    private readonly serverName: string,
    private readonly serverUrl: string,
    private readonly config: McpOAuthConfig,
    private readonly callbacks: McpOAuthCallbacks,
  ) {}

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

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    if (this.config.clientId) {
      return {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      };
    }

    const clientInfo = await readOAuthClientInfo(this.serverName, this.serverUrl);
    if (!clientInfo) {
      return undefined;
    }
    if (clientInfo.clientSecretExpiresAt && clientInfo.clientSecretExpiresAt < Date.now() / 1000) {
      return undefined;
    }

    return {
      client_id: clientInfo.clientId,
      client_secret: clientInfo.clientSecret,
    };
  }

  async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    await writeOAuthClientInfo(this.serverName, {
      clientId: info.client_id,
      clientSecret: info.client_secret,
      clientIdIssuedAt: info.client_id_issued_at,
      clientSecretExpiresAt: info.client_secret_expires_at,
      serverUrl: this.serverUrl,
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const tokens = await readOAuthTokens(this.serverName, this.serverUrl);
    if (!tokens) {
      return undefined;
    }

    return {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresAt
        ? Math.max(0, Math.floor(tokens.expiresAt - Date.now() / 1000))
        : undefined,
      scope: tokens.scope,
    };
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await writeOAuthTokens(this.serverName, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() / 1000 + tokens.expires_in : undefined,
      scope: tokens.scope,
      serverUrl: this.serverUrl,
    });
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

  async saveState(state: string): Promise<void> {
    await writeOAuthFlowState(this.serverName, {
      oauthState: state,
      serverUrl: this.serverUrl,
    });
  }

  async state(): Promise<string> {
    if (this.usesClientCredentials) {
      throw new Error('state is not used for client_credentials flow');
    }
    const flowState = await readOAuthFlowState(this.serverName);
    if (!flowState?.oauthState) {
      throw new Error(`No OAuth state saved for MCP server: ${this.serverName}`);
    }
    return flowState.oauthState;
  }

  async invalidateCredentials(type: 'all' | 'client' | 'tokens'): Promise<void> {
    if (type === 'all') {
      await clearOAuthCredentials(this.serverName);
      return;
    }
    if (type === 'client') {
      await clearOAuthClientInfo(this.serverName);
      return;
    }
    await clearOAuthTokens(this.serverName);
    await clearOAuthFlowState(this.serverName);
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
