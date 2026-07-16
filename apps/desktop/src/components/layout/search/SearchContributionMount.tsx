/**
 * SearchContributionMount, loads and mounts an app's federated global-search
 * panel (declared via `sero.app.search`).
 *
 * Mirrors WidgetMount: wraps the federated component in AppProvider so the
 * panel has full access to useAppState, useAppTools, and the other
 * app-runtime hooks — the search logic itself stays inside the plugin.
 */

import { Suspense } from 'react';
import { AppProvider } from '@sero-ai/app-runtime';
import type { SeroAppManifest } from '@/types/ipc';
import { getFederatedComponent } from '@/lib/federation-registry';
import { Spinner } from '@sero-ai/ui/components/ui/spinner';
import { useAppRuntimeMount } from '@/components/apps/useAppRuntimeMount';

export function SearchContributionMount({ manifest }: { manifest: SeroAppManifest }) {
  const { contextValue, status } = useAppRuntimeMount(manifest);

  if (status === 'loading-workspace') {
    return <SearchPanelLoading />;
  }

  if (status === 'missing-workspace') {
    return <SearchPanelFallback message="No workspace selected" />;
  }

  const LazyComponent = manifest.search
    ? getFederatedComponent(
        manifest.id,
        manifest.search.component,
        manifest.devPort,
        manifest.remoteEntryOverride,
      )
    : null;
  if (!LazyComponent) {
    return <SearchPanelFallback message="Search panel unavailable" />;
  }

  return (
    <AppProvider value={contextValue}>
      <Suspense fallback={<SearchPanelLoading />}>
        <LazyComponent />
      </Suspense>
    </AppProvider>
  );
}

function SearchPanelFallback({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
      {message}
    </div>
  );
}

function SearchPanelLoading() {
  return (
    <div role="status" className="flex h-full items-center justify-center gap-2">
      <Spinner className="size-4 text-[var(--text-muted)]" />
      <span className="text-xs text-[var(--text-muted)]">Loading search</span>
    </div>
  );
}
