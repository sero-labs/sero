/**
 * DashboardWidget, wrapper around a mounted widget on the dashboard grid.
 *
 * Provides a drag handle, widget metadata, app launch affordance, and remove
 * action while keeping the mounted app widget isolated inside the card body.
 */

import type { CSSProperties, ReactNode, Ref } from 'react';
import { X, Maximize2, GripVertical } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
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
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * react-grid-layout passes a ref to each grid child for measuring and positioning.
 */
export function DashboardWidget({ widget, manifest, widgetMeta, style, className, children, ref, ...rest }: DashboardWidgetProps) {
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const AppIcon = getAppIcon(widgetMeta?.appIcon ?? null);
  const widgetName = widgetMeta?.manifest.name ?? widget.widgetId;
  const appName = widgetMeta?.appName ?? widget.appId;
  const canOpenApp = manifest !== null;

  return (
    <div
      ref={ref}
      style={style}
      className={`${className ?? ''} sero-dashboard-widget group`}
      {...rest}
    >
      <div className="widget-drag-handle sero-dashboard-widget-header">
        <GripVertical className="sero-dashboard-widget-grip size-3.5 shrink-0" />
        <div className="sero-dashboard-widget-icon-shell">
          <AppIcon className="size-3.5 shrink-0" />
        </div>
        <div className="sero-dashboard-widget-title-lockup">
          <span>{widgetName}</span>
          <small>{appName}</small>
        </div>
        <div className="sero-dashboard-widget-actions">
          {canOpenApp && (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="sero-dashboard-widget-action"
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
            className="sero-dashboard-widget-action"
            aria-label="Remove widget"
            title="Remove widget"
            onClick={() => removeWidget(widget.instanceId)}
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>

      <div className="sero-dashboard-widget-body">
        {manifest ? (
          <WidgetMount widget={widget} manifest={manifest} widgetMeta={widgetMeta} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
            App not found: {widget.appId}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}
