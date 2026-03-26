/**
 * Auth IPC handlers — OAuth login + API key management.
 *
 * Bridges the Pi SDK's AuthStorage.login() callback-driven OAuth flow
 * across Electron IPC, and provides simple set/remove for API keys.
 *
 * OAuth flow:
 *   1. Renderer calls `login(providerId)`
 *   2. Main calls `authStorage.login(providerId, callbacks)`
 *   3. Each callback sends an OAuthEvent to renderer via push channel
 *   4. For prompts/manual input, main holds a Promise until renderer responds
 *   5. Renderer calls `respondPrompt(value)` or `respondManualCode(value)`
 *   6. On completion, main sends success/error event
 *
 * API key flow:
 *   Renderer calls `setApiKey(providerId, key)` or `removeApiKey(providerId)`.
 *   Main writes directly to auth.json via AuthStorage.
 */

import fs from 'fs';
import { ipcMain, BrowserWindow, shell, type WebContents } from 'electron';
import { getEnvApiKey } from '@mariozechner/pi-ai';
import { getOAuthProviders } from '@mariozechner/pi-ai/oauth';
import type { OAuthProviderId } from '@mariozechner/pi-ai';

import { IpcChannels } from '../../../src/types/ipc';
import type {
  OAuthProviderInfo,
  ApiKeyProviderInfo,
  AuthProvidersResponse,
  OAuthEvent,
} from '../../../src/types/ipc';
import { ensureInfra } from '../shared-infra';
import { AUTH_JSON_PATH } from '../../env';

// ── auth.json permission hardening ───────────────────────────
// The Pi SDK writes auth.json with default permissions (0o644).
// We enforce 0o600 after every write to prevent other users from
// reading API keys on multi-user systems.

/** Ensure auth.json has 0o600 permissions. No-op if file doesn't exist. */
function hardenAuthJsonPermissions(): void {
  try {
    fs.chmodSync(AUTH_JSON_PATH, 0o600);
  } catch {
    // File may not exist yet — that's fine
  }
}

/**
 * Check auth.json permissions at startup and repair if needed.
 * Logs a warning if permissions were wrong.
 */
function repairAuthJsonPermissionsOnStartup(): void {
  try {
    const stat = fs.statSync(AUTH_JSON_PATH);
    const mode = stat.mode & 0o777;
    if (mode !== 0o600) {
      fs.chmodSync(AUTH_JSON_PATH, 0o600);
      console.warn(
        `[auth] Repaired auth.json permissions: 0o${mode.toString(8)} → 0o600`,
      );
    }
  } catch {
    // File doesn't exist yet — nothing to repair
  }
}

// ── API-key provider definitions ─────────────────────────────
// Providers that accept a plain API key (not OAuth).
// Ordered roughly by popularity.

const API_KEY_PROVIDERS: { id: string; name: string }[] = [
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google (Gemini)' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'xai', name: 'xAI' },
  { id: 'groq', name: 'Groq' },
  { id: 'cerebras', name: 'Cerebras' },
  { id: 'mistral', name: 'Mistral' },
  { id: 'azure-openai-responses', name: 'Azure OpenAI' },
  { id: 'huggingface', name: 'Hugging Face' },
  { id: 'vercel-ai-gateway', name: 'Vercel AI Gateway' },
  { id: 'zai', name: 'ZAI' },
  { id: 'opencode', name: 'OpenCode' },
  { id: 'kimi-coding', name: 'Kimi' },
];

// ── In-flight login state ────────────────────────────────────

let abortController: AbortController | null = null;
let promptResolver: ((value: string) => void) | null = null;
let promptRejecter: ((err: Error) => void) | null = null;
let manualCodeResolver: ((value: string) => void) | null = null;
let manualCodeRejecter: ((err: Error) => void) | null = null;

/**
 * The webContents that initiated the current login flow.
 * Events are sent only to this target to prevent leaking OAuth data
 * to unrelated windows (DevTools, webviews, detached panels).
 */
let loginOriginWebContents: WebContents | null = null;

/**
 * Send an OAuth event to the originating window only.
 * Falls back to the focused window if the originator was destroyed.
 */
function sendAuthEvent(event: OAuthEvent): void {
  if (loginOriginWebContents && !loginOriginWebContents.isDestroyed()) {
    loginOriginWebContents.send(IpcChannels.auth.event, event);
    return;
  }
  // Fallback: originating window was closed mid-flow
  const focused = BrowserWindow.getFocusedWindow();
  if (focused) {
    focused.webContents.send(IpcChannels.auth.event, event);
  } else {
    console.warn('[auth] No window available to send OAuth event:', event.type);
  }
}

/** Clear all pending resolvers (on cancel, complete, or error). */
function clearPending(): void {
  promptResolver = null;
  promptRejecter = null;
  manualCodeResolver = null;
  manualCodeRejecter = null;
  abortController = null;
  loginOriginWebContents = null;
}

// ── Registration ─────────────────────────────────────────────

