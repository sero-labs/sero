/**
 * Dashboard store — manages widget instances and grid layout.
 *
 * Widget positions are persisted to layout.json via persistLayout().
 * Available widgets are resolved from app manifests at runtime.
 */

import { create } from 'zustand';
import type { RuntimeWidget } from '@sero-ai/app-runtime';
import type { LayoutItem } from 'react-grid-layout';
import type {
  DashboardWidgetInstance,
  DashboardLayoutState,
  AvailableWidget,
  WidgetManifest,
} from '@/types/dashboard';
import type { SeroAppManifest } from '@/types/ipc';
import { persistLayout } from '@/lib/persist-layout';

// ── Helpers ──────────────────────────────────────────────────────

let instanceCounter = 0;

function generateInstanceId(): string {
  instanceCounter += 1;
  return `widget-${Date.now()}-${instanceCounter}`;
}

function createDefaultLayout(
  instanceId: string,
  manifest: WidgetManifest,
  existingLayouts: LayoutItem[],
): LayoutItem {
  // Place new widgets at the bottom of the grid
  const maxY = existingLayouts.reduce((max, l) => Math.max(max, l.y + l.h), 0);
  return {
    i: instanceId,
    x: 0,
    y: maxY,
    w: manifest.defaultSize.w,
    h: manifest.defaultSize.h,
    minW: manifest.minSize?.w,
    minH: manifest.minSize?.h,
    // No maxW/maxH: widgets resize freely up to the grid width. The manifest
    // maxSize is treated as advisory (initial ceiling), never a hard resize cap.
  };
}

// ── Store ────────────────────────────────────────────────────────

interface DashboardState {
  /** Widget instances on the grid. */
  widgets: DashboardWidgetInstance[];
  /** react-grid-layout positions (keyed by instanceId). */
  layouts: LayoutItem[];

  /** Add a widget to the dashboard. */
  addWidget: (widget: AvailableWidget) => void;
  /** Remove a widget by instance ID. */
  removeWidget: (instanceId: string) => void;
  /** Update grid layouts in memory (no persist — called on every drag frame). */
  updateLayouts: (layouts: LayoutItem[]) => void;
  /** Persist current layouts to disk. Call from onDragStop / onResizeStop. */
  persistLayouts: () => void;

  /** Hydrate from persisted layout state. */
  hydrate: (state: DashboardLayoutState | undefined) => void;
}

function buildPersistState(widgets: DashboardWidgetInstance[], layouts: LayoutItem[]): DashboardLayoutState {
  return { widgets, layouts };
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  widgets: [],
  layouts: [],

  addWidget: (widget) => {
    const instanceId = generateInstanceId();
    const instance: DashboardWidgetInstance = {
      instanceId,
      appId: widget.appId,
      widgetId: widget.manifest.id,
      component: widget.manifest.component,
      source: widget.source,
    };

    const { widgets, layouts } = get();
    const newLayout = createDefaultLayout(instanceId, widget.manifest, layouts);
    const nextWidgets = [...widgets, instance];
    const nextLayouts = [...layouts, newLayout];

    set({ widgets: nextWidgets, layouts: nextLayouts });
    persistLayout({ dashboardLayout: buildPersistState(nextWidgets, nextLayouts) });
  },

  removeWidget: (instanceId) => {
    const { widgets, layouts } = get();
    const nextWidgets = widgets.filter((w) => w.instanceId !== instanceId);
    const nextLayouts = layouts.filter((l) => l.i !== instanceId);

    set({ widgets: nextWidgets, layouts: nextLayouts });
    persistLayout({ dashboardLayout: buildPersistState(nextWidgets, nextLayouts) });
  },

  updateLayouts: (nextLayouts) => {
    set({ layouts: nextLayouts });
  },

  persistLayouts: () => {
    const { widgets, layouts } = get();
    persistLayout({ dashboardLayout: buildPersistState(widgets, layouts) });
  },

  hydrate: (state) => {
    if (!state) return;
    set({
      widgets: (state.widgets ?? []).map((widget) => ({
        ...widget,
        source: widget.source ?? 'manifest',
      })),
      // Drop any persisted maxW/maxH so widgets placed before the cap was
      // removed also become freely resizable.
      layouts: (state.layouts ?? []).map(({ maxW: _maxW, maxH: _maxH, ...item }) => item),
    });
  },
}));

// ── Selectors ────────────────────────────────────────────────────

/** Resolve all available widgets from app manifests and runtime registration. */
export function getAvailableWidgets(
  manifests: SeroAppManifest[],
  runtimeWidgets: RuntimeWidget[] = [],
): AvailableWidget[] {
  const results = new Map<string, AvailableWidget>();
  const manifestsById = new Map(manifests.map((manifest) => [manifest.id, manifest]));

  for (const manifest of manifests) {
    if (!manifest.component || !manifest.widgets || manifest.widgets.length === 0) continue;
    for (const widget of manifest.widgets) {
      results.set(`${manifest.id}:${widget.id}`, {
        appId: manifest.id,
        appName: manifest.name,
        appIcon: manifest.icon,
        manifest: widget,
        devPort: manifest.devPort,
        source: 'manifest',
      });
    }
  }

  for (const widget of runtimeWidgets) {
    const key = `${widget.appId}:${widget.widgetId}`;
    if (results.has(key)) continue;

    const manifest = manifestsById.get(widget.appId);
    results.set(key, {
      appId: widget.appId,
      appName: manifest?.name ?? widget.appId,
      appIcon: manifest?.icon ?? 'box',
      manifest: {
        id: widget.widgetId,
        name: widget.name,
        component: widget.widgetId,
        defaultSize: widget.defaultSize,
        minSize: widget.minSize,
        maxSize: widget.maxSize,
        description: widget.description,
      },
      devPort: manifest?.devPort,
      source: 'runtime',
      runtimeComponent: widget.component,
    });
  }

  return Array.from(results.values());
}
