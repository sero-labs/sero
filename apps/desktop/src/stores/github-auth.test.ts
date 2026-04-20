// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubDeviceFlowEvent } from '@/types/electron-services';
import { resetGitHubAuthStore, useGitHubAuthStore } from './github-auth';

const githubBridge = {
  status: vi.fn(),
  onEvent: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  cancel: vi.fn(),
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

function installSeroBridge() {
  Object.defineProperty(window, 'sero', {
    configurable: true,
    value: {
      github: githubBridge,
    },
  });
}

describe('useGitHubAuthStore', () => {
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

    installSeroBridge();
  });

  afterEach(() => {
    resetGitHubAuthStore();

    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }
  });

  it('initializes one shared GitHub event subscription path', async () => {
    await useGitHubAuthStore.getState().init();
    await useGitHubAuthStore.getState().init();

    expect(githubBridge.onEvent).toHaveBeenCalledTimes(1);
    expect(githubBridge.status).toHaveBeenCalledTimes(1);
    expect(useGitHubAuthStore.getState().statusReady).toBe(true);
  });

  it('reuses one active dialog request and resolves with refreshed auth status on success', async () => {
    githubBridge.status
      .mockResolvedValueOnce({ authenticated: false })
      .mockResolvedValueOnce({ authenticated: false })
      .mockResolvedValueOnce({ authenticated: true, username: 'octocat' });

    const firstPromise = useGitHubAuthStore.getState().openGitHubAuthDialog({ source: 'explorer' });
    const secondPromise = useGitHubAuthStore.getState().openGitHubAuthDialog({ source: 'publish' });

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
      expect(useGitHubAuthStore.getState().activeRequest).toEqual({ source: 'explorer' });
    });

    expect(githubBridge.status).toHaveBeenCalledTimes(2);
    expect(githubEventListener).not.toBeNull();

    githubEventListener?.({ type: 'success', username: 'octocat' });

    await expect(Promise.all([firstPromise, secondPromise])).resolves.toEqual([
      {
        outcome: 'success',
        status: { authenticated: true, username: 'octocat' },
      },
      {
        outcome: 'success',
        status: { authenticated: true, username: 'octocat' },
      },
    ]);

    expect(useGitHubAuthStore.getState().open).toBe(false);
    expect(useGitHubAuthStore.getState().activeRequest).toBeNull();
    expect(useGitHubAuthStore.getState().authStatus).toEqual({ authenticated: true, username: 'octocat' });
  });

  it('resolves generic failures back to the launching surface when the shared dialog closes', async () => {
    const resultPromise = useGitHubAuthStore.getState().openGitHubAuthDialog({ source: 'remote-origin' });

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });

    useGitHubAuthStore.setState({
      flow: { step: 'error', message: 'Device flow failed' },
    });

    await useGitHubAuthStore.getState().dismissGitHubAuthDialog();

    await expect(resultPromise).resolves.toEqual({
      outcome: 'error',
      status: { authenticated: false },
      message: 'Device flow failed',
    });

    expect(githubBridge.cancel).toHaveBeenCalledTimes(1);
    expect(useGitHubAuthStore.getState().open).toBe(false);
  });

  it('cancels an in-flight login even if the user closes the dialog before the device code arrives', async () => {
    const resultPromise = useGitHubAuthStore.getState().openGitHubAuthDialog({ source: 'explorer' });

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });

    useGitHubAuthStore.getState().startLogin();

    expect(useGitHubAuthStore.getState().flow).toEqual({ step: 'idle' });

    await useGitHubAuthStore.getState().dismissGitHubAuthDialog();

    await expect(resultPromise).resolves.toEqual({
      outcome: 'cancelled',
      status: { authenticated: false },
    });

    expect(githubBridge.login).toHaveBeenCalledTimes(1);
    expect(githubBridge.cancel).toHaveBeenCalledTimes(1);
    expect(useGitHubAuthStore.getState().open).toBe(false);
    expect(useGitHubAuthStore.getState().flow).toEqual({ step: 'idle' });
  });

  it('refreshes GitHub status after logout instead of trusting cached success state', async () => {
    useGitHubAuthStore.setState({
      authStatus: { authenticated: true, username: 'octocat' },
      statusReady: true,
      flow: { step: 'success', username: 'octocat' },
    });
    githubBridge.status.mockResolvedValue({ authenticated: false });

    await useGitHubAuthStore.getState().logout();

    expect(githubBridge.logout).toHaveBeenCalledTimes(1);
    expect(githubBridge.status).toHaveBeenCalledTimes(1);
    expect(useGitHubAuthStore.getState().authStatus).toEqual({ authenticated: false });
    expect(useGitHubAuthStore.getState().flow).toEqual({ step: 'idle' });
  });
});
