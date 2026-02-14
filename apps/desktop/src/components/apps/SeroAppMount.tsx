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
import { getFederatedComponent } from '@/lib/federation-registry';

// ── Props ────────────────────────────────────────────────────

interface SeroAppMountProps {
  manifest: SeroAppManifest;
}

// ── Component ────────────────────────────────────────────────

export function SeroAppMount({ manifest }: SeroAppMountProps) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  // Resolve workspace path
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const workspacePath = workspace?.path ?? '';

  // Prompt function injected into context — reads active session from Zustand
  const promptAgent = useCallback((text: string) => {
    const sessionId = useSessionStore.getState().activeSessionId;
    if (!sessionId) {
      console.warn('[SeroAppMount] No active session — prompt dropped');
      return;
    }
    window.sero.agent.prompt(sessionId, text).catch((err: unknown) => {
      console.error('[SeroAppMount] Failed to send prompt:', err);
    });
  }, []);

  // Build the AppProvider context value
  const contextValue = useMemo<AppContextValue>(
    () => ({
      appId: manifest.id,
      workspaceId: activeWorkspaceId ?? '',
      workspacePath,
      stateFilePath: workspacePath
        ? `${workspacePath}/${manifest.stateFile}`
        : '',
      promptAgent,
    }),
    [manifest.id, activeWorkspaceId, manifest.stateFile, workspacePath, promptAgent],
  );

  const LazyComponent = getFederatedComponent(manifest.id);

  if (!LazyComponent) {
    return <AppPlaceholder name={manifest.name} reason="No UI module registered" />;
  }

  if (!workspacePath) {
    return <AppPlaceholder name={manifest.name} reason="No workspace selected" />;
  }

  return (
    <AppProvider value={contextValue}>
      <Suspense fallback={<AppLoading name={manifest.name} />}>
        <LazyComponent />
      </Suspense>
    </AppProvider>
  );
}

// ── Fallback states ──────────────────────────────────────────

function AppPlaceholder({ name, reason }: { name: string; reason: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-[var(--bg-base)]">
      <span className="text-sm font-medium text-[var(--text-secondary)]">
        {name}
      </span>
      <span className="mt-1 text-xs text-[var(--text-muted)]">{reason}</span>
    </div>
  );
}

function AppLoading({ name }: { name: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--bg-base)]">
      <span className="text-xs text-[var(--text-muted)]">
        Loading {name}…
      </span>
    </div>
  );
}
