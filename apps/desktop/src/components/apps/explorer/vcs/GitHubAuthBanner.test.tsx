// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGitHubAuthStore, useGitHubAuthStore } from '@/stores/github-auth';
import { GitHubAuthBanner } from './GitHubAuthBanner';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const githubBridge = {
  status: vi.fn(),
  onEvent: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  cancel: vi.fn(),
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button with label containing "${label}"`);
  }
  return button;
}

describe('GitHubAuthBanner', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGitHubAuthStore();

    githubBridge.status.mockResolvedValue({ authenticated: false });
    githubBridge.onEvent.mockReturnValue(vi.fn());
    githubBridge.login.mockResolvedValue(undefined);
    githubBridge.logout.mockResolvedValue(undefined);
    githubBridge.cancel.mockResolvedValue(undefined);

    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: {
        github: githubBridge,
      },
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

  it('stays summary-only and launches the shared dialog instead of starting login inline', async () => {
    await act(async () => {
      root?.render(<GitHubAuthBanner />);
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Connect GitHub to push, fetch, and create PRs.');
    });

    await act(async () => {
      useGitHubAuthStore.setState({
        flow: {
          step: 'code',
          userCode: 'ABCD-1234',
          verificationUri: 'https://github.com/login/device',
        },
      });
    });

    expect(container.textContent).not.toContain('ABCD-1234');
    expect(container.textContent).not.toContain('Waiting for authorization');

    await act(async () => {
      findButton('Connect GitHub').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });

    expect(githubBridge.login).not.toHaveBeenCalled();

    await act(async () => {
      useGitHubAuthStore.getState().resolveGitHubAuthDialog({
        outcome: 'cancelled',
        status: { authenticated: false },
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('GitHub is still disconnected.');
      expect(container.textContent).toContain('Try again');
    });
  });

  it('shows the connected summary and disconnect affordance', async () => {
    useGitHubAuthStore.setState({
      authStatus: { authenticated: true, username: 'octocat' },
      statusReady: true,
    });

    await act(async () => {
      root?.render(<GitHubAuthBanner />);
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Connected as octocat');
      expect(container.textContent).toContain('Disconnect');
    });

    await act(async () => {
      findButton('Disconnect').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(githubBridge.logout).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('Connect GitHub to push, fetch, and create PRs.');
    });
  });
});
