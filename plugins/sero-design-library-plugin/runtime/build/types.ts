/**
 * What a build produces.
 *
 * `document` absent means nothing renderable came out, and the variant must not
 * be called ready — a warning is a note about a page that works, never a
 * substitute for one that does not (spec §7).
 */
export interface BuildResult {
  document?: string;
  /** Refusals and repairs, in the order they happened. Shown outside the frame. */
  warnings: string[];
}
