# Google Plugin Auth UX Improvements

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Google plugin auth setup, stale token detection, expired session UX

## Problem

The Google plugin has three auth UX issues:

1. **"Not configured" is a dead end.** When `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are missing, the UI shows a warning telling users to edit `~/.sero-ui/agent/.env` manually. There's no way to configure credentials from within Sero.

2. **Stale tokens show as authenticated.** `getStatus()` checks whether tokens *exist* in the gogcli keyring but never validates them. When tokens are expired or revoked, the UI shows a green "authenticated" banner while API calls fail silently. The only error signal is a small red text string in the header bar.

3. **No recovery path.** When auth is stale, it's not obvious how to fix it. The user must manually click "Sign out" then "Sign in" again, but nothing in the UI suggests this.

## Design

### 1. Google OAuth Config File

Store client credentials in `~/.sero-ui/agent/google-oauth.json`:

```json
{
  "clientId": "123456.apps.googleusercontent.com",
  "clientSecret": "GOCSPX-..."
}
```

**In `auth-manager.ts`:**

- Add `loadConfig(): { clientId: string; clientSecret: string } | null` — reads JSON file, returns null if missing/malformed.
- Add `saveConfig(clientId: string, clientSecret: string): void` — writes JSON file with `0o600` permissions.
- Modify `getClientId()` / `getClientSecret()` to check config file first, fall back to `process.env`.
- Export `isConfigured()`, `getConfig()`, and `saveConfig()` for IPC use.

**Env var fallback preserved.** Advanced users who prefer `.env` still work. The config file takes priority when both exist.

### 2. IPC Channels for Config Management

Add two new IPC handlers in `google-api.ts`:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `sero:google:get-config` | renderer -> main | Returns `{ configured: boolean }` (does not expose secrets back to renderer) |
| `sero:google:save-config` | renderer -> main | Accepts `{ clientId, clientSecret }`, writes to JSON, returns `{ ok: boolean }` |

Update the preload bridge (`google-imagegen.ts`) to expose:
- `getConfig(): Promise<{ configured: boolean }>`
- `saveConfig(clientId: string, clientSecret: string): Promise<{ ok: boolean }>`

Update type definitions in `ipc-channels.ts` and `electron.d.ts`.

### 3. AuthSetup UI: Setup Form

Replace the static "not configured" warning with an inline setup form.

**Layout when `status === 'not-configured'`:**

```
+----------------------------------------------------------+
|  (i) Set up Google integration                           |
|                                                          |
|  Create OAuth credentials in Google Cloud Console.       |
|  Enable the Gmail API and Google Calendar API,           |
|  then create an OAuth 2.0 Client ID (Desktop app).      |
|                                                          |
|  Client ID                                               |
|  [____________________________] (show/hide toggle)       |
|                                                          |
|  Client Secret                                           |
|  [____________________________] (show/hide toggle)       |
|                                                          |
|                              [Cancel]  [Save & Continue] |
+----------------------------------------------------------+
```

**Behavior:**
- Both fields required; "Save & Continue" disabled until both have content.
- On save: calls `window.sero.google.saveConfig(clientId, clientSecret)`.
- On success: calls `checkAuth()` which now finds `configured: true` and transitions to the "signed out" state with the "Sign in with Google" button.
- On failure: shows inline error.

**Helper text** is concise. No step-by-step tutorial — just enough to point users in the right direction (Google Cloud Console, which APIs, which credential type).

### 4. Token Validation in `getStatus()`

Currently `getStatus()` only checks token *existence*. Change it to also verify the token is usable.

**In `auth-manager.ts` `getStatus()`:**

After finding a token key in gogcli's keyring, attempt a lightweight validation:

```
gog --json auth token <email>
```

This asks gogcli to produce a valid access token, which triggers a refresh-token exchange if the current access token is expired. If the refresh token itself is revoked or invalid, this command fails.

- **Success:** return `{ configured: true, authenticated: true, email }`.
- **Failure:** return `{ configured: true, authenticated: false }` — token exists but is dead.

**Caching:** Cache the validation result for 30 seconds to avoid hammering gogcli on rapid UI re-renders. Use a simple `{ validUntil: number; result: GoogleAuthStatus }` cache object on the manager instance.

### 5. Auth Error Detection in Data Commands

**In `useGoogleApi.ts` `exec()`:**

After a command fails (`exitCode !== 0`), check if the error message contains auth-related patterns:

```typescript
const authErrorPatterns = /401|unauthorized|token.*expired|token.*revoked|invalid.*credentials/i;
```

If matched:
- Set `auth` state to `{ status: 'expired', email: auth.email, error: null }`.
- This causes the UI to show the expired banner instead of the green authenticated banner.

This catches mid-session token revocation that wouldn't be caught by `getStatus()` alone.

### 6. New "Expired" Auth Status

Add `'expired'` to the `AuthStatus` type union:

```typescript
type AuthStatus = 'unknown' | 'checking' | 'not-configured' | 'signed-out'
  | 'signing-in' | 'authenticated' | 'expired';
