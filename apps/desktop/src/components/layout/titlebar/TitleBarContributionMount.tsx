/**
 * TitleBarContributionMount, loads and mounts an app's federated title-bar
 * control (declared via `sero.app.titlebar`).
 *
 * The plugin owns the whole control — trigger and popover both. That works
 * because `@sero-ai/ui`'s Popover portals into the container `PluginStyleScope`
 * provides, so the plugin's own popover stays inside its style scope instead of
 * landing unscoped on `document.body`.
 *
 * Renders nothing while loading or on failure: the title bar is chrome, and an
 * error message wedged between the window controls is worse than a gap.
 */

import { Suspense, useId } from 'react';
import { AppProvider } from '@sero-ai/app-runtime';
import { PluginStyleScope } from '@sero-ai/ui/plugin-style-scope';
import type { SeroAppManifest } from '@/types/ipc';
import { getFederatedComponent } from '@/lib/federation-registry';
import { useAppRuntimeMount } from '@/components/apps/useAppRuntimeMount';

export function TitleBarContributionMount({ manifest }: { manifest: SeroAppManifest }) {
  const { contextValue, status } = useAppRuntimeMount(manifest);
  const surfaceId = useId();

  if (status !== 'ready' || !manifest.titlebar) return null;

  const LazyComponent = getFederatedComponent(
    manifest.id,
    manifest.titlebar.component,
    manifest.devPort,
    manifest.remoteEntryOverride,
  );
  if (!LazyComponent) return null;

  return (
    <AppProvider value={contextValue}>
      <PluginStyleScope pluginId={manifest.id} surfaceId={surfaceId}>
        <div data-sero-plugin={manifest.id} className="contents">
          <Suspense fallback={null}>
            <LazyComponent />
          </Suspense>
        </div>
      </PluginStyleScope>
    </AppProvider>
  );
}
