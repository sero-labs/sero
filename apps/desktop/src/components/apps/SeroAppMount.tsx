/**
 * SeroAppMount — loads and mounts a federated Sero app.
 *
 * Uses standard dynamic import() for MF remotes declared in the
 * host vite config. Wraps the component in an AppProvider with
 * the correct workspace context.
 */

import { Suspense, lazy, useMemo } from 'react';
import { AppProvider } from '@sero/app-runtime';
import type { AppContextValue } from '@sero/app-runtime';
import type { SeroAppManifest } from '@/types/ipc';
import { useWorkspaceStore } from '@/stores/workspace';

// ── Remote component registry ────────────────────────────────
//
// Maps app IDs to lazy-loaded components via MF import().
// Each remote is declared in vite.config.ts; the import path
// matches the remote name + exposed module.

const remoteComponents: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  todo: lazy(() => import('sero_todo/TodoApp')),
};

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

  // Build the AppProvider context value
  const contextValue = useMemo<AppContextValue>(
    () => ({
      appId: manifest.id,
      workspacePath,
      stateFilePath: workspacePath
        ? `${workspacePath}/${manifest.stateFile}`
        : '',
    }),
    [manifest.id, manifest.stateFile, workspacePath],
  );

  const LazyComponent = remoteComponents[manifest.id];

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
