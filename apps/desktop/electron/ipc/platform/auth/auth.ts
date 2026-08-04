/**
 * Auth IPC handlers — OAuth login + API key management.
 *
 * Bridges Pi's provider-neutral ModelRuntime authentication protocol across
 * Electron IPC and keeps credentials inside the main process.
 *
 * OAuth flow:
 *   1. Renderer calls `login(providerId)`
 *   2. Main calls `modelRuntime.login(providerId, 'oauth', interaction)`
 *   3. Each notification sends an OAuthEvent to the initiating renderer
 *   4. For prompts/manual input, main holds a Promise until renderer responds
 *   5. Renderer calls `respondPrompt(value)` or `respondManualCode(value)`
 *   6. On completion, main sends success/error event
 *
 * API key flow:
 *   Renderer calls `setApiKey(providerId, key)` or `removeApiKey(providerId)`.
 *   Main asks ModelRuntime to persist provider-owned credentials.
 */

import fs from 'fs';
import { ipcMain, shell, type WebContents } from 'electron';
import type { AuthEvent, AuthInteraction, AuthPrompt } from '@earendil-works/pi-ai';

import { IpcChannels } from '@/types/ipc-channels';
import type {
  OAuthProviderInfo,
  ApiKeyProviderInfo,
  AuthProvidersResponse,
  OAuthEvent,
} from '@/types/ipc';
import { ensureInfra } from '@electron/shared/infra/shared-infra';
import {
  getApiKeyProviderCatalog,
  getOAuthProviderCatalog,
} from '@electron/shared/auth/provider-catalog';
import { AUTH_JSON_PATH } from '@electron/platform/env';
import { refreshModelAvailabilityAfterCredentialChange } from './auth-model-refresh';

// ── auth.json permission hardening ───────────────────────────
// The Pi SDK writes auth.json with default permissions (0o644).
// We enforce 0o600 after every write to prevent other users from
// reading API keys on multi-user systems.

/** Ensure auth.json has 0o600 permissions. No-op if file doesn't exist. */
function hardenAuthJsonPermissions(): void {
  if (!fs.existsSync(AUTH_JSON_PATH)) return;
  try {
    fs.chmodSync(AUTH_JSON_PATH, 0o600);
  } catch (error) {
    console.warn('[auth] Could not set auth.json permissions to 0o600:', error);
  }
}

/**
 * Check auth.json permissions at startup and repair if needed.
 * Logs a warning if permissions were wrong.
 */
interface AuthPermissionFileSystem {
  existsSync(path: string): boolean;
  statSync(path: string): { mode: number };
  chmodSync(path: string, mode: number): void;
}

export function repairAuthJsonPermissionsOnStartup(
  fileSystem: AuthPermissionFileSystem = fs,
): void {
  if (!fileSystem.existsSync(AUTH_JSON_PATH)) return;
  try {
    const mode = fileSystem.statSync(AUTH_JSON_PATH).mode & 0o777;
    if (mode === 0o600) return;
    fileSystem.chmodSync(AUTH_JSON_PATH, 0o600);
    console.warn(
      `[auth] Repaired auth.json permissions: 0o${mode.toString(8)} → 0o600`,
    );
  } catch (error) {
    console.warn('[auth] Could not repair auth.json permissions:', error);
  }
}

// ── In-flight login state ────────────────────────────────────

interface PendingResponse {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

interface LoginAttempt {
  origin: WebContents;
  controller: AbortController;
  prompt: PendingResponse | null;
  manualCode: PendingResponse | null;
  select: PendingResponse | null;
}

let activeLogin: LoginAttempt | null = null;

function sendAuthEvent(attempt: LoginAttempt, event: OAuthEvent): void {
  if (!attempt.origin.isDestroyed()) {
    attempt.origin.send(IpcChannels.auth.event, event);
  }
}

function cancelAttempt(attempt: LoginAttempt): void {
  attempt.controller.abort();
  const error = new Error('Login cancelled');
  attempt.prompt?.reject(error);
  attempt.manualCode?.reject(error);
  attempt.select?.reject(error);
  attempt.prompt = null;
  attempt.manualCode = null;
  attempt.select = null;
}

function waitForResponse(
  attempt: LoginAttempt,
  field: 'prompt' | 'manualCode' | 'select',
  signal?: AbortSignal,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Login cancelled'));
      return;
    }
    const response = { resolve, reject };
    attempt[field] = response;
    signal?.addEventListener('abort', () => {
      if (attempt[field] !== response) return;
      attempt[field] = null;
      reject(new Error('Login cancelled'));
    }, { once: true });
  });
}

