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
import http from 'node:http';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir, hostname, userInfo } from 'node:os';
import path from 'node:path';
import { readPluginConfig } from '../../plugin-config';

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

// ── Types ────────────────────────────────────────────────────

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

// ── Binary helpers (inlined to avoid circular imports) ────────

function findGog(): string {
  const paths = ['/opt/homebrew/bin/gog', '/usr/local/bin/gog',
    path.join(homedir(), '.local/bin/gog'), path.join(homedir(), 'go/bin/gog')];
  return paths.find((p) => existsSync(p)) ?? 'gog';
}

/**
 * Derive a machine-specific keyring password instead of using a hardcoded value.
 * Combines hostname, uid, and a salt so the password varies per machine/user.
 *
 * NOTE: This is defense-in-depth, not a real secret — hostname and uid are
 * both easily discoverable by any local user. The primary protection is
 * file permissions on the keyring file itself (user-only directory).
 * TODO: Consider using Electron safeStorage or macOS Keychain for the
 * keyring password if stronger isolation is needed.
 *
 * Exported because google-api.ts (IPC data commands) must use the same
 * password that was used to import the token.
 */
export function deriveKeyringPassword(): string {
  const host = hostname();
  let uid: string;
  try {
    uid = String(userInfo().uid);
  } catch {
    uid = 'unknown';
  }
  return crypto.createHash('sha256')
    .update(`sero-google-keyring:${host}:${uid}`)
    .digest('hex')
    .slice(0, 32);
}

function gogEnv(): NodeJS.ProcessEnv {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin',
    path.join(homedir(), '.local/bin'), path.join(homedir(), 'go/bin')];
  return {
    ...process.env,
    PATH: [...extra, process.env.PATH || ''].join(':'),
    // File-based keyring (no macOS Keychain prompts). Password is derived
    // from machine-specific data so it's not trivially guessable.
    GOG_KEYRING_PASSWORD: deriveKeyringPassword(),
  };
}

function pipeToGog(args: string[], stdin: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = execFile(findGog(), args, { env: gogEnv(), timeout: 10_000 },
      (err, stdout, stderr) => {
        if (err) console.warn(`[google-auth] gog ${args.slice(0, 3).join(' ')} failed:`, stderr?.trim() || err.message);
        resolve({ ok: !err, out: (stdout ?? '').trim() });
      });
    child.stdin?.write(stdin);
    child.stdin?.end();
    child.on('error', (e) => resolve({ ok: false, out: e.message }));
  });
}

// ── Manager ──────────────────────────────────────────────────

export class GoogleAuthManager {
  private email: string | null = null;
  private credsImported = false;
  private statusCache: { validUntil: number; result: GoogleAuthStatus } | null = null;
  private static STATUS_CACHE_TTL = 30_000; // 30 seconds

  isConfigured(): boolean {
    const { clientId, clientSecret } = getCredentials();
    return !!clientId && !!clientSecret;
  }
  getEmail(): string | null { return this.email; }

  /** Clear the cached auth status (call after saving new config). */
  clearStatusCache(): void { this.statusCache = null; }

  async getStatus(): Promise<GoogleAuthStatus> {
    if (!this.isConfigured()) return { configured: false, authenticated: false };

    // Return cached result if fresh
    if (this.statusCache && Date.now() < this.statusCache.validUntil) {
      return this.statusCache.result;
    }

    // Check gogcli for stored tokens
    const listResult = await this.gogExec(['--json', 'auth', 'tokens', 'list']);
    if (!listResult) {
      return this.cacheStatus({ configured: true, authenticated: false });
    }

    let email: string | null = null;
    try {
      const keys: string[] = (JSON.parse(listResult) as { keys?: string[] }).keys ?? [];
      const tok = keys.find((k) => k.startsWith('token:'));
      if (tok) {
        email = tok.split(':').slice(2).join(':');
      }
    } catch { /* parse error */ }

    if (!email) {
      return this.cacheStatus({ configured: true, authenticated: false });
    }

    // Validate token by attempting a refresh
    const tokenResult = await this.gogExec(['--json', 'auth', 'token', email]);
    if (!tokenResult) {
      // Token exists but refresh failed — expired/revoked
      return this.cacheStatus({ configured: true, authenticated: false });
    }

    this.email = email;
    return this.cacheStatus({ configured: true, authenticated: true, email });
  }

