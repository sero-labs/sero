/**
 * GoogleAuthManager — OAuth2 Authorization Code + PKCE.
 *
 * Flow: click "Sign in" → browser opens → Google account chooser →
 * user approves → redirect to localhost → token exchange → done.
 *
 * After auth, the refresh token is imported into gogcli's keychain
 * so all `gog gmail/calendar` commands work natively.
 */

import { shell } from 'electron';
import crypto from 'node:crypto';

import { GoogleCredentialManager } from './credentials';
import {
  AUTH_URL,
  LOOPBACK,
  SCOPES,
  getGoogleCredentials,
} from './config';
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  startOAuthLoopbackServer,
} from './oauth-loopback';
import {
  findAccessibleEmail,
  migrateFromBuggyKeyring,
} from './status';
import {
  argsWithClient,
  deriveKeyringPassword,
  getGoogleClientName,
  pipeToGog,
} from './gog-keyring';
import type {
  GoogleAuthProgress,
  GoogleAuthStatus,
} from './types';

export type { GoogleAuthProgress, GoogleAuthStatus } from './types';

export class GoogleAuthManager {
  private email: string | null = null;
  private statusCache: { validUntil: number; result: GoogleAuthStatus } | null = null;
  private static STATUS_CACHE_TTL = 30_000; // 30 seconds
  private migrationAttempted = false;
  private readonly credentialManager = new GoogleCredentialManager();

  isConfigured(): boolean {
    const { clientId, clientSecret } = getGoogleCredentials();
    return !!clientId && !!clientSecret;
  }

  getEmail(): string | null {
    return this.email;
  }

  /**
   * Reset cached state after config changes (e.g. new OAuth credentials saved
   * via the setup form). Clears the status cache so the next getStatus()
   * re-checks, and resets credsImported so ensureCredentials() re-imports the
   * new client ID/secret into gogcli.
   */
  resetForConfigChange(): void {
    this.statusCache = null;
    this.credentialManager.reset();
  }

  async ensureCredentialsAvailable(): Promise<void> {
    if (!this.isConfigured()) return;
    await this.credentialManager.ensureCredentials(getGoogleClientName());
  }

  async getStatus(): Promise<GoogleAuthStatus> {
    if (!this.isConfigured()) return { configured: false, authenticated: false };

    if (this.statusCache && Date.now() < this.statusCache.validUntil) {
      return this.statusCache.result;
    }

    const clientName = getGoogleClientName();
    let email = await findAccessibleEmail(deriveKeyringPassword(), clientName);

    if (!email && !this.migrationAttempted) {
      this.migrationAttempted = true;
      const migratedEmail = await migrateFromBuggyKeyring(
        clientName,
        () => this.credentialManager.ensureCredentials(clientName),
      );
      if (migratedEmail) {
        email = await findAccessibleEmail(deriveKeyringPassword(), clientName);
      }
    }

    if (!email) {
      this.email = null;
      return this.cacheStatus({ configured: true, authenticated: false });
    }

    this.email = email;
    await this.credentialManager.ensureCredentials(clientName);
    return this.cacheStatus({ configured: true, authenticated: true, email });
  }

  /**
   * Full OAuth2 sign-in. Opens browser, waits for callback.
   * No email input needed — Google's account chooser handles it.
   */
  async login(onProgress: (e: GoogleAuthProgress) => void): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth not configured. Use the setup form in the Google plugin or add credentials to ~/.sero-ui/agent/plugin-config/sero-google-plugin.json');
    }

    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    const { port, getCode, server } = await startOAuthLoopbackServer();
    const redirectUri = `http://${LOOPBACK}:${port}`;

    const creds = getGoogleCredentials();
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    onProgress({ type: 'browser', message: 'Opening Google sign-in…' });
    void shell.openExternal(`${AUTH_URL}?${params}`);
    onProgress({ type: 'waiting', message: 'Waiting for authorization…' });

    let code: string;
    try {
      code = await getCode;
    } finally {
      server.close();
    }

    const tokens = await exchangeCodeForTokens(code, redirectUri, verifier);
    if (!tokens.refresh_token) {
      throw new Error('No refresh token. Revoke access at myaccount.google.com/permissions and retry.');
    }

    const email = await fetchGoogleUserEmail(tokens.access_token);
    this.email = email;

    await this.credentialManager.importRefreshToken(
      getGoogleClientName(),
      email,
      tokens.refresh_token,
    );

    this.statusCache = null;
    onProgress({ type: 'success', message: `Signed in as ${email}`, email });
  }

  async logout(): Promise<void> {
    this.statusCache = null;
    const clientName = getGoogleClientName();
    const email = this.email ?? await findAccessibleEmail(deriveKeyringPassword(), clientName);
    if (email) {
      await pipeToGog(
        argsWithClient(clientName, ['auth', 'tokens', 'delete', email, '--force']),
        '',
      );
    }
    this.email = null;
  }

  private cacheStatus(result: GoogleAuthStatus): GoogleAuthStatus {
    this.statusCache = {
      validUntil: Date.now() + GoogleAuthManager.STATUS_CACHE_TTL,
      result,
    };
    return result;
  }
}
