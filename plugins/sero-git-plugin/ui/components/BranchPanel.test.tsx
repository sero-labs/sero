// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GitManagerRequest } from '../../shared/types';
import { BranchPanel } from './BranchPanel';

vi.mock('./BranchContextMenu', () => ({
  BranchContextMenu: ({
    children,
    onForceDelete,
    onForceRemoveWorktree,
  }: {
    children: ReactNode;
    onForceDelete?: () => void;
    onForceRemoveWorktree?: () => void;
  }) => (
    <div>
      {children}
      {onForceDelete && <button type="button" onClick={onForceDelete}>Force delete branch</button>}
      {onForceRemoveWorktree && <button type="button" onClick={onForceRemoveWorktree}>Force remove worktree</button>}
    </div>
  ),
}));

function clickButton(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function setTextInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('BranchPanel', () => {
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

  it('wires force delete and force remove worktree actions through the shared request contract', async () => {
    await act(async () => {
      root?.render(
        <BranchPanel
          branches={[
            {
              name: 'feature/delete',
              current: false,
              ahead: 0,
              behind: 0,
            },
            {
              name: 'feature/worktree',
              current: false,
              ahead: 0,
              behind: 0,
              checkedOutIn: '/tmp/feature-worktree',
            },
          ]}
          remoteBranches={[]}
          remotes={[]}
          stashes={[]}
          currentBranch="main"
          defaultBranch="main"
          onAction={onAction}
          mode="normal"
          headHash="abc1234"
          onRequestCheckout={vi.fn()}
        />, 
      );
    });

    await act(async () => {
      clickButton(container, 'Force delete branch');
      clickButton(container, 'Force remove worktree');
    });

    expect(onAction).toHaveBeenNthCalledWith(1, { action: 'delete_branch', branch: 'feature/delete', force: true });
    expect(onAction).toHaveBeenNthCalledWith(2, {
      action: 'remove_worktree',
      worktreePath: '/tmp/feature-worktree',
      force: true,
    });
  });

  it('creates a new branch from the inline form and keeps stash pop behind confirmation', async () => {
    await act(async () => {
      root?.render(
        <BranchPanel
          branches={[
            { name: 'main', current: true, ahead: 0, behind: 0 },
          ]}
          remoteBranches={[]}
          remotes={[]}
          stashes={[
            { index: 0, hash: 'stash-0', message: 'WIP', date: '2026-04-14T10:00:00.000Z' },
          ]}
          currentBranch="main"
          defaultBranch="main"
          onAction={onAction}
          mode="normal"
          headHash="abc1234"
          onRequestCheckout={vi.fn()}
        />,
      );
    });

    await act(async () => {
      clickButton(container, 'New branch');
    });

    const input = container.querySelector('input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Branch input not found');
    }

    await act(async () => {
      setTextInputValue(input, 'feature/e5-split');
      clickButton(container, 'Create');
    });

    expect(onAction).toHaveBeenCalledWith({ action: 'create_branch', branch: 'feature/e5-split' });

    await act(async () => {
      clickButton(container, 'Pop');
    });
    expect(onAction).not.toHaveBeenCalledWith({ action: 'stash_pop', stashIndex: 0 });

    await act(async () => {
      clickButton(container, 'Confirm pop');
    });
    expect(onAction).toHaveBeenLastCalledWith({ action: 'stash_pop', stashIndex: 0 });
  });

  // The remote row names where the code lives, so it is also the way there.
  it('opens the remote in the browser from its row', async () => {
    const openExternal = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);
    Reflect.set(window, 'sero', { shell: { openExternal } });

    await act(async () => {
      root?.render(
        <BranchPanel
          branches={[{ name: 'main', current: true, ahead: 0, behind: 0 }]}
          remoteBranches={[{ name: 'origin/main', current: false, ahead: 0, behind: 0 }]}
          remotes={[{
            name: 'origin',
            fetchUrl: 'git@github.com:sero-ai/sero.git',
            pushUrl: 'git@github.com:sero-ai/sero.git',
          }]}
          stashes={[]}
          currentBranch="main"
          defaultBranch="main"
          onAction={onAction}
          mode="normal"
          headHash="abc1234"
          onRequestCheckout={vi.fn()}
        />,
      );
    });

    await act(async () => {
      clickButton(container, 'github.com');
    });

    expect(openExternal).toHaveBeenCalledWith('https://github.com/sero-ai/sero');
    Reflect.deleteProperty(window, 'sero');
  });

  // A remote with no web page must not look clickable.
  it('leaves a remote with no browsable address inert', async () => {
    await act(async () => {
      root?.render(
        <BranchPanel
          branches={[{ name: 'main', current: true, ahead: 0, behind: 0 }]}
          remoteBranches={[{ name: 'origin/main', current: false, ahead: 0, behind: 0 }]}
          remotes={[{ name: 'origin', fetchUrl: '/Users/dan/mirror.git', pushUrl: '/Users/dan/mirror.git' }]}
          stashes={[]}
          currentBranch="main"
          defaultBranch="main"
          onAction={onAction}
          mode="normal"
          headHash="abc1234"
          onRequestCheckout={vi.fn()}
        />,
      );
    });

    const remoteRow = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.trim().startsWith('origin'));
    expect(remoteRow?.disabled).toBe(true);
  });
});
