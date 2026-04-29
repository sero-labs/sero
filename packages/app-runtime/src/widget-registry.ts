/**
 * Widget registry — runtime registration of widgets from app modules.
 *
 * Apps can register widget components dynamically (in addition to static
 * manifest declarations). The host dashboard subscribes to changes and
 * renders registered widgets.
 *
 * Uses a globalThis singleton to ensure a single registry across all
 * module federation copies, matching the AppContext pattern.
 */

import type { ComponentType } from 'react';

/** A runtime-registered widget definition. */
export interface RuntimeWidget {
  /** App ID that owns this widget. */
  appId: string;
  /** Unique widget identifier within the app. */
  widgetId: string;
  /** Display name. */
  name: string;
  /** The React component to render. */
  component: ComponentType;
  /** Default grid size (react-grid-layout units). */
  defaultSize: { w: number; h: number };
  /** Minimum grid size. */
  minSize?: { w: number; h: number };
  /** Maximum grid size. */
  maxSize?: { w: number; h: number };
  /** Optional description. */
  description?: string;
}

type WidgetChangeListener = () => void;

interface WidgetRegistryState {
  widgets: Map<string, RuntimeWidget>;
  snapshot: RuntimeWidget[];
  listeners: Set<WidgetChangeListener>;
}

declare global {
  var __sero_widget_registry__: WidgetRegistryState | undefined;
}

function createRegistryState(): WidgetRegistryState {
  return {
    widgets: new Map<string, RuntimeWidget>(),
    snapshot: [],
    listeners: new Set<WidgetChangeListener>(),
  };
}

function getRegistry(): WidgetRegistryState {
  if (!globalThis.__sero_widget_registry__) {
    globalThis.__sero_widget_registry__ = createRegistryState();
  }
  return globalThis.__sero_widget_registry__;
}

function makeKey(appId: string, widgetId: string): string {
  return `${appId}:${widgetId}`;
}

function publishSnapshot(registry: WidgetRegistryState): void {
  registry.snapshot = Array.from(registry.widgets.values());
  registry.listeners.forEach((fn) => fn());
}

function sameGridSize(
  left: RuntimeWidget['defaultSize'] | RuntimeWidget['minSize'] | RuntimeWidget['maxSize'],
  right: RuntimeWidget['defaultSize'] | RuntimeWidget['minSize'] | RuntimeWidget['maxSize'],
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.w === right.w && left.h === right.h;
}

function sameWidget(existing: RuntimeWidget | undefined, next: RuntimeWidget): boolean {
  if (!existing) return false;
  return existing.appId === next.appId
    && existing.widgetId === next.widgetId
    && existing.name === next.name
    && existing.component === next.component
    && sameGridSize(existing.defaultSize, next.defaultSize)
    && sameGridSize(existing.minSize, next.minSize)
    && sameGridSize(existing.maxSize, next.maxSize)
    && existing.description === next.description;
}

/**
 * Register a widget component at runtime. Call from your app's root
 * component or module initialisation.
 *
 * @returns An unregister function.
 */
export function registerWidget(widget: RuntimeWidget): () => void {
  const registry = getRegistry();
  const key = makeKey(widget.appId, widget.widgetId);
  const existing = registry.widgets.get(key);
  if (!sameWidget(existing, widget)) {
    registry.widgets.set(key, widget);
    publishSnapshot(registry);
  }

  return () => {
    registry.widgets.delete(key);
    publishSnapshot(registry);
  };
}

/** Get all runtime-registered widgets. */
export function getRuntimeWidgets(): RuntimeWidget[] {
  return getRegistry().snapshot;
}

/** Subscribe to widget registration changes. Returns an unsubscribe function. */
export function onWidgetRegistryChange(listener: WidgetChangeListener): () => void {
  const registry = getRegistry();
  registry.listeners.add(listener);
  return () => {
    registry.listeners.delete(listener);
  };
}
