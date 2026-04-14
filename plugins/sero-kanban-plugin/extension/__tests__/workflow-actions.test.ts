import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { KanbanState } from '../../shared/types';
import type { KanbanSessionRuntime } from '../session-runtime';

const writeState = vi.fn();
const appendError = vi.fn();
const removeWorktree = vi.fn();

vi.mock('../state-io', () => ({
  writeState,
}));

vi.mock('../error-log', async () => {
  const actual = await vi.importActual<typeof import('../error-log')>('../error-log');
  return {
    ...actual,
    appendError,
  };
});

vi.mock('../worktree-cleanup', () => ({
  removeWorktree,
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
    appendError.mockReset();
    removeWorktree.mockReset();
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
    expect(text).toContain('yoloAutoMergePrs: false');
    expect(text).toContain('testingEnabled: true');
    expect(text).toContain('reviewMode: full');
    expect(text).toContain('autoAdvance: true');
    expect(text).not.toContain('reviewLevel');
    expect(text).not.toContain('maxConcurrentCards');
  });

  it('rejects removed settings names with the updated allowlist', async () => {
    const { handleSettings } = await import('../workflow-actions');
    const result = await handleSettings('/tmp/state.json', makeState(), 'reviewLevel', 'per-wave');

    expect(result.content[0]?.text).toBe('Unknown setting "reviewLevel". Available: yoloMode, yoloAutoMergePrs, testingEnabled, reviewMode');
    expect(writeState).not.toHaveBeenCalled();
  });

  it('rejects auto-merge outside YOLO mode', async () => {
    const { handleSettings } = await import('../workflow-actions');
    const state = makeState();

    const result = await handleSettings('/tmp/state.json', state, 'yoloAutoMergePrs', 'true');

    expect(result.content[0]?.text).toBe('PR auto-merge is only available when YOLO mode is enabled.');
    expect(writeState).not.toHaveBeenCalled();
  });

  it('surfaces cleanup warnings while still clearing done-card worktrees', async () => {
    const { handleCleanup } = await import('../workflow-actions');
    const state = makeState();
    state.cards = [{
      id: '1',
      title: 'Done card',
      description: 'done',
      acceptance: ['done'],
      priority: 'medium',
      column: 'done',
      status: 'idle',
      subtasks: [],
      worktreePath: '/tmp/worktree-1',
      createdAt: '2026-04-14T10:00:00.000Z',
      updatedAt: '2026-04-14T10:00:00.000Z',
    }];
    removeWorktree.mockResolvedValue(['git worktree prune failed: locked worktree']);

    const result = await handleCleanup('/tmp/state.json', state, '/workspace');
    const text = result.content[0]?.text ?? '';

    expect(text).toContain('Cleaned up 1 worktree');
    expect(text).toContain('Cleanup warnings');
    expect(text).toContain('git worktree prune failed');
    expect(state.cards[0]?.worktreePath).toBeUndefined();
    expect(appendError).toHaveBeenCalledWith('/tmp/state.json', expect.objectContaining({
      cardId: '1',
      agentName: 'system',
      severity: 'warning',
      message: 'git worktree prune failed: locked worktree',
    }));
  });
});