```

**UI in `AuthSetup.tsx` for `status === 'expired'`:**

```
+----------------------------------------------------------+
|  (!) danielrosscarter@gmail.com                          |
|      Session expired - sign in again to reconnect        |
|                                    [Sign in]  [Sign out] |
+----------------------------------------------------------+
```

- Amber/warning styling (similar to not-configured, but distinct).
- Shows the last-known email so the user knows which account.
- "Sign in" calls `signIn()` to re-run the OAuth flow.
- "Sign out" calls `signOut()` to clear stale state entirely.

### 7. Hook Changes (`useGoogleApi.ts`)

- Add `saveConfig(clientId: string, clientSecret: string)` to the `GoogleApi` interface.
- Add `getConfig()` for the setup form to check current state.
- Update `SeroGoogleBridge` interface to include the new bridge methods.
- Update `exec()` with auth error detection (section 5).
- Add `'expired'` to `AuthStatus`.

## Files Changed

| File | Change |
|------|--------|
| `apps/desktop/electron/features/auth/google/auth-manager.ts` | Config file read/write, token validation in `getStatus()`, validation cache |
| `apps/desktop/electron/ipc/integrations/google-api.ts` | New `get-config` / `save-config` IPC handlers |
| `apps/desktop/electron/preload/integrations/google-imagegen.ts` | Expose `getConfig` / `saveConfig` on bridge |
| `apps/desktop/src/types/ipc-channels.ts` | New `google.getConfig` / `google.saveConfig` channel constants |
| `apps/desktop/src/types/electron.d.ts` | Type the new `window.sero.google` methods |
| `plugins/sero-google-plugin/ui/components/AuthSetup.tsx` | Setup form for not-configured, expired state banner |
| `plugins/sero-google-plugin/ui/hooks/useGoogleApi.ts` | Auth error detection in `exec()`, expired status, config methods |

## What Stays the Same

- The OAuth flow itself (PKCE + browser + gogcli import).
- Token storage in gogcli keyring.
- The sign-in/sign-out mechanics.
- Mail/Calendar data fetching logic.
- Env var fallback for advanced users.

## Edge Cases

- **Both config file and env vars set:** Config file wins. This is documented in the helper text.
- **Config saved but gogcli not installed:** `getStatus()` returns `{ configured: true, authenticated: false }`. The sign-in flow will fail with "gogcli not found" — this is the existing behavior and acceptable.
- **Token refresh succeeds during validation but fails during data fetch:** The 30s cache means we might briefly show "authenticated" then get an error. The `exec()` auth-error detection catches this and transitions to "expired".
- **User revokes access via Google permissions page mid-session:** Next data command fails, `exec()` detects the auth error, UI transitions to "expired".
