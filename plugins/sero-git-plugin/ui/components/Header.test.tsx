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

  // There is no sync slot any more. Watching keeps the view current, which is a
  // state with no action and therefore nothing to say (rule 28); the two things
  // that *were* worth saying moved to where you would act on them — staleness
  // onto Refresh, failures into the mode banner (rules 21 and 22).
  it('says nothing at all while file watching is active', async () => {
    await act(async () => {
      root?.render(<Header state={createState({ syncMode: 'watch' })} onAction={onAction} github={GITHUB} onOpenPullRequest={() => {}} info={NORMAL_MODE} />);
    });

    for (const gone of ['Live', 'LIVE', 'Manual', 'Issue', 'Syncing', 'Polling']) {
      expect(container.textContent).not.toContain(gone);
    }
  });

  /**
   * The signal this must not lose. Watchers die for ordinary reasons — a
   * filesystem that cannot be watched, a missing git dir, too many open files —
   * and the app then shows stale data forever. Refresh carries the time,
   * because Refresh is what you would press about it.
   */
  it('puts the last-read time on Refresh when the view is not updating itself', async () => {
    await act(async () => {
      root?.render(<Header state={createState({ syncMode: 'manual' })} onAction={onAction} github={GITHUB} onOpenPullRequest={() => {}} info={NORMAL_MODE} />);
    });

    const refresh = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Refresh'));
    expect(refresh).toBeDefined();
    // A time, whatever the runner's locale renders it as.
    expect(refresh?.textContent).toMatch(/\d{1,2}[:.]\d{2}/);
    expect(refresh?.getAttribute('title')).toContain('not updating on its own');
  });

  it('leaves Refresh bare while the view keeps itself current', async () => {
    await act(async () => {
      root?.render(<Header state={createState({ syncMode: 'watch' })} onAction={onAction} github={GITHUB} onOpenPullRequest={() => {}} info={NORMAL_MODE} />);
    });

    const refresh = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Refresh'));
    expect(refresh?.textContent?.trim()).toBe('Refresh');
  });
});
