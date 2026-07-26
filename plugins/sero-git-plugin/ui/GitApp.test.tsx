// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommitNode, GitAppState, GitManagerRequest } from '../shared/types';
import { DEFAULT_GIT_STATE } from '../shared/types';
import { GitApp } from './GitApp';

const COMMIT: CommitNode = {
  hash: 'abc123456789',
  shortHash: 'abc1234',
  parents: [],
  authorName: 'Sero Dev',
  authorEmail: 'dev@example.com',
  authorDate: '2026-04-14T12:00:00.000Z',
  subject: 'Move the commit detail into the column',
  refs: [],
};

const runGitActionMock = vi.fn();
const useAppInfoMock = vi.fn();
const useAppStateMock = vi.fn();
const commitGraphRenderMock = vi.fn();

vi.mock('@sero-ai/app-runtime', () => ({
  useAppInfo: () => useAppInfoMock(),
  useAppState: (initialState: GitAppState) => useAppStateMock(initialState),
  useTheme: () => ({ mode: 'dark', presetId: 'default', editorThemeId: 'auto' }),
}));

// Only the write path is stubbed — the rest of the bridge (the GitHub sign-in
// the header reads, for one) stays real.
vi.mock('./store/sero-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store/sero-bridge')>()),
  runGitAction: (workspaceId: string, params: GitManagerRequest) =>
    runGitActionMock(workspaceId, params),
}));

vi.mock('./components/Header', () => ({
  Header: ({ onAction }: { onAction: (action: GitManagerRequest) => void }) => (
    <button type="button" onClick={() => onAction({ action: 'fetch' })}>Trigger fetch</button>
  ),
}));

vi.mock('./components/BranchPanel', () => ({ BranchPanel: () => null }));
vi.mock('./components/app/WorkingTree', () => ({ WorkingTree: () => <div>working tree</div> }));
vi.mock('./components/CommitDetail', () => ({
  CommitDetail: ({ commit, onClose }: { commit: CommitNode; onClose: () => void }) => (
    <div>
      commit {commit.subject}
      <button type="button" onClick={onClose}>Working tree</button>
    </div>
  ),
}));
vi.mock('./components/CommitGraph', () => ({
  CommitGraph: ({ onSelectCommit }: { onSelectCommit: (commit: CommitNode) => void }) => {
    commitGraphRenderMock();
    return (
      <button type="button" onClick={() => onSelectCommit(COMMIT)}>Pick a commit</button>
    );
  },
}));
vi.mock('./components/diff/DiffPane', () => ({ DiffPane: () => null }));
vi.mock('./styles', () => ({ GIT_STYLES: '' }));

function clickButton(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => {
    const text = candidate.textContent?.trim() || candidate.getAttribute('aria-label') || '';
    return text.includes(label);
  });
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('GitApp', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const state: GitAppState = {
      ...DEFAULT_GIT_STATE,
      repoPath: '/workspace/repo',
      repoName: 'repo',
      currentBranch: 'main',
      lastRefresh: '2026-04-14T12:00:00.000Z',
    };

    useAppInfoMock.mockReturnValue({ workspaceId: 'ws-1', workspacePath: '/workspace/repo' });
    useAppStateMock.mockReturnValue([state, vi.fn()]);
    commitGraphRenderMock.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
      root?.unmount();
    });
    container.remove();
    root = null;
    runGitActionMock.mockReset();
    useAppInfoMock.mockReset();
    useAppStateMock.mockReset();
    vi.useRealTimers();
  });

  it('surfaces host action failures with action-specific copy', async () => {
    vi.useFakeTimers();
    runGitActionMock.mockResolvedValue({ ok: false, message: 'Remote rejected fetch' });

    await act(async () => {
      root?.render(<GitApp />);
    });
    expect(commitGraphRenderMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      clickButton(container, 'Trigger fetch');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runGitActionMock).toHaveBeenCalledWith('ws-1', { action: 'fetch' });
    expect(container.textContent).toContain('Could not fetch remotes');
    expect(container.textContent).toContain('Remote rejected fetch');
    // The notice is app chrome: showing it must not redraw the graph.
    expect(commitGraphRenderMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      clickButton(container, 'Dismiss git action notice');
    });
  });

  /**
   * The commit you picked out of the history takes the middle column, in place
   * of the working tree. It used to be a band across the foot of the app, which
   * squeezed everything above it and could not grow with the commit.
   */
  it('shows the picked commit in place of the working tree, and gives it back', async () => {
    vi.useFakeTimers();
    runGitActionMock.mockResolvedValue({ ok: true });

    await act(async () => {
      root?.render(<GitApp />);
    });
    expect(container.textContent).toContain('working tree');

    await act(async () => {
      clickButton(container, 'Pick a commit');
    });

    expect(container.textContent).toContain('Move the commit detail into the column');
    expect(container.textContent).not.toContain('working tree');

    await act(async () => {
      clickButton(container, 'Working tree');
    });

    expect(container.textContent).toContain('working tree');
    expect(container.textContent).not.toContain('Move the commit detail into the column');
  });
});
