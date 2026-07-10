/**
 * DashboardWidget, wrapper around a mounted widget on the dashboard grid.
 *
 * Content-first tile: the federated widget fills the whole surface. All
 * chrome (name, open-app / remove actions, drag grip) lives in a slim
 * strip overlaying the top edge, revealed on hover or keyboard focus.
 * The strip doubles as the drag handle; visibility is driven by the
 * `.dash-widget-chrome` rules in dashboard.css.
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
      className={`${className ?? ''} dash-tile relative flex flex-col overflow-hidden`}
      {...rest}
    >
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

      {/* ── Hover chrome / drag handle ── */}
      <div className="dash-widget-chrome widget-drag-handle absolute inset-x-0 top-0 z-10 flex h-9 cursor-grab items-center gap-1.5 px-2.5 pb-1 active:cursor-grabbing">
        <GripVertical className="size-3 shrink-0 text-[var(--text-muted)]" />
        <AppIcon className="size-3.5 shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
          {widgetName}
        </span>
        {canOpenApp && (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="rounded-none"
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
          className="rounded-none"
          aria-label="Remove widget"
          title="Remove widget"
          onClick={() => removeWidget(widget.instanceId)}
        >
          <X className="size-3" />
        </Button>
      </div>

      {/* react-grid-layout resize handle (injected as children) */}
      {children}
    </div>
  );
}
