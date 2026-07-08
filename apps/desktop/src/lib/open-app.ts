import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import { useAppStore } from '@/stores/app';
import { isAppEntrySupported } from '@/stores/app/shared';
import {
  findNavigationTarget,
  useNavigationStore,
  type NavigationDirection,
} from '@/stores/navigation';

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

function canActivate(appId: string): boolean {
  const entry = useAppStore.getState().apps.find((app) => app.id === appId);
  return entry !== undefined && isAppEntrySupported(entry);
}

function navigate(direction: NavigationDirection): void {
  const { entries, index } = useNavigationStore.getState();
  const target = findNavigationTarget(
    entries,
    index,
    direction,
    (entry) => canActivate(entry.appId),
  );
  if (!target) return;

  useNavigationStore.setState({ index: target.index });
  useAppStore.getState().setActiveApp(target.entry.appId, { skipHistory: true });
}

/** Go back in navigation history (title-bar button, ⌘[, mouse button 4). */
export function navigateBack(): void {
  navigate(-1);
}

/** Go forward in navigation history (title-bar button, ⌘], mouse button 5). */
export function navigateForward(): void {
  navigate(1);
}
