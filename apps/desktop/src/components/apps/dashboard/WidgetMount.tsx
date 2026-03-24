/**
 * WidgetMount — loads and mounts a federated widget component.
 *
 * Similar to SeroAppMount but for widget-sized components. Wraps the
 * federated component in AppProvider so widgets have full access to
 * useAppState, useAgentPrompt, and other app-runtime hooks.
 */

import { memo, Suspense, useMemo, useCallback } from 'react';
import { AppProvider } from '@sero-ai/app-runtime';
import type { AppContextValue } from '@sero-ai/app-runtime';
import type { SeroAppManifest } from '@/types/ipc';
import type { AvailableWidget, DashboardWidgetInstance } from '@/types/dashboard';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';
import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import { getFederatedComponent } from '@/lib/federation-registry';
import { Spinner } from '@sero/ui/components/ui/spinner';

// ── Ensure-session-and-prompt (shared pattern) ──────────────────

async function ensureSessionAndPrompt(text: string) {
  const sessionStore = useSessionStore.getState();
  const targetWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId || 'global';

  let sessionId = sessionStore.activeSessionId;
  let session = sessionId
    ? sessionStore.sessions.find((s) => s.id === sessionId)
    : null;

  if (!session || session.workspaceId !== targetWorkspaceId) {
    session = sessionStore.sessions.find((s) => s.workspaceId === targetWorkspaceId) ?? null;
    sessionId = session?.id ?? null;
  }

  if (!sessionId || !session) {
    try {
      session = await sessionStore.createSession(targetWorkspaceId);
      sessionId = session.id;
    } catch (err) {
      console.error('[WidgetMount] Failed to create session:', err);
      return;
    }
  }

  if (sessionStore.activeSessionId !== sessionId) {
    sessionStore.setActiveSession(sessionId);
  }

  try {
    await useAgentStore.getState().openSession(sessionId, session.path, session.workspaceId);
  } catch (err) {
    console.error('[WidgetMount] Failed to open session:', err);
    return;
  }

  if (!useAppStore.getState().chatPanelOpen) {
    useAppStore.getState().setChatPanelOpen(true);
  }

  useAgentStore.getState().sendPrompt(sessionId, text);
}

// ── Props ────────────────────────────────────────────────────────

interface WidgetMountProps {
  widget: DashboardWidgetInstance;
  manifest: SeroAppManifest;
  widgetMeta: AvailableWidget | null;
}

// ── Component ────────────────────────────────────────────────────

/**
 * Memoised so that parent re-renders during grid drag/resize (which
 * only change style/className on DashboardWidget) don't cascade into
 * the expensive federated widget render tree.
 */
export const WidgetMount = memo(function WidgetMount({ widget, manifest, widgetMeta }: WidgetMountProps) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const effectiveMode = useThemeStore((s) => s.effectiveMode);
  const activePresetId = useThemeStore((s) => s.activePresetId);

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const workspacePath = workspace?.path ?? '';

  const promptAgent = useCallback((text: string) => {
    void ensureSessionAndPrompt(text);
  }, []);

  const isGlobal = manifest.scope === 'global';
  const stateFilePath = isGlobal
    ? manifest.globalStatePath ?? ''
    : workspacePath ? `${workspacePath}/${manifest.stateFile}` : '';

  const contextValue = useMemo<AppContextValue>(
    () => ({
      appId: manifest.id,
      workspaceId: isGlobal ? (activeWorkspaceId || 'global') : (activeWorkspaceId ?? ''),
      workspacePath,
      stateFilePath,
      promptAgent,
      themeMode: effectiveMode,
      themePresetId: activePresetId,
    }),
    [manifest.id, activeWorkspaceId, stateFilePath, workspacePath, promptAgent, effectiveMode, activePresetId],
  );

  // Workspace-scoped widgets show a placeholder when no workspace is active
  if (!isGlobal && !workspacePath) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
        No workspace selected
      </div>
    );
  }

  if (widget.source === 'runtime') {
    const RuntimeComponent = widgetMeta?.runtimeComponent;
    if (!RuntimeComponent) {
      return (
        <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
          Widget unavailable
        </div>
      );
    }
    return (
      <AppProvider value={contextValue}>
        <RuntimeComponent />
      </AppProvider>
    );
  }

  const LazyComponent = getFederatedComponent(manifest.id, widget.component, manifest.devPort);
  if (!LazyComponent) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
        Widget unavailable
      </div>
    );
  }

  return (
    <AppProvider value={contextValue}>
      <Suspense fallback={<WidgetLoading />}>
        <LazyComponent />
      </Suspense>
    </AppProvider>
  );
});

function WidgetLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-4 text-[var(--text-muted)]" />
    </div>
  );
}
