// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitAppState, GitManagerRequest } from '../../shared/types';
import { DEFAULT_GIT_STATE } from '../../shared/types';
import { Header } from './Header';

const GITHUB = { ready: true, authenticated: false, signIn: () => {} };

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

  it('shows Live when file watching is active', async () => {
    await act(async () => {
      root?.render(<Header state={createState({ syncMode: 'watch' })} onAction={onAction} github={GITHUB} onOpenPullRequest={() => {}} />);
    });

    expect(container.textContent).toContain('Live');
    expect(container.textContent).not.toContain('Polling');
  });

  it('shows Manual when the app is running without live watchers', async () => {
    await act(async () => {
      root?.render(<Header state={createState({ syncMode: 'manual' })} onAction={onAction} github={GITHUB} onOpenPullRequest={() => {}} />);
    });

    expect(container.textContent).toContain('Manual');
    expect(container.textContent).not.toContain('Polling');
  });
});
