// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectRemoteResult } from '@sero-ai/common';
import type { GitHubAuthStatus, GitHubDeviceFlowEvent } from '@/types/electron-services';
import type { WorkspaceInfo } from '@/types/ipc';
import { resetGitHubAuthStore, useGitHubAuthStore } from '@/stores/github-auth';
import { GitHubAuthDialog } from '../auth/github/GitHubAuthDialog';
import { RemoteOriginManager } from './RemoteOriginManager';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const seroBridge = {
  vcs: {
    remotes: vi.fn(),
    connectRemote: vi.fn(),
    publishRepo: vi.fn(),
  },
  github: {
    status: vi.fn(),
    createRepo: vi.fn(),
    onEvent: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    cancel: vi.fn(),
  },
  editor: {
    listFiles: vi.fn(),
  },
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');
const workspace: WorkspaceInfo = {
  id: 'workspace-1',
  name: 'Workspace 1',
  path: '/tmp/workspace-1',
  open: true,
  runtime: { backend: 'host' },
  container: false,
  references: [],
  mounts: [],
  roots: [],
};

function findButton(label: string, index = 0): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll('button')).filter((candidate) =>
    candidate.textContent?.includes(label),
  );

  if (!buttons[index]) {
    throw new Error(`Expected button ${index} with label containing "${label}"`);
  }

  return buttons[index] as HTMLButtonElement;
}

