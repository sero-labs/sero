/**
 * The explicit-outcome rule: a wake ends with sleep, decide or blocked. A turn
 * that ends without one is no progress, and three in a row block the project.
 */

import { block } from '../shared/lifecycle';
import type { ProjectRecord } from '../shared/record';

export type OutcomeKind = 'sleep' | 'decide' | 'blocked';

export const SILENT_TURN_LIMIT = 3;

export interface TurnOutcomes {
  /** Marks a turn as started; clears any earlier declaration. */
  begin(projectId: string): void;
  /** Called by the owner actions that end a wake. */
  declare(projectId: string, kind: OutcomeKind): void;
  /** Reads and clears the declaration for the turn that just ended. */
  end(projectId: string): OutcomeKind | null;
}

export function createTurnOutcomes(): TurnOutcomes {
  const declared = new Map<string, OutcomeKind | null>();
  return {
    begin: (projectId) => { declared.set(projectId, null); },
    declare: (projectId, kind) => { declared.set(projectId, kind); },
    end: (projectId) => {
      const kind = declared.get(projectId) ?? null;
      declared.delete(projectId);
      return kind;
    },
  };
}

/**
 * Applies a finished turn to the record. A declared outcome resets the silent
 * count; a silent turn raises it, and the third blocks the project with a
 * reason the user can read.
 */
export function applyTurnOutcome(record: ProjectRecord, declared: OutcomeKind | null, now: string): ProjectRecord {
  const turns = record.session.turns + 1;
  if (declared) {
    return { ...record, session: { ...record.session, silentTurns: 0, turns } };
  }
  const silentTurns = record.session.silentTurns + 1;
  const next = { ...record, session: { ...record.session, silentTurns, turns } };
  if (silentTurns < SILENT_TURN_LIMIT || next.blockedReason !== null) return next;
  const blocked = block(next, now, `the owner ended ${SILENT_TURN_LIMIT} turns in a row without declaring an outcome (sleep, decide or blocked)`);
  return blocked.ok ? blocked.record : next;
}
