// Status — a semantic status dot, label or pill.
//
// Replaces the hand-rolled `size-2 rounded-full` dots with inline hex colours
// that appear across the existing widgets. Encodes only neutral semantic tones,
// never plugin-specific status names — callers map their domain status onto a
// tone.

import * as React from "react";

import { cn } from "../../lib/utils";
import { toneColor, toneDot, tonePill, type Tone } from "./tone";

export interface StatusProps extends React.ComponentProps<"span"> {
  tone?: Tone;
  /** Presentation: coloured dot + label, a tinted pill, or a bare dot. */
  variant?: "dot" | "pill";
  /** Add a soft glow to the dot (e.g. a live/active indicator). */
  pulse?: boolean;
}

/** Semantic status dot, label or pill with neutral/success/warning/error/info tones. */
function Status({
  className,
  tone = "neutral",
  variant = "dot",
  pulse = false,
  children,
  ...props
}: StatusProps) {
  const hasLabel = children != null && children !== "";

  if (variant === "pill") {
    return (
      <span
        data-slot="status"
        data-tone={tone}
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
          tonePill[tone],
          className,
        )}
        {...props}
      >
        <span className={cn("size-1.5 shrink-0 rounded-full", toneDot[tone])} />
        {children}
      </span>
    );
  }

  return (
    <span
      data-slot="status"
      data-tone={tone}
      // A bare dot carries no text, so surface the tone to assistive tech.
      role={hasLabel ? undefined : "status"}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          toneDot[tone],
          // ring-current picks up the tone's text colour for a matching glow.
          pulse && cn(toneColor[tone], "ring-2 ring-current/25"),
        )}
      />
      {children}
    </span>
  );
}

export { Status };
