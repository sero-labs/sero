import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCheckpoint: vi.fn(),
  getCurrentChangeId: vi.fn(),
  hasWorkingCopyChanges: vi.fn(),
  listCheckpoints: vi.fn(),
  restoreCheckpoint: vi.fn(),
  diff: vi.fn(),
  hasMutatingGit: vi.fn(() => false),
  isLikelyReadOnlyBash: vi.fn(() => true),
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  vcsManager: {
    createCheckpoint: mocks.createCheckpoint,
    getCurrentChangeId: mocks.getCurrentChangeId,
    hasWorkingCopyChanges: mocks.hasWorkingCopyChanges,
    listCheckpoints: mocks.listCheckpoints,
    restoreCheckpoint: mocks.restoreCheckpoint,
    diff: mocks.diff,
  },
}));

vi.mock('@electron/platform/security/git-command-filter', () => ({
  hasMutatingGit: mocks.hasMutatingGit,
  isLikelyReadOnlyBash: mocks.isLikelyReadOnlyBash,
}));

interface RegisteredHandler {
  event: string;
  handler: (event: unknown, ctx?: unknown) => unknown;
}

function createPiStub() {
  const handlers: RegisteredHandler[] = [];

  const pi = {
    on: vi.fn((event: string, handler: RegisteredHandler['handler']) => {
      handlers.push({ event, handler });
    }),
    appendEntry: vi.fn(),
    registerCommand: vi.fn(),
    sendMessage: vi.fn(),
    events: {
      on: vi.fn(),
    },
  } as unknown as ExtensionAPI;

  async function emit(event: string, payload: unknown): Promise<void> {
    for (const registration of handlers.filter((entry) => entry.event === event)) {
      await registration.handler(payload);
    }
  }

  return { pi, emit };
}

describe('registerGitCheckpointFeatures', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createCheckpoint.mockResolvedValue({
      changeId: 'abc123',
      description: 'checkpoint: Summarized result',
      source: 'turn',
    });
  });

  it('summarizes the latest assistant text block when auto-checkpointing a mutating run', async () => {
    const { registerGitCheckpointFeatures } = await import('@electron/features/apps/extensions/git-checkpoints');
    const { pi, emit } = createPiStub();

    registerGitCheckpointFeatures(pi, 'ws-1');

    await emit('tool_call', { toolName: 'write', input: {} });
    await emit('agent_end', {
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Do the thing' }] },
        { role: 'assistant', content: [{ type: 'image', url: 'ignored' }] },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Summarized result\nMore detail follows.' },
            { type: 'image', url: 'ignored' },
          ],
        },
      ],
    });

    expect(mocks.createCheckpoint).toHaveBeenCalledWith('ws-1', {
      source: 'turn',
      description: 'checkpoint: Summarized result',
    });
    expect(pi.appendEntry).toHaveBeenCalledWith('git-checkpoint', expect.objectContaining({
      workspaceId: 'ws-1',
      changeId: 'abc123',
    }));
  });

  it('falls back to the generic checkpoint description for malformed assistant content', async () => {
    const { registerGitCheckpointFeatures } = await import('@electron/features/apps/extensions/git-checkpoints');
    const { pi, emit } = createPiStub();

    registerGitCheckpointFeatures(pi, 'ws-1');

    await emit('tool_call', { toolName: 'edit', input: {} });
    await emit('agent_end', {
      messages: [
        { role: 'assistant', content: 'not-an-array' },
        { role: 'assistant', content: [{ type: 'image', url: 'only-image' }] },
      ],
    });

    expect(mocks.createCheckpoint).toHaveBeenCalledWith('ws-1', {
      source: 'turn',
      description: 'checkpoint: turn',
    });
  });
});
