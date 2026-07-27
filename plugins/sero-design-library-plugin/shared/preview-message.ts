/**
 * The only vocabulary that crosses the preview boundary (spec §7).
 *
 * Shared rather than owned by the runtime because both sides need it: the
 * harness inside the frame sends these, and the UI outside it renders them. One
 * definition means a message the frame can send is always a message the surface
 * knows how to show.
 *
 * Outbound only, save for one exception. The frame reports what it tried and was
 * refused; the sole thing it accepts back is a value for a control that
 * revision's own manifest declared — a custom property name and a string, never
 * a selector, a stylesheet or code.
 */

export const PREVIEW_MESSAGE_SOURCE = 'sero-design-preview';

export interface PreviewMessage {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  /** `ready` once the document is up; `blocked` and `error` are the warnings. */
  kind: 'ready' | 'blocked' | 'error';
  /** What was attempted: `fetch`, `window.open`, `navigation`, `script`. */
  capability: string;
  /** The argument or message, truncated. Empty for `ready`. */
  detail: string;
}

export function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.source === PREVIEW_MESSAGE_SOURCE &&
    (candidate.kind === 'ready' || candidate.kind === 'blocked' || candidate.kind === 'error') &&
    typeof candidate.capability === 'string' &&
    typeof candidate.detail === 'string'
  );
}
