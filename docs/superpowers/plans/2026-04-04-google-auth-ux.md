# Google Auth UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead-end "not configured" warning with an in-app setup form, detect stale/expired tokens, and provide a clear re-authentication path.

**Architecture:** Add a JSON config file (`google-oauth.json`) for client credentials with IPC to read/write it, validate tokens during status checks via gogcli refresh, detect auth failures reactively in data commands, and surface all states clearly in the AuthSetup UI.

**Tech Stack:** Electron IPC, React, TypeScript, gogcli

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/desktop/electron/features/auth/google/auth-manager.ts` | Modify | Config file read/write, token validation in `getStatus()`, validation cache |
| `apps/desktop/electron/ipc/integrations/google-api.ts` | Modify | New `get-config` / `save-config` IPC handlers |
| `apps/desktop/electron/preload/integrations/google-imagegen.ts` | Modify | Expose `getConfig` / `saveConfig` on bridge |
| `apps/desktop/src/types/ipc-channels.ts` | Modify | New channel constants |
| `apps/desktop/src/types/electron-apps.d.ts` | Modify | Type the new bridge methods |
| `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts` | Modify | Auth error detection in `exec()`, expired status, config methods |
| `plugins/sero-google-plugin/ui/components/AuthSetup.tsx` | Modify | Setup form for not-configured, expired state banner |

---

### Task 1: Config File Support in auth-manager.ts

**Files:**
- Modify: `apps/desktop/electron/features/auth/google/auth-manager.ts`

- [ ] **Step 1: Add config file helpers**

Add imports and config file functions at the top of the file, after the existing imports:

```typescript
// Add to imports at top:
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';

// Add after the LOOPBACK constant (line 26), before SCOPES:
import { SERO_AGENT_DIR } from '../../../platform/env';

const GOOGLE_CONFIG_PATH = path.join(SERO_AGENT_DIR, 'google-oauth.json');

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

