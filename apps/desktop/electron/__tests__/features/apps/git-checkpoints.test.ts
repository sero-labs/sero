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
  const commands = new Map<string, { handler: (args?: string) => Promise<void> | void }>();

  const pi = {
    on: vi.fn((event: string, handler: RegisteredHandler['handler']) => {
      handlers.push({ event, handler });
    }),
    appendEntry: vi.fn(),
    registerCommand: vi.fn((name: string, command: { handler: (args?: string) => Promise<void> | void }) => {
      commands.set(name, command);
    }),
    sendMessage: vi.fn(),
    events: {
      on: vi.fn(),
    },
  } as unknown as ExtensionAPI;

  async function emit(event: string, payload: unknown, ctx?: unknown): Promise<void> {
    for (const registration of handlers.filter((entry) => entry.event === event)) {
      await registration.handler(payload, ctx);
    }
  }

  async function runCommand(name: string, args?: string): Promise<void> {
    const command = commands.get(name);
    if (!command) {
      throw new Error(`Command not registered: ${name}`);
    }
    await command.handler(args);
  }

  return { pi, emit, runCommand };
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
    mocks.listCheckpoints.mockResolvedValue([]);
    mocks.restoreCheckpoint.mockResolvedValue(undefined);
    mocks.diff.mockResolvedValue('diff --git a/file.txt b/file.txt');
  });

  it('summarizes the latest assistant text block when auto-checkpointing a mutating run', async () => {
    const { registerGitCheckpointFeatures } = await import('@electron/features/apps/extensions/git-checkpoints');
    const { pi, emit } = createPiStub();

    registerGitCheckpointFeatures(pi, 'ws-1');

    await emit('tool_call', { toolName: 'write', input: {} });
    await emit(
      'agent_end',
      {
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
      },
      {
        sessionManager: {
          getBranch: () => [
            {
              id: 'user-entry-1',
              type: 'message',
              message: { role: 'user', content: 'Do the thing' },
            },
          ],
        },
      },
    );

    expect(mocks.createCheckpoint).toHaveBeenCalledWith('ws-1', {
      source: 'turn',
      description: 'checkpoint: Summarized result',
    });
    expect(pi.appendEntry).toHaveBeenCalledWith('turn-undo', expect.objectContaining({
      workspaceId: 'ws-1',
      snapshotId: 'abc123',
      targetUserEntryId: 'user-entry-1',
      label: 'checkpoint: Summarized result',
    }));
  });

  it('falls back to the generic checkpoint description for malformed assistant content', async () => {
    const { registerGitCheckpointFeatures } = await import('@electron/features/apps/extensions/git-checkpoints');
    const { pi, emit } = createPiStub();

    registerGitCheckpointFeatures(pi, 'ws-1');

    await emit('tool_call', { toolName: 'edit', input: {} });
    await emit(
      'agent_end',
      {
        messages: [
          { role: 'assistant', content: 'not-an-array' },
          { role: 'assistant', content: [{ type: 'image', url: 'only-image' }] },
        ],
      },
      {
        sessionManager: {
          getBranch: () => [],
        },
      },
    );

    expect(mocks.createCheckpoint).toHaveBeenCalledWith('ws-1', {
      source: 'turn',
      description: 'checkpoint: turn',
    });
  });

  it('keeps /checkpoint behavior unchanged for manual checkpoints', async () => {
    const { registerGitCheckpointFeatures } = await import('@electron/features/apps/extensions/git-checkpoints');
    const { pi, runCommand } = createPiStub();
    mocks.createCheckpoint.mockResolvedValue({
      changeId: 'man123',
      description: 'checkpoint: manual save',
      source: 'manual',
    });

    registerGitCheckpointFeatures(pi, 'ws-1');
    await runCommand('checkpoint', 'manual save');

    expect(mocks.createCheckpoint).toHaveBeenCalledWith('ws-1', {
      source: 'manual',
      description: 'manual save',
    });
    expect(pi.appendEntry).toHaveBeenCalledWith('git-checkpoint', expect.objectContaining({
      workspaceId: 'ws-1',
      changeId: 'man123',
      source: 'manual',
    }));
    expect(pi.sendMessage).toHaveBeenCalledWith({
      customType: 'git-checkpoint',
      content: 'Checkpoint created: **man123**',
      display: true,
      details: {
        changeId: 'man123',
        description: 'checkpoint: manual save',
        source: 'manual',
      },
    });
  });

  it('keeps /checkpoints behavior unchanged for listing recent checkpoints', async () => {
    const { registerGitCheckpointFeatures } = await import('@electron/features/apps/extensions/git-checkpoints');
    const { pi, runCommand } = createPiStub();
    mocks.listCheckpoints.mockResolvedValue([
      { changeId: 'a1', description: 'checkpoint: manual one', source: 'manual' },
      { changeId: 'b2', description: 'checkpoint: turn two', source: 'turn' },
    ]);

    registerGitCheckpointFeatures(pi, 'ws-1');
    await runCommand('checkpoints', '2');

    expect(mocks.listCheckpoints).toHaveBeenCalledWith('ws-1', 2);
    expect(pi.sendMessage).toHaveBeenCalledWith({
      customType: 'git-checkpoint',
      content: '**Recent checkpoints (2)**\n- `a1` checkpoint: manual one\n- `b2` checkpoint: turn two',
      display: true,
    });
  });

  it('keeps /restore behavior unchanged for manual restores', async () => {
    const { registerGitCheckpointFeatures } = await import('@electron/features/apps/extensions/git-checkpoints');
    const { pi, runCommand } = createPiStub();

    registerGitCheckpointFeatures(pi, 'ws-1');
    await runCommand('restore', 'abc123');

    expect(mocks.restoreCheckpoint).toHaveBeenCalledWith('ws-1', 'abc123');
    expect(pi.appendEntry).toHaveBeenCalledWith('git-workspace-link', expect.objectContaining({
      workspaceId: 'ws-1',
      changeId: 'abc123',
    }));
    expect(pi.sendMessage).toHaveBeenCalledWith({
      customType: 'git-checkpoint',
      content: 'Workspace restored to **abc123**.',
      display: true,
    });
  });

  it('keeps /diffcp behavior unchanged for checkpoint diffs', async () => {
    const { registerGitCheckpointFeatures } = await import('@electron/features/apps/extensions/git-checkpoints');
    const { pi, runCommand } = createPiStub();

    registerGitCheckpointFeatures(pi, 'ws-1');
    await runCommand('diffcp', 'from123 to456');

    expect(mocks.diff).toHaveBeenCalledWith('ws-1', 'from123', 'to456');
    expect(pi.sendMessage).toHaveBeenCalledWith({
      customType: 'git-checkpoint-diff',
      content: 'diff --git a/file.txt b/file.txt',
      display: true,
      details: { from: 'from123', to: 'to456' },
    });
  });
});
