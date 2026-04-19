// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroAppManifest, UserFeedbackPendingQuestion } from '@/types/ipc';

const federationMocks = vi.hoisted(() => {
  let resolvePreload: (() => void) | null = null;
  let preloadPromise: Promise<void> | null = null;

  return {
    reset() {
      preloadPromise = new Promise<void>((resolve) => {
        resolvePreload = resolve;
      });
    },
    resolve() {
      resolvePreload?.();
    },
    wait() {
      if (!preloadPromise) throw new Error('preload promise not initialised');
      return preloadPromise;
    },
    preloadFederatedModule: vi.fn<
      (appId: string, component: string, devPort: number | undefined) => Promise<void>
    >(),
    refreshTransientRemote: vi.fn<(appId: string) => void>(),
    hasTransientRemote: vi.fn<(appId: string) => boolean>(),
  };
});

vi.mock('@/lib/persist-layout', () => ({
  persistLayout: vi.fn(),
}));

vi.mock('@/lib/federation-registry', () => ({
  preloadFederatedModule: federationMocks.preloadFederatedModule,
  refreshTransientRemote: federationMocks.refreshTransientRemote,
  hasTransientRemote: federationMocks.hasTransientRemote,
}));

import { useAppStore, type AppEntry } from './app';
import { useUserFeedbackStore } from './user-feedback-store';

function createManifest(id: string): SeroAppManifest {
  return {
    id,
    name: id,
    description: null,
    version: '1.0.0',
    packageName: `@sero/${id}`,
    icon: 'box',
    stateFile: `.sero/apps/${id}/state.json`,
    scope: 'workspace',
    globalStatePath: null,
    uiEntry: `sero-ext://${id}/mf-manifest.json`,
    runtimeEntry: null,
    component: `${id}App`,
    devPort: 4100,
    remoteEntryOverride: null,
    packagePath: `/tmp/${id}`,
    isPlugin: false,
    widgets: [],
  };
}

function createApp(
  id: string,
  label: string,
  options?: { builtin?: boolean; manifest?: SeroAppManifest | null },
): AppEntry {
  return {
    id,
    label,
    icon: 'box',
    builtin: options?.builtin ?? false,
    manifest: options?.manifest ?? null,
  };
}

function createQuestion(
  id: string,
  type: UserFeedbackPendingQuestion['type'] = 'questionnaire',
): UserFeedbackPendingQuestion {
  return {
    id,
    type,
    toolCallId: `tool-${id}`,
    timestamp: new Date().toISOString(),
    questions: [
      {
        id: 'q0',
        label: 'Scope',
        prompt: 'What should we focus on?',
        options: [{ value: 'a', label: 'Option A' }],
        allowOther: true,
      },
    ],
  };
}

