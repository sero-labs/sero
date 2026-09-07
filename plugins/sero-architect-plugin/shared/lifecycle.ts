/**
 * Lifecycle rules as pure functions over the record. Every function returns a
 * new record or a refusal; nothing here touches a file. The runtime is the only
 * caller that persists the result, which keeps the single-writer rule simple.
 */

import { PHASE_ORDER, openDecisions, type ArchitectOverlay, type ArchitectPhase, type ProjectRecord } from './record';

export type Refusal = { ok: false; error: string };
export type Applied = { ok: true; record: ProjectRecord };
export type Outcome = Applied | Refusal;

const refuse = (error: string): Refusal => ({ ok: false, error });

/**
 * At most one overlay shows, in this precedence. Blocked is a stop the user
 * must read; limited is a stop the user must lift; paused is the user's own
 * stop; a decision is a wait. Each is a stop on new work, so the order only
 * decides which reason the user sees first.
 */
export function deriveOverlay(record: ProjectRecord): ArchitectOverlay | null {
  if (record.blockedReason !== null) return 'blocked';
  if (record.budget.capUsd !== null && record.budget.spentUsd >= record.budget.capUsd) return 'limited';
  if (record.paused) return 'paused';
  if (openDecisions(record).length > 0) return 'decision';
  return null;
}

/** Recomputes the derived fields. Every write goes through here. */
export function settle(record: ProjectRecord, now: string): ProjectRecord {
  return { ...record, overlay: deriveOverlay(record), updatedAt: now };
}

function recordHistory(record: ProjectRecord, now: string, cause: string): ProjectRecord {
  const settled = settle(record, now);
  return {
    ...settled,
    history: [...settled.history, { at: now, phase: settled.phase, overlay: settled.overlay, cause }],
  };
}

/** The forward phase transition. Only the next phase, and never past an unapproved charter. */
export function advancePhase(record: ProjectRecord, to: ArchitectPhase, now: string, cause: string): Outcome {
  const from = PHASE_ORDER.indexOf(record.phase);
  const target = PHASE_ORDER.indexOf(to);
  if (target !== from + 1) {
    return refuse(`Cannot move from ${record.phase} to ${to}: phases advance one step forward only.`);
  }
  if (record.phase === 'charter') {
    if (record.charter === null) return refuse('Cannot start building: no charter has been proposed.');
    if (record.charter.approvedAt === null) return refuse('Cannot start building: the charter is not approved by the user.');
    if (record.budget.capUsd === null) return refuse('Cannot start building: the charter has no approved cost cap.');
  }
  if (to === 'discovery' && record.workspaceId === null) {
    return refuse('Cannot start discovery: the workspace is not registered yet.');
  }
  return { ok: true, record: recordHistory({ ...record, phase: to }, now, cause) };
}

export function approveCharter(record: ProjectRecord, now: string): Outcome {
  if (record.charter === null) return refuse('There is no charter to approve.');
  if (record.charter.approvedAt !== null) return refuse('The charter is already approved.');
  const charter = { ...record.charter, approvedAt: now };
  const next = {
    ...record,
    charter,
    autonomy: charter.autonomy,
    budget: { ...record.budget, capUsd: charter.capUsd },
  };
  return { ok: true, record: recordHistory(next, now, 'user approved the charter') };
}

export function pause(record: ProjectRecord, now: string): Outcome {
  if (record.paused) return refuse('The project is already paused.');
  return { ok: true, record: recordHistory({ ...record, paused: true }, now, 'user paused the project') };
}

export function resume(record: ProjectRecord, now: string): Outcome {
  if (!record.paused) return refuse('The project is not paused.');
  return { ok: true, record: recordHistory({ ...record, paused: false }, now, 'user resumed the project') };
}

export function block(record: ProjectRecord, now: string, reason: string): Outcome {
  if (!reason.trim()) return refuse('A blocked project needs a reason.');
  return { ok: true, record: recordHistory({ ...record, blockedReason: reason.trim() }, now, `blocked: ${reason.trim()}`) };
}

export function unblock(record: ProjectRecord, now: string, cause: string): Outcome {
  if (record.blockedReason === null) return refuse('The project is not blocked.');
  return { ok: true, record: recordHistory({ ...record, blockedReason: null }, now, cause) };
}

/**
 * Charges spend and applies the cap. Charging happens before the check, and a
 * limit reached is recorded as the cause with the phase unchanged: a limit is
 * never progress.
 */
export function charge(
  record: ProjectRecord,
  source: keyof ProjectRecord['budget']['sources'],
  costUsd: number,
  now: string,
): ProjectRecord {
  if (!(costUsd > 0)) return record;
  const sources = { ...record.budget.sources, [source]: record.budget.sources[source] + costUsd };
  const budget = { ...record.budget, spentUsd: record.budget.spentUsd + costUsd, sources };
  const wasLimited = deriveOverlay(record) === 'limited';
  const next = { ...record, budget };
  const nowLimited = deriveOverlay(next) === 'limited';
  if (nowLimited && !wasLimited) {
    return recordHistory(next, now, `reached the $${budget.capUsd} cost cap`);
  }
  return settle(next, now);
}

export function setCap(record: ProjectRecord, capUsd: number, now: string): Outcome {
  if (!(capUsd > 0)) return refuse('The cost cap must be a positive amount.');
  const wasLimited = deriveOverlay(record) === 'limited';
  const next = { ...record, budget: { ...record.budget, capUsd }, charter: record.charter ? { ...record.charter, capUsd } : null };
  const cause = wasLimited && deriveOverlay(next) !== 'limited'
    ? `user raised the cap to $${capUsd}, limit cleared`
    : `user set the cap to $${capUsd}`;
  return { ok: true, record: recordHistory(next, now, cause) };
}

export function setAutonomy(record: ProjectRecord, autonomy: ProjectRecord['autonomy'], now: string): Outcome {
  if (record.autonomy === autonomy) return refuse(`Autonomy is already ${autonomy}.`);
  const charter = record.charter ? { ...record.charter, autonomy } : null;
  return { ok: true, record: recordHistory({ ...record, autonomy, charter }, now, `user set autonomy to ${autonomy}`) };
}

/** Is the owner allowed to be woken for ordinary work right now? Directives always may. */
export function mayWakeForWork(record: ProjectRecord): boolean {
  return deriveOverlay(record) === null || deriveOverlay(record) === 'decision';
}

/** Is a new dispatch allowed? Any overlay stops new work. */
export function mayDispatch(record: ProjectRecord): boolean {
  const working = record.phase === 'build' || record.phase === 'release' || record.phase === 'maintain';
  return working ? deriveOverlay(record) === null : false;
}
