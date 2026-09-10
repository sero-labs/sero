/** Small formatting helpers shared by the list, the page and the widget. */

import type { ArchitectOverlay, ArchitectPhase } from '../../shared/types';

export const PHASES: readonly ArchitectPhase[] = ['intake', 'discovery', 'charter', 'build', 'release', 'maintain'];

export function usd(value: number): string {
  return `$${value.toFixed(1).replace(/\.0$/, '')}`;
}

/** "$11.4 / $40" or "$0.9 · no cap". */
export function spendLabel(spentUsd: number, capUsd: number | null): string {
  return capUsd === null ? `${usd(spentUsd)} · no cap` : `${usd(spentUsd)} / ${usd(capUsd)}`;
}

export type SpendTone = 'ok' | 'warn' | 'err' | 'none';

/** Green under 80% of the cap, amber from 80%, red at the cap. No cap is toneless. */
export function spendTone(spentUsd: number, capUsd: number | null): SpendTone {
  if (capUsd === null || capUsd <= 0) return 'none';
  const ratio = spentUsd / capUsd;
  if (ratio >= 1) return 'err';
  if (ratio >= 0.8) return 'warn';
  return 'ok';
}

export function spendRatio(spentUsd: number, capUsd: number | null): number {
  if (capUsd === null || capUsd <= 0) return 0;
  return Math.min(1, spentUsd / capUsd);
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
