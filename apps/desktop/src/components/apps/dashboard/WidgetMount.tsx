/**
 * WidgetMount, loads and mounts a federated widget component.
 *
 * Similar to SeroAppMount but for widget-sized components. Wraps the
 * federated component in AppProvider so widgets have full access to
 * useAppState, useAgentPrompt, and other app-runtime hooks.
 */

import { memo } from 'react';
import { AppProvider } from '@sero-ai/app-runtime';
import type { SeroAppManifest } from '@/types/ipc';
import type { AvailableWidget, DashboardWidgetInstance } from '@/types/dashboard';
import { Spinner } from '@sero-ai/ui/components/ui/spinner';
import { useAppRuntimeMount } from '@/components/apps/useAppRuntimeMount';
import { FederatedContributionMount } from '@/components/apps/FederatedContributionMount';

interface WidgetMountProps {
  widget: DashboardWidgetInstance;
  manifest: SeroAppManifest;
  widgetMeta: AvailableWidget | null;
}

/**
 * Memoised so that parent re-renders during grid drag/resize (which
 * only change style/className on DashboardWidget) don't cascade into
 * the expensive federated widget render tree.
 */
export const WidgetMount = memo(function WidgetMount({ widget, manifest, widgetMeta }: WidgetMountProps) {
  if (widget.source === 'runtime') {
    return <RuntimeWidgetMount manifest={manifest} widgetMeta={widgetMeta} />;
  }

  return (
    <FederatedContributionMount
      manifest={manifest}
      contribution={{
        id: widget.widgetId,
        extensionPoint: 'ui.dashboard.widget',
        component: widgetMeta?.manifest.component ?? widget.component,
        name: widgetMeta?.manifest.name ?? widget.widgetId,
        defaultSize: widgetMeta?.manifest.defaultSize ?? { w: 2, h: 2 },
      }}
      contributionKey={`${manifest.id}:ui.dashboard.widget:${widget.widgetId}`}
      loading={<WidgetLoading />}
      unavailable={<WidgetFallback message="Widget unavailable" />}
      missingWorkspace={<WidgetFallback message="No workspace selected" />}
    />
  );
});

function RuntimeWidgetMount({
  manifest,
  widgetMeta,
}: {
  manifest: SeroAppManifest;
  widgetMeta: AvailableWidget | null;
}) {
  const { contextValue, status } = useAppRuntimeMount(manifest);
  if (status === 'loading-workspace') return <WidgetLoading />;
  if (status === 'missing-workspace') return <WidgetFallback message="No workspace selected" />;

  const RuntimeComponent = widgetMeta?.runtimeComponent;
  if (!RuntimeComponent) return <WidgetFallback message="Widget unavailable" />;
  return (
    <AppProvider value={contextValue}>
      <RuntimeComponent />
    </AppProvider>
  );
}

function WidgetFallback({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
      {message}
    </div>
  );
}

function WidgetLoading() {
  return (
    <div role="status" className="flex h-full items-center justify-center gap-2">
      <Spinner className="size-4 text-[var(--text-muted)]" />
      <span className="text-xs text-[var(--text-muted)]">Loading widget</span>
    </div>
  );
}
