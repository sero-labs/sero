/**
 * The two guards that stand between the phone and a broken session:
 * a model the account has no credentials for, and a thinking level the
 * host does not know. Both must be refused before anything is applied.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  applySessionModel,
  applySessionThinkingLevel,
} from '@electron/ipc/gateway/model-ops';
import type { AgentSession } from '@earendil-works/pi-coding-agent';

interface FakeModel {
  provider: string;
  id: string;
}

/**
 * A session with just the surface the model operations touch.
 *
 * `registry` is every model the runtime knows; `available` is the subset
 * that has credentials. Real accounts have models in the first and not
 * the second, which is the case the credentials guard exists for.
 */
function fakeSession(options: {
  registry: FakeModel[];
  available: FakeModel[];
}) {
  const setModel = vi.fn().mockResolvedValue(undefined);
  const setThinkingLevel = vi.fn();

  const session = {
    modelRuntime: {
      getModel: (provider: string, modelId: string) =>
        options.registry.find(
          (model) => model.provider === provider && model.id === modelId,
        ) ?? null,
      getAvailable: async () => options.available,
    },
    setModel,
    setThinkingLevel,
  };

  return { session: session as unknown as AgentSession, setModel, setThinkingLevel };
}

describe('applySessionModel', () => {
  it('switches to a model that exists and has credentials', async () => {
    const gpt5 = { provider: 'openai', id: 'gpt-5' };
    const { session, setModel } = fakeSession({ registry: [gpt5], available: [gpt5] });

    await applySessionModel(session, 'openai', 'gpt-5');

    expect(setModel).toHaveBeenCalledWith(gpt5);
  });

  it('refuses a model the runtime does not know', async () => {
    const { session, setModel } = fakeSession({ registry: [], available: [] });

    await expect(applySessionModel(session, 'openai', 'gpt-9')).rejects.toThrow(
      'Model not found: openai/gpt-9',
    );
    expect(setModel).not.toHaveBeenCalled();
  });

  it('refuses a known model that has no credentials', async () => {
    const opus = { provider: 'anthropic', id: 'claude-opus-5' };
    const { session, setModel } = fakeSession({ registry: [opus], available: [] });

    // Without this guard the switch succeeds and the next prompt fails.
    await expect(
      applySessionModel(session, 'anthropic', 'claude-opus-5'),
    ).rejects.toThrow('No credentials for anthropic/claude-opus-5');
    expect(setModel).not.toHaveBeenCalled();
  });

  it('refuses an empty provider', async () => {
    const { session, setModel } = fakeSession({ registry: [], available: [] });

    await expect(applySessionModel(session, '   ', 'gpt-5')).rejects.toThrow();
    expect(setModel).not.toHaveBeenCalled();
  });
});

describe('applySessionThinkingLevel', () => {
  it('sets a level the host knows', () => {
    const { session, setThinkingLevel } = fakeSession({ registry: [], available: [] });

    applySessionThinkingLevel(session, 'high');

    expect(setThinkingLevel).toHaveBeenCalledWith('high');
  });

  it('refuses a level the host does not know', () => {
    const { session, setThinkingLevel } = fakeSession({ registry: [], available: [] });

    expect(() => applySessionThinkingLevel(session, 'turbo')).toThrow(
      /Invalid thinking level/,
    );
    expect(setThinkingLevel).not.toHaveBeenCalled();
  });
});
