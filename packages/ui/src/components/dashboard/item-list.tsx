// ItemList and ItemListItem — compact rows for dashboard lists.
//
// Built on the existing Item primitive, tightened for dense widget use. Each
// row takes optional leading media, primary/secondary text, trailing metadata
// and actions. ItemList adds a shared overflow ("+N more") treatment so widgets
// stop hand-rolling it.

import * as React from "react";

import { cn } from "../../lib/utils";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "../ui/item";

export interface ItemListItemProps
  extends Omit<React.ComponentProps<typeof Item>, "children"> {
  /** Leading media — an icon, avatar or status marker. */
  leading?: React.ReactNode;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  /** Trailing metadata (e.g. a timestamp or count). */
  trailing?: React.ReactNode;
  /** Trailing interactive actions (e.g. an IconButton). */
  actions?: React.ReactNode;
}

/** A single compact list row with optional media, text, metadata and actions. */
function ItemListItem({
  className,
  leading,
  primary,
  secondary,
  trailing,
  actions,
  variant = "default",
  ...props
}: ItemListItemProps) {
  return (
    <Item
      data-slot="item-list-item"
      variant={variant}
      size="sm"
      className={cn(
        "gap-2 rounded-md bg-[var(--surface-flat)] p-2 transition-colors hover:bg-[var(--glass-hover)]",
        className,
      )}
      {...props}
    >
      {leading && (
        <ItemMedia className="self-center">{leading}</ItemMedia>
      )}
      <ItemContent className="gap-0.5">
        <ItemTitle className="truncate text-xs font-medium text-[var(--text-primary)]">
          {primary}
        </ItemTitle>
        {secondary && (
          <ItemDescription className="line-clamp-1 text-xs text-[var(--text-muted)]">
            {secondary}
          </ItemDescription>
        )}
      </ItemContent>
      {trailing && (
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
          {trailing}
        </span>
      )}
      {actions && <ItemActions>{actions}</ItemActions>}
    </Item>
  );
}

export interface ItemListProps extends React.ComponentProps<"div"> {
  /** Count of items not shown; renders a "+N more" footer when > 0. */
  overflowCount?: number;
}

/** A vertical stack of ItemListItem rows with a shared overflow footer. */
function ItemList({
  className,
  overflowCount = 0,
  children,
  ...props
}: ItemListProps) {
  return (
    <div
      data-slot="item-list"
      role="list"
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    >
      {children}
      {overflowCount > 0 && (
        <span className="px-2 text-[11px] text-[var(--text-muted)]">
          +{overflowCount} more
        </span>
      )}
    </div>
  );
}

export { ItemList, ItemListItem };
