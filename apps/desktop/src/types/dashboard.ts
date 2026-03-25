/**
 * Dashboard widget system types.
 *
 * Widgets are small, mountable views of Sero apps that live on the
 * dashboard grid. Each widget is backed by a federated component
 * exposed by an app package.
 */

import type { ComponentType } from 'react';
import type { LayoutItem } from 'react-grid-layout';

// ── Widget Manifest (declared in package.json sero.app.widgets) ──

/** Widget definition from a package's sero.app manifest. */
export interface WidgetManifest {
  /** Unique widget identifier within the app (e.g. "board-summary"). */
  id: string;
  /** Display name shown in the widget header and picker. */
  name: string;
  /** Exported component name from the module federation remote. */
  component: string;
  /** Default grid size (react-grid-layout units). */
  defaultSize: { w: number; h: number };
  /** Minimum grid size. */
  minSize?: { w: number; h: number };
  /** Maximum grid size. */
  maxSize?: { w: number; h: number };
  /** Optional short description for the widget picker. */
  description?: string;
}

export type DashboardWidgetSource = 'manifest' | 'runtime';

// ── Dashboard State (persisted in layout.json) ───────────────────

/** A widget instance placed on the dashboard grid. */
export interface DashboardWidgetInstance {
  /** Unique instance ID (generated when widget is added). */
  instanceId: string;
  /** App ID that owns this widget. */
  appId: string;
  /** Widget manifest ID. */
  widgetId: string;
  /** Federated component name to load. */
  component: string;
  /** Whether the widget came from a static manifest or runtime registry. */
  source?: DashboardWidgetSource;
}

/** Serialised dashboard layout persisted to layout.json. */
export interface DashboardLayoutState {
  /** Widget instances on the grid. */
  widgets: DashboardWidgetInstance[];
  /** react-grid-layout layout items (keyed by instanceId). */
  layouts: LayoutItem[];
}

// ── Available Widget (resolved at runtime) ───────────────────────

/** A widget available for placement, resolved from app manifests. */
export interface AvailableWidget {
  /** App that provides this widget. */
  appId: string;
  appName: string;
  appIcon: string;
  /** Widget manifest details. */
  manifest: WidgetManifest;
  /** Dev port for module federation (if in dev mode). */
  devPort: number | undefined;
  /** Static manifest widget or runtime-registered widget. */
  source: DashboardWidgetSource;
  /** Concrete component for runtime-registered widgets. */
  runtimeComponent?: ComponentType;
}
