// EmptyState — a compact empty state built on the Empty primitives.
//
// Tightened for widget use (the base Empty primitive pads for full pages).
// Optional icon, title, message and action.

import * as React from "react";

import { cn } from "../../lib/utils";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { Icon } from "./typography";

export interface EmptyStateProps
  extends Omit<React.ComponentProps<typeof Empty>, "title"> {
  /** Leading icon component (e.g. a lucide-react icon). */
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  message?: React.ReactNode;
  /** Optional action (e.g. a Button). */
  action?: React.ReactNode;
}

/** Compact empty state for widgets and plugin views. */
function EmptyState({
  className,
  icon,
  title,
  message,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <Empty
      data-slot="empty-state"
      className={cn(
        "flex-1 gap-3 border-0 p-4 md:p-4",
        className,
      )}
      {...props}
    >
      <EmptyHeader className="gap-1.5">
        {icon && (
          <EmptyMedia
            variant="icon"
            className="size-9 border-[var(--surface-line)] bg-[var(--surface-flat)] text-[var(--text-muted)]"
          >
            <Icon icon={icon} size="md" className="text-current" />
          </EmptyMedia>
        )}
        <EmptyTitle className="text-base font-medium text-[var(--text-primary)]">
          {title}
        </EmptyTitle>
        {message && (
          <EmptyDescription className="text-xs text-[var(--text-muted)]">
            {message}
          </EmptyDescription>
        )}
      </EmptyHeader>
      {action && <EmptyContent className="gap-2">{action}</EmptyContent>}
    </Empty>
  );
}

export { EmptyState };
