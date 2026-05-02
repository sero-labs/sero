import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import { useAppStore } from '@/stores/app';

const USER_FEEDBACK_APP_ID = 'userfeedback';

/**
 * Open an app from the renderer, preserving user-feedback return navigation.
 */
export function openApp(appId: string): void {
  if (appId === USER_FEEDBACK_APP_ID) {
    useUserFeedbackStore.getState().openFeedbackApp();
    return;
  }

  useAppStore.getState().setActiveApp(appId);
}
