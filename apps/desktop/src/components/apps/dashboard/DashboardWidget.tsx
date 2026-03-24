/**
 * DashboardWidget — wrapper around a mounted widget on the dashboard grid.
 *
 * Provides a header with the widget name, app icon, and action buttons
 * (open full app, remove). The content area renders the federated widget
 * component via WidgetMount.
 */

import { forwardRef } from 'react';
import { X, Maximize2, GripVertical } from 'lucide-react';
import { Button } from '@sero/ui/components/ui/button';
import type { DashboardWidgetInstance, AvailableWidget } from '@/types/dashboard';
import type { SeroAppManifest } from '@/types/ipc';
import { getAppIcon } from '@/lib/app-icons';
import { openApp } from '@/lib/open-app';
import { useDashboardStore } from '@/stores/dashboard';
import { WidgetMount } from './WidgetMount';

interface DashboardWidgetProps {
  widget: DashboardWidgetInstance;
  manifest: SeroAppManifest | null;
  widgetMeta: AvailableWidget | null;
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}

/**
 * forwardRef is required by react-grid-layout — it passes a ref to
 * each grid child for measuring and positioning.
 */
export const DashboardWidget = forwardRef<HTMLDivElement, DashboardWidgetProps>(
  function DashboardWidget({ widget, manifest, widgetMeta, style, className, children, ...rest }, ref) {
    const removeWidget = useDashboardStore((s) => s.removeWidget);
    const AppIcon = getAppIcon(widgetMeta?.appIcon ?? null);
    const widgetName = widgetMeta?.manifest.name ?? widget.widgetId;
    const appName = widgetMeta?.appName ?? widget.appId;
    const canOpenApp = manifest !== null;

    return (
      <div
        ref={ref}
        style={style}
        className={`${className ?? ''} flex flex-col overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]`}
        {...rest}
      >
        {/* ── Header ── */}
        <div className="widget-drag-handle flex cursor-grab items-center gap-1.5 border-b border-[var(--border-default)] px-3 py-1.5 active:cursor-grabbing">
          <GripVertical className="size-3 shrink-0 text-[var(--text-muted)]" />
          <AppIcon className="size-3.5 shrink-0 text-[var(--text-muted)]" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-secondary)]">
            {widgetName}
          </span>
          {canOpenApp && (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Open ${appName}`}
              title={`Open ${appName}`}
              onClick={() => openApp(widget.appId)}
            >
              <Maximize2 className="size-3" />
            </Button>
          )}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Remove widget"
            title="Remove widget"
            onClick={() => removeWidget(widget.instanceId)}
          >
            <X className="size-3" />
          </Button>
        </div>

        {/* ── Content ── */}
        <div className="min-h-0 flex-1 overflow-auto">
          {manifest ? (
            <WidgetMount widget={widget} manifest={manifest} widgetMeta={widgetMeta} />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
              App not found: {widget.appId}
            </div>
          )}
        </div>

        {/* react-grid-layout resize handle (injected as children) */}
        {children}
      </div>
    );
  },
);
