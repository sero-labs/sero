/**
 * The footer status of a loop card on the home overview (specs/09-ui-redesign.md).
 * A running loop shows a live progress bar; everything else shows a status line.
 * Pure so the progress-vs-text decision and the blocked wording are unit-tested;
 * the component only handles the cosmetic relative-time suffix on a complete loop.
 */

import type { LoopSummary } from '../../shared/types';
import { LOOP_STATUS_STYLE } from './status-style';

export type LoopCardStatus =
  | { kind: 'progress'; done: number; total: number; current: number }
  | { kind: 'text'; text: string; tone: 'blocked' | 'muted'; showRelativeTime?: boolean };

export function loopCardStatus(loop: LoopSummary): LoopCardStatus {
  const p = loop.progress;
  if (p?.running && p.total > 0) {
    return { kind: 'progress', done: p.done, total: p.total, current: Math.min(p.done + 1, p.total) };
  }
  if (loop.status === 'complete') return { kind: 'text', text: 'Complete', tone: 'muted', showRelativeTime: true };
  if (loop.status === 'blocked') {
    return { kind: 'text', text: loop.pendingInput ? 'Blocked — needs input' : 'Blocked', tone: 'blocked' };
  }
  return { kind: 'text', text: LOOP_STATUS_STYLE[loop.status].label, tone: 'muted' };
}
