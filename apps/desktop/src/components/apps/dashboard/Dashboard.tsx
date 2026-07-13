/**
 * Dashboard, the default landing page with a draggable/resizable widget grid.
 *
 * Uses react-grid-layout for the grid system. Widgets are federated
 * components from Sero apps, mounted with full AppProvider context.
 * Layout is persisted to layout.json.
 */

import { memo, useMemo, useCallback } from 'react';
import { GridLayout } from 'react-grid-layout';
import type { Layout, LayoutItem, GridLayoutProps } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import '@sero-ai/ui/styles/glass-board.css';
import './dashboard.css';

import { useAppStore } from '@/stores/app';
import { useDashboardStore, getAvailableWidgets } from '@/stores/dashboard';
import type { AvailableWidget } from '@/types/dashboard';
import { DashboardWidget } from './DashboardWidget';
import { AddWidgetDialog } from './AddWidgetDialog';
import { useGridWidth } from './useGridWidth';
import { useRuntimeWidgets } from './useRuntimeWidgets';

// ── Grid configuration ───────────────────────────────────────────
// Hoisted to module scope: GridLayout derives per-item geometry from these
// objects, so passing fresh literals on every render forces the whole grid
// (and every widget wrapper) to re-render whenever Dashboard renders.

const GRID_CONFIG: GridLayoutProps['gridConfig'] = {
  cols: 6,
  rowHeight: 120,
  margin: [3, 3],
  containerPadding: [3, 3],
};

const DRAG_CONFIG: GridLayoutProps['dragConfig'] = {
  enabled: true,
  handle: '.widget-drag-handle',
};

const RESIZE_CONFIG: GridLayoutProps['resizeConfig'] = {
  enabled: true,
};

// ── Component ────────────────────────────────────────────────────

// Memoised: takes no props, so shell re-renders (panel toggles, app
// preloads, …) never cascade into the widget grid.
export const Dashboard = memo(function Dashboard() {
  const apps = useAppStore((s) => s.apps);
  const widgets = useDashboardStore((s) => s.widgets);
  const layouts = useDashboardStore((s) => s.layouts);
  const updateLayouts = useDashboardStore((s) => s.updateLayouts);
  const persistLayouts = useDashboardStore((s) => s.persistLayouts);
  const runtimeWidgets = useRuntimeWidgets();

  const { containerRef, width } = useGridWidth();

  // Resolve app manifests for all discovered apps
  const manifestMap = useMemo(() => {
    const map = new Map<string, (typeof apps)[number]>();
    for (const app of apps) {
      if (app.manifest) map.set(app.id, app);
    }
    return map;
  }, [apps]);

  // Resolve available widgets from all app manifests
  const availableWidgets = useMemo<AvailableWidget[]>(() => {
    const manifests = apps.filter((a) => a.manifest).map((a) => a.manifest!);
    return getAvailableWidgets(manifests, runtimeWidgets);
  }, [apps, runtimeWidgets]);

  // Build a lookup for widget metadata
  const widgetMetaMap = useMemo(() => {
    const map = new Map<string, AvailableWidget>();
    for (const aw of availableWidgets) {
      map.set(`${aw.appId}:${aw.manifest.id}`, aw);
    }
    return map;
  }, [availableWidgets]);

  // Convert mutable LayoutItem[] to readonly Layout for the grid
  const gridLayout: Layout = layouts;

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      // Layout is readonly LayoutItem[], copy to mutable for store
      const mutable: LayoutItem[] = newLayout.map((item) => ({ ...item }));
      updateLayouts(mutable);
    },
    [updateLayouts],
  );

  // Persist only once when drag/resize finishes, not on every frame
  const handleInteractionStop = useCallback(() => {
    persistLayouts();
  }, [persistLayouts]);

  // Stable child elements — a fresh array of elements each render would
  // force GridLayout to reconcile every grid item on every render.
  const gridChildren = useMemo(
    () =>
      widgets.map((widget) => {
        const appEntry = manifestMap.get(widget.appId);
        const manifest = appEntry?.manifest ?? null;
        const meta = widgetMetaMap.get(`${widget.appId}:${widget.widgetId}`) ?? null;

        return (
          <DashboardWidget
            key={widget.instanceId}
            widget={widget}
            manifest={manifest}
            widgetMeta={meta}
          />
        );
      }),
    [widgets, manifestMap, widgetMetaMap],
  );

  const hasWidgets = widgets.length > 0;

  return (
    <div
      ref={containerRef}
      className="sero-dashboard glass-canvas flex h-full flex-col overflow-auto"
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between border-b border-[var(--dash-seam)] px-4 py-2">
        <h1 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          Dashboard
        </h1>
        <AddWidgetDialog availableWidgets={availableWidgets} />
      </div>

      {/* ── Grid ── */}
      {hasWidgets && width > 0 ? (
        <div className="flex-1">
          <GridLayout
            layout={gridLayout}
            width={width}
            gridConfig={GRID_CONFIG}
            dragConfig={DRAG_CONFIG}
            resizeConfig={RESIZE_CONFIG}
            onLayoutChange={handleLayoutChange}
            onDragStop={handleInteractionStop}
            onResizeStop={handleInteractionStop}
          >
            {gridChildren}
          </GridLayout>
        </div>
      ) : (
        <EmptyState availableWidgets={availableWidgets} />
      )}
    </div>
  );
});

// ── Empty state ──────────────────────────────────────────────────

function EmptyState({ availableWidgets }: { availableWidgets: AvailableWidget[] }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 border border-dashed border-[var(--dash-seam-strong)] px-16 py-12">
        <div className="text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            Your dashboard is empty
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Add widgets from your apps to see them here
          </p>
        </div>
        <AddWidgetDialog availableWidgets={availableWidgets} />
      </div>
    </div>
  );
}
