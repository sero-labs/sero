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
