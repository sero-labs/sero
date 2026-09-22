/** Small formatting helpers shared by the list, the page and the widget. */

import { relativeTime, spendRatio, spendTone } from '@sero-ai/common';
import type { ProjectActivity } from '../../shared/activity';
import type { ArchitectOverlay, ArchitectPhase } from '../../shared/types';

// The rule lives in @sero-ai/common so a project, a Room and a single member
// cannot disagree about whether something is at its limit. Re-exported here
// because every Architect surface imports it from this module.
export { spendRatio, spendTone };

/**
 * Whose work it is, and when it last said so. Times are formatted at render,
 * because the index is written once and read for days.
 *
 * It lives here, not beside the component that shows it, so the component file
 * exports components only and Fast Refresh can keep their state.
 */
export function ownerSentence(activity: ProjectActivity): string {
  const when = activity.ownerAt ? relativeTime(activity.ownerAt) : '';
  const owner = [activity.owner, when].filter(Boolean).join(' ');
  return [owner, activity.ownerSuffix].filter(Boolean).join(' · ');
}

/**
 * The project header's lines under the heading. When the record saved why the
 * work stopped, the reason takes a line of its own and carries what the
 * Architect itself is doing, so neither fact is printed twice. Without a
 * reason this is the same one line the projects list shows.
 */
export function headerSentences(activity: ProjectActivity): { owner: string; reason: string | null } {
  if (!activity.reason) return { owner: ownerSentence(activity), reason: null };
  const when = activity.ownerAt ? relativeTime(activity.ownerAt) : '';
  return {
    owner: [activity.owner, when].filter(Boolean).join(' '),
    reason: [activity.reason, activity.ownerSuffix].filter(Boolean).join(' · '),
  };
}

export const PHASES: readonly ArchitectPhase[] = ['intake', 'discovery', 'charter', 'build', 'release', 'maintain'];

export function usd(value: number): string {
  return `$${value.toFixed(1).replace(/\.0$/, '')}`;
}

/**
 * An amount in cents, as the list and the project header print it: "$5.52",
 * "$10", "$0.064".
 *
 * Cents are kept because a cap is read against them, and a third decimal is
 * only added when two would round a real charge to nothing. A whole amount
 * drops its zeros, so a $10 cap does not read as "$10.00".
 */
export function money(value: number): string {
  const cents = value.toFixed(2);
  if (value !== 0 && Number(cents) === 0) return `$${value.toPrecision(2)}`;
  return `$${cents.replace(/\.00$/, '')}`;
}

/** "$5.52 of $10" or "$0.9 · no cap". */
export function spendLabel(spentUsd: number, capUsd: number | null): string {
  return capUsd === null ? `${money(spentUsd)} · no cap` : `${money(spentUsd)} of ${money(capUsd)}`;
}

export const OVERLAY_LABEL: Record<ArchitectOverlay, string> = {
  decision: 'Decision',
  blocked: 'Blocked',
  paused: 'Paused',
  limited: 'Limited',
};

export type PillTone = 'ok' | 'warn' | 'err' | 'info' | 'violet' | 'plain';

export function overlayTone(overlay: ArchitectOverlay): PillTone {
  if (overlay === 'decision') return 'warn';
  if (overlay === 'paused') return 'plain';
  return 'err';
}

/** "09:41" for today, "Tue 09:41" inside a week, else "12 Mar". */
export function shortTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return hhmm;
  const ageMs = now.getTime() - date.getTime();
  if (ageMs < 7 * 24 * 60 * 60 * 1000) {
    return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${hhmm}`;
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The two-letter glyph a row leads with. */
export function glyph(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '··';
}

/** Collapse a home-directory prefix to `~` for display only. */
export function homeRelative(folder: string, home: string | null): string {
  if (!home) return folder;
  const trimmed = home.replace(/[\\/]+$/, '');
  return folder.startsWith(trimmed) ? `~${folder.slice(trimmed.length)}` : folder;
}
