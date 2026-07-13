// lib/format.ts — Shared formatting helpers for the web UI.

// Relative time ("2m ago") is shared across Sero UIs — see @sero-ai/common.
export { relativeTime } from '@sero-ai/common';

/** Extract the domain from a URL string. */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Truncate text to a max length with ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

/** Format a character count as a human-readable string. */
export function formatChars(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}
