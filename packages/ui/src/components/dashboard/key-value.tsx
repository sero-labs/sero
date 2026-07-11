// KeyValue and KeyValueList — compact label/value metadata.
//
// For configuration summaries, totals and metadata where a full metric is too
// heavy. Uses a semantic description list with predictable alignment and
// value truncation.

import * as React from "react";

import { cn } from "../../lib/utils";

export interface KeyValueProps extends React.ComponentProps<"div"> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Use mono + tabular numerals for the value (ids, counts, sizes). */
  mono?: boolean;
}

/** A single label/value row rendered as a `dt`/`dd` pair. */
function KeyValue({ className, label, value, mono, ...props }: KeyValueProps) {
  return (
    <div
      data-slot="key-value"
      className={cn("flex items-baseline justify-between gap-3", className)}
      {...props}
    >
      <dt className="shrink-0 truncate text-xs text-[var(--text-muted)]">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right text-xs text-[var(--text-primary)]",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export interface KeyValueListProps extends React.ComponentProps<"dl"> {}

/** A vertical list of KeyValue rows. */
function KeyValueList({ className, ...props }: KeyValueListProps) {
  return (
    <dl
      data-slot="key-value-list"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

export { KeyValue, KeyValueList };
