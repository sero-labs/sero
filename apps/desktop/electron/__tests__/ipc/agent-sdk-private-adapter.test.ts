import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBaseSystemPrompt,
  rewriteSessionManagerFile,
  setBaseSystemPrompt,
  setRuntimeSessionModel,
} from '@electron/ipc/agent/core/sdk-private-adapter';

describe('agent SDK private adapter', () => {
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    consoleWarn.mockClear();
  });

  it('reads and writes the cached base system prompt while updating the live agent prompt', () => {
    const setSystemPrompt = vi.fn();
    const session = {
      _baseSystemPrompt: 'Original prompt',
      agent: { setSystemPrompt },
      sessionManager: {},
    } as never;

    expect(getBaseSystemPrompt(session)).toBe('Original prompt');

    setBaseSystemPrompt(session, 'Updated prompt');

    expect(getBaseSystemPrompt(session)).toBe('Updated prompt');
    expect(setSystemPrompt).toHaveBeenCalledWith('Updated prompt');
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('invokes the private session-manager rewrite hook when present', () => {
    const rewriteFile = vi.fn();
    const session = {
      agent: { setSystemPrompt: vi.fn() },
      sessionManager: { _rewriteFile: rewriteFile },
    } as never;

    rewriteSessionManagerFile(session);

    expect(rewriteFile).toHaveBeenCalledTimes(1);
  });

  it('updates the runtime model object through the narrow private adapter', () => {
    const setModel = vi.fn();
    const session = {
      agent: { setModel },
      sessionManager: {},
    } as never;
    const model = { provider: 'openai', id: 'gpt-5.4' } as never;

    setRuntimeSessionModel(session, model);
    expect(setModel).toHaveBeenCalledWith(model);

    setRuntimeSessionModel(session, undefined);
    expect(setModel).toHaveBeenLastCalledWith(undefined);
  });
});
