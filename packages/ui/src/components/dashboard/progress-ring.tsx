// ProgressRing — an accessible circular progress / donut gauge.
//
// Pure SVG so consuming plugins need no charting dependency. Exposes an
// accessible progressbar with value semantics and supports centre content.

import * as React from "react";

import { cn } from "../../lib/utils";
import { toneColor, type Tone } from "./tone";

export interface ProgressRingProps
  extends Omit<React.ComponentProps<"div">, "children"> {
  /** Current value. */
  value: number;
  /** Maximum value the ring represents. */
  max?: number;
  /** Outer diameter in pixels. */
  size?: number;
  /** Stroke width in pixels. */
  thickness?: number;
  tone?: Tone;
  /** Accessible name for the gauge. */
  label?: string;
  /** Show the percentage in the centre when no children are provided. */
  showValue?: boolean;
  /** Custom centre content (overrides `showValue`). */
  children?: React.ReactNode;
}

/** Circular progress / donut gauge for a bounded value. */
function ProgressRing({
  className,
  value,
  max = 100,
  size = 44,
  thickness = 4,
  tone = "info",
  label,
  showValue = true,
  children,
  ...props
}: ProgressRingProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const pct = max > 0 ? clamped / max : 0;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);
  const center = size / 2;

  return (
    <div
      data-slot="progress-ring"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        toneColor[tone],
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--surface-line)"
          strokeWidth={thickness}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[var(--text-primary)]">
        {children ??
          (showValue && (
            <span className="text-xs font-semibold tabular-nums">
              {Math.round(pct * 100)}%
            </span>
          ))}
      </div>
    </div>
  );
}

export { ProgressRing };
