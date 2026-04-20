import { create } from 'zustand';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import type { GitHubAuthStatus, GitHubDeviceFlowEvent } from '@/types/electron-services';

function unauthenticatedStatus(): GitHubAuthStatus {
  return { authenticated: false };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function isFlowInProgress(flow: GitHubFlowState): boolean {
  return flow.step === 'code' || flow.step === 'polling';
}

function normalizeFlowForStatus(
  flow: GitHubFlowState,
  status: GitHubAuthStatus,
): GitHubFlowState {
  if (status.authenticated) {
    if (flow.step === 'success') {
      return {
        step: 'success',
        username: flow.username || status.username || '',
      };
    }
    return { step: 'idle' };
  }

  if (flow.step === 'success') {
    return { step: 'idle' };
  }

  return flow;
}

function createInitialGitHubAuthStoreState(): GitHubAuthStoreData {
  return {
    open: false,
    activeRequest: null,
    authStatus: null,
    statusReady: false,
    flow: { step: 'idle' },
    copied: false,
    copyFailed: false,
    eventsInitialized: false,
  };
}

export type GitHubFlowState =
  | { step: 'idle' }
  | { step: 'code'; userCode: string; verificationUri: string }
  | { step: 'polling' }
  | { step: 'success'; username: string }
  | { step: 'error'; message: string };

export type GitHubAuthSource = 'explorer' | 'onboarding' | 'remote-origin' | 'publish';

export type GitHubAuthDialogResult =
  | { outcome: 'success'; status: GitHubAuthStatus }
  | { outcome: 'cancelled'; status: GitHubAuthStatus }
  | { outcome: 'error'; status: GitHubAuthStatus; message: string };

export interface GitHubAuthDialogRequest {
  source: GitHubAuthSource;
}

interface GitHubAuthStoreData {
  open: boolean;
  activeRequest: GitHubAuthDialogRequest | null;
  authStatus: GitHubAuthStatus | null;
  statusReady: boolean;
  flow: GitHubFlowState;
  copied: boolean;
  copyFailed: boolean;
  eventsInitialized: boolean;
}

interface GitHubAuthStoreActions {
  init: () => Promise<void>;
  openGitHubAuthDialog: (request: GitHubAuthDialogRequest) => Promise<GitHubAuthDialogResult>;
  dismissGitHubAuthDialog: () => Promise<void>;
  resolveGitHubAuthDialog: (result: GitHubAuthDialogResult) => void;
  refreshStatus: () => Promise<GitHubAuthStatus>;
  startLogin: () => void;
  logout: () => Promise<void>;
  cancel: () => Promise<void>;
  copyCode: (code: string) => Promise<void>;
}

export type GitHubAuthStore = GitHubAuthStoreData & GitHubAuthStoreActions;

let githubEventUnsubscribe: (() => void) | null = null;
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
let activeDialogDeferred: ReturnType<typeof createDeferred<GitHubAuthDialogResult>> | null = null;
let dialogLaunchPromise: Promise<GitHubAuthDialogResult> | null = null;

function clearCopyResetTimer(): void {
  if (copyResetTimer) {
    clearTimeout(copyResetTimer);
    copyResetTimer = null;
  }
}

function resetCopyFeedback(): void {
  clearCopyResetTimer();
  useGitHubAuthStore.setState({ copied: false, copyFailed: false });
}

function setTransientCopyState(state: 'copied' | 'failed'): void {
  resetCopyFeedback();
  useGitHubAuthStore.setState({
    copied: state === 'copied',
    copyFailed: state === 'failed',
  });

  copyResetTimer = setTimeout(() => {
    useGitHubAuthStore.setState({ copied: false, copyFailed: false });
    copyResetTimer = null;
  }, state === 'copied' ? 2000 : 3000);
}

function resolveActiveGitHubAuthDialog(result: GitHubAuthDialogResult): void {
  const deferred = activeDialogDeferred;
  activeDialogDeferred = null;
  useGitHubAuthStore.setState({ open: false, activeRequest: null });
  deferred?.resolve(result);
}

async function handleGitHubDeviceFlowEvent(event: GitHubDeviceFlowEvent): Promise<void> {
  switch (event.type) {
    case 'code':
      resetCopyFeedback();
      useGitHubAuthStore.setState({
        flow: {
          step: 'code',
          userCode: event.userCode ?? '',
          verificationUri: event.verificationUri ?? '',
        },
      });
      return;

    case 'polling':
      useGitHubAuthStore.setState((state) => ({
        flow: state.flow.step === 'code' ? state.flow : { step: 'polling' },
      }));
      return;

    case 'success': {
      resetCopyFeedback();
      const fallbackUsername = event.username ?? useGitHubAuthStore.getState().authStatus?.username ?? '';
      useGitHubAuthStore.setState({
        flow: {
          step: 'success',
          username: fallbackUsername,
        },
      });

      const status = await useGitHubAuthStore.getState().refreshStatus();
      if (status.authenticated) {
        useGitHubAuthStore.setState({
          flow: {
            step: 'success',
            username: status.username ?? fallbackUsername,
          },
        });
        resolveActiveGitHubAuthDialog({ outcome: 'success', status });
        return;
      }

      useGitHubAuthStore.setState({
        flow: {
          step: 'error',
          message: 'GitHub auth completed, but the refreshed status was unavailable.',
        },
      });
      return;
    }

    case 'error':
      resetCopyFeedback();
      useGitHubAuthStore.setState({
        flow: {
          step: 'error',
          message: event.message ?? 'Login failed',
        },
      });
      return;
  }
}

export const useGitHubAuthStore = create<GitHubAuthStore>((set, get) => ({
  ...createInitialGitHubAuthStoreState(),

  init: async () => {
    if (!get().eventsInitialized) {
      githubEventUnsubscribe = window.sero.github.onEvent((event) => {
        void handleGitHubDeviceFlowEvent(event);
      });
      set({ eventsInitialized: true });
    }

    if (!get().statusReady) {
      await get().refreshStatus();
    }
  },

  openGitHubAuthDialog: (request) => {
    if (dialogLaunchPromise) {
      return dialogLaunchPromise;
    }

    dialogLaunchPromise = (async () => {
      await get().init();

      const status = await get().refreshStatus();
      if (status.authenticated) {
        return { outcome: 'success', status } satisfies GitHubAuthDialogResult;
      }

      resetCopyFeedback();
      activeDialogDeferred = createDeferred<GitHubAuthDialogResult>();
      set((state) => ({
        open: true,
        activeRequest: state.activeRequest ?? request,
        flow: isFlowInProgress(state.flow) ? state.flow : { step: 'idle' },
      }));

      return activeDialogDeferred.promise;
    })().finally(() => {
      dialogLaunchPromise = null;
    });

    return dialogLaunchPromise;
  },

  dismissGitHubAuthDialog: async () => {
    if (!activeDialogDeferred) {
      set({ open: false, activeRequest: null });
      return;
    }

    const flow = get().flow;
    const errorMessage = flow.step === 'error' ? flow.message : null;

    try {
      await window.sero.github.cancel();
    } catch {
      // Best effort — auth status refresh below remains authoritative.
    }

    resetCopyFeedback();
    set({ flow: { step: 'idle' } });

    const status = await get().refreshStatus();
    if (status.authenticated) {
      resolveActiveGitHubAuthDialog({ outcome: 'success', status });
      return;
    }

    if (errorMessage) {
      resolveActiveGitHubAuthDialog({ outcome: 'error', status, message: errorMessage });
      return;
    }

    resolveActiveGitHubAuthDialog({ outcome: 'cancelled', status });
  },

  resolveGitHubAuthDialog: (result) => {
    resolveActiveGitHubAuthDialog(result);
  },

  refreshStatus: async () => {
    try {
      const status = await window.sero.github.status();
      set((state) => ({
        authStatus: status,
        statusReady: true,
        flow: normalizeFlowForStatus(state.flow, status),
      }));
      return status;
    } catch {
      const status = unauthenticatedStatus();
      set((state) => ({
        authStatus: status,
        statusReady: true,
        flow: normalizeFlowForStatus(state.flow, status),
      }));
      return status;
    }
  },

  startLogin: () => {
    void get().init();
    resetCopyFeedback();
    set({ flow: { step: 'idle' } });
    void window.sero.github.login();
  },

  logout: async () => {
    try {
      await window.sero.github.logout();
    } finally {
      resetCopyFeedback();
      set({ flow: { step: 'idle' } });
      await get().refreshStatus();
    }
  },

  cancel: async () => {
    try {
      await window.sero.github.cancel();
    } finally {
      resetCopyFeedback();
      set({ flow: { step: 'idle' } });
    }
  },

  copyCode: async (code) => {
    const ok = await copyTextToClipboard(code);
    setTransientCopyState(ok ? 'copied' : 'failed');
  },
}));

export function resetGitHubAuthStore(): void {
  githubEventUnsubscribe?.();
  githubEventUnsubscribe = null;
  clearCopyResetTimer();
  activeDialogDeferred = null;
  dialogLaunchPromise = null;
  useGitHubAuthStore.setState(createInitialGitHubAuthStoreState());
}