function notifyRenderer(attempt: LoginAttempt, event: AuthEvent): void {
  if (event.type === 'auth_url') {
    void shell.openExternal(event.url).catch(() => {});
    sendAuthEvent(attempt, {
      type: 'auth',
      url: event.url,
      instructions: event.instructions,
    });
  } else if (event.type === 'device_code') {
    void shell.openExternal(event.verificationUri).catch(() => {});
    sendAuthEvent(attempt, {
      type: 'auth',
      url: event.verificationUri,
      instructions: `Enter code: ${event.userCode}`,
    });
  } else {
    sendAuthEvent(attempt, { type: 'progress', message: event.message });
  }
}

function promptRenderer(attempt: LoginAttempt, prompt: AuthPrompt): Promise<string> {
  if (prompt.type === 'select') {
    sendAuthEvent(attempt, {
      type: 'select',
      message: prompt.message,
      options: prompt.options.map(({ id, label }) => ({ id, label })),
    });
    return waitForResponse(attempt, 'select', prompt.signal);
  }
  if (prompt.type === 'manual_code') {
    sendAuthEvent(attempt, { type: 'manual_input', prompt: prompt.message });
    return waitForResponse(attempt, 'manualCode', prompt.signal);
  }
  sendAuthEvent(attempt, {
    type: 'prompt',
    message: prompt.message,
    placeholder: prompt.placeholder,
  });
  return waitForResponse(attempt, 'prompt', prompt.signal);
}

