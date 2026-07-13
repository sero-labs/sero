// StaleIndicator — a compact hint that displayed data may be out of date.
//
// Shows an optional last-updated value and an optional refresh action. The
// component owns no fetching; the plugin passes the label and handles refresh.

import * as React from "react";
import { Clock, RotateCw } from "lucide-react";

import { cn } from "../../lib/utils";
import { Icon } from "./typography";
import { IconButton } from "./icon-button";

export interface StaleIndicatorProps extends React.ComponentProps<"div"> {
  /** Pre-formatted last-updated value, e.g. "Updated 5m ago". */
  lastUpdated?: React.ReactNode;
  /** Refresh handler. When provided, a refresh button is shown. */
  onRefresh?: () => void;
  /** Spin the refresh icon while a refresh is in flight. */
  refreshing?: boolean;
}

/** Compact "data may be stale" indicator with optional refresh. */
function StaleIndicator({
  className,
  lastUpdated,
  onRefresh,
  refreshing = false,
  ...props
}: StaleIndicatorProps) {
  return (
    <div
      data-slot="stale-indicator"
      className={cn(
        "flex items-center gap-1.5 text-sm text-[var(--text-muted)]",
        className,
      )}
      {...props}
    >
      <Icon icon={Clock} size="xs" tone="warning" />
      <span className="truncate">{lastUpdated ?? "Data may be out of date"}</span>
      {onRefresh && (
        <IconButton
          icon={RotateCw}
          label="Refresh"
          size="xs"
          onClick={onRefresh}
          className={cn("ml-auto", refreshing && "animate-spin")}
          disabled={refreshing}
        />
      )}
    </div>
  );
}

export { StaleIndicator };
