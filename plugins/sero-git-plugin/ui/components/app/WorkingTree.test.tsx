// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileChange, GitManagerRequest } from '../../../shared/types';
import { createDefaultGitState } from '../../../shared/types';
import { deriveRepoMode } from '../../lib/repo-mode';
import { WorkingTree } from './WorkingTree';

const CHANGES: FileChange[] = [
  { path: 'src/edited.ts', status: 'modified', staged: false },
  { path: 'src/ready.ts', status: 'modified', staged: true },
];

const MERGE_CHANGES: FileChange[] = [
  { path: 'src/parse.ts', status: 'conflict', staged: false },
  { path: 'CHANGELOG.md', status: 'modified', staged: true },
  { path: 'README.md', status: 'modified', staged: true },
];

const NORMAL = deriveRepoMode({
  ...createDefaultGitState(),
  headHash: 'abc1234',
  commitCount: 3,
  fileChanges: CHANGES,
});

const MERGING = deriveRepoMode({
  ...createDefaultGitState(),
  headHash: 'abc1234',
  commitCount: 3,
  fileChanges: MERGE_CHANGES,
  merge: { fromRef: 'feat/changelog', message: 'Merge branch', conflictPaths: ['src/parse.ts', 'CHANGELOG.md'] },
});

function click(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.getAttribute('aria-label') === label);
  if (!button) throw new Error(`No button labelled ${label}`);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('WorkingTree', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let onAction: ReturnType<typeof vi.fn>;

  async function render(overrides: Partial<Parameters<typeof WorkingTree>[0]> = {}) {
    await act(async () => {
      root?.render(
        <WorkingTree
          workspaceId="ws-test"
          fileChanges={CHANGES}
          onAction={onAction as unknown as (action: GitManagerRequest) => void}
          onSelectFile={vi.fn()}
          onOpenInEditor={vi.fn()}
          selectedFile={null}
          info={NORMAL}
          {...overrides}
        />,
      );
    });
  }

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onAction = vi.fn();
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    container.remove();
    root = null;
  });

  it('asks before discarding, because discarding cannot be undone', async () => {
    await render();

    await act(async () => { click(container, 'Discard changes in src/edited.ts'); });
    expect(onAction).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Discard?');

    await act(async () => { click(container, 'Discard changes in src/edited.ts'); });
    expect(onAction).toHaveBeenCalledWith({ action: 'discard', file: 'src/edited.ts' });
  });

  it('never offers discard for a staged file', async () => {
    await render();
    const labels = Array.from(container.querySelectorAll('button'))
      .map((button) => button.getAttribute('aria-label'));
    expect(labels).toContain('Unstage src/ready.ts');
    expect(labels).not.toContain('Discard changes in src/ready.ts');
  });

  it('blocks committing while conflicts remain, and says why', async () => {
    await render({ fileChanges: MERGE_CHANGES, info: MERGING });

    const commit = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Conclude merge'));
    expect(commit?.disabled).toBe(true);
    expect(container.textContent).toContain('1 conflict left to resolve');
  });

  // The list is the to-do list: what conflicts, what you fixed, what merged
  // itself — and a file git already forgot conflicted stays under Resolved.
  it('groups the working tree by what the merge needs from you', async () => {
    await render({ fileChanges: MERGE_CHANGES, info: MERGING });

    expect(container.textContent).toContain('Conflicts');
    expect(container.textContent).toContain('Resolved');
    expect(container.textContent).toContain('Merged cleanly');
    expect(container.textContent).not.toContain('Staged');
  });
});
