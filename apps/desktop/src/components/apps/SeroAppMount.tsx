/**
 * SeroAppMount — loads and mounts a federated Sero app.
 *
 * Resolves the lazy component from the federated remote registry
 * (src/lib/federation-registry.ts) based on the manifest's app ID.
 * Wraps in AppProvider with workspace context + agent prompt bridge.
 */

import { Suspense, useMemo, useCallback } from 'react';
import { AppProvider } from '@sero/app-runtime';
import type { AppContextValue } from '@sero/app-runtime';
import type { SeroAppManifest } from '@/types/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionStore } from '@/stores/sessions';
import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import { getFederatedComponent } from '@/lib/federation-registry';
import { Spinner } from '@sero/ui/components/ui/spinner';

// ── Ensure-session-and-prompt helper ─────────────────────────

/**
 * Guarantees a session is created, opened in the agent pool, and the
 * chat panel is visible before sending the prompt. Called fire-and-forget
 * from the promptAgent callback so apps never need to worry about
 * session lifecycle.
 */
async function ensureSessionAndPrompt(text: string) {
  const sessionStore = useSessionStore.getState();
  const targetWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId || 'global';

  let sessionId = sessionStore.activeSessionId;
  let session = sessionId
    ? sessionStore.sessions.find((entry) => entry.id === sessionId)
    : null;

  if (!session || session.workspaceId !== targetWorkspaceId) {
    session = sessionStore.sessions.find((entry) => entry.workspaceId === targetWorkspaceId) ?? null;
    sessionId = session?.id ?? null;
  }

  if (!sessionId || !session) {
    try {
      session = await sessionStore.createSession(targetWorkspaceId);
      sessionId = session.id;
    } catch (err) {
      console.error('[SeroAppMount] Failed to create session:', err);
      return;
    }
  }

  if (sessionStore.activeSessionId !== sessionId) {
    sessionStore.setActiveSession(sessionId);
  }

  // Always await the shared openSession action. It deduplicates concurrent
  // opens and guarantees the main-process pool entry exists before prompting.
  try {
    await useAgentStore.getState().openSession(sessionId, session.path, session.workspaceId);
  } catch (err) {
    console.error('[SeroAppMount] Failed to open session:', err);
    return;
  }

  // Show the chat panel so the user sees the response
  if (!useAppStore.getState().chatPanelOpen) {
    useAppStore.getState().setChatPanelOpen(true);
  }

  // Send via the agent store (handles optimistic UI + error state)
  useAgentStore.getState().sendPrompt(sessionId, text);
}

// ── Props ────────────────────────────────────────────────────

interface SeroAppMountProps {
  manifest: SeroAppManifest;
}

// ── Component ────────────────────────────────────────────────

export function SeroAppMount({ manifest }: SeroAppMountProps) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspacesReady = useWorkspaceStore((s) => s.workspacesReady);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const effectiveMode = useThemeStore((s) => s.effectiveMode);
  const activePresetId = useThemeStore((s) => s.activePresetId);

  // Resolve workspace path
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const workspacePath = workspace?.path ?? '';

  // Prompt function injected into context — ensures a session exists,
  // opens it in the agent pool, reveals the chat panel, then sends.
  const promptAgent = useCallback((text: string) => {
    void ensureSessionAndPrompt(text);
  }, []);

  // Resolve state file path based on scope
  const isGlobal = manifest.scope === 'global';
  const stateFilePath = isGlobal
    ? manifest.globalStatePath ?? ''
    : workspacePath ? `${workspacePath}/${manifest.stateFile}` : '';

  // Build the AppProvider context value
  const contextValue = useMemo<AppContextValue>(
    () => ({
      appId: manifest.id,
      // Global apps use 'global' as a stable key when no workspace is selected.
      // Workspace-scoped apps are guarded by the `!isGlobal && !workspacePath`
      // check below — they never render without an activeWorkspaceId.
      workspaceId: isGlobal ? (activeWorkspaceId || 'global') : activeWorkspaceId!,
      workspacePath,
      stateFilePath,
      promptAgent,
      themeMode: effectiveMode,
      themePresetId: activePresetId,
    }),
    [manifest.id, activeWorkspaceId, stateFilePath, workspacePath, promptAgent, effectiveMode, activePresetId],
  );

  // Workspace-scoped apps need an active workspace; global apps don't
  if (!isGlobal && !workspacesReady) {
    return <AppLoading name={manifest.name} />;
  }
  if (!isGlobal && !workspacePath) {
    return <AppPlaceholder name={manifest.name} reason="No workspace selected" />;
  }

  const LazyComponent = getFederatedComponent(manifest.id, manifest.component, manifest.devPort);

  if (!LazyComponent) {
    return <AppPlaceholder name={manifest.name} reason="No UI module registered" />;
  }

  return (
    <AppProvider value={contextValue}>
      <div data-app={manifest.id} className="contents">
        <Suspense fallback={<AppLoading name={manifest.name} />}>
          <LazyComponent />
        </Suspense>
      </div>
    </AppProvider>
  );
}

// ── Fallback states ──────────────────────────────────────────

function AppPlaceholder({ name, reason }: { name: string; reason: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--bg-base)]">
      <span className="text-sm font-medium text-[var(--text-secondary)]">
        {name}
      </span>
      <span className="mt-1 text-xs text-[var(--text-muted)]">{reason}</span>
    </div>
  );
}

function AppLoading({ name }: { name: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--bg-base)]">
      <Spinner className="size-5 text-[var(--status-success)]" />
      <span className="text-sm text-[var(--text-muted)]">
        Loading {name}
      </span>
    </div>
  );
}
