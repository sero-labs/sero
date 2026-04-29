// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubDeviceFlowEvent } from '@/types/electron-services';
import type { GitHubAuthDialogResult } from '@/stores/github-auth';
import { resetGitHubAuthStore, useGitHubAuthStore } from '@/stores/github-auth';
import { GitHubAuthDialog } from './GitHubAuthDialog';

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
  if (!button) {
    throw new Error(`Expected button with label containing "${label}"`);
  }
  return button as HTMLButtonElement;
}

describe('GitHubAuthDialog', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let githubEventListener: ((event: GitHubDeviceFlowEvent) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGitHubAuthStore();
    githubEventListener = null;

    githubBridge.status.mockResolvedValue({ authenticated: false });
    githubBridge.login.mockResolvedValue(undefined);
    githubBridge.logout.mockResolvedValue(undefined);
    githubBridge.cancel.mockResolvedValue(undefined);
    githubBridge.onEvent.mockImplementation((callback: (event: GitHubDeviceFlowEvent) => void) => {
      githubEventListener = callback;
      return vi.fn(() => {
        if (githubEventListener === callback) {
          githubEventListener = null;
        }
      });
    });

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

  it('resolves cancelled launch requests through the shared dialog store', async () => {
    await act(async () => {
      root?.render(<GitHubAuthDialog />);
    });

    let resultPromise!: Promise<GitHubAuthDialogResult>;
    await act(async () => {
      resultPromise = useGitHubAuthStore.getState().openGitHubAuthDialog({ source: 'publish' });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Connect GitHub');
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });

    let result: GitHubAuthDialogResult | undefined;
    await act(async () => {
      findButton('Cancel').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      result = await resultPromise;
    });

    expect(result).toEqual({
      outcome: 'cancelled',
      status: { authenticated: false },
    });

    expect(useGitHubAuthStore.getState().open).toBe(false);
    expect(githubBridge.onEvent).toHaveBeenCalledTimes(1);
  });

  it('renders code, connected, and error states from the shared store', async () => {
    await act(async () => {
      useGitHubAuthStore.setState({
        open: true,
        activeRequest: { source: 'explorer' },
        authStatus: { authenticated: false },
        statusReady: true,
        flow: {
          step: 'code',
          userCode: 'ABCD-1234',
          verificationUri: 'https://github.com/login/device',
        },
      });
      root?.render(<GitHubAuthDialog />);
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('ABCD-1234');
      expect(document.body.textContent).toContain('Open GitHub');
    });

    await act(async () => {
      useGitHubAuthStore.setState({
        authStatus: { authenticated: true, username: 'octocat' },
        flow: { step: 'idle' },
      });
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('GitHub connected');
      expect(document.body.textContent).toContain('Connected as octocat');
    });

    await act(async () => {
      useGitHubAuthStore.setState({
        authStatus: { authenticated: false },
        flow: { step: 'error', message: 'Device flow failed' },
      });
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('GitHub authentication failed');
      expect(document.body.textContent).toContain('Device flow failed');
    });

    await act(async () => {
      findButton('Try again').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(githubBridge.login).toHaveBeenCalledTimes(1);
  });
});
