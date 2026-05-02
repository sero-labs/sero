import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createInternalSnapshot: vi.fn(),
  getCurrentChangeId: vi.fn(),
  hasSnapshotDiff: vi.fn(),
  hasWorkingCopyChanges: vi.fn(),
  invalidateWorkspace: vi.fn(),
  hasMutatingGit: vi.fn(() => false),
  isLikelyReadOnlyBash: vi.fn(() => false),
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  vcsManager: {
    createInternalSnapshot: mocks.createInternalSnapshot,
    getCurrentChangeId: mocks.getCurrentChangeId,
    hasSnapshotDiff: mocks.hasSnapshotDiff,
    hasWorkingCopyChanges: mocks.hasWorkingCopyChanges,
  },
}));

vi.mock('@electron/features/apps/git-app/manager', () => ({
  gitWorkspaceStateManager: {
    invalidateWorkspace: mocks.invalidateWorkspace,
  },
}));

vi.mock('@electron/platform/security/git-command-filter', () => ({
  hasMutatingGit: mocks.hasMutatingGit,
  isLikelyReadOnlyBash: mocks.isLikelyReadOnlyBash,
}));

describe('registerGitTurnUndoCapture', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createInternalSnapshot.mockReset();
    mocks.createInternalSnapshot.mockResolvedValue('snap-1');
    mocks.getCurrentChangeId.mockReset();
    mocks.getCurrentChangeId.mockResolvedValue('cp-1');
    mocks.hasSnapshotDiff.mockReset();
    mocks.hasSnapshotDiff.mockResolvedValue(true);
    mocks.hasWorkingCopyChanges.mockReset();
    mocks.hasWorkingCopyChanges.mockResolvedValue(false);
    mocks.invalidateWorkspace.mockClear();
    mocks.hasMutatingGit.mockClear();
    mocks.isLikelyReadOnlyBash.mockClear();
  });

  it('invalidates Git refresh after recording a mutating turn undo snapshot', async () => {
    const handlers = new Map<string, Function>();
    const pi = {
      on: vi.fn((event: string, handler: Function) => {
        handlers.set(event, handler);
      }),
    };
    const entries = {
      appendWorkspaceLink: vi.fn(),
      appendTurnUndoEntry: vi.fn(),
    };

    const { registerGitTurnUndoCapture } = await import('@electron/features/apps/extensions/git-turn-undo-capture');

    registerGitTurnUndoCapture(pi as never, 'ws-1', entries as never);

    await handlers.get('agent_start')?.();
    await handlers.get('tool_call')?.({ toolCallId: 'tool-write-1', toolName: 'write', input: { path: 'story.txt' } });
    await handlers.get('tool_execution_end')?.({ toolCallId: 'tool-write-1', toolName: 'write', isError: false });
    await handlers.get('agent_end')?.(
      {
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Saved to: story.txt' }],
          },
        ],
      },
      {
        sessionManager: {
          getBranch: () => [
            {
              id: 'user-entry-1',
              type: 'message',
              message: { role: 'user', content: 'save that to file story.txt' },
            },
          ],
        },
      },
    );

    expect(mocks.createInternalSnapshot).toHaveBeenCalledWith('ws-1');
    expect(mocks.hasSnapshotDiff).toHaveBeenCalledWith('ws-1', 'snap-1');
    expect(entries.appendTurnUndoEntry).toHaveBeenCalledWith({
      snapshotId: 'snap-1',
      targetUserEntryId: 'user-entry-1',
      label: 'Update story.txt',
    });
    expect(mocks.invalidateWorkspace).toHaveBeenCalledWith('ws-1', 'agent:mutating-turn');
  });
});
