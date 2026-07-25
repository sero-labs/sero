// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitAppState, GitManagerRequest } from '../../shared/types';
import { DEFAULT_GIT_STATE } from '../../shared/types';
import { deriveRepoMode } from '../lib/repo-mode';
import { Header } from './Header';

const GITHUB = { ready: true, authenticated: false, signIn: () => {} };
const NORMAL_MODE = deriveRepoMode({
  ...DEFAULT_GIT_STATE,
  headHash: 'abc1234',
  commitCount: 2,
});

function createState(overrides: Partial<GitAppState> = {}): GitAppState {
  return {
    ...DEFAULT_GIT_STATE,
    repoName: 'repo',
    currentBranch: 'main',
    lastRefresh: '2026-04-17T12:00:00.000Z',
    ...overrides,
  };
}

describe('Header sync status', () => {
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

  // This used to assert the opposite — that watching showed "Live". Rule 28
  // rules out a status label for a state with no action, and names this one.
  it('says nothing while file watching is active', async () => {
    await act(async () => {
      root?.render(<Header state={createState({ syncMode: 'watch' })} onAction={onAction} github={GITHUB} onOpenPullRequest={() => {}} info={NORMAL_MODE} />);
    });

    expect(container.textContent).not.toContain('Live');
    expect(container.textContent).not.toContain('Polling');
  });

  // The case the change must not take with it: manual mode means the view will
  // not update itself, which is something you act on.
  it('shows Manual when the app is running without live watchers', async () => {
    await act(async () => {
      root?.render(<Header state={createState({ syncMode: 'manual' })} onAction={onAction} github={GITHUB} onOpenPullRequest={() => {}} info={NORMAL_MODE} />);
    });

    expect(container.textContent).toContain('Manual');
    expect(container.textContent).not.toContain('Polling');
  });

  it('still surfaces a repository-level failure', async () => {
    await act(async () => {
      root?.render(<Header state={createState({ syncMode: 'watch', error: 'fatal: not a git repository' })} onAction={onAction} github={GITHUB} onOpenPullRequest={() => {}} info={NORMAL_MODE} />);
    });

    expect(container.textContent).toContain('Issue');
  });

  // Progress belongs in the control that started it (rules 21 and 23), not in a
  // label of its own appearing and disappearing beside it.
  it('does not announce loading in the sync slot', async () => {
    await act(async () => {
      root?.render(<Header state={createState({ syncMode: 'watch', loading: true })} onAction={onAction} github={GITHUB} onOpenPullRequest={() => {}} info={NORMAL_MODE} />);
    });

    expect(container.textContent).not.toContain('Syncing');
  });
});
