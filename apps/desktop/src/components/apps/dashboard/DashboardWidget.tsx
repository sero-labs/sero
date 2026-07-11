/**
 * DashboardWidget, wrapper around a mounted widget on the dashboard grid.
 *
 * Content-first tile: the federated widget fills the whole surface and stays
 * fully interactive. The chrome (drag grip, open-app / remove actions) lives in
 * a small pill in the top-right corner, revealed on hover or keyboard focus.
 * The chrome overlay is `pointer-events-none` so it never intercepts clicks on
 * the widget beneath it; only the pill is interactive, and only the grip drags
 * (not the whole top edge). Visibility is driven by the `.dash-widget-chrome`
 * rules in dashboard.css.
 */

import type { CSSProperties, ReactNode, Ref } from 'react';
import { X, Maximize2, GripVertical } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { DashboardWidgetInstance, AvailableWidget } from '@/types/dashboard';
import type { SeroAppManifest } from '@/types/ipc';
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
  const appName = widgetMeta?.appName ?? widget.appId;
  const canOpenApp = manifest !== null;

  return (
    <div
      ref={ref}
      style={style}
      className={`${className ?? ''} glass-tile relative flex flex-col overflow-hidden`}
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

      {/* ── Hover controls ──
          pointer-events-none so this overlay never intercepts interaction with
          the widget beneath it (no more move-on-hover). Only the pill is
          interactive, and only the grip is the drag handle. Revealed on hover /
          focus by the `.dash-widget-chrome` rules in dashboard.css. */}
      <div className="dash-widget-chrome pointer-events-none absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-end px-1.5">
        <div className="dash-widget-actions flex items-center gap-0.5 p-0.5">
          <span
            className="widget-drag-handle flex size-5 cursor-grab items-center justify-center active:cursor-grabbing"
            aria-label="Move widget"
            title="Move widget"
          >
            <GripVertical className="size-3.5 text-[var(--text-muted)]" />
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
      </div>

      {/* react-grid-layout resize handle (injected as children) */}
      {children}
    </div>
  );
}
