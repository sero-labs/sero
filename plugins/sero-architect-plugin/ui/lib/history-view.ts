/**
 * Pure derivations for the History view. Nothing here touches the bridge, so
 * every rule has a unit test.
 */

import type { HistoryEntry } from '../../shared/record';

/**
 * The line an entry shows.
 *
 * Every kind reads as the subject's name followed by what happened, so a
 * milestone entry names its milestone without parsing the sentence. A decision
 * is the one exception: its cause is already a complete sentence that names the
 * question, so a label before it would read twice.
 */
export function historyLine(entry: HistoryEntry): string {
  const subject = entry.subject;
  if (!subject || subject.kind === 'decision' || subject.label === null) return entry.cause;
  return `${subject.label} ${entry.cause}`;
}

/** Where an entry's link goes. */
export type HistoryLink =
  | { kind: 'evidence'; milestoneId: string }
  | { kind: 'workflow'; id: string }
  | { kind: 'room'; id: string };

/**
 * The one link an entry carries, or null when no link is drawn.
 *
 * The kind chooses the target: a milestone opens its evidence on the project
 * page, a Workflow or a Room opens that record in the Orchestrator, and a
 * decision has no destination. An entry written before subjects were saved has
 * no kind, so no link is invented for it.
 */
export function historyLink(entry: HistoryEntry): HistoryLink | null {
  const subject = entry.subject;
  if (!subject || subject.kind === 'decision') return null;
  if (subject.kind === 'milestone') return { kind: 'evidence', milestoneId: subject.id };
  return subject.kind === 'room' ? { kind: 'room', id: subject.id } : { kind: 'workflow', id: subject.id };
}

/** The word on the link, as the drawing prints it. */
export const HISTORY_LINK_LABEL: Record<HistoryLink['kind'], string> = {
  evidence: 'Evidence',
  workflow: 'Workflow',
  room: 'Room',
};

/** The dot an entry shows: a block, a question, an accepted milestone, or none. */
export type HistoryDot = 'block' | 'question' | 'accepted' | null;

export function historyDot(entry: HistoryEntry): HistoryDot {
  if (entry.overlay === 'blocked' || entry.cause.startsWith('blocked:')) return 'block';
  if (entry.cause === 'Architect asked a question') return 'question';
  if (entry.cause === 'accepted on passed evidence') return 'accepted';
  return null;
}

/**
 * The words an entry shows beside its time: a status word for a block or a
 * question, then the line.
 *
 * A block's cause is written as `blocked: <reason>`, and the drawing separates
 * the word from the reason. The prefix is a literal, so removing it is not the
 * id parsing this change removes elsewhere.
 */
export function historyHeadline(entry: HistoryEntry): { status: 'Blocked' | 'Question' | null; line: string } {
  const dot = historyDot(entry);
  const line = historyLine(entry);
  if (dot === 'block') return { status: 'Blocked', line: line.replace(/^blocked:\s*/i, '') };
  if (dot === 'question') return { status: 'Question', line };
  return { status: null, line };
}

/** How many entries the History view shows before "Show earlier". */
export const HISTORY_PAGE = 14;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The day heading the drawing prints: `10 Sep`. */
export function historyDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** The time on a timeline row: `01:45`. */
export function historyClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** One entry and the stable key its fold preference is saved under. */
export interface HistoryRow {
  entry: HistoryEntry;
  /** Comma-free, so the host's joined list round-trips it. */
  key: string;
}

export interface HistoryDay {
  label: string;
  rows: HistoryRow[];
}

/**
 * The newest `limit` entries, newest first, grouped under a heading per day.
 *
 * The key counts the entry's position from the oldest, which is stable because
 * a record's history is only ever appended to.
 */
export function historyDays(entries: readonly HistoryEntry[], limit: number): HistoryDay[] {
  const start = Math.max(0, entries.length - limit);
  const days: HistoryDay[] = [];
  for (let index = entries.length - 1; index >= start; index -= 1) {
    const entry = entries[index]!;
    const label = historyDay(entry.at);
    const row: HistoryRow = { entry, key: `${index}:${entry.at}` };
    const last = days[days.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else days.push({ label, rows: [row] });
  }
  return days;
}

/** The header's count and date range, as `30 changes` and `8 Sep – 10 Sep`. */
export function historyHeader(entries: readonly HistoryEntry[]): { count: string; range: string | null } {
  if (entries.length === 0) return { count: 'No changes', range: null };
  const oldest = entries[0]!;
  const newest = entries[entries.length - 1]!;
  const range = historyDay(oldest.at) === historyDay(newest.at)
    ? historyDay(newest.at)
    : `${historyDay(oldest.at)} – ${historyDay(newest.at)}`;
  return { count: `${entries.length} change${entries.length === 1 ? '' : 's'}`, range };
}