function findInput(id: string): HTMLInputElement {
  const input = document.getElementById(id);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected input with id "${id}"`);
  }
  return input;
}

async function clickButton(label: string, index = 0): Promise<void> {
  await act(async () => {
    findButton(label, index).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

async function setInputValue(id: string, value: string): Promise<void> {
  const input = findInput(id);
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!valueSetter) {
    throw new Error('Expected HTMLInputElement value setter');
  }

  await act(async () => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('RemoteOriginManager', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let githubStatus: GitHubAuthStatus;
  let githubEventListener: ((event: GitHubDeviceFlowEvent) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGitHubAuthStore();
    githubStatus = { authenticated: false };
    githubEventListener = null;

    seroBridge.vcs.remotes.mockResolvedValue([]);
    seroBridge.vcs.connectRemote.mockImplementation(async (_wsId: string, url: string) => ({
      ok: true,
      url,
      updatedExisting: false,
      import: { imported: true },
    }));
    seroBridge.vcs.publishRepo.mockResolvedValue({ ok: true, url: 'https://github.com/octocat/alpha-repo' });
    seroBridge.github.status.mockImplementation(async () => githubStatus);
    seroBridge.github.createRepo.mockResolvedValue({
      success: true,
      message: 'created',
      url: 'https://github.com/octocat/workspace-1',
    });
    seroBridge.github.login.mockResolvedValue(undefined);
    seroBridge.github.logout.mockResolvedValue(undefined);
    seroBridge.github.cancel.mockResolvedValue(undefined);
    seroBridge.github.onEvent.mockImplementation((callback: (event: GitHubDeviceFlowEvent) => void) => {
      githubEventListener = callback;
      return vi.fn(() => {
        if (githubEventListener === callback) {
          githubEventListener = null;
        }
      });
    });

    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: seroBridge,
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
    resetGitHubAuthStore();

    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }
  });

  async function renderManager(): Promise<void> {
    await act(async () => {
      root?.render(
        <>
          <RemoteOriginManager
            open
            onOpenChange={vi.fn()}
            workspace={workspace}
          />
          <GitHubAuthDialog />
        </>,
      );
    });
  }

  it('shows origin-load failures instead of treating them as no origin', async () => {
    seroBridge.vcs.remotes.mockRejectedValue(new Error('remote lookup failed'));

    await act(async () => {
      root?.render(
        <RemoteOriginManager
          open
          onOpenChange={vi.fn()}
          workspace={workspace}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Couldn't load remote origin");
      expect(document.body.textContent).toContain('remote lookup failed');
    });

    await act(async () => {
      findButton('Retry').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(seroBridge.vcs.remotes).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps the create form state and retry path after auth is cancelled from the shared dialog', async () => {
    await renderManager();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Create new on GitHub');
    });

    await clickButton('Create new on GitHub');
    await setInputValue('repo-name', 'alpha-repo');
    await setInputValue('repo-desc', 'Alpha description');
    await clickButton('Public');
    await clickButton('Create Repository');

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('GitHub connection required');
      expect(document.body.textContent).toContain('Connect GitHub');
    });

    expect(findInput('repo-name').value).toBe('alpha-repo');
    expect(findInput('repo-desc').value).toBe('Alpha description');
    expect(document.body.textContent).not.toContain('sidebar first');
    expect(document.body.textContent).not.toContain('Explorer');
    expect(seroBridge.vcs.publishRepo).not.toHaveBeenCalled();

    await clickButton('Connect GitHub');

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
      expect(document.body.textContent).toContain('remote creation so you can finish creating this repository');
    });

    await act(async () => {
      await useGitHubAuthStore.getState().dismissGitHubAuthDialog();
    });

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(false);
      expect(document.body.textContent).toContain('GitHub is still disconnected');
      expect(document.body.textContent).toContain('Try again');
    });

    expect(findInput('repo-name').value).toBe('alpha-repo');
    expect(findInput('repo-desc').value).toBe('Alpha description');
    expect(document.body.textContent).toContain('GitHub connection required');
    expect(seroBridge.vcs.publishRepo).not.toHaveBeenCalled();
  });

  it('shows a retryable generic auth failure without losing create form values', async () => {
    await renderManager();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Create new on GitHub');
    });

    await clickButton('Create new on GitHub');
    await setInputValue('repo-name', 'alpha-repo');
    await setInputValue('repo-desc', 'Alpha description');
    await clickButton('Create Repository');

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('GitHub connection required');
    });

    await clickButton('Connect GitHub');

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });

    await act(async () => {
      useGitHubAuthStore.setState({
        authStatus: { authenticated: false },
        statusReady: true,
        flow: { step: 'error', message: 'Device flow failed' },
      });
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('GitHub authentication failed');
      expect(document.body.textContent).toContain('Device flow failed');
    });

    await clickButton('Close', 1);

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(false);
      expect(document.body.textContent).toContain('Device flow failed');
      expect(document.body.textContent).toContain('Try again');
    });

    expect(findInput('repo-name').value).toBe('alpha-repo');
    expect(findInput('repo-desc').value).toBe('Alpha description');
    expect(seroBridge.vcs.publishRepo).not.toHaveBeenCalled();

    await clickButton('Try again');

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });
  });

  it('resumes the blocked create action after successful auth without losing form values', async () => {
    seroBridge.vcs.publishRepo.mockResolvedValue({
      ok: true,
      url: 'https://github.com/octocat/alpha-repo',
    });

    await renderManager();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Create new on GitHub');
    });

    await clickButton('Create new on GitHub');
    await setInputValue('repo-name', 'alpha-repo');
    await setInputValue('repo-desc', 'Alpha description');
    await clickButton('Public');
    await clickButton('Create Repository');

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('GitHub connection required');
    });

    await clickButton('Connect GitHub');

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });

    expect(findInput('repo-name').value).toBe('alpha-repo');
    expect(findInput('repo-desc').value).toBe('Alpha description');

    await act(async () => {
      githubStatus = { authenticated: true, username: 'octocat' };
      useGitHubAuthStore.setState({
        authStatus: githubStatus,
        statusReady: true,
      });
      useGitHubAuthStore.getState().resolveGitHubAuthDialog({
        outcome: 'success',
        status: githubStatus,
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(seroBridge.vcs.publishRepo).toHaveBeenCalledTimes(1);
      expect(seroBridge.vcs.publishRepo).toHaveBeenCalledWith('workspace-1', {
        name: 'alpha-repo',
        description: 'Alpha description',
        visibility: 'public',
      });
      expect(document.body.textContent).toContain('octocat/alpha-repo');
    });
  });

  it('imports files and shows the connected repo for an empty workspace', async () => {
    await renderManager();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Connect existing repository');
    });

    await clickButton('Connect existing repository');
    await setInputValue('remote-url', 'https://github.com/octocat/workspace-1.git');
    await clickButton('Connect Repository');

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('octocat/workspace-1');
    });
    expect(seroBridge.vcs.connectRemote).toHaveBeenCalledWith(
      'workspace-1',
      'https://github.com/octocat/workspace-1.git',
      'auto',
    );
  });

  it('offers a reconcile choice when the import fails, keeping the remote linked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    seroBridge.vcs.connectRemote.mockImplementation(async (_wsId: string, url: string) => ({
      ok: true,
      url,
      updatedExisting: false,
      import: { imported: false, reason: 'import-failed', message: 'checkout failed' },
    }));

    await renderManager();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Connect existing repository');
    });

    await clickButton('Connect existing repository');
    await setInputValue('remote-url', 'https://github.com/octocat/workspace-1.git');
    await clickButton('Connect Repository');

    // Import failed → user is offered a choice rather than a silent success.
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("couldn't be imported: checkout failed");
      expect(document.body.textContent).toContain('Import files');
      expect(document.body.textContent).toContain('Just link');
    });

    // "Just link" keeps the remote and surfaces the warning on the connected view.
    await clickButton('Just link');
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('octocat/workspace-1');
      expect(document.body.textContent).toContain("couldn't be imported: checkout failed");
    });

    warn.mockRestore();
  });
  it('cannot close while an existing repository import is running', async () => {
    let finishConnect: (result: ConnectRemoteResult) => void = () => {};
    seroBridge.vcs.connectRemote.mockImplementation(() => new Promise((resolve) => {
      finishConnect = resolve;
    }));
    const onOpenChange = vi.fn();
    await act(async () => {
      root?.render(
        <RemoteOriginManager
          open
          onOpenChange={onOpenChange}
          workspace={workspace}
        />,
      );
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('Connect existing repository'));
    await clickButton('Connect existing repository');
    await setInputValue('remote-url', 'https://github.com/octocat/workspace-1.git');
    await clickButton('Connect Repository');

    expect(findButton('Connecting…').disabled).toBe(true);
    expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => {
      finishConnect({
        ok: true,
        url: 'https://github.com/octocat/workspace-1.git',
        updatedExisting: false,
        import: { imported: true },
      });
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('octocat/workspace-1'));
  });

});
