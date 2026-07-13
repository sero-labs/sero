// Metric, MetricGroup and MetricCard — consistent numeric summaries.
//
// A metric is a label + value with optional icon, supporting text and a trend.
// Metric works inline; MetricCard wraps it in a contained surface; MetricGroup
// arranges several responsively. Values use tabular numerals so columns align.

import * as React from "react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { cn } from "../../lib/utils";
import { Icon } from "./typography";
import { toneColor, type Tone } from "./tone";
import { Grid, type GridProps } from "./layout";

export interface MetricTrend {
  direction: "up" | "down" | "flat";
  /** Change label, e.g. "+12%". */
  value?: React.ReactNode;
  /** Colour of the trend. Defaults to neutral — "up" is not always good. */
  tone?: Tone;
}

const trendIcon = {
  up: ArrowUp,
  down: ArrowDown,
  flat: ArrowRight,
} as const;

export interface MetricProps extends Omit<React.ComponentProps<"div">, "title"> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Leading icon component (e.g. a lucide-react icon). */
  icon?: React.ComponentType<{ className?: string }>;
  /** Supporting text under the value. */
  supporting?: React.ReactNode;
  trend?: MetricTrend;
  /** Semantic colour for the value. */
  tone?: Tone;
  /** Vertical (default) or horizontal label/value arrangement. */
  orientation?: "vertical" | "horizontal";
}

/** A single label + value metric, usable inline or inside a MetricCard. */
function Metric({
  className,
  label,
  value,
  icon,
  supporting,
  trend,
  tone,
  orientation = "vertical",
  ...props
}: MetricProps) {
  const TrendIcon = trend ? trendIcon[trend.direction] : null;
  return (
    <div
      data-slot="metric"
      className={cn(
        "flex min-w-0",
        orientation === "vertical"
          ? "flex-col gap-0.5"
          : "items-center justify-between gap-2",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        {icon && <Icon icon={icon} size="sm" />}
        <span className="truncate text-sm font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-lg font-semibold leading-none tabular-nums",
            tone ? toneColor[tone] : "text-[var(--text-primary)]",
          )}
        >
          {value}
        </span>
        {trend && TrendIcon && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
              trend.tone ? toneColor[trend.tone] : "text-[var(--text-muted)]",
            )}
          >
            <TrendIcon className="size-3" aria-hidden />
            {trend.value}
          </span>
        )}
      </div>
      {supporting && (
        <span className="truncate text-xs text-[var(--text-muted)]">
          {supporting}
        </span>
      )}
    </div>
  );
}

// ── MetricCard ───────────────────────────────────────────────────

export interface MetricCardProps extends React.ComponentProps<"div"> {}

/** A contained surface for a Metric (or any compact summary content). */
function MetricCard({ className, ...props }: MetricCardProps) {
  return (
    <div
      data-slot="metric-card"
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-[var(--surface-line)] bg-[var(--surface-raised)] p-3 shadow-[inset_0_1px_0_var(--surface-rim)]",
        className,
      )}
      {...props}
    />
  );
}

// ── MetricGroup ──────────────────────────────────────────────────

export interface MetricGroupProps extends GridProps {}

/** Arranges multiple metrics responsively in a bounded grid. */
function MetricGroup({ columns = "auto", gap = "sm", minColumnWidth = 96, ...props }: MetricGroupProps) {
  return (
    <Grid
      data-slot="metric-group"
      columns={columns}
      gap={gap}
      minColumnWidth={minColumnWidth}
      {...props}
    />
  );
}

export { Metric, MetricCard, MetricGroup };