export function registerAuthHandlers(): void {
  // Repair auth.json permissions on startup if they've drifted
  repairAuthJsonPermissionsOnStartup();

  // ── Get all providers (OAuth + API key) with auth status ──
  ipcMain.handle(
    IpcChannels.auth.getProviders,
    async (): Promise<AuthProvidersResponse> => {
      const infra = await ensureInfra();

      // OAuth providers
      const oauthProviders = getOAuthProviders();
      const oauth: OAuthProviderInfo[] = oauthProviders.map((p) => {
        const cred = infra.authStorage.get(p.id);
        return {
          id: p.id,
          name: p.name,
          isLoggedIn: cred?.type === 'oauth',
        };
      });

      // API key providers
      const apiKey: ApiKeyProviderInfo[] = API_KEY_PROVIDERS.map((p) => {
        const cred = infra.authStorage.get(p.id);
        const envKey = getEnvApiKey(p.id);
        return {
          id: p.id,
          name: p.name,
          hasKey: cred?.type === 'api_key' || !!envKey,
          fromEnv: !cred && !!envKey,
        };
      });

      return { oauth, apiKey };
    },
  );

  // ── Start login ────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.login,
    async (ipcEvent, providerId: string): Promise<void> => {
      // Track originating window so OAuth events go only to it
      loginOriginWebContents = ipcEvent.sender;

      const infra = await ensureInfra();
      const providers = getOAuthProviders();
      const provider = providers.find((p) => p.id === providerId);

      if (!provider) {
        sendAuthEvent({
          type: 'error',
          provider: providerId,
          message: `Unknown OAuth provider: ${providerId}`,
        });
        return;
      }

      // Abort any in-flight login
      if (abortController) {
        abortController.abort();
        clearPending();
      }

      abortController = new AbortController();
      const usesCallbackServer = provider.usesCallbackServer ?? false;

      try {
        await infra.authStorage.login(providerId as OAuthProviderId, {
          onAuth: (info) => {
            // Open browser via Electron (better than exec)
            shell.openExternal(info.url).catch(() => {
              // Silently ignore — URL is shown in dialog anyway
            });

            sendAuthEvent({
              type: 'auth',
              url: info.url,
              instructions: info.instructions,
            });

            // For callback server providers, also request manual input
            if (usesCallbackServer) {
              sendAuthEvent({
                type: 'manual_input',
                prompt: 'Paste redirect URL below, or complete login in browser:',
              });
            } else if (providerId === 'github-copilot') {
              sendAuthEvent({
                type: 'waiting',
                message: 'Waiting for browser authentication...',
              });
            }
          },

          onPrompt: async (prompt) => {
            sendAuthEvent({
              type: 'prompt',
              message: prompt.message,
              placeholder: prompt.placeholder,
            });

            // Wait for renderer to respond
            return new Promise<string>((resolve, reject) => {
              promptResolver = resolve;
              promptRejecter = reject;
            });
          },

          onProgress: (message) => {
            sendAuthEvent({ type: 'progress', message });
          },

          onManualCodeInput: () => {
            // Promise that resolves when renderer submits manual code
            return new Promise<string>((resolve, reject) => {
              manualCodeResolver = resolve;
              manualCodeRejecter = reject;
            });
          },

          signal: abortController.signal,
        });

        // Success — refresh model registry so new credentials are picked up
        infra.modelRegistry.refresh();
        hardenAuthJsonPermissions();

        sendAuthEvent({
          type: 'success',
          provider: provider.name,
          message: `Logged in to ${provider.name}. Credentials saved.`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'Login cancelled') {
          sendAuthEvent({ type: 'cancelled' });
        } else {
          sendAuthEvent({
            type: 'error',
            provider: provider.name,
            message: `Failed to login to ${provider.name}: ${msg}`,
          });
        }
      } finally {
        clearPending();
      }
    },
  );

  // ── Logout (OAuth or API key) ────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.logout,
    async (_event, providerId: string): Promise<void> => {
      const infra = await ensureInfra();
      infra.authStorage.logout(providerId);
      infra.modelRegistry.refresh();
    },
  );

  // ── Set API key ────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.setApiKey,
    async (_event, providerId: string, key: string): Promise<void> => {
      const infra = await ensureInfra();
      infra.authStorage.set(providerId, { type: 'api_key', key });
      hardenAuthJsonPermissions();
      infra.modelRegistry.refresh();
    },
  );

  // ── Remove API key ─────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.removeApiKey,
    async (_event, providerId: string): Promise<void> => {
      const infra = await ensureInfra();
      infra.authStorage.remove(providerId);
      infra.modelRegistry.refresh();
    },
  );

  // ── Respond to pending prompt ──────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.respondPrompt,
    async (_event, value: string): Promise<boolean> => {
      if (promptResolver) {
        promptResolver(value);
        promptResolver = null;
        promptRejecter = null;
        return true;
      }
      console.warn('[auth] respondPrompt called but no prompt is pending — ignoring');
      return false;
    },
  );

  // ── Respond to pending manual code input ───────────────────
  ipcMain.handle(
    IpcChannels.auth.respondManualCode,
    async (_event, value: string): Promise<boolean> => {
      if (manualCodeResolver) {
        manualCodeResolver(value);
        manualCodeResolver = null;
        manualCodeRejecter = null;
        return true;
      }
      console.warn('[auth] respondManualCode called but no input is pending — ignoring');
      return false;
    },
  );

  // ── Cancel in-progress login ───────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.cancel,
    async (): Promise<void> => {
      if (abortController) {
        abortController.abort();
      }
      // Reject any pending prompts
      if (promptRejecter) {
        promptRejecter(new Error('Login cancelled'));
      }
      if (manualCodeRejecter) {
        manualCodeRejecter(new Error('Login cancelled'));
      }
      clearPending();
    },
  );
}
