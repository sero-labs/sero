/**
 * Dashboard — the plugin widgets this client may load.
 *
 * Only widgets that opted in with `remote: true` reach a browser. A
 * plugin that never opted in is not listed here and its files are not
 * served, so the dashboard can be empty on a machine full of plugins.
 *
 * Widgets are read-only for now. Writing arrives with issue #497.
 */

import { useEffect } from 'react';
import { LayoutGrid } from 'lucide-react';
import { EmptyState } from '@sero-ai/ui';
import { useWorkspaceStore } from '@/stores/workspace';
import { useWidgetsStore } from '@/stores/widgets';
import { WidgetFrame } from './WidgetFrame';

export function WidgetsView() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const widgets = useWidgetsStore((s) => s.widgets);
  const loadedFor = useWidgetsStore((s) => s.loadedFor);
  const isLoading = useWidgetsStore((s) => s.isLoading);
  const error = useWidgetsStore((s) => s.error);
  const fetchWidgets = useWidgetsStore((s) => s.fetchWidgets);

  // The listing is per workspace, and its URLs carry a ticket, so it is
  // fetched again whenever the workspace changes.
  useEffect(() => {
    if (loadedFor === workspaceId) return;
    void fetchWidgets(workspaceId);
  }, [workspaceId, loadedFor, fetchWidgets]);

  if (error !== null) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={LayoutGrid} title="Widgets unavailable" message={error} />
      </div>
    );
  }

  if (widgets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={LayoutGrid}
          title={isLoading ? 'Loading widgets' : 'No widgets yet'}
          message={
            isLoading
              ? 'Reading the widget list.'
              : 'No installed plugin offers a widget for the browser.'
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-3">
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 px-1 sm:grid-cols-2">
        {widgets.map((widget) => (
          <WidgetFrame
            key={`${widget.appId}/${widget.widgetId}`}
            widget={widget}
            workspaceId={workspaceId ?? ''}
          />
        ))}
      </div>
    </div>
  );
}
