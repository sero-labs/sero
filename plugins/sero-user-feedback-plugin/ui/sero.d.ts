/**
 * Minimal type declarations for window.sero APIs used by this app.
 *
 * The full window.sero API is typed in apps/desktop/src/types/electron.d.ts.
 * This file only declares the subset needed by this app's UI.
 */

import type {
  UserFeedbackPendingQuestion,
  UserFeedbackResponse,
} from './types';

interface SeroUserFeedbackAPI {
  getPending(): Promise<UserFeedbackPendingQuestion[]>;
  answer(response: UserFeedbackResponse): Promise<void>;
  onQuestion(callback: (data: UserFeedbackPendingQuestion) => void): () => void;
  onCancel(callback: (data: { id: string }) => void): () => void;
}

/** Subset of the profiles API needed for onboarding state. */
interface SeroProfilesAPI {
  needsOnboarding(): Promise<boolean>;
  markOnboardingDone(): Promise<void>;
}

declare global {
  interface Window {
    sero: {
      userFeedback: SeroUserFeedbackAPI;
      profiles: SeroProfilesAPI;
    };
  }
}

export {};
