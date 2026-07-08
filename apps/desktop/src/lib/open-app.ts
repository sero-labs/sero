import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import { useAppStore } from '@/stores/app';
import { useNavigationStore } from '@/stores/navigation';

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

/** Go back in navigation history (title-bar button, ⌘[, mouse button 4). */
export function navigateBack(): void {
  const entry = useNavigationStore.getState().back();
  if (entry) useAppStore.getState().setActiveApp(entry.appId, { skipHistory: true });
}

/** Go forward in navigation history (title-bar button, ⌘], mouse button 5). */
export function navigateForward(): void {
  const entry = useNavigationStore.getState().forward();
  if (entry) useAppStore.getState().setActiveApp(entry.appId, { skipHistory: true });
}
