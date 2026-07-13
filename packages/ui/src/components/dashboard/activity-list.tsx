// ActivityList and ActivityListItem — a compact chronological event list.
//
// Each row carries a status marker or icon, a label, a timestamp and optional
// supporting detail. Timestamps are passed as pre-formatted strings — the
// component never computes relative time, so it stays stateless and the plugin
// owns any refresh.

import * as React from "react";

import { cn } from "../../lib/utils";
import { Icon } from "./typography";
import { toneDot, type Tone } from "./tone";

export interface ActivityListItemProps
  extends Omit<React.ComponentProps<"li">, "title"> {
  label: React.ReactNode;
  /** Pre-formatted timestamp, e.g. "08:00" or "in 2h". */
  timestamp?: React.ReactNode;
  /** Supporting detail under the label. */
  detail?: React.ReactNode;
  /** Status marker tone. Ignored when `icon` is provided. */
  tone?: Tone;
  /** Leading icon component, used instead of the status dot. */
  icon?: React.ComponentType<{ className?: string }>;
}

/** A single chronological event row. */
function ActivityListItem({
  className,
  label,
  timestamp,
  detail,
  tone = "neutral",
  icon,
  ...props
}: ActivityListItemProps) {
  return (
    <li
      data-slot="activity-list-item"
      className={cn("flex items-start gap-2 py-1", className)}
      {...props}
    >
      <span className="mt-1 flex size-3.5 shrink-0 items-center justify-center">
        {icon ? (
          <Icon icon={icon} size="xs" tone={tone === "neutral" ? undefined : tone} />
        ) : (
          <span className={cn("size-2 rounded-full", toneDot[tone])} />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs text-[var(--text-primary)]">
            {label}
          </span>
          {timestamp && (
            <span className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
              {timestamp}
            </span>
          )}
        </div>
        {detail && (
          <span className="line-clamp-1 text-xs text-[var(--text-muted)]">
            {detail}
          </span>
        )}
      </div>
    </li>
  );
}

export interface ActivityListProps extends React.ComponentProps<"ul"> {
  /** Count of events not shown; renders a "+N more" footer when > 0. */
  overflowCount?: number;
}

/** A chronological list of ActivityListItem rows. */
function ActivityList({
  className,
  overflowCount = 0,
  children,
  ...props
}: ActivityListProps) {
  return (
    <ul
      data-slot="activity-list"
      className={cn("flex min-w-0 flex-col", className)}
      {...props}
    >
      {children}
      {overflowCount > 0 && (
        <li className="pl-5 pt-0.5 text-sm text-[var(--text-muted)]">
          +{overflowCount} more
        </li>
      )}
    </ul>
  );
}

export { ActivityList, ActivityListItem };
