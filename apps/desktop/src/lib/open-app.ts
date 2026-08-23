import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import { useAppStore } from '@/stores/app';
import { useWorkspaceStore } from '@/stores/workspace';
import { isAppEntrySupported } from '@/stores/app/shared';
import {
  findNavigationTarget,
  useNavigationStore,
  type NavEntry,
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

function canActivate(
  target: NavEntry,
  appIds: Set<string>,
  workspaceIds: Set<string>,
): boolean {
  return appIds.has(target.appId) && (!target.workspaceId || workspaceIds.has(target.workspaceId));
}

function navigate(direction: NavigationDirection): void {
  const { entries, index } = useNavigationStore.getState();
  const appIds = new Set<string>();
  for (const app of useAppStore.getState().apps) {
    if (isAppEntrySupported(app)) appIds.add(app.id);
  }
  const workspaceIds = new Set(
    useWorkspaceStore.getState().workspaces.map((workspace) => workspace.id),
  );
  const target = findNavigationTarget(
    entries,
    index,
    direction,
    (entry) => canActivate(entry, appIds, workspaceIds),
  );
  if (!target) return;

  useNavigationStore.setState({ index: target.index });
  if (target.entry.workspaceId
    && target.entry.workspaceId !== useWorkspaceStore.getState().activeWorkspaceId) {
    useWorkspaceStore.getState().setActiveWorkspace(target.entry.workspaceId);
    // Sidebar workspace sync uses the latest route; history must keep its
    // exact older route instead.
    useNavigationStore.getState().replaceCurrent(target.entry);
  }
  if (target.entry.viewId) {
    useAppStore.getState().setAppView(
      target.entry.appId,
      target.entry.workspaceId ?? 'global',
      target.entry.viewId,
      { skipHistory: true, workspaceId: target.entry.workspaceId },
    );
  }
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