function createAuthInteraction(attempt: LoginAttempt): AuthInteraction {
  return {
    signal: attempt.controller.signal,
    notify: (event) => notifyRenderer(attempt, event),
    prompt: (prompt) => promptRenderer(attempt, prompt),
  };
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
      const providers = infra.modelRuntime.getProviders();
      const credentials = new Map(
        (await infra.modelRuntime.listCredentials())
          .map((credential) => [credential.providerId, credential]),
      );

      const oauth: OAuthProviderInfo[] = getOAuthProviderCatalog(providers).map((provider) => {
        const credential = credentials.get(provider.id);
        return {
          id: provider.id,
          name: provider.name,
          isLoggedIn: credential?.type === 'oauth',
        };
      });

      const apiKey: ApiKeyProviderInfo[] = getApiKeyProviderCatalog(providers).map((provider) => {
        const credential = credentials.get(provider.id);
        const status = infra.modelRuntime.getProviderAuthStatus(provider.id);
        return {
          id: provider.id,
          name: provider.name,
          hasKey: status.configured,
          fromEnv: !credential && status.source === 'environment',
        };
      });

      return { oauth, apiKey };
    },
  );

  // ── Start login ────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.login,
    async (ipcEvent, providerId: string): Promise<void> => {
      const infra = await ensureInfra();
      const provider = infra.modelRuntime.getProvider(providerId);

      if (!provider?.auth.oauth) {
        const failedAttempt: LoginAttempt = {
          origin: ipcEvent.sender,
          controller: new AbortController(),
          prompt: null,
          manualCode: null,
          select: null,
        };
        sendAuthEvent(failedAttempt, {
          type: 'error',
          provider: providerId,
          message: `Unknown OAuth provider: ${providerId}`,
        });
        return;
      }

      if (activeLogin) cancelAttempt(activeLogin);
      const attempt: LoginAttempt = {
        origin: ipcEvent.sender,
        controller: new AbortController(),
        prompt: null,
        manualCode: null,
        select: null,
      };
      activeLogin = attempt;

      try {
        await infra.modelRuntime.login(providerId, 'oauth', createAuthInteraction(attempt));

        hardenAuthJsonPermissions();
        await refreshModelAvailabilityAfterCredentialChange(providerId);
        sendAuthEvent(attempt, {
          type: 'success',
          provider: provider.name,
          message: `Logged in to ${provider.name}. Credentials saved.`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt.controller.signal.aborted || msg === 'Login cancelled') {
          sendAuthEvent(attempt, { type: 'cancelled' });
        } else {
          sendAuthEvent(attempt, {
            type: 'error',
            provider: provider.name,
            message: `Failed to login to ${provider.name}: ${msg}`,
          });
        }
      } finally {
        if (activeLogin === attempt) activeLogin = null;
      }
    },
  );

  // ── Logout (OAuth or API key) ────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.logout,
    async (_event, providerId: string): Promise<void> => {
      const infra = await ensureInfra();
      await infra.modelRuntime.logout(providerId);
      hardenAuthJsonPermissions();
      await refreshModelAvailabilityAfterCredentialChange(providerId);
    },
  );

  // ── Set API key ────────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.setApiKey,
    async (_event, providerId: string, key: string): Promise<void> => {
      const infra = await ensureInfra();
      const provider = infra.modelRuntime.getProvider(providerId);
      const allowedProvider = getApiKeyProviderCatalog(
        infra.modelRuntime.getProviders(),
      ).some((candidate) => candidate.id === providerId);
      if (!provider?.auth.apiKey?.login || !allowedProvider) {
        throw new Error(`API key setup is not supported for provider: ${providerId}`);
      }
      let promptAnswered = false;
      await infra.modelRuntime.login(providerId, 'api_key', {
        prompt: async (prompt) => {
          if (promptAnswered || (prompt.type !== 'secret' && prompt.type !== 'text')) {
            throw new Error(`Provider ${providerId} requires unsupported API key setup`);
          }
          promptAnswered = true;
          return key;
        },
        notify: () => {},
      });
      hardenAuthJsonPermissions();
      await refreshModelAvailabilityAfterCredentialChange(providerId);
    },
  );

  // ── Remove API key ─────────────────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.removeApiKey,
    async (_event, providerId: string): Promise<void> => {
      const infra = await ensureInfra();
      await infra.modelRuntime.logout(providerId);
      hardenAuthJsonPermissions();
      await refreshModelAvailabilityAfterCredentialChange(providerId);
    },
  );

  // ── Respond to pending prompt ──────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.respondPrompt,
    async (event, value: string): Promise<boolean> => {
      if (activeLogin?.origin === event.sender && activeLogin.prompt) {
        activeLogin.prompt.resolve(value);
        activeLogin.prompt = null;
        return true;
      }
      console.warn('[auth] respondPrompt called but no prompt is pending — ignoring');
      return false;
    },
  );

  // ── Respond to pending manual code input ───────────────────
  ipcMain.handle(
    IpcChannels.auth.respondManualCode,
    async (event, value: string): Promise<boolean> => {
      if (activeLogin?.origin === event.sender && activeLogin.manualCode) {
        activeLogin.manualCode.resolve(value);
        activeLogin.manualCode = null;
        return true;
      }
      console.warn('[auth] respondManualCode called but no input is pending — ignoring');
      return false;
    },
  );

  // ── Respond to pending selection ───────────────────────────
  ipcMain.handle(
    IpcChannels.auth.respondSelect,
    async (event, value: string): Promise<boolean> => {
      if (activeLogin?.origin === event.sender && activeLogin.select) {
        activeLogin.select.resolve(value);
        activeLogin.select = null;
        return true;
      }
      console.warn('[auth] respondSelect called but no selection is pending — ignoring');
      return false;
    },
  );

  // ── Cancel in-progress login ───────────────────────────────
  ipcMain.handle(
    IpcChannels.auth.cancel,
    async (event): Promise<void> => {
      if (activeLogin?.origin === event.sender) cancelAttempt(activeLogin);
    },
  );
}
