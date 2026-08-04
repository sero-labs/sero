import { chmodSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthInteraction,
  Credential,
  Provider,
} from '@earendil-works/pi-ai';

const AUTH_PATH = '/tmp/sero-auth-handlers-test.json';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openExternal: vi.fn(async () => {}),
  ensureInfra: vi.fn(),
  refreshAfterCredentialChange: vi.fn(async () => {}),
  packageProviders: [] as Array<{ id: string; name: string; envVar?: string }>,
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    },
  },
  shell: { openExternal: mocks.openExternal },
}));

vi.mock('@electron/platform/env', () => ({
  AUTH_JSON_PATH: '/tmp/sero-auth-handlers-test.json',
  SERO_AGENT_DIR: '/tmp/sero-agent-test',
}));

vi.mock('@electron/shared/providers/package-provider-manifests', () => ({
  getPackageApiKeyProviders: () => mocks.packageProviders.map(({ id, name }) => ({ id, name })),
  registerPackageProviderAuth: (runtime: {
    getProvider: (providerId: string) => unknown;
    registerProvider: (
      providerId: string,
      config: { name: string; apiKey?: string },
    ) => void;
  }) => {
    for (const provider of mocks.packageProviders) {
      if (runtime.getProvider(provider.id)) continue;
      runtime.registerProvider(provider.id, {
        name: provider.name,
        apiKey: provider.envVar ? `$${provider.envVar}` : undefined,
      });
    }
  },
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  ensureInfra: mocks.ensureInfra,
}));

vi.mock('@electron/ipc/platform/auth/auth-model-refresh', () => ({
  refreshModelAvailabilityAfterCredentialChange: mocks.refreshAfterCredentialChange,
}));

import { IpcChannels } from '@/types/ipc-channels';
import {
  registerAuthHandlers,
  repairAuthJsonPermissionsOnStartup,
} from '@electron/ipc/platform/auth/auth';

function oauthProvider(id = 'test-oauth'): Provider {
  return {
    id,
    name: 'Test OAuth',
    auth: {
      oauth: {
        name: 'Test OAuth',
        login: vi.fn(),
        refresh: vi.fn(),
        toAuth: vi.fn(),
      },
    },
    getModels: () => [],
  } as unknown as Provider;
}

function apiKeyProvider(id = 'anthropic'): Provider {
  return {
    id,
    name: 'Test Key',
    auth: {
      apiKey: {
        name: 'Test Key',
        login: vi.fn(),
        resolve: vi.fn(),
      },
    },
    getModels: () => [],
  } as unknown as Provider;
}

function sender() {
  return {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
  };
}

function handler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const registered = mocks.handlers.get(channel);
  if (!registered) throw new Error(`Missing IPC handler: ${channel}`);
  return async (...args) => registered(...args);
}

