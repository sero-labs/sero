import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { KanbanState } from '../../shared/types';
import type { KanbanSessionRuntime } from '../session-runtime';

const writeState = vi.fn();

vi.mock('../state-io', () => ({
  writeState,
}));

function makeState(): KanbanState {
  return {
    cards: [],
    nextId: 1,
    settings: {
      autoAdvance: true,
      reviewMode: 'full',
      testingEnabled: true,
      yoloMode: false,
      yoloAutoMergePrs: false,
    },
  };
}

describe('workflow actions', () => {
  beforeEach(() => {
    writeState.mockReset();
  });

  it('queues the brainstorm prompt template as a follow-up', async () => {
    const { handleBrainstorm } = await import('../workflow-actions');
    const runtime: KanbanSessionRuntime = {
      sendUserMessage: vi.fn(),
      sendMessage: vi.fn(),
    };

    const result = await handleBrainstorm(runtime);

    expect(runtime.sendUserMessage).toHaveBeenCalledWith('/brainstorm', { deliverAs: 'followUp' });
    expect(result.content[0]?.text).toBe('Queued the /brainstorm workflow in the chat session.');
  });

  it('shows only the runtime-backed board settings', async () => {
    const { handleSettings } = await import('../workflow-actions');
    const result = await handleSettings('/tmp/state.json', makeState());
    const text = result.content[0]?.text ?? '';

    expect(text).toContain('yoloMode: false');
    expect(text).toContain('testingEnabled: true');
    expect(text).toContain('reviewMode: full');
    expect(text).toContain('autoAdvance: true');
    expect(text).not.toContain('reviewLevel');
    expect(text).not.toContain('maxConcurrentCards');
  });

  it('rejects removed settings names with the updated allowlist', async () => {
    const { handleSettings } = await import('../workflow-actions');
    const result = await handleSettings('/tmp/state.json', makeState(), 'reviewLevel', 'per-wave');

    expect(result.content[0]?.text).toBe('Unknown setting "reviewLevel". Available: yoloMode, testingEnabled, reviewMode');
    expect(writeState).not.toHaveBeenCalled();
  });
});
