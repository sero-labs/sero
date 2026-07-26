// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommitNode, FileDiff, GitManagerRequest } from '../../shared/types';
import { CommitDetail } from './CommitDetail';

function clickButton(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

const commit: CommitNode = {
  hash: 'abc123456789',
  shortHash: 'abc1234',
  parents: ['parent'],
  authorName: 'Sero Dev',
  authorEmail: 'dev@example.com',
  authorDate: '2026-04-14T12:00:00.000Z',
  subject: 'Split Git UI components',
  refs: [],
};

const diffs: FileDiff[] = [
  {
    path: 'src/app.ts',
    status: 'modified',
    hunks: [],
    binary: false,
    additions: 3,
    deletions: 1,
  },
];

describe('CommitDetail', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const onAction = vi.fn<(action: GitManagerRequest) => void>();

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onAction.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
  });

  it('requires explicit confirmation before auto-stash cherry-pick on a dirty working tree', async () => {
    await act(async () => {
      root?.render(
        <CommitDetail
          commit={commit}
          diffs={diffs}
          loading={false}
          hasWorkingTreeChanges
          onSelectFile={() => undefined}
          onClose={() => undefined}
          onAction={onAction}
        />,
      );
    });

    await act(async () => {
      clickButton(container, 'Cherry-pick');
    });

    expect(container.textContent).toContain('You have uncommitted changes');
    expect(onAction).not.toHaveBeenCalled();

    await act(async () => {
      clickButton(container, 'Auto-stash + cherry-pick');
    });

    expect(onAction).toHaveBeenCalledWith({ action: 'cherry_pick', hash: commit.hash, all: true });
  });

  it('dispatches a plain cherry-pick when the working tree is clean', async () => {
    await act(async () => {
      root?.render(
        <CommitDetail
          commit={commit}
          diffs={diffs}
          loading={false}
          hasWorkingTreeChanges={false}
          onSelectFile={() => undefined}
          onClose={() => undefined}
          onAction={onAction}
        />,
      );
    });

    await act(async () => {
      clickButton(container, 'Cherry-pick');
    });

    expect(onAction).toHaveBeenCalledWith({ action: 'cherry_pick', hash: commit.hash });
  });
});