  private cacheStatus(result: GoogleAuthStatus): GoogleAuthStatus {
    this.statusCache = { validUntil: Date.now() + GoogleAuthManager.STATUS_CACHE_TTL, result };
    return result;
  }

  /**
   * Full OAuth2 sign-in. Opens browser, waits for callback.
   * No email input needed — Google's account chooser handles it.
   */
  async login(onProgress: (e: GoogleAuthProgress) => void): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth not configured. Use the setup form in the Google plugin or add credentials to ~/.sero-ui/agent/google-oauth.json');
    }

    // PKCE
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    // Loopback server
    const { port, getCode, server } = await this.startServer();
    const redirect = `http://${LOOPBACK}:${port}`;

    const creds = getCredentials();
    const params = new URLSearchParams({
      client_id: creds.clientId, redirect_uri: redirect,
      response_type: 'code', scope: SCOPES,
      access_type: 'offline', prompt: 'consent',
      code_challenge: challenge, code_challenge_method: 'S256',
    });

    onProgress({ type: 'browser', message: 'Opening Google sign-in…' });
    void shell.openExternal(`${AUTH_URL}?${params}`);
    onProgress({ type: 'waiting', message: 'Waiting for authorization…' });

    let code: string;
    try { code = await getCode; } finally { server.close(); }

    // Exchange code → tokens
    const tokens = await this.exchangeCode(code, redirect, verifier);
    if (!tokens.refresh_token) {
      throw new Error('No refresh token. Revoke access at myaccount.google.com/permissions and retry.');
    }

    // Get email from Google
    const email = await this.fetchEmail(tokens.access_token);
    this.email = email;

    // Import into gogcli
    await this.importToGogcli(email, tokens.refresh_token);

    this.statusCache = null;
    onProgress({ type: 'success', message: `Signed in as ${email}`, email });
  }

  async logout(): Promise<void> {
    this.statusCache = null;
    if (this.email) {
      await pipeToGog(['auth', 'tokens', 'delete', this.email, '--force'], '');
      this.email = null;
    }
  }

  // ── OAuth helpers ──────────────────────────────────────────

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
        if (!addr || typeof addr === 'string') { reject(new Error('Listen failed')); return; }
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
        code, client_id: creds.clientId, client_secret: creds.clientSecret,
        redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier,
      }),
    });
    if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status} ${await resp.text()}`);
    return (await resp.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  }

  private async fetchEmail(accessToken: string): Promise<string> {
    const resp = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) throw new Error(`Userinfo failed: ${resp.status}`);
    return ((await resp.json()) as { email: string }).email;
  }

  // ── gogcli integration ─────────────────────────────────────

  private async importToGogcli(email: string, refreshToken: string): Promise<void> {
    // 1. Import OAuth client credentials
    await this.ensureCredentials();

    // 2. Import refresh token into keychain
    const r = await pipeToGog(['auth', 'tokens', 'import', '-'],
      JSON.stringify({ email, refresh_token: refreshToken }));
    if (r.ok) console.log('[google-auth] Token imported into gogcli for', email);
    else console.warn('[google-auth] Token import failed:', r.out);
  }

  private async ensureCredentials(): Promise<void> {
    if (this.credsImported) return;
    const creds = getCredentials();
    const r = await pipeToGog(['auth', 'credentials', 'set', '-'], JSON.stringify({
      installed: {
        client_id: creds.clientId, client_secret: creds.clientSecret,
        auth_uri: AUTH_URL, token_uri: TOKEN_URL, redirect_uris: ['http://localhost'],
      },
    }));
    if (r.ok) this.credsImported = true;
  }

  private gogExec(args: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      execFile(findGog(), args, { env: gogEnv(), timeout: 10_000 },
        (err, stdout) => resolve(err ? null : (stdout ?? '')));
    });
  }
}
