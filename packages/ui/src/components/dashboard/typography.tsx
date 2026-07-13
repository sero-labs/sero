// Typography and media primitives for dashboard widgets.
//
// Text, Heading and Icon give one type scale and one icon treatment so
// equivalent text and icons render identically across widgets, replacing the
// scattered `text-xs`/`text-sm` and per-widget muted colours.

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { toneColor, type Tone } from "./tone";

// ── Text ─────────────────────────────────────────────────────────

const textVariants = cva("min-w-0", {
  variants: {
    variant: {
      body: "text-base text-[var(--text-primary)]",
      label:
        "text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]",
      supporting: "text-xs text-[var(--text-secondary)]",
      muted: "text-xs text-[var(--text-muted)]",
      numeric:
        "text-base font-semibold tabular-nums text-[var(--text-primary)]",
    },
  },
  defaultVariants: { variant: "body" },
});

export interface TextProps
  extends Omit<React.ComponentProps<"span">, "color">,
    VariantProps<typeof textVariants> {
  /** Truncate to a single line with an ellipsis. */
  truncate?: boolean;
  /** Clamp to N lines. Overrides `truncate`. */
  clamp?: 1 | 2 | 3;
  /** Semantic colour override (e.g. a numeric value that turns red on error). */
  tone?: Tone;
  asChild?: boolean;
}

const clampClass = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
} as const;

/** Semantic text with truncation, line-clamp and optional tone. */
function Text({
  className,
  variant,
  truncate,
  clamp,
  tone,
  ...props
}: TextProps) {
  return (
    <span
      data-slot="text"
      className={cn(
        textVariants({ variant }),
        clamp ? clampClass[clamp] : truncate && "truncate",
        tone && toneColor[tone],
        className,
      )}
      {...props}
    />
  );
}

// ── Heading ──────────────────────────────────────────────────────

const headingSize = {
  sm: "text-xs font-semibold",
  md: "text-base font-semibold",
  lg: "text-base font-semibold",
} as const;

export interface HeadingProps extends React.ComponentProps<"h2"> {
  /** HTML heading level for correct document semantics (1–4). */
  level?: 1 | 2 | 3 | 4;
  /** Visual size, decoupled from the semantic level. */
  size?: keyof typeof headingSize;
  truncate?: boolean;
}

/** Compact heading with correct HTML semantics decoupled from visual size. */
function Heading({
  className,
  level = 2,
  size = "md",
  truncate,
  ...props
}: HeadingProps) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
  return (
    <Tag
      data-slot="heading"
      className={cn(
        "leading-snug text-[var(--text-primary)]",
        headingSize[size],
        truncate && "truncate",
        className,
      )}
      {...props}
    />
  );
}

// ── Icon ─────────────────────────────────────────────────────────

const iconSize = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
} as const;

export interface IconProps extends React.ComponentProps<"span"> {
  /** The icon component to render (e.g. a lucide-react icon). */
  icon: React.ComponentType<{ className?: string }>;
  size?: keyof typeof iconSize;
  tone?: Tone;
  /**
   * Accessible label. When omitted the icon is decorative and hidden from
   * assistive tech; when provided it is exposed as an image with this name.
   */
  label?: string;
}

/** Consistent icon wrapper for size, tone and accessibility. */
function Icon({ className, icon: IconCmp, size = "md", tone, label, ...props }: IconProps) {
  return (
    <span
      data-slot="icon"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        tone ? toneColor[tone] : "text-[var(--text-muted)]",
        className,
      )}
      {...props}
    >
      <IconCmp className={iconSize[size]} />
    </span>
  );
}

export { Text, Heading, Icon };
