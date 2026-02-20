/**
 * GitHubAuthManager — OAuth Device Flow for unified GitHub authentication.
 *
 * Login once from the Electron host, get a token that authenticates both
 * `gh` CLI (via GH_TOKEN) and git/jj push/fetch (via GIT_ASKPASS=gh).
 *
 * Uses GitHub's Device Flow:
 *   1. POST /login/device/code → get user_code + verification_uri
 *   2. User opens URL in browser, enters code
 *   3. Poll POST /login/oauth/access_token until user completes auth
 *
 * Token is stored encrypted on disk via Electron safeStorage.
 */

import { safeStorage, shell } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { SERO_HOME } from '../env';

// ── GitHub OAuth App ─────────────────────────────────────────
// Client ID for "Sero Desktop" GitHub OAuth App (public, no secret needed for device flow).
// Device flow only — callback URL is unused (http://localhost placeholder).
const GITHUB_CLIENT_ID = 'Ov23liG8cpbS8TskdGxy';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_API_URL = 'https://api.github.com/user';

// Scopes needed: repo (push/PR), read:org (org membership for private repos)
const SCOPES = 'repo read:org';

const TOKEN_FILE = path.join(SERO_HOME, 'github-auth.json');
const POLL_INTERVAL_MIN_MS = 5_000;

// ── Types ────────────────────────────────────────────────────

export interface GitHubAuthStatus {
  authenticated: boolean;
  username?: string;
  scopes?: string;
}

export interface DeviceFlowProgress {
  type: 'code' | 'polling' | 'success' | 'error';
  userCode?: string;
  verificationUri?: string;
  message?: string;
  username?: string;
}

interface StoredToken {
  /** Encrypted access token (base64 of safeStorage.encryptString) */
  encrypted: string;
  username: string;
  scopes: string;
  createdAt: string;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

// ── Manager ──────────────────────────────────────────────────

export class GitHubAuthManager {
  private cachedToken: string | null = null;
  private cachedUsername: string | null = null;

  constructor() {
    this.loadCachedToken();
  }

  /** Get the current OAuth token, or null if not authenticated. */
  getToken(): string | null {
    return this.cachedToken;
  }

  /** Get current auth status without network calls. */
  getStatus(): GitHubAuthStatus {
    if (!this.cachedToken) return { authenticated: false };
    return {
      authenticated: true,
      username: this.cachedUsername ?? undefined,
    };
  }

  /**
   * Run the GitHub Device Flow. Calls `onProgress` at each stage
   * so the UI can show the user code and status.
   */
  async login(
    onProgress: (event: DeviceFlowProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    // Step 1: Request device code
    const deviceResp = await this.requestDeviceCode();

    // Step 2: Show user code and open browser
    onProgress({
      type: 'code',
      userCode: deviceResp.user_code,
      verificationUri: deviceResp.verification_uri,
      message: `Enter code ${deviceResp.user_code} at ${deviceResp.verification_uri}`,
    });

    void shell.openExternal(deviceResp.verification_uri);

    // Step 3: Poll for token
    onProgress({ type: 'polling', message: 'Waiting for authorization...' });
    const token = await this.pollForToken(deviceResp, signal);

    // Step 4: Verify token and get username
    const user = await this.fetchUser(token);

    // Step 5: Store token
    this.storeToken(token, user.login);
    this.cachedToken = token;
    this.cachedUsername = user.login;

    onProgress({
      type: 'success',
      username: user.login,
      message: `Authenticated as ${user.login}`,
    });
  }

  /** Clear stored token and cached state. */
  logout(): void {
    this.cachedToken = null;
    this.cachedUsername = null;
    try {
      if (existsSync(TOKEN_FILE)) unlinkSync(TOKEN_FILE);
    } catch (err) {
      console.warn('[github-auth] Failed to delete token file:', err);
    }
  }

  /**
   * Build environment variables that authenticate both `gh` and git/jj.
   * Returns empty object if not authenticated.
   */
  getAuthEnvVars(): Record<string, string> {
    const token = this.getToken();
    if (!token) return {};

    return {
      GH_TOKEN: token,
      // gh acts as a git credential helper when GH_TOKEN is set
      GIT_ASKPASS: 'gh',
      // Prevent git from prompting interactively (containers are non-interactive)
      GIT_TERMINAL_PROMPT: '0',
      // Rewrite SSH-style remotes to HTTPS so token auth works
      GIT_CONFIG_COUNT: '2',
      'GIT_CONFIG_KEY_0': 'url.https://github.com/.insteadOf',
      'GIT_CONFIG_VALUE_0': 'git@github.com:',
      'GIT_CONFIG_KEY_1': 'url.https://github.com/.insteadOf',
      'GIT_CONFIG_VALUE_1': 'ssh://git@github.com/',
    };
  }

  // ── Device Flow Steps ──────────────────────────────────────

  private async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const body = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      scope: SCOPES,
    });

    const resp = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body,
    });

    if (!resp.ok) {
      throw new Error(`GitHub device code request failed: ${resp.status} ${resp.statusText}`);
    }

    return (await resp.json()) as DeviceCodeResponse;
  }

  private async pollForToken(
    device: DeviceCodeResponse,
    signal?: AbortSignal,
  ): Promise<string> {
    const interval = Math.max(device.interval * 1000, POLL_INTERVAL_MIN_MS);
    const deadline = Date.now() + device.expires_in * 1000;

    while (Date.now() < deadline) {
      signal?.throwIfAborted();

      await sleep(interval);
      signal?.throwIfAborted();

      const body = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        device_code: device.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });

      const resp = await fetch(ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body,
      });

      if (!resp.ok) continue;

      const data = (await resp.json()) as Record<string, string>;

      if (data.access_token) return data.access_token;
      if (data.error === 'authorization_pending') continue;
      if (data.error === 'slow_down') {
        await sleep(5000);
        continue;
      }
      if (data.error === 'expired_token') {
        throw new Error('Device code expired. Please try again.');
      }
      if (data.error === 'access_denied') {
        throw new Error('Authorization was denied by the user.');
      }
      if (data.error) {
        throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
      }
    }

    throw new Error('Device code expired. Please try again.');
  }

  private async fetchUser(token: string): Promise<{ login: string }> {
    const resp = await fetch(USER_API_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      throw new Error(`Failed to verify GitHub token: ${resp.status}`);
    }
    return (await resp.json()) as { login: string };
  }

  // ── Token Storage ──────────────────────────────────────────

  private storeToken(token: string, username: string): void {
    try {
      const dir = path.dirname(TOKEN_FILE);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const encrypted = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(token).toString('base64')
        : Buffer.from(token).toString('base64'); // Fallback: base64 only

      const stored: StoredToken = {
        encrypted,
        username,
        scopes: SCOPES,
        createdAt: new Date().toISOString(),
      };

      writeFileSync(TOKEN_FILE, JSON.stringify(stored, null, 2), 'utf8');
    } catch (err) {
      console.warn('[github-auth] Failed to store token:', err);
    }
  }

  private loadCachedToken(): void {
    try {
      if (!existsSync(TOKEN_FILE)) return;

      const raw = readFileSync(TOKEN_FILE, 'utf8');
      const stored = JSON.parse(raw) as StoredToken;

      const token = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'))
        : Buffer.from(stored.encrypted, 'base64').toString('utf8');

      this.cachedToken = token;
      this.cachedUsername = stored.username;
    } catch (err) {
      console.warn('[github-auth] Failed to load cached token:', err);
      this.cachedToken = null;
      this.cachedUsername = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
