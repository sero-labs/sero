/**
 * SeroAppMount, loads and mounts a federated Sero app.
 *
 * Resolves the lazy component from the federated remote registry
 * (src/lib/federation-registry.ts) based on the manifest's app ID.
 * Wraps in AppProvider with workspace context + agent prompt bridge.
 */

import {
  Component,
  memo,
  Suspense,
  useInsertionEffect,
  useId,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { AppProvider } from '@sero-ai/app-runtime';
import type { SeroAppManifest } from '@/types/ipc';
import { getFederatedComponent, prioritizeFederatedStyles } from '@/lib/federation-registry';
import { Spinner } from '@sero-ai/ui/components/ui/spinner';
import { PluginStyleScope } from '@sero-ai/ui/plugin-style-scope';
import { useAppRuntimeMount } from '@/components/apps/useAppRuntimeMount';

interface SeroAppMountProps {
  manifest: SeroAppManifest;
}

export const SeroAppMount = memo(function SeroAppMount({ manifest }: SeroAppMountProps) {
  const { contextValue, status } = useAppRuntimeMount(manifest);
  const surfaceId = useId();

  useInsertionEffect(() => {
    if (manifest.styleIsolation !== 'scope') prioritizeFederatedStyles(manifest.id);
  }, [manifest.id, manifest.styleIsolation]);

  if (status === 'loading-workspace') {
    return <AppLoading name={manifest.name} />;
  }

  if (status === 'missing-workspace') {
    return <AppPlaceholder name={manifest.name} reason="No workspace selected" />;
  }

  // Mounting an incompatible bundle would crash inside the plugin's first hook,
  // so stop here and say what to do instead. Checked on every mount, not just at
  // install, because a Sero update can strand an already-installed plugin.
  const blocker = manifest.hostCompatibility?.supported === false
    ? manifest.hostCompatibility.issues[0]?.message
    : null;
  if (blocker) {
    return <AppPlaceholder name={manifest.name} reason={blocker} />;
  }

  if (!manifest.component) {
    return <AppPlaceholder name={manifest.name} reason="No UI module registered" />;
  }

  const LazyComponent = getFederatedComponent(
    manifest.id,
    manifest.component,
    manifest.devPort,
    manifest.remoteEntryOverride,
  );

  if (!LazyComponent) {
    return <AppPlaceholder name={manifest.name} reason="No UI module registered" />;
  }

  return (
    <AppProvider value={contextValue}>
      <AppErrorBoundary name={manifest.name}>
        <PluginStyleScope pluginId={manifest.id} surfaceId={surfaceId}>
          <div data-app={manifest.id} data-sero-plugin={manifest.id} className="contents">
            <Suspense fallback={<AppLoading name={manifest.name} />}>
              <LazyComponent />
            </Suspense>
          </div>
        </PluginStyleScope>
      </AppErrorBoundary>
    </AppProvider>
  );
});

interface AppErrorBoundaryProps {
  children: ReactNode;
  name: string;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[apps] ${this.props.name} crashed while rendering`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return <AppPlaceholder name={this.props.name} reason="App crashed while rendering" />;
    }
    return this.props.children;
  }
}

function AppPlaceholder({ name, reason }: { name: string; reason: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center bg-[var(--bg-base)]">
      <span className="text-base font-medium text-[var(--text-secondary)]">
        {name}
      </span>
      <span className="mt-1 text-xs text-[var(--text-muted)]">{reason}</span>
    </div>
  );
}

function AppLoading({ name }: { name: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-[var(--bg-base)]">
      <Spinner className="size-5 text-status-success" />
      <span className="text-base text-[var(--text-muted)]">
        Loading {name}
      </span>
    </div>
  );
}