function loadConfig(): GoogleOAuthConfig | null {
  try {
    const raw = readFileSync(GOOGLE_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<GoogleOAuthConfig>;
    if (parsed.clientId && parsed.clientSecret) {
      return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveGoogleConfig(clientId: string, clientSecret: string): void {
  writeFileSync(GOOGLE_CONFIG_PATH, JSON.stringify({ clientId, clientSecret }, null, 2) + '\n', 'utf8');
  chmodSync(GOOGLE_CONFIG_PATH, 0o600);
}

export function getGoogleConfig(): { configured: boolean } {
  const cfg = loadConfig();
  const envConfigured = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  return { configured: !!cfg || envConfigured };
}
```

- [ ] **Step 2: Update getClientId / getClientSecret to check config file first**

Replace the existing `getClientId()` and `getClientSecret()` functions (lines 20-21):

```typescript
// Old:
function getClientId(): string { return process.env.GOOGLE_CLIENT_ID ?? ''; }
function getClientSecret(): string { return process.env.GOOGLE_CLIENT_SECRET ?? ''; }

// New:
function getClientId(): string {
  return loadConfig()?.clientId ?? process.env.GOOGLE_CLIENT_ID ?? '';
}
function getClientSecret(): string {
  return loadConfig()?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? '';
}
```

- [ ] **Step 3: Remove the now-redundant `existsSync` import**

The file currently imports `existsSync` from `node:fs` (line 14). Replace it with the new imports. The final import line should be:

```typescript
import { readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
```

(Keep `existsSync` since `findGog()` still uses it.)

- [ ] **Step 4: Verify the file compiles**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: No new errors in `auth-manager.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/features/auth/google/auth-manager.ts
git commit -m "feat(google): add config file support for OAuth client credentials"
```

---

### Task 2: Token Validation in getStatus()

**Files:**
- Modify: `apps/desktop/electron/features/auth/google/auth-manager.ts`

- [ ] **Step 1: Add validation cache to GoogleAuthManager**

Add a private cache property to the `GoogleAuthManager` class, after the existing `private credsImported = false;` line:

```typescript
private statusCache: { validUntil: number; result: GoogleAuthStatus } | null = null;
private static STATUS_CACHE_TTL = 30_000; // 30 seconds
```

- [ ] **Step 2: Replace getStatus() with token-validating version**

Replace the existing `getStatus()` method (lines 118-134) with:

```typescript
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
```

- [ ] **Step 3: Invalidate cache on login/logout**

Add `this.statusCache = null;` at the end of the `login()` method (before the final `onProgress` call, around line 180) and at the start of the `logout()` method:

In `login()`, add before `onProgress({ type: 'success', ... })`:
```typescript
this.statusCache = null;
```

In `logout()`, add as the first line:
```typescript
this.statusCache = null;
```

- [ ] **Step 4: Verify the file compiles**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/features/auth/google/auth-manager.ts
git commit -m "feat(google): validate tokens in getStatus() with refresh check and cache"
```

---

### Task 3: IPC Channels and Type Definitions

**Files:**
- Modify: `apps/desktop/src/types/ipc-channels.ts`
- Modify: `apps/desktop/src/types/electron-apps.d.ts`

- [ ] **Step 1: Add new channel constants**

In `apps/desktop/src/types/ipc-channels.ts`, add two new entries inside the `google` object (after the `authEvent` line, around line 371):

```typescript
  google: {
    /** Execute a gogcli data command (gog --json --no-input <service> <args>). */
    execute: 'sero:google:execute',
    /** Get Google auth status (configured, authenticated, email). */
    authStatus: 'sero:google:auth-status',
    /** Start Google OAuth2 sign-in flow (opens browser). */
    login: 'sero:google:login',
    /** Sign out of Google. */
    logout: 'sero:google:logout',
    /** Main → renderer push: auth flow progress events. */
    authEvent: 'sero:google:auth-event',
    /** Get Google OAuth config status (configured or not). */
    getConfig: 'sero:google:get-config',
    /** Save Google OAuth client credentials. */
    saveConfig: 'sero:google:save-config',
  },
```

- [ ] **Step 2: Add type definitions for the new bridge methods**

In `apps/desktop/src/types/electron-apps.d.ts`, add to the `SeroGoogleAPI` interface (after the `onAuthEvent` method, around line 69):

```typescript
interface SeroGoogleAPI {
  /** Execute a gogcli data command: gog --json --no-input <service> <args>. */
  execute(service: string, subArgs: string[]): Promise<GogExecResult>;
  /** Get current auth status. */
  authStatus(): Promise<GoogleAuthStatus>;
  /** Start OAuth2 sign-in (opens browser). Resolves when complete. */
  login(): Promise<void>;
  /** Sign out. */
  logout(): Promise<void>;
  /** Subscribe to auth flow progress events. Returns unsubscribe. */
  onAuthEvent(callback: (event: GoogleAuthEvent) => void): () => void;
  /** Check if Google OAuth client credentials are configured. */
  getConfig(): Promise<{ configured: boolean }>;
  /** Save Google OAuth client credentials. Returns success. */
  saveConfig(clientId: string, clientSecret: string): Promise<{ ok: boolean }>;
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/types/ipc-channels.ts apps/desktop/src/types/electron-apps.d.ts
git commit -m "feat(google): add IPC channel constants and types for config management"
```

---

### Task 4: IPC Handlers and Preload Bridge

**Files:**
- Modify: `apps/desktop/electron/ipc/integrations/google-api.ts`
- Modify: `apps/desktop/electron/preload/integrations/google-imagegen.ts`

- [ ] **Step 1: Add IPC handlers for config**

In `apps/desktop/electron/ipc/integrations/google-api.ts`, add an import for the new exports from auth-manager. Update the existing import (line 18):

```typescript
import { GoogleAuthManager, deriveKeyringPassword, saveGoogleConfig, getGoogleConfig } from '../../features/auth/google/auth-manager';
```

Then add two new handlers inside `registerGoogleApiHandlers()`, after the logout handler (after line 119):

```typescript
  /** Get Google OAuth config status. */
  ipcMain.handle(IpcChannels.google.getConfig, async () => {
    return getGoogleConfig();
  });

  /** Save Google OAuth client credentials. */
  ipcMain.handle(
    IpcChannels.google.saveConfig,
    async (_event, clientId: string, clientSecret: string): Promise<{ ok: boolean }> => {
      try {
        saveGoogleConfig(clientId, clientSecret);
        return { ok: true };
      } catch (err) {
        console.error('[google-api] Failed to save config:', err);
        return { ok: false };
      }
    },
  );
```

- [ ] **Step 2: Add preload bridge methods**

In `apps/desktop/electron/preload/integrations/google-imagegen.ts`, add the new methods to the `googleBridge` object (after the `onAuthEvent` method, before the closing `};`):

```typescript
export const googleBridge = {
  execute: (service: string, subArgs: string[]) =>
    ipcRenderer.invoke(IpcChannels.google.execute, service, subArgs),
  authStatus: () => ipcRenderer.invoke(IpcChannels.google.authStatus),
  login: () => ipcRenderer.invoke(IpcChannels.google.login),
  logout: () => ipcRenderer.invoke(IpcChannels.google.logout),
  onAuthEvent: (cb: (event: any) => void) => {
    const handler = (_e: IpcRendererEvent, event: any) => cb(event);
    ipcRenderer.on(IpcChannels.google.authEvent, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.google.authEvent, handler);
    };
  },
  getConfig: (): Promise<{ configured: boolean }> =>
    ipcRenderer.invoke(IpcChannels.google.getConfig),
  saveConfig: (clientId: string, clientSecret: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IpcChannels.google.saveConfig, clientId, clientSecret),
};
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron/ipc/integrations/google-api.ts apps/desktop/electron/preload/integrations/google-imagegen.ts
git commit -m "feat(google): add IPC handlers and preload bridge for config management"
```

---

### Task 5: Hook — Auth Error Detection and Config Methods

**Files:**
- Modify: `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts`

- [ ] **Step 1: Update the AuthStatus type and SeroGoogleBridge interface**

In `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts`, update the `SeroGoogleBridge` interface (lines 14-20) and `AuthStatus` type (line 28):

```typescript
interface SeroGoogleBridge {
  execute: (service: string, args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  authStatus: () => Promise<{ configured: boolean; authenticated: boolean; email?: string }>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  onAuthEvent: (cb: (event: { type: string; message: string; email?: string }) => void) => () => void;
  getConfig: () => Promise<{ configured: boolean }>;
  saveConfig: (clientId: string, clientSecret: string) => Promise<{ ok: boolean }>;
}
```

Update the `AuthStatus` type:

```typescript
export type AuthStatus = 'unknown' | 'checking' | 'not-configured' | 'signed-out' | 'signing-in' | 'authenticated' | 'expired';
```

- [ ] **Step 2: Add saveConfig to GoogleApi interface and hook return**

Add to the `GoogleApi` interface (after `signOut`, around line 44):

```typescript
export interface GoogleApi {
  loading: boolean;
  error: string | null;
  auth: AuthInfo;
  checkAuth: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  saveConfig: (clientId: string, clientSecret: string) => Promise<boolean>;
  fetchInbox: (query: string, max?: number) => Promise<void>;
  fetchThread: (threadId: string) => Promise<void>;
  fetchEvents: (view: 'today' | 'week') => Promise<void>;
  fetchEventsRange: (from: string, to: string) => Promise<void>;
  fetchCalendars: () => Promise<void>;
  sendEmail: (to: string, subject: string, body: string) => Promise<boolean>;
  archiveThread: (threadId: string) => Promise<boolean>;
}
```

- [ ] **Step 3: Add auth error detection pattern and saveConfig implementation**

Add the auth error regex constant before the `useGoogleApi` function:

```typescript
const AUTH_ERROR_PATTERN = /401|unauthorized|token.*expired|token.*revoked|invalid.*credentials/i;
```

Add the `saveConfig` callback inside `useGoogleApi`, after `signOut`:

```typescript
const saveConfig = useCallback(async (clientId: string, clientSecret: string): Promise<boolean> => {
  const api = getSeroGoogle();
  if (!api) return false;
  const result = await api.saveConfig(clientId, clientSecret);
  if (result.ok) {
    await checkAuth();
  }
  return result.ok;
}, [checkAuth]);
```

- [ ] **Step 4: Add auth error detection in exec()**

In the `exec` function (around line 120), add auth error detection after the `exitCode !== 0` check. Replace the existing error handling block inside exec:

```typescript
const exec = useCallback(async (service: string, args: string[]): Promise<any | null> => {
  setLoading(true);
  setError(null);
  try {
    const api = getSeroGoogle();
    if (!api) { setError('Bridge unavailable'); return null; }
    const result = await api.execute(service, args);
    if (result.exitCode === 127) { setError('gogcli not found'); return null; }
    if (result.exitCode !== 0) {
      const msg = result.stderr.trim() || result.stdout.trim() || 'Command failed';

      // Detect auth-related failures and transition to expired state
      if (AUTH_ERROR_PATTERN.test(msg)) {
        setAuth((prev) => ({
          status: 'expired',
          email: prev.email,
          error: null,
        }));
      }

      setError(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
      return null;
    }
    try { return JSON.parse(result.stdout); } catch { return result.stdout.trim(); }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
    return null;
  } finally {
    setLoading(false);
  }
}, []);
```

Note: The `exec` callback now references `setAuth` which is in scope from the outer `useGoogleApi` function, so this is fine.

- [ ] **Step 5: Update the return value**

Update the `useMemo` return to include `saveConfig`:

```typescript
return useMemo(() => ({
  loading, error, auth, checkAuth, signIn, signOut, saveConfig,
  fetchInbox, fetchThread, fetchEvents, fetchEventsRange, fetchCalendars, sendEmail, archiveThread,
}), [loading, error, auth, checkAuth, signIn, signOut, saveConfig,
  fetchInbox, fetchThread, fetchEvents, fetchEventsRange, fetchCalendars, sendEmail, archiveThread]);
```

- [ ] **Step 6: Verify types compile**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts
git commit -m "feat(google): add auth error detection and config save to hook"
```

---

### Task 6: AuthSetup UI — Setup Form and Expired State

**Files:**
- Modify: `plugins/sero-google-plugin/ui/components/AuthSetup.tsx`

- [ ] **Step 1: Replace the entire AuthSetup component**

Replace the full contents of `plugins/sero-google-plugin/ui/components/AuthSetup.tsx`:

```tsx
/**
 * AuthSetup — Google sign-in UI.
 *
 * States:
 * - not-configured: Setup form for entering OAuth client credentials
 * - signed-out: "Sign in with Google" button
 * - signing-in: Spinner while OAuth flow is in progress
 * - authenticated: Green banner with email and sign-out
 * - expired: Amber banner with re-sign-in prompt
 * - checking/unknown: Loading/error states
 */

import { useState } from 'react';
import { CheckCircle2, Loader2, LogIn, LogOut, AlertTriangle, Eye, EyeOff, Settings } from 'lucide-react';
import type { AuthInfo, GoogleApi } from '../hooks/useGoogleApi';

interface AuthSetupProps {
  auth: AuthInfo;
  google: GoogleApi;
}

export function AuthSetup({ auth, google }: AuthSetupProps) {
  // Authenticated — compact banner with sign-out
  if (auth.status === 'authenticated' && auth.email) {
    return (
      <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] px-3 py-1.5">
        <CheckCircle2 className="size-3.5 text-emerald-500" />
        <span className="flex-1 text-[11px] text-[var(--text-secondary)]">{auth.email}</span>
        <button
          onClick={google.signOut}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <LogOut className="size-2.5" />
          Sign out
        </button>
      </div>
    );
  }

  // Expired — amber banner with re-sign-in
  if (auth.status === 'expired') {
    return (
      <div className="mx-2 mt-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            {auth.email && (
              <p className="text-[11px] text-[var(--text-secondary)]">{auth.email}</p>
            )}
            <p className="text-[12px] font-medium text-[var(--text-primary)]">
              Session expired — sign in again to reconnect
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => google.signIn()}
              className="flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
            >
              <LogIn className="size-3" />
              Sign in
            </button>
            <button
              onClick={google.signOut}
              className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              <LogOut className="size-2.5" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Signing in — spinner
  if (auth.status === 'signing-in') {
    return (
      <div className="mx-2 mt-2 flex items-center gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/[0.03] px-3 py-3">
        <Loader2 className="size-4 animate-spin text-blue-400" />
        <div>
          <p className="text-[12px] font-medium text-[var(--text-primary)]">Waiting for Google sign-in…</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Complete the sign-in in your browser</p>
        </div>
      </div>
    );
  }

  // Not configured — setup form
  if (auth.status === 'not-configured') {
    return <ConfigSetupForm google={google} />;
  }

  // Checking
  if (auth.status === 'checking') {
    return (
      <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-3 py-2.5">
        <Loader2 className="size-3.5 animate-spin text-[var(--text-muted)]" />
        <span className="text-[12px] text-[var(--text-muted)]">Checking…</span>
      </div>
    );
  }

  // Signed out — one button
  return (
    <div className="mx-2 mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-3 py-3">
      <div className="flex items-center gap-3">
        <GoogleLogo />
        <div className="flex-1">
          <p className="text-[12px] font-medium text-[var(--text-primary)]">Connect your Google account</p>
          <p className="text-[11px] text-[var(--text-muted)]">Access Gmail and Calendar</p>
        </div>
        <button
          onClick={() => google.signIn()}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] active:scale-[0.98]"
        >
          <LogIn className="size-3.5" />
          Sign in with Google
        </button>
      </div>
      {auth.error && <p className="mt-2 text-[11px] text-red-400">{auth.error}</p>}
    </div>
  );
}

// ── Setup Form ──────────────────────────────────────────────

function ConfigSetupForm({ google }: { google: GoogleApi }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showId, setShowId] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = clientId.trim().length > 0 && clientSecret.trim().length > 0 && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const ok = await google.saveConfig(clientId.trim(), clientSecret.trim());
    if (!ok) {
      setError('Failed to save credentials. Check file permissions.');
    }
    setSaving(false);
  };

  return (
    <div className="mx-2 mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-3 py-3">
      <div className="flex items-start gap-2.5">
        <Settings className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" />
        <div className="flex-1 space-y-2.5">
          <div>
            <p className="text-[12px] font-medium text-[var(--text-primary)]">Set up Google integration</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
              Create OAuth credentials in{' '}
              <span className="font-medium text-[var(--text-secondary)]">Google Cloud Console</span>.
              Enable the Gmail API and Google Calendar API, then create an{' '}
              <span className="font-medium text-[var(--text-secondary)]">OAuth 2.0 Client ID</span>{' '}
              (Desktop app type).
            </p>
          </div>

          {/* Client ID */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Client ID
            </label>
            <div className="flex items-center gap-1">
              <input
                type={showId ? 'text' : 'password'}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="123456789.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 font-mono text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 focus:border-blue-500/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowId(!showId)}
                className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]"
              >
                {showId ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>

          {/* Client Secret */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Client Secret
            </label>
            <div className="flex items-center gap-1">
              <input
                type={showSecret ? 'text' : 'password'}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-…"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 font-mono text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/40 focus:border-blue-500/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]"
              >
                {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && <p className="text-[11px] text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end pt-0.5">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-40 disabled:pointer-events-none"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : null}
              Save & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Google Logo ─────────────────────────────────────────────

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add plugins/sero-google-plugin/ui/components/AuthSetup.tsx
git commit -m "feat(google): replace not-configured warning with setup form and add expired state"
```

---

### Task 7: Final Typecheck and Integration Test

**Files:**
- All files from Tasks 1-6

- [ ] **Step 1: Run full monorepo typecheck**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm typecheck`
Expected: All packages pass with zero errors.

- [ ] **Step 2: Build the Google plugin**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero/plugins/sero-google-plugin && pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Build Electron main process**

Run: `cd /Users/danielcarter/Documents/Dev/projects/sero/sero/apps/desktop && node scripts/build-electron.mjs`
Expected: Build succeeds without errors.

- [ ] **Step 4: Verify no file exceeds 500 lines**

Run: `wc -l plugins/sero-google-plugin/ui/components/AuthSetup.tsx plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts apps/desktop/electron/features/auth/google/auth-manager.ts apps/desktop/electron/ipc/integrations/google-api.ts apps/desktop/electron/preload/integrations/google-imagegen.ts`
Expected: All files under 500 lines.

- [ ] **Step 5: Commit any fixes if needed from steps 1-4**

If any issues were found and fixed:
```bash
git add -u
git commit -m "fix(google): resolve typecheck/build issues from auth UX changes"
```
