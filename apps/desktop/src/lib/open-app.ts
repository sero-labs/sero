import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import { useAppStore } from '@/stores/app';
import { isManifestHostSupported } from '@/stores/app/shared';
import { useNavigationStore, type NavEntry } from '@/stores/navigation';

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
  return entry !== undefined && (entry.builtin || isManifestHostSupported(entry.manifest));
}

// History entries can go stale (e.g. a plugin uninstalled mid-session);
// activating one would no-op in setActiveApp and desync the cursor from
// the visible app, so skip past them.
function navigate(step: () => NavEntry | null): void {
  let entry = step();
  while (entry && !canActivate(entry.appId)) entry = step();
  if (entry) useAppStore.getState().setActiveApp(entry.appId, { skipHistory: true });
}

/** Go back in navigation history (title-bar button, ⌘[, mouse button 4). */
export function navigateBack(): void {
  navigate(() => useNavigationStore.getState().back());
}

/** Go forward in navigation history (title-bar button, ⌘], mouse button 5). */
export function navigateForward(): void {
  navigate(() => useNavigationStore.getState().forward());
}
