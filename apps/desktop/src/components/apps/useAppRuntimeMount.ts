import { useCallback, useMemo } from 'react';
import type { AppContextValue, AppProfilePreferenceValue } from '@sero-ai/app-runtime';
import type { SeroAppManifest } from '@/types/ipc';
import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';
import { useSessionStore } from '@/stores/sessions';
import { useNavigationStore } from '@/stores/navigation';
import { useThemeStore } from '@/stores/theme';
import { useWorkspaceStore } from '@/stores/workspace';

export type AppRuntimeMountStatus = 'ready' | 'loading-workspace' | 'missing-workspace';

const EMPTY_APP_PREFERENCES: Readonly<Record<string, AppProfilePreferenceValue>> = {};

function findTargetSession(targetWorkspaceId: string) {
  const sessionStore = useSessionStore.getState();
  const activeSession = sessionStore.activeSessionId
    ? sessionStore.sessions.find((session) => session.id === sessionStore.activeSessionId) ?? null
    : null;

  if (activeSession?.workspaceId === targetWorkspaceId) {
    return activeSession;
  }

  return sessionStore.sessions.find((session) => session.workspaceId === targetWorkspaceId) ?? null;
}

/**
 * Guarantees a session is created, opened in the agent pool, and the
 * chat panel is visible before sending the prompt. Called fire-and-forget
 * from the promptAgent callback so apps never need to worry about
 * session lifecycle.
 */
async function ensureSessionReadyAndPrompt(text: string): Promise<boolean> {
  const targetWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? 'global';
  const sessionStore = useSessionStore.getState();

  let session = findTargetSession(targetWorkspaceId);

  if (!session) {
    try {
      session = await sessionStore.createSession(targetWorkspaceId);
    } catch (err) {
      console.error('[app-runtime-mount] Failed to create session:', err);
      return false;
    }
  }

  if (sessionStore.activeSessionId !== session.id) {
    sessionStore.setActiveSession(session.id);
  }

  // Always await the shared openSession action. It deduplicates concurrent
  // opens and guarantees the main-process pool entry exists before prompting.
  await useAgentStore.getState().openSession(session.id, session.path, session.workspaceId);

  // `openSession()` currently logs and absorbs failures instead of throwing, so
  // verify that the session is actually present in the agent store before we
  // reveal the chat panel or send the prompt.
  const openedSession = useAgentStore.getState().agents[session.id];
  if (!openedSession?.sessionId) {
    console.error('[app-runtime-mount] Failed to open session:', session.id);
    return false;
  }

  // Show the chat panel so the user sees the response.
  if (!useAppStore.getState().chatPanelOpen) {
    useAppStore.getState().setChatPanelOpen(true);
  }

  // Send via the agent store (handles optimistic UI + error state).
  await useAgentStore.getState().sendPrompt(session.id, text);
  return true;
}

interface AppRuntimeMountResult {
  contextValue: AppContextValue;
  status: AppRuntimeMountStatus;
}

/**
 * Shared app/widget runtime wiring for federated surfaces.
 *
 * Builds the AppProvider context and standardises workspace-hydration
 * semantics so full apps and dashboard widgets behave the same way.
 */
export function useAppRuntimeMount(manifest: SeroAppManifest): AppRuntimeMountResult {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspacesReady = useWorkspaceStore((state) => state.workspacesReady);
  // Select the resolved path (a string) rather than the workspaces array:
  // the array is replaced wholesale on unrelated updates (expand/collapse,
  // reloads), which would re-render every mounted app and widget.
  const workspacePath = useWorkspaceStore(
    (state) => state.workspaces.find((entry) => entry.id === state.activeWorkspaceId)?.path ?? '',
  );
  const effectiveMode = useThemeStore((state) => state.effectiveMode);
  const activePresetId = useThemeStore((state) => state.activePresetId);
  const editorThemeId = useAppStore((state) => state.editorThemeId);
  const appPreferenceValues = useAppStore(
    (state) => state.appPreferences[manifest.id] ?? EMPTY_APP_PREFERENCES,
  );
  const isGlobal = manifest.scope === 'global';
  const navigationWorkspaceId = isGlobal ? undefined : activeWorkspaceId ?? undefined;
  const navigationScopeId = navigationWorkspaceId ?? 'global';
  const savedViewId = useAppStore((state) => state.appViewIds[manifest.id]?.[navigationScopeId]);
  const navigationViewId = useNavigationStore((state) => {
    const entry = state.entries[state.index];
    return entry?.appId === manifest.id && entry.workspaceId === navigationWorkspaceId
      ? entry.viewId
      : undefined;
  });

  // Prompt function injected into context — ensures a session exists,
  // opens it in the agent pool, reveals the chat panel, then sends.
  const promptAgent = useCallback((text: string) => {
    void ensureSessionReadyAndPrompt(text);
  }, []);

  const navigate = useCallback((viewId: string, options?: { replace?: boolean }) => {
    useAppStore.getState().setAppView(manifest.id, navigationScopeId, viewId, {
      workspaceId: navigationWorkspaceId,
      replaceHistory: options?.replace,
    });
  }, [manifest.id, navigationScopeId, navigationWorkspaceId]);

  const navigation = useMemo(() => ({
    viewId: navigationViewId ?? savedViewId,
    navigate,
  }), [navigationViewId, savedViewId, navigate]);

  const setProfilePreference = useCallback((key: string, value: AppProfilePreferenceValue) => {
    useAppStore.getState().setAppPreference(manifest.id, key, value);
  }, [manifest.id]);

  const profilePreferences = useMemo(() => ({
    values: appPreferenceValues,
    set: setProfilePreference,
  }), [appPreferenceValues, setProfilePreference]);

  // Resolve state file path based on scope.
  const stateFilePath = isGlobal
    ? manifest.globalStatePath ?? ''
    : workspacePath ? `${workspacePath}/${manifest.stateFile}` : '';

  const status: AppRuntimeMountStatus = isGlobal
    ? 'ready'
    : !workspacesReady
      ? 'loading-workspace'
      : workspacePath
        ? 'ready'
        : 'missing-workspace';

  const contextValue = useMemo<AppContextValue>(
    () => ({
      appId: manifest.id,
      workspaceId: isGlobal ? (activeWorkspaceId ?? 'global') : (activeWorkspaceId ?? ''),
      workspacePath,
      stateFilePath,
      promptAgent,
      themeMode: effectiveMode,
      themePresetId: activePresetId,
      editorThemeId,
      navigation,
      profilePreferences,
    }),
    [manifest.id, isGlobal, activeWorkspaceId, workspacePath, stateFilePath, promptAgent, effectiveMode, activePresetId, editorThemeId, navigation, profilePreferences],
  );

  return { contextValue, status };
}
