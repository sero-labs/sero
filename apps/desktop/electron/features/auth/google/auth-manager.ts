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
import http from 'node:http';
import path from 'node:path';

import { readPluginConfig } from '../../plugin-config';
import { readRegistrySync } from '../../profile/manager';
import { SERO_AGENT_DIR } from '../../../platform/env';
import {
  argsWithClient,
  deriveKeyringPassword,
  deriveProfileScopedKeyringPassword,
  exportTokenForClient,
  findTokenCandidateEmails,
  getGoogleClientName,
  GOG_DEFAULT_CLIENT,
  gogExecWithPassword,
  parseEmailFromTokenData,
  pipeToGog,
} from './gog-keyring';

// ── Constants ───────────────────────────────────────────────

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const LOOPBACK = '127.0.0.1';
const GOOGLE_PLUGIN_ID = 'sero-google-plugin';

function getCredentials(): { clientId: string; clientSecret: string } {
  const cfg = readPluginConfig(GOOGLE_PLUGIN_ID);
  const clientId = (cfg?.clientId as string) || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = (cfg?.clientSecret as string) || process.env.GOOGLE_CLIENT_SECRET || '';
  return { clientId, clientSecret };
}

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

// ── Types ───────────────────────────────────────────────────

export interface GoogleAuthStatus {
  configured: boolean;
  authenticated: boolean;
  email?: string;
}

export interface GoogleAuthProgress {
  type: 'browser' | 'waiting' | 'success' | 'error';
  message: string;
  email?: string;
}

// ── Manager ─────────────────────────────────────────────────

export class GoogleAuthManager {
  private email: string | null = null;
  private credsImportedClients = new Set<string>();
  private statusCache: { validUntil: number; result: GoogleAuthStatus } | null = null;
  private static STATUS_CACHE_TTL = 30_000; // 30 seconds
  private migrationAttempted = false;

  isConfigured(): boolean {
    const { clientId, clientSecret } = getCredentials();
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
    this.credsImportedClients.clear();
  }

  async ensureCredentialsAvailable(): Promise<void> {
    if (!this.isConfigured()) return;
    await this.ensureCredentials();
  }

  async getStatus(): Promise<GoogleAuthStatus> {
    if (!this.isConfigured()) return { configured: false, authenticated: false };

    if (this.statusCache && Date.now() < this.statusCache.validUntil) {
      return this.statusCache.result;
    }

    const clientName = getGoogleClientName();
    let email = await this.findAccessibleEmail(deriveKeyringPassword(), clientName);

    if (!email && !this.migrationAttempted) {
      const migrated = await this.migrateFromBuggyKeyring(clientName);
      if (migrated) {
        email = await this.findAccessibleEmail(deriveKeyringPassword(), clientName);
      }
    }

    if (!email) {
      this.email = null;
      return this.cacheStatus({ configured: true, authenticated: false });
    }

    this.email = email;
    await this.ensureCredentials();
    return this.cacheStatus({ configured: true, authenticated: true, email });
  }

  private cacheStatus(result: GoogleAuthStatus): GoogleAuthStatus {
    this.statusCache = {
      validUntil: Date.now() + GoogleAuthManager.STATUS_CACHE_TTL,
      result,
    };
    return result;
  }

  /**
   * Find the current profile's token without enumerating the whole keyring.
   *
   * `gog auth tokens list` and `gog auth status` fail if *any* sibling token in
   * the shared file keyring was written with a different password. Exporting a
   * specific email key is resilient, so we probe candidate emails directly.
   */
  private async findAccessibleEmail(
    password: string,
    clientName: string,
  ): Promise<string | null> {
    const candidates = findTokenCandidateEmails();
    for (const email of candidates) {
      const tokenData = await exportTokenForClient(email, password, clientName);
      if (!tokenData) continue;
      return parseEmailFromTokenData(tokenData) ?? email;
    }
    return this.findEmailFromStatus(password, clientName);
  }

  private async findEmailFromStatus(
    password: string,
    clientName: string,
  ): Promise<string | null> {
    const status = await gogExecWithPassword(
      argsWithClient(clientName, ['--json', 'auth', 'status']),
      password,
    );
    if (!status) return null;
    try {
      const parsed = JSON.parse(status) as { account?: { email?: string } };
      const email = parsed.account?.email;
      return typeof email === 'string' && email ? email : null;
    } catch {
      return null;
    }
  }

