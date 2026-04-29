import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { Api, Model } from '@mariozechner/pi-ai';
import { ensureSessionHasAvailableModel } from '@electron/ipc/agent/core/agent-session-model-sync';

function createModel(provider: string, id: string): Model<Api> {
  return { provider, id } as Model<Api>;
}

describe('ensureSessionHasAvailableModel', () => {
  const authReload = vi.fn();
  const findModel = vi.fn();
  const getAvailable = vi.fn();
  const settingsReload = vi.fn();
  const getDefaultProvider = vi.fn(() => undefined);
  const getDefaultModel = vi.fn(() => undefined);
  const getGlobalSettings = vi.fn(() => ({}));
  const setModel = vi.fn(async () => {});
  const runtimeSetModel = vi.fn();

  beforeEach(() => {
    authReload.mockReset();
    findModel.mockReset();
    getAvailable.mockReset();
    settingsReload.mockReset();
    getDefaultProvider.mockReset().mockReturnValue(undefined);
    getDefaultModel.mockReset().mockReturnValue(undefined);
    getGlobalSettings.mockReset().mockReturnValue({});
    setModel.mockReset();
    runtimeSetModel.mockReset();
  });

  it('clears the live session model when availability drops to zero', async () => {
    const session = {
      model: createModel('openai', 'gpt-5.4-mini'),
      agent: { setModel: runtimeSetModel },
      setModel,
      modelRegistry: {
        authStorage: { reload: authReload },
        find: findModel.mockReturnValue(undefined),
        getAvailable: getAvailable.mockReturnValue([]),
      },
      settingsManager: {
        reload: settingsReload,
        getDefaultProvider,
        getDefaultModel,
        getGlobalSettings,
      },
    } as unknown as AgentSession;

    const changed = await ensureSessionHasAvailableModel(session);

    expect(changed).toBe(true);
    expect(authReload).toHaveBeenCalledOnce();
    expect(runtimeSetModel).toHaveBeenCalledWith(undefined);
    expect(setModel).not.toHaveBeenCalled();
  });

  it('does nothing when the session is already model-less and nothing is available', async () => {
    const session = {
      model: undefined,
      agent: { setModel: runtimeSetModel },
      setModel,
      modelRegistry: {
        authStorage: { reload: authReload },
        find: findModel.mockReturnValue(undefined),
        getAvailable: getAvailable.mockReturnValue([]),
      },
      settingsManager: {
        reload: settingsReload,
        getDefaultProvider,
        getDefaultModel,
        getGlobalSettings,
      },
    } as unknown as AgentSession;

    const changed = await ensureSessionHasAvailableModel(session);

    expect(changed).toBe(false);
    expect(runtimeSetModel).not.toHaveBeenCalled();
    expect(setModel).not.toHaveBeenCalled();
  });
});
