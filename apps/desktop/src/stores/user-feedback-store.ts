/**
 * Zustand store for user-feedback pending questions.
 *
 * Listens for question/cancel IPC events from the main process and holds
 * pending questions so ChatPanel and the UserFeedbackApp can render them.
 *
 * Clearing is driven by a DOM CustomEvent ('sero:user-feedback:answered')
 * dispatched synchronously in the preload's answer() method. This ensures
 * the store clears immediately regardless of which component sent the answer
 * (host Zustand store, federated app UI, etc.) — no IPC round-trip needed.
 */

import { create } from 'zustand';
import type {
  UserFeedbackPendingQuestion,
  UserFeedbackResponse,
  UserFeedbackAnswer,
} from '@/types/ipc';
import { useAppStore } from '@/stores/app';

const USER_FEEDBACK_APP_ID = 'userfeedback';

interface UserFeedbackState {
  /** Currently pending questions (keyed by id for quick lookup). */
  pending: Map<string, UserFeedbackPendingQuestion>;

  /** App to restore once the current multi-step feedback flow is complete. */
  returnApp: string | null;

  /** Get the first pending question of a given type (or any). */
  getPending(type?: 'question' | 'questionnaire' | 'interview' | 'permission'): UserFeedbackPendingQuestion | null;

  /** Open the dedicated User Feedback app and remember where to return. */
  openFeedbackApp(): void;

  /** Submit an answer to a pending question. Removes it from pending. */
  answer(id: string, answers: UserFeedbackAnswer[]): Promise<void>;

  /** Cancel a pending question. Removes it from pending. */
  cancel(id: string): Promise<void>;

  /** Initialize IPC listeners. Call once on mount. Returns cleanup fn. */
  initListeners(): () => void;
}

function isMultiStepQuestion(
  question: UserFeedbackPendingQuestion,
): boolean {
  return question.type === 'questionnaire' || question.type === 'interview';
}

function hasPendingMultiStepQuestions(
  pending: Map<string, UserFeedbackPendingQuestion>,
): boolean {
  for (const question of pending.values()) {
    if (isMultiStepQuestion(question)) return true;
  }
  return false;
}

export const useUserFeedbackStore = create<UserFeedbackState>((set, get) => {
  const maybeRestoreReturnApp = () => {
    const { pending, returnApp } = get();
    if (hasPendingMultiStepQuestions(pending)) return;
    if (!returnApp) return;

    const appStore = useAppStore.getState();
    const shouldExitFeedbackApp =
      appStore.activeApp === USER_FEEDBACK_APP_ID
      || appStore.pendingApp === USER_FEEDBACK_APP_ID;

    set({ returnApp: null });

    if (!shouldExitFeedbackApp) return;
    if (!appStore.apps.some((app) => app.id === returnApp)) return;

    appStore.setActiveApp(returnApp);
  };

  const clearPending = (id: string) => {
    let removed = false;
    set((state) => {
      if (!state.pending.has(id)) return state;
      removed = true;
      const next = new Map(state.pending);
      next.delete(id);
      return { pending: next };
    });
    if (removed) maybeRestoreReturnApp();
  };

  // Ref-counted IPC subscription so multiple callers (App root, ChatPanel,
  // OrchestrationPanel) share a single set of listeners. The real listeners are
  // created on the first init and torn down when the last caller unsubscribes;
  // the always-mounted App-root caller keeps them alive for the app's lifetime.
  let listenerRefCount = 0;
  let teardownListeners: (() => void) | null = null;

  return {
    pending: new Map(),
    returnApp: null,

    getPending(type) {
      const { pending } = get();
      for (const q of pending.values()) {
        if (!type || q.type === type) return q;
      }
      return null;
    },

    openFeedbackApp() {
      const appStore = useAppStore.getState();
      const returnTarget =
        appStore.pendingApp && appStore.pendingApp !== USER_FEEDBACK_APP_ID
          ? appStore.pendingApp
          : appStore.activeApp;

      if (returnTarget !== USER_FEEDBACK_APP_ID) {
        set({ returnApp: returnTarget });
      }
      appStore.setActiveApp(USER_FEEDBACK_APP_ID);
    },

    async answer(id, answers) {
      const response: UserFeedbackResponse = { id, answers, cancelled: false };
      // The preload's answer() fires a DOM event that clears all stores synchronously.
      await window.sero.userFeedback.answer(response);
    },

    async cancel(id) {
      const response: UserFeedbackResponse = { id, answers: [], cancelled: true };
      await window.sero.userFeedback.answer(response);
    },

    initListeners() {
      listenerRefCount += 1;
      if (listenerRefCount === 1) {
        // New question arrived from an extension tool — add to pending.
        // Only multi-step forms switch to the User Feedback app; single
        // questions and permission prompts stay in the chat panel.
        const unsubQuestion = window.sero.userFeedback.onQuestion((data) => {
          set((state) => {
            const next = new Map(state.pending);
            next.set(data.id, data);
            return { pending: next };
          });
          if (isMultiStepQuestion(data)) {
            get().openFeedbackApp();
          }
        });

        // Main process cancelled a question (e.g. tool aborted)
        const unsubCancel = window.sero.userFeedback.onCancel((data) => {
          clearPending(data.id);
        });

        // DOM event: any call to window.sero.userFeedback.answer() fires this
        // synchronously, so the store clears even if the answer came from the
        // federated UserFeedbackApp (which doesn't use this Zustand store).
        const onAnswered = (e: Event) => {
          const { id } = (e as CustomEvent<{ id: string }>).detail;
          clearPending(id);
        };
        window.addEventListener('sero:user-feedback:answered', onAnswered);

        teardownListeners = () => {
          unsubQuestion();
          unsubCancel();
          window.removeEventListener('sero:user-feedback:answered', onAnswered);
        };
      }

      return () => {
        listenerRefCount -= 1;
        if (listenerRefCount === 0 && teardownListeners) {
          teardownListeners();
          teardownListeners = null;
        }
      };
    },
  };
});