  /**
   * Migrate tokens written by the buggy profile-scoped-password implementation
   * into the stable-password + per-profile-client-bucket layout.
   *
   * First we try the active profile's old password. If that finds nothing and
   * exactly one token exists on disk, we also try the other registered profile
   * passwords — this recovers the "same Google account in two profiles" case
   * where the second sign-in overwrote the shared `token:default:<email>` file.
   */
  private async migrateFromBuggyKeyring(targetClient: string): Promise<boolean> {
    this.migrationAttempted = true;

    const candidates = findTokenCandidateEmails();
    if (candidates.length === 0) return false;

    const currentScopedPassword = deriveProfileScopedKeyringPassword(SERO_AGENT_DIR);
    if (await this.tryMigrateFromPassword(candidates, currentScopedPassword, targetClient)) {
      return true;
    }

    if (candidates.length !== 1) {
      return false;
    }

    const registry = readRegistrySync();
    for (const profile of registry.profiles) {
      const profileAgentDir = path.join(profile.path, 'agent');
      if (path.resolve(profileAgentDir) === path.resolve(SERO_AGENT_DIR)) continue;
      const password = deriveProfileScopedKeyringPassword(profileAgentDir);
      if (password === currentScopedPassword) continue;
      if (await this.tryMigrateFromPassword(candidates, password, targetClient)) {
        return true;
      }
    }

    return false;
  }

  private async tryMigrateFromPassword(
    candidates: string[],
    sourcePassword: string,
    targetClient: string,
  ): Promise<boolean> {
    for (const email of candidates) {
      const tokenData = await exportTokenForClient(email, sourcePassword, GOG_DEFAULT_CLIENT);
      if (!tokenData) continue;

      await this.ensureCredentials();
      const importResult = await pipeToGog(
        argsWithClient(targetClient, ['auth', 'tokens', 'import', '-']),
        tokenData,
      );
      if (!importResult.ok) {
        console.warn('[google-auth] Token migration import failed:', importResult.out);
        continue;
      }

      const migratedEmail = parseEmailFromTokenData(tokenData) ?? email;
      this.email = migratedEmail;
      console.log(
        `[google-auth] Migrated token for ${migratedEmail} into client bucket ${targetClient}`,
      );
      return true;
    }
    return false;
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

    const { port, getCode, server } = await this.startServer();
    const redirect = `http://${LOOPBACK}:${port}`;

    const creds = getCredentials();
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirect,
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

    const tokens = await this.exchangeCode(code, redirect, verifier);
    if (!tokens.refresh_token) {
      throw new Error('No refresh token. Revoke access at myaccount.google.com/permissions and retry.');
    }

    const email = await this.fetchEmail(tokens.access_token);
    this.email = email;

    await this.importToGogcli(email, tokens.refresh_token);

    this.statusCache = null;
    onProgress({ type: 'success', message: `Signed in as ${email}`, email });
  }

  async logout(): Promise<void> {
    this.statusCache = null;
    const email = this.email ?? await this.findAccessibleEmail(deriveKeyringPassword(), getGoogleClientName());
    if (email) {
      await pipeToGog(
        argsWithClient(getGoogleClientName(), ['auth', 'tokens', 'delete', email, '--force']),
        '',
      );
    }
    this.email = null;
  }

  // ── OAuth helpers ─────────────────────────────────────────

  private startServer(): Promise<{ port: number; getCode: Promise<string>; server: http.Server }> {
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

  private async exchangeCode(code: string, redirect: string, verifier: string) {
    const creds = getCredentials();
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status} ${await resp.text()}`);
    return (await resp.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  }

  private async fetchEmail(accessToken: string): Promise<string> {
    const resp = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new Error(`Userinfo failed: ${resp.status}`);
    return ((await resp.json()) as { email: string }).email;
  }

  // ── gogcli integration ────────────────────────────────────

  private async importToGogcli(email: string, refreshToken: string): Promise<void> {
    await this.ensureCredentials();

    const r = await pipeToGog(
      argsWithClient(getGoogleClientName(), ['auth', 'tokens', 'import', '-']),
      JSON.stringify({ email, refresh_token: refreshToken }),
    );
    if (r.ok) console.log('[google-auth] Token imported into gogcli for', email);
    else console.warn('[google-auth] Token import failed:', r.out);
  }

  private async ensureCredentials(): Promise<void> {
    const clientName = getGoogleClientName();
    if (this.credsImportedClients.has(clientName)) return;
    if (await this.clientHasCredentials(clientName)) {
      this.credsImportedClients.add(clientName);
      return;
    }

    const creds = getCredentials();
    const r = await pipeToGog(
      argsWithClient(clientName, ['auth', 'credentials', 'set', '-']),
      JSON.stringify({
        installed: {
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          auth_uri: AUTH_URL,
          token_uri: TOKEN_URL,
          redirect_uris: ['http://localhost'],
        },
      }),
    );
    if (r.ok) {
      this.credsImportedClients.add(clientName);
      return;
    }
    console.warn(`[google-auth] Failed to import OAuth credentials for client ${clientName}:`, r.out);
  }

  private async clientHasCredentials(clientName: string): Promise<boolean> {
    const status = await gogExecWithPassword(
      argsWithClient(clientName, ['--json', 'auth', 'status']),
      deriveKeyringPassword(),
    );
    if (!status) return false;
    try {
      const parsed = JSON.parse(status) as { account?: { credentials_exists?: boolean } };
      return parsed.account?.credentials_exists === true;
    } catch {
      return false;
    }
  }
}
