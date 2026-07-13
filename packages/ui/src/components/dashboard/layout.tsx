// Layout and structure primitives for dashboard widgets.
//
// WidgetContent, Stack, Inline, Grid, Section and Divider give widgets a
// consistent frame, spacing and container-query boundary without re-declaring
// `flex h-full flex-col gap-2 p-3` in every widget. They compose normal React
// children and accept `className` for escape hatches.

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Separator } from "../ui/separator";
import { gapClass, type Gap } from "./spacing";

// ── WidgetContent ────────────────────────────────────────────────

const widgetContentVariants = cva(
  // Full-height frame with a container-query boundary so child components can
  // respond to the widget's own size rather than the viewport.
  "@container/widget flex h-full min-h-0 flex-col",
  {
    variants: {
      padding: {
        none: "p-0",
        sm: "p-2",
        md: "p-3",
        lg: "p-4",
      },
      scroll: {
        true: "overflow-auto",
        false: "overflow-hidden",
      },
    },
    defaultVariants: { padding: "md", scroll: false },
  },
);

export interface WidgetContentProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof widgetContentVariants> {
  /**
   * Apply the glass token scope so surfaces read as translucent on the
   * frosted dashboard tile. On by default; set `false` for solid full
   * plugin views (outside a dashboard tile).
   */
  glass?: boolean;
}

/** Full-height widget content frame with standard padding + a container query. */
function WidgetContent({
  className,
  padding,
  scroll,
  glass = true,
  ...props
}: WidgetContentProps) {
  return (
    <div
      data-slot="widget-content"
      className={cn(widgetContentVariants({ padding, scroll }), glass && "glass", className)}
      {...props}
    />
  );
}

// ── Stack ────────────────────────────────────────────────────────

const alignClass = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
} as const;

const justifyClass = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
} as const;

export interface StackProps extends React.ComponentProps<"div"> {
  gap?: Gap;
  align?: keyof typeof alignClass;
  justify?: keyof typeof justifyClass;
  /**
   * Grow to fill the remaining height of a flex parent (e.g. the top-level
   * Stack under `WidgetContent`, so a nested `scroll` region can bound).
   */
  fill?: boolean;
  /** Fill remaining height and scroll overflow. Use for the main content flow. */
  scroll?: boolean;
}

/** Vertical layout with semantic spacing, alignment and optional scrolling. */
function Stack({
  className,
  gap = "sm",
  align,
  justify,
  fill = false,
  scroll = false,
  ...props
}: StackProps) {
  return (
    <div
      data-slot="stack"
      className={cn(
        "flex flex-col",
        gapClass[gap],
        align && alignClass[align],
        justify && justifyClass[justify],
        (fill || scroll) && "min-h-0 flex-1",
        scroll && "overflow-auto",
        className,
      )}
      {...props}
    />
  );
}

// ── Inline ───────────────────────────────────────────────────────

export interface InlineProps extends React.ComponentProps<"div"> {
  gap?: Gap;
  align?: keyof typeof alignClass;
  justify?: keyof typeof justifyClass;
  wrap?: boolean;
}

/** Horizontal layout with semantic spacing, alignment, wrap and justify. */
function Inline({
  className,
  gap = "sm",
  align = "center",
  justify,
  wrap = false,
  ...props
}: InlineProps) {
  return (
    <div
      data-slot="inline"
      className={cn(
        "flex flex-row",
        gapClass[gap],
        alignClass[align],
        justify && justifyClass[justify],
        wrap ? "flex-wrap" : "min-w-0",
        className,
      )}
      {...props}
    />
  );
}

// ── Grid ─────────────────────────────────────────────────────────

const columnsClass = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
} as const;

export interface GridProps extends React.ComponentProps<"div"> {
  /** Fixed column count, or `auto` for a responsive min-width fill. */
  columns?: keyof typeof columnsClass | "auto";
  gap?: Gap;
  /** Minimum column width for `columns="auto"`. */
  minColumnWidth?: number;
}

/** Responsive grid with bounded columns for metric and summary layouts. */
function Grid({
  className,
  columns = "auto",
  gap = "sm",
  minColumnWidth = 120,
  style,
  ...props
}: GridProps) {
  const auto = columns === "auto";
  return (
    <div
      data-slot="grid"
      className={cn(
        "grid",
        gapClass[gap],
        !auto && columnsClass[columns],
        className,
      )}
      style={
        auto
          ? {
              gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
              ...style,
            }
          : style
      }
      {...props}
    />
  );
}

// ── Section ──────────────────────────────────────────────────────

export interface SectionProps extends React.ComponentProps<"div"> {
  /** Section heading text or node. Omit for an unlabelled group. */
  heading?: React.ReactNode;
  /** Supporting text shown under the heading. */
  description?: React.ReactNode;
  /** Trailing action aligned to the heading row (e.g. an IconButton). */
  action?: React.ReactNode;
  gap?: Gap;
}

/** Compact section with optional heading, description and trailing action. */
function Section({
  className,
  heading,
  description,
  action,
  gap = "sm",
  children,
  ...props
}: SectionProps) {
  return (
    <section
      data-slot="section"
      className={cn("flex flex-col", gapClass[gap], className)}
      {...props}
    >
      {(heading || action) && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            {heading && (
              <h3 className="truncate text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {heading}
              </h3>
            )}
            {description && (
              <p className="truncate text-xs text-[var(--text-muted)]">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ── Divider ──────────────────────────────────────────────────────

export interface DividerProps
  extends React.ComponentProps<typeof Separator> {
  /** Vertical spacing around a horizontal divider. */
  spacing?: "none" | "sm" | "md";
}

const dividerSpacing = { none: "my-0", sm: "my-1", md: "my-2" } as const;

/** Compact divider built on the Separator primitive. */
function Divider({
  className,
  orientation = "horizontal",
  spacing = "sm",
  ...props
}: DividerProps) {
  return (
    <Separator
      data-slot="divider"
      orientation={orientation}
      className={cn(
        orientation === "horizontal" ? dividerSpacing[spacing] : "mx-1",
        className,
      )}
      {...props}
    />
  );
}

export { WidgetContent, Stack, Inline, Grid, Section, Divider };