describe('useUserFeedbackStore', () => {
  const initialAppState = useAppStore.getState();
  const initialFeedbackState = useUserFeedbackStore.getState();
  const answer = vi.fn<() => Promise<void>>();
  let questionListeners: Array<(data: UserFeedbackPendingQuestion) => void> = [];
  let cancelListeners: Array<(data: { id: string }) => void> = [];
  let cleanup: (() => void) | null = null;

  function setApps(userFeedbackManifest: SeroAppManifest | null = null) {
    useAppStore.setState({
      ...initialAppState,
      activeApp: 'kanban',
      pendingApp: null,
      apps: [
        createApp('explorer', 'Explorer', { builtin: true }),
        createApp('kanban', 'Kanban'),
        createApp('userfeedback', 'User Feedback', { manifest: userFeedbackManifest }),
      ],
    }, true);
  }

  function emitQuestion(data: UserFeedbackPendingQuestion) {
    for (const listener of questionListeners) listener(data);
  }

  function emitCancel(id: string) {
    for (const listener of cancelListeners) listener({ id });
  }

  function emitAnswered(id: string) {
    window.dispatchEvent(
      new CustomEvent('sero:user-feedback:answered', { detail: { id } }),
    );
  }

  beforeEach(() => {
    federationMocks.reset();
    federationMocks.preloadFederatedModule.mockImplementation(() => federationMocks.wait());
    answer.mockReset();
    answer.mockResolvedValue(undefined);
    questionListeners = [];
    cancelListeners = [];

    (window as Window & { sero: any }).sero = {
      userFeedback: {
        answer,
        onQuestion: (callback: (data: UserFeedbackPendingQuestion) => void) => {
          questionListeners.push(callback);
          return () => {
            questionListeners = questionListeners.filter((listener) => listener !== callback);
          };
        },
        onCancel: (callback: (data: { id: string }) => void) => {
          cancelListeners.push(callback);
          return () => {
            cancelListeners = cancelListeners.filter((listener) => listener !== callback);
          };
        },
      },
    };

    setApps();
    useUserFeedbackStore.setState({
      ...initialFeedbackState,
      pending: new Map(),
      returnApp: null,
    }, true);
    cleanup = useUserFeedbackStore.getState().initListeners();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    federationMocks.preloadFederatedModule.mockReset();
    useAppStore.setState(initialAppState, true);
    useUserFeedbackStore.setState(initialFeedbackState, true);
  });

  it('restores the previous app after a questionnaire is answered', () => {
    emitQuestion(createQuestion('questionnaire-1'));

    expect(useAppStore.getState().activeApp).toBe('userfeedback');
    expect(useUserFeedbackStore.getState().returnApp).toBe('kanban');

    emitAnswered('questionnaire-1');

    expect(useAppStore.getState().activeApp).toBe('kanban');
    expect(useAppStore.getState().pendingApp).toBeNull();
    expect(useUserFeedbackStore.getState().returnApp).toBeNull();
    expect(useUserFeedbackStore.getState().pending.size).toBe(0);
  });

  it('keeps the feedback app open until the last multi-step prompt is resolved', () => {
    emitQuestion(createQuestion('questionnaire-1', 'questionnaire'));
    emitQuestion(createQuestion('interview-1', 'interview'));

    emitAnswered('questionnaire-1');

    expect(useAppStore.getState().activeApp).toBe('userfeedback');
    expect(useUserFeedbackStore.getState().returnApp).toBe('kanban');
    expect(useUserFeedbackStore.getState().pending.size).toBe(1);

    emitCancel('interview-1');

    expect(useAppStore.getState().activeApp).toBe('kanban');
    expect(useUserFeedbackStore.getState().returnApp).toBeNull();
    expect(useUserFeedbackStore.getState().pending.size).toBe(0);
  });

  it('returns to the latest originating app when feedback is reopened from a notice', () => {
    emitQuestion(createQuestion('questionnaire-1'));

    useAppStore.getState().setActiveApp('explorer');
    expect(useAppStore.getState().activeApp).toBe('explorer');

    useUserFeedbackStore.getState().openFeedbackApp();

    expect(useAppStore.getState().activeApp).toBe('userfeedback');
    expect(useUserFeedbackStore.getState().returnApp).toBe('explorer');

    emitAnswered('questionnaire-1');

    expect(useAppStore.getState().activeApp).toBe('explorer');
    expect(useUserFeedbackStore.getState().returnApp).toBeNull();
  });

  it('cancels an in-flight switch if feedback resolves before the remote app finishes preloading', async () => {
    setApps(createManifest('userfeedback'));

    emitQuestion(createQuestion('questionnaire-1'));

    expect(useAppStore.getState().activeApp).toBe('kanban');
    expect(useAppStore.getState().pendingApp).toBe('userfeedback');

    emitAnswered('questionnaire-1');

    expect(useAppStore.getState().activeApp).toBe('kanban');
    expect(useAppStore.getState().pendingApp).toBeNull();
    expect(useUserFeedbackStore.getState().returnApp).toBeNull();

    federationMocks.resolve();
    await federationMocks.wait();

    expect(useAppStore.getState().activeApp).toBe('kanban');
    expect(useAppStore.getState().pendingApp).toBeNull();
  });
});
