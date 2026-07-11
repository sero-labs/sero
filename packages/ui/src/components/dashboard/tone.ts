// Shared semantic tone vocabulary for dashboard components.
//
// Tones map to the `--status-*` design tokens in styles/globals.css so every
// dashboard component speaks one status language. Components must never encode
// plugin-specific status names (e.g. "running", "queued") — they map their
// domain status onto one of these neutral tones.

export type Tone = "neutral" | "success" | "warning" | "error" | "info";

/** Solid foreground colour for a tone (dots, icons, emphasised text). */
export const toneColor: Record<Tone, string> = {
  neutral: "text-[var(--text-muted)]",
  success: "text-[var(--status-success)]",
  warning: "text-[var(--status-warning)]",
  error: "text-[var(--status-error)]",
  info: "text-[var(--status-info)]",
};

/** Solid background colour for a tone (status dots). */
export const toneDot: Record<Tone, string> = {
  neutral: "bg-[var(--text-muted)]",
  success: "bg-[var(--status-success)]",
  warning: "bg-[var(--status-warning)]",
  error: "bg-[var(--status-error)]",
  info: "bg-[var(--status-info)]",
};

/**
 * Default accessible name for a tone, used as the text alternative when a
 * status indicator carries no visible label. Generic by design — callers with
 * a domain-specific meaning should pass their own `aria-label`.
 */
export const toneLabel: Record<Tone, string> = {
  neutral: "Neutral",
  success: "Success",
  warning: "Warning",
  error: "Error",
  info: "Info",
};

/** Muted tinted background + matching text for a tone (pills, chips). */
export const tonePill: Record<Tone, string> = {
  neutral: "bg-[var(--surface-flat)] text-[var(--text-secondary)]",
  success: "bg-[var(--status-success-muted)] text-[var(--status-success)]",
  warning: "bg-[var(--status-warning-muted)] text-[var(--status-warning)]",
  error: "bg-[var(--status-error-muted)] text-[var(--status-error)]",
  info: "bg-[var(--status-info-muted)] text-[var(--status-info)]",
};
