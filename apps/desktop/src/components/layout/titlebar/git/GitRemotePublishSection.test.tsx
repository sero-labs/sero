// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubAuthStatus, GitHubDeviceFlowEvent } from '@/types/electron-services';
import { GitHubAuthDialog } from '@/components/layout/auth/github/GitHubAuthDialog';
import { resetGitHubAuthStore, useGitHubAuthStore } from '@/stores/github-auth';
import { GitRemotePublishSection } from './GitRemotePublishSection';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const seroBridge = {
  vcs: {
    addRemote: vi.fn(),
    setRemoteUrl: vi.fn(),
  },
  github: {
    status: vi.fn(),
    createRepo: vi.fn(),
    onEvent: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    cancel: vi.fn(),
  },
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

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

describe('GitRemotePublishSection', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let githubStatus: GitHubAuthStatus;
  let githubEventListener: ((event: GitHubDeviceFlowEvent) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGitHubAuthStore();
    githubStatus = { authenticated: false };
    githubEventListener = null;

    seroBridge.vcs.addRemote.mockResolvedValue(undefined);
    seroBridge.vcs.setRemoteUrl.mockResolvedValue(undefined);
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

  async function renderSection(onPublished = vi.fn()): Promise<ReturnType<typeof vi.fn>> {
    await act(async () => {
      root?.render(
        <>
          <GitRemotePublishSection
            workspaceId="workspace-1"
            workspaceName="Workspace 1"
            onPublished={onPublished}
          />
          <GitHubAuthDialog />
        </>,
      );
    });

    return onPublished;
  }

  it('connects proactively without auto-creating a repository', async () => {
    const onPublished = await renderSection();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Connect GitHub');
      expect(document.body.textContent).not.toContain('sidebar');
      expect(document.body.textContent).not.toContain('Explorer');
    });

    await clickButton('Connect GitHub');

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
      expect(document.body.textContent).toContain('publishing so you can finish creating and pushing this repository');
    });

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
      expect(document.body.textContent).toContain('Connected as');
      expect(document.body.textContent).toContain('octocat');
    });

    expect(seroBridge.github.createRepo).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
  });

  it('keeps a retry path after auth is cancelled from a blocked publish attempt', async () => {
    await renderSection();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Create repo + publish');
    });

    await setInputValue('publish-repo-name', 'alpha-repo');
    await clickButton('Create repo + publish');

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('GitHub connection required');
      expect(document.body.textContent).toContain('Connect GitHub');
    });

    expect(findInput('publish-repo-name').value).toBe('alpha-repo');
    expect(document.body.textContent).not.toContain('sidebar');
    expect(document.body.textContent).not.toContain('Explorer');
    expect(seroBridge.github.createRepo).not.toHaveBeenCalled();

    await clickButton('Connect GitHub');

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });

    await act(async () => {
      await useGitHubAuthStore.getState().dismissGitHubAuthDialog();
    });

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(false);
      expect(document.body.textContent).toContain('GitHub is still disconnected');
      expect(document.body.textContent).toContain('Try again');
    });

    expect(findInput('publish-repo-name').value).toBe('alpha-repo');
    expect(document.body.textContent).toContain('GitHub connection required');
    expect(seroBridge.github.createRepo).not.toHaveBeenCalled();
  });

  it('resumes the blocked create-and-publish action after successful auth', async () => {
    const onPublished = await renderSection();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Create repo + publish');
    });

    await setInputValue('publish-repo-name', 'alpha-repo');
    await clickButton('Public');
    await clickButton('Create repo + publish');

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('GitHub connection required');
    });

    await clickButton('Connect GitHub');

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });

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
      expect(seroBridge.github.createRepo).toHaveBeenCalledTimes(1);
      expect(seroBridge.github.createRepo).toHaveBeenCalledWith('workspace-1', {
        name: 'alpha-repo',
        description: undefined,
        visibility: 'public',
        addRemote: true,
      });
      expect(document.body.textContent).toContain('Repository published and origin connected.');
    });

    expect(onPublished).toHaveBeenCalledTimes(1);
  });
});