describe('authentication IPC', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.openExternal.mockClear();
    mocks.ensureInfra.mockReset();
    mocks.refreshAfterCredentialChange.mockClear();
    mocks.packageProviders = [];
    writeFileSync(AUTH_PATH, '{}');
    chmodSync(AUTH_PATH, 0o644);
    registerAuthHandlers();
  });

  afterAll(() => {
    unlinkSync(AUTH_PATH);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds provider status from runtime metadata without exposing secrets', async () => {
    const oauth = oauthProvider('anthropic');
    const apiKey = apiKeyProvider('openai');
    const modelRuntime = {
      getProviders: () => [oauth, apiKey],
      listCredentials: vi.fn(async () => [
        { providerId: oauth.id, type: 'oauth' as const },
      ]),
      getProviderAuthStatus: vi.fn((id: string) => (
        id === apiKey.id
          ? { configured: true, source: 'environment', label: 'TEST_KEY' }
          : { configured: true, source: 'stored' }
      )),
    };
    mocks.ensureInfra.mockResolvedValue({ modelRuntime });

    const result = await handler(IpcChannels.auth.getProviders)();

    expect(result).toEqual({
      oauth: [{ id: oauth.id, name: oauth.name, isLoggedIn: true }],
      apiKey: [
        { id: oauth.id, name: 'Anthropic', hasKey: false, fromEnv: false },
        { id: apiKey.id, name: 'OpenAI', hasKey: true, fromEnv: true },
      ],
    });
  });

  it('keeps command-configured API keys visible after extension registration', async () => {
    vi.stubEnv('COMMAND_PROVIDER_KEY', 'environment-secret');
    const provider = apiKeyProvider('openai');
    const modelRuntime = {
      getProviders: () => [provider],
      listCredentials: vi.fn(async () => []),
      getProviderAuthStatus: vi.fn(() => ({
        configured: true,
        source: 'models_json_command' as const,
        label: '!printenv COMMAND_PROVIDER_KEY',
      })),
    };
    mocks.ensureInfra.mockResolvedValue({ modelRuntime });

    await expect(handler(IpcChannels.auth.getProviders)()).resolves.toEqual({
      oauth: [],
      apiKey: [{
        id: 'openai',
        name: 'OpenAI',
        hasKey: true,
        fromEnv: true,
      }],
    });
  });

  it('maps every auth notification and prompt through the initiating window', async () => {
    const provider = oauthProvider();
    const origin = sender();
    const otherWindow = sender();
    const answers: string[] = [];
    const modelRuntime = {
      getProvider: () => provider,
      login: vi.fn(async (
        _providerId: string,
        _type: string,
        interaction: AuthInteraction,
      ): Promise<Credential> => {
        interaction.notify({ type: 'auth_url', url: 'https://auth.test', instructions: 'Sign in' });
        interaction.notify({
          type: 'device_code',
          userCode: 'ABCD',
          verificationUri: 'https://device.test',
        });
        interaction.notify({ type: 'info', message: 'Information' });
        interaction.notify({ type: 'progress', message: 'Waiting' });
        answers.push(await interaction.prompt({ type: 'text', message: 'Account' }));
        answers.push(await interaction.prompt({ type: 'secret', message: 'Secret' }));
        answers.push(await interaction.prompt({ type: 'manual_code', message: 'Paste callback' }));
        answers.push(await interaction.prompt({
          type: 'select',
          message: 'Choose account',
          options: [{ id: 'one', label: 'One', description: 'First' }],
        }));
        return { type: 'oauth', access: 'access', refresh: 'refresh', expires: Date.now() };
      }),
    };
    mocks.ensureInfra.mockResolvedValue({ modelRuntime });

    const login = handler(IpcChannels.auth.login)({ sender: origin }, provider.id);
    await vi.waitFor(() => expect(origin.send).toHaveBeenCalledWith(
      IpcChannels.auth.event,
      expect.objectContaining({ type: 'prompt', message: 'Account' }),
    ));
    await expect(handler(IpcChannels.auth.respondPrompt)({ sender: otherWindow }, 'poison'))
      .resolves.toBe(false);
    await handler(IpcChannels.auth.respondPrompt)({ sender: origin }, 'account');
    await vi.waitFor(() => expect(origin.send).toHaveBeenCalledWith(
      IpcChannels.auth.event,
      expect.objectContaining({ type: 'prompt', message: 'Secret' }),
    ));
    await handler(IpcChannels.auth.respondPrompt)({ sender: origin }, 'secret');
    await vi.waitFor(() => expect(origin.send).toHaveBeenCalledWith(
      IpcChannels.auth.event,
      expect.objectContaining({ type: 'manual_input' }),
    ));
    await handler(IpcChannels.auth.respondManualCode)({ sender: origin }, 'callback');
    await vi.waitFor(() => expect(origin.send).toHaveBeenCalledWith(
      IpcChannels.auth.event,
      expect.objectContaining({ type: 'select' }),
    ));
    await handler(IpcChannels.auth.respondSelect)({ sender: origin }, 'one');
    await login;

    expect(answers).toEqual(['account', 'secret', 'callback', 'one']);
    expect(mocks.openExternal).toHaveBeenCalledWith('https://auth.test');
    expect(mocks.openExternal).toHaveBeenCalledWith('https://device.test');
    expect(origin.send).toHaveBeenCalledWith(
      IpcChannels.auth.event,
      expect.objectContaining({ type: 'success', provider: provider.name }),
    );
    expect(otherWindow.send).not.toHaveBeenCalled();
    expect(statSync(AUTH_PATH).mode & 0o777).toBe(0o600);
  });

  it('cancels the active flow and sends cancellation only to its origin', async () => {
    const provider = oauthProvider();
    const origin = sender();
    const otherWindow = sender();
    let loginSignal: AbortSignal | undefined;
    const modelRuntime = {
      getProvider: () => provider,
      login: vi.fn(async (
        _providerId: string,
        _type: string,
        interaction: AuthInteraction,
      ): Promise<Credential> => new Promise((_resolve, reject) => {
        loginSignal = interaction.signal;
        interaction.signal?.addEventListener(
          'abort',
          () => reject(new Error('Login cancelled')),
          { once: true },
        );
      })),
    };
    mocks.ensureInfra.mockResolvedValue({ modelRuntime });

    const login = handler(IpcChannels.auth.login)({ sender: origin }, provider.id);
    await vi.waitFor(() => expect(modelRuntime.login).toHaveBeenCalledOnce());
    await handler(IpcChannels.auth.cancel)({ sender: otherWindow });
    expect(loginSignal?.aborted).toBe(false);
    await handler(IpcChannels.auth.cancel)({ sender: origin });
    await login;

    expect(origin.send).toHaveBeenCalledWith(
      IpcChannels.auth.event,
      { type: 'cancelled' },
    );
    expect(otherWindow.send).not.toHaveBeenCalled();
  });

  it('rejects follow-up prompts after cancellation', async () => {
    const provider = oauthProvider();
    const origin = sender();
    const modelRuntime = {
      getProvider: () => provider,
      login: vi.fn(async (_id: string, _type: string, interaction: AuthInteraction) => {
        await new Promise<void>((resolve) => {
          interaction.signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        await interaction.prompt({ type: 'text', message: 'Too late' });
        return { type: 'oauth' as const, access: 'unused' };
      }),
    };
    mocks.ensureInfra.mockResolvedValue({ modelRuntime });

    const login = handler(IpcChannels.auth.login)({ sender: origin }, provider.id);
    await vi.waitFor(() => expect(modelRuntime.login).toHaveBeenCalledOnce());
    await handler(IpcChannels.auth.cancel)({ sender: origin });
    await login;

    expect(origin.send).not.toHaveBeenCalledWith(
      IpcChannels.auth.event,
      expect.objectContaining({ type: 'prompt', message: 'Too late' }),
    );
    await expect(handler(IpcChannels.auth.respondPrompt)({ sender: origin }, 'unused'))
      .resolves.toBe(false);
  });

  it('persists replacement API keys and removes credentials through ModelRuntime', async () => {
    const savedKeys: string[] = [];
    const login = vi.fn(async (
      _providerId: string,
      _type: string,
      interaction: AuthInteraction,
    ) => {
      const key = await interaction.prompt({ type: 'secret', message: 'API key' });
      savedKeys.push(key);
      return { type: 'api_key' as const, key };
    });
    const logout = vi.fn(async () => {});
    const provider = apiKeyProvider();
    mocks.ensureInfra.mockResolvedValue({
      modelRuntime: {
        getProvider: () => provider,
        getProviders: () => [provider],
        login,
        logout,
      },
    });

    await handler(IpcChannels.auth.setApiKey)({}, 'anthropic', 'first');
    await handler(IpcChannels.auth.setApiKey)({}, 'anthropic', 'replacement');
    await handler(IpcChannels.auth.removeApiKey)({}, 'anthropic');

    expect(login).toHaveBeenCalledTimes(2);
    expect(savedKeys).toEqual(['first', 'replacement']);
    expect(logout).toHaveBeenCalledWith('anthropic');
    expect(mocks.refreshAfterCredentialChange).toHaveBeenCalledTimes(3);
    expect(statSync(AUTH_PATH).mode & 0o777).toBe(0o600);
  });

  it('configures manifest providers and reads their environment status before a session', async () => {
    const providerId = 'manifest-provider';
    const envVar = 'MANIFEST_PROVIDER_KEY';
    const providers = new Map<string, Provider>();
    const login = vi.fn(async (
      id: string,
      _type: string,
      interaction: AuthInteraction,
    ) => {
      const key = await interaction.prompt({ type: 'secret', message: 'API key' });
      return { type: 'api_key' as const, key, providerId: id };
    });
    const registerProvider = vi.fn((id: string, config: { name: string }) => {
      const provider = apiKeyProvider(id);
      providers.set(id, { ...provider, name: config.name });
    });
    mocks.packageProviders = [{ id: providerId, name: 'Manifest Provider', envVar }];
    vi.stubEnv(envVar, 'environment-secret');
    const modelRuntime = {
      getProvider: (id: string) => providers.get(id),
      getProviders: () => [...providers.values()],
      getProviderAuthStatus: (id: string) => (
        id === providerId && process.env[envVar]
          ? { configured: true, source: 'environment' as const, label: envVar }
          : { configured: false }
      ),
      listCredentials: vi.fn(async () => []),
      registerProvider,
      login,
    };
    mocks.ensureInfra.mockResolvedValue({ modelRuntime });

    await expect(handler(IpcChannels.auth.getProviders)()).resolves.toEqual({
      oauth: [],
      apiKey: [{
        id: providerId,
        name: 'Manifest Provider',
        hasKey: true,
        fromEnv: true,
      }],
    });
    await handler(IpcChannels.auth.setApiKey)({}, providerId, 'saved-secret');

    expect(registerProvider).toHaveBeenCalledWith(providerId, {
      name: 'Manifest Provider',
      apiKey: `$${envVar}`,
    });
    expect(login).toHaveBeenCalledOnce();
  });

  it('rejects API-key providers that require more than one prompt', async () => {
    const provider = apiKeyProvider();
    const login = vi.fn(async (
      _providerId: string,
      _type: string,
      interaction: AuthInteraction,
    ) => {
      await interaction.prompt({ type: 'secret', message: 'API key' });
      await interaction.prompt({ type: 'text', message: 'Account ID' });
      return { type: 'api_key' as const, key: 'unused' };
    });
    mocks.ensureInfra.mockResolvedValue({
      modelRuntime: {
        getProvider: () => provider,
        getProviders: () => [provider],
        login,
      },
    });

    await expect(
      handler(IpcChannels.auth.setApiKey)({}, provider.id, 'secret-value'),
    ).rejects.toThrow('requires unsupported API key setup');
    expect(mocks.refreshAfterCredentialChange).not.toHaveBeenCalled();
  });

  it('settles a prompt whose signal was already aborted', async () => {
    const provider = oauthProvider();
    const origin = sender();
    const modelRuntime = {
      getProvider: () => provider,
      login: vi.fn(async (
        _providerId: string,
        _type: string,
        interaction: AuthInteraction,
      ) => {
        const controller = new AbortController();
        controller.abort();
        await interaction.prompt({
          type: 'manual_code',
          message: 'Paste callback',
          signal: controller.signal,
        });
        return { type: 'oauth' as const, access: 'unused' };
      }),
    };
    mocks.ensureInfra.mockResolvedValue({ modelRuntime });

    await handler(IpcChannels.auth.login)({ sender: origin }, provider.id);

    expect(origin.send).toHaveBeenCalledWith(
      IpcChannels.auth.event,
      { type: 'cancelled' },
    );
  });

  it('registers auth handlers when permission repair fails', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => repairAuthJsonPermissionsOnStartup({
      existsSync: () => true,
      statSync: () => ({ mode: 0o100644 }),
      chmodSync: () => {
        throw new Error('read-only filesystem');
      },
    })).not.toThrow();
    expect(mocks.handlers.has(IpcChannels.auth.login)).toBe(true);
    expect(mocks.handlers.has(IpcChannels.auth.setApiKey)).toBe(true);
    expect(consoleWarn).toHaveBeenCalledWith(
      '[auth] Could not repair auth.json permissions:',
      expect.any(Error),
    );
    consoleWarn.mockRestore();
  });
});
