/**
 * ExplorerViewMount, loads and mounts an app's federated Explorer view
 * (declared via `sero.app.explorerView`).
 *
 * Mirrors SearchContributionMount: the host contributes the slot, the plugin
 * contributes what goes in it (AD-025). A contributed view fills the whole
 * Explorer area — the host sidebar is hidden while one is active — and it
 * unmounts when you switch away, so the plugin keeps its own view state.
 */

import { Suspense, useId } from 'react';
import { AppProvider } from '@sero-ai/app-runtime';
import { PluginStyleScope } from '@sero-ai/ui/plugin-style-scope';
import { Spinner } from '@sero-ai/ui/components/ui/spinner';
import type { SeroAppManifest } from '@/types/ipc';
import { getFederatedComponent } from '@/lib/federation-registry';
import { useAppRuntimeMount } from '@/components/apps/useAppRuntimeMount';

export function ExplorerViewMount({ manifest }: { manifest: SeroAppManifest }) {
  const { contextValue, status } = useAppRuntimeMount(manifest);
  const surfaceId = useId();

  if (status === 'loading-workspace') {
    return <ExplorerViewLoading />;
  }

  if (status === 'missing-workspace') {
    return <ExplorerViewMessage message="No workspace selected" />;
  }

  const LazyComponent = manifest.explorerView
    ? getFederatedComponent(
        manifest.id,
        manifest.explorerView.component,
        manifest.devPort,
        manifest.remoteEntryOverride,
      )
    : null;
  if (!LazyComponent) {
    return <ExplorerViewMessage message={`${manifest.name} view unavailable`} />;
  }

  return (
    <AppProvider value={contextValue}>
      <PluginStyleScope pluginId={manifest.id} surfaceId={surfaceId}>
        <div data-sero-plugin={manifest.id} className="contents">
          <Suspense fallback={<ExplorerViewLoading />}>
            <LazyComponent />
          </Suspense>
        </div>
      </PluginStyleScope>
    </AppProvider>
  );
}

/**
 * Shown when the active panel is a contributed view whose plugin isn't
 * installed or is currently unsupported. The panel id is kept either way, so
 * the view returns as soon as the plugin does.
 */
export function ExplorerViewMissing({ panelId }: { panelId: string }) {
  return <ExplorerViewMessage message={`The "${panelId}" view isn't available`} />;
}

function ExplorerViewMessage({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
      {message}
    </div>
  );
}

function ExplorerViewLoading() {
  return (
    <div role="status" className="flex h-full items-center justify-center gap-2">
      <Spinner className="size-4 text-[var(--text-muted)]" />
      <span className="text-xs text-[var(--text-muted)]">Loading view</span>
    </div>
  );
}
