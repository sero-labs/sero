// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitAppState, GitManagerRequest } from '../shared/types';
import { DEFAULT_GIT_STATE } from '../shared/types';
import { GitApp } from './GitApp';

const getSeroApiMock = vi.fn();
const useAppInfoMock = vi.fn();
const useAppStateMock = vi.fn();

vi.mock('@sero-ai/app-runtime', () => ({
  getSeroApi: () => getSeroApiMock(),
  useAppInfo: () => useAppInfoMock(),
  useAppState: (initialState: GitAppState) => useAppStateMock(initialState),
}));

vi.mock('./components/Header', () => ({
  Header: ({ onAction }: { onAction: (action: GitManagerRequest) => void }) => (
    <button onClick={() => onAction({ action: 'fetch' })}>Trigger fetch</button>
  ),
}));

vi.mock('./components/BranchPanel', () => ({ BranchPanel: () => null }));
vi.mock('./components/CommitDetail', () => ({ CommitDetail: () => null }));
vi.mock('./components/CommitGraph', () => ({ CommitGraph: () => null }));
vi.mock('./components/DiffViewer', () => ({ DiffViewer: () => null }));
vi.mock('./components/StagingArea', () => ({ StagingArea: () => null }));
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
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
      root?.unmount();
    });
    container.remove();
    root = null;
    getSeroApiMock.mockReset();
    useAppInfoMock.mockReset();
    useAppStateMock.mockReset();
    vi.useRealTimers();
  });

  it('shows a notice when the host git bridge is unavailable', async () => {
    vi.useFakeTimers();
    getSeroApiMock.mockReturnValue({ gitApp: undefined });

    await act(async () => {
      root?.render(<GitApp />);
    });

    await act(async () => {
      clickButton(container, 'Trigger fetch');
    });

    expect(container.textContent).toContain('Git bridge unavailable');
    expect(container.textContent).toContain('Reload Sero or reopen this workspace');

    await act(async () => {
      clickButton(container, 'Dismiss git action notice');
    });
  });

  it('surfaces host action failures with action-specific copy', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue({ ok: false, message: 'Remote rejected fetch' });
    getSeroApiMock.mockReturnValue({ gitApp: { run } });

    await act(async () => {
      root?.render(<GitApp />);
    });

    await act(async () => {
      clickButton(container, 'Trigger fetch');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(run).toHaveBeenCalledWith('ws-1', { action: 'fetch' });
    expect(container.textContent).toContain('Could not fetch remotes');
    expect(container.textContent).toContain('Remote rejected fetch');

    await act(async () => {
      clickButton(container, 'Dismiss git action notice');
    });
  });
});
