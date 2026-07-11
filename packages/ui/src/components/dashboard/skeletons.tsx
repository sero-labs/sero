// Widget skeleton patterns — small compositions of the Skeleton primitive for
// the common metric, list and activity loading layouts, so every widget shows a
// consistent loading shape instead of hand-rolling one.

import * as React from "react";

import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";

export interface SkeletonPatternProps extends React.ComponentProps<"div"> {
  /** Number of rows / cells to render. */
  count?: number;
}

/** A row of metric placeholders (label + value stacks). */
function MetricSkeleton({ className, count = 3, ...props }: SkeletonPatternProps) {
  return (
    <div
      data-slot="metric-skeleton"
      className={cn("flex gap-4", className)}
      {...props}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-5 w-8" />
        </div>
      ))}
    </div>
  );
}

/** A stack of list-row placeholders. */
function ListSkeleton({ className, count = 4, ...props }: SkeletonPatternProps) {
  return (
    <div
      data-slot="list-skeleton"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md p-2">
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

/** A stack of activity-row placeholders (marker + label + timestamp). */
function ActivitySkeleton({ className, count = 4, ...props }: SkeletonPatternProps) {
  return (
    <div
      data-slot="activity-skeleton"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-2">
          <Skeleton className="mt-0.5 size-2 rounded-full" />
          <div className="flex flex-1 flex-col gap-1">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export { MetricSkeleton, ListSkeleton, ActivitySkeleton };
