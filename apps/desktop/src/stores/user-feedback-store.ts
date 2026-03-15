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

interface UserFeedbackState {
  /** Currently pending questions (keyed by id for quick lookup). */
  pending: Map<string, UserFeedbackPendingQuestion>;

  /** Get the first pending question of a given type (or any). */
  getPending(type?: 'question' | 'questionnaire' | 'interview' | 'permission'): UserFeedbackPendingQuestion | null;

  /** Submit an answer to a pending question. Removes it from pending. */
  answer(id: string, answers: UserFeedbackAnswer[]): Promise<void>;

  /** Cancel a pending question. Removes it from pending. */
  cancel(id: string): Promise<void>;

  /** Initialize IPC listeners. Call once on mount. Returns cleanup fn. */
  initListeners(): () => void;
}

function removePending(state: UserFeedbackState, id: string) {
  const next = new Map(state.pending);
  next.delete(id);
  return { pending: next };
}

export const useUserFeedbackStore = create<UserFeedbackState>((set, get) => ({
  pending: new Map(),

  getPending(type) {
    const { pending } = get();
    for (const q of pending.values()) {
      if (!type || q.type === type) return q;
    }
    return null;
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
    // New question arrived from an extension tool — add to pending.
    // Only multi-step forms switch to the User Feedback app; single
    // questions and permission prompts stay in the chat panel.
    const unsubQuestion = window.sero.userFeedback.onQuestion((data) => {
      set((state) => {
        const next = new Map(state.pending);
        next.set(data.id, data);
        return { pending: next };
      });
      if (data.type === 'questionnaire' || data.type === 'interview') {
        useAppStore.getState().setActiveApp('userfeedback');
      }
    });

    // Main process cancelled a question (e.g. tool aborted)
    const unsubCancel = window.sero.userFeedback.onCancel((data) => {
      set((state) => removePending(state, data.id));
    });

    // DOM event: any call to window.sero.userFeedback.answer() fires this
    // synchronously, so the store clears even if the answer came from the
    // federated UserFeedbackApp (which doesn't use this Zustand store).
    const onAnswered = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      set((state) => removePending(state, id));
    };
    window.addEventListener('sero:user-feedback:answered', onAnswered);

    return () => {
      unsubQuestion();
      unsubCancel();
      window.removeEventListener('sero:user-feedback:answered', onAnswered);
    };
  },
}));
