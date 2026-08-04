import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';
import { ensureSessionHasAvailableModel } from '@electron/ipc/agent/core/agent-session-model-sync';

function createModel(provider: string, id: string): Model<Api> {
  return { provider, id } as Model<Api>;
}

describe('ensureSessionHasAvailableModel', () => {
  const findModel = vi.fn();
  const getAvailable = vi.fn();
  const settingsReload = vi.fn();
  const getDefaultProvider = vi.fn(() => undefined);
  const getDefaultModel = vi.fn(() => undefined);
  const getGlobalSettings = vi.fn(() => ({}));
  const setModel = vi.fn(async () => {});

  beforeEach(() => {
    findModel.mockReset();
    getAvailable.mockReset();
    settingsReload.mockReset();
    getDefaultProvider.mockReset().mockReturnValue(undefined);
    getDefaultModel.mockReset().mockReturnValue(undefined);
    getGlobalSettings.mockReset().mockReturnValue({});
    setModel.mockReset();
  });

  it('clears the live session model when availability drops to zero', async () => {
    const runtimeState = { model: createModel('openai', 'gpt-5.4-mini') };
    const session = {
      model: runtimeState.model,
      agent: { state: runtimeState },
      setModel,
      modelRuntime: {
        getModel: findModel.mockReturnValue(undefined),
        getAvailable: getAvailable.mockResolvedValue([]),
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
    expect(runtimeState.model).toBeUndefined();
    expect(setModel).not.toHaveBeenCalled();
  });

  it('does nothing when the session is already model-less and nothing is available', async () => {
    const session = {
      model: undefined,
      agent: { state: { model: undefined } },
      setModel,
      modelRuntime: {
        getModel: findModel.mockReturnValue(undefined),
        getAvailable: getAvailable.mockResolvedValue([]),
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
    expect(setModel).not.toHaveBeenCalled();
  });
});
