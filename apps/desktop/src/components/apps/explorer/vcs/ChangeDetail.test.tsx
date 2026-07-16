// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEntry } from '@sero-ai/common';
import { ChangeDetail } from './ChangeDetail';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const vcsStoreMocks = vi.hoisted(() => {
  const store = {
    byWorkspace: { 'ws-1': { activePushBookmark: null } },
    describe: vi.fn(async () => {}),
    push: vi.fn(async () => ({ success: true, message: 'ok' })),
    moveBookmark: vi.fn(async () => {}),
    createBookmark: vi.fn(async () => {}),
    restoreCheckpoint: vi.fn(async () => {}),
    abandon: vi.fn(async () => {}),
  };

  return {
    store,
    getState: vi.fn(() => ({ byWorkspace: {} })),
    useWorkspaceVcs: vi.fn(() => ({ activePushBookmark: null })),
  };
});

vi.mock('@/stores/vcs', () => ({
  useVcsStore: Object.assign(vi.fn((selector: (store: typeof vcsStoreMocks.store) => unknown) => (
    selector(vcsStoreMocks.store)
  )), {
    getState: vcsStoreMocks.getState,
  }),
  useWorkspaceVcs: vcsStoreMocks.useWorkspaceVcs,
}));

describe('ChangeDetail', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  const fileDiffSummary = vi.fn(async () => {
    throw new Error('boom');
  });

  const entry: ChangeEntry = {
    changeId: 'change-1',
    commitId: '1234567890abcdef',
    author: 'Sero',
    email: 'sero@example.com',
    timestamp: '2026-04-14T00:00:00.000Z',
    description: 'Test change',
    empty: false,
    conflict: false,
    immutable: false,
    isWorkingCopy: false,
    bookmarks: [],
    tags: [],
  };

  beforeEach(() => {
    fileDiffSummary.mockClear();
    fileDiffSummary.mockRejectedValue(new Error('boom'));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: {
        vcs: {
          fileDiffSummary,
        },
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    warnSpy.mockRestore();
    Reflect.deleteProperty(window, 'sero');
  });

  it('surfaces file-summary load failures instead of silently swallowing them', async () => {
    await act(async () => {
      root?.render(<ChangeDetail workspaceId="ws-1" entry={entry} />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Failed to load changed files: boom');
    });
    expect(container.textContent).toContain('Restore checkpoint');
    expect(fileDiffSummary).toHaveBeenCalledWith('ws-1', 'change-1');
    expect(warnSpy).toHaveBeenCalledWith(
      '[vcs-change-detail] Failed to load changed files:',
      expect.any(Error),
    );
  });
});
