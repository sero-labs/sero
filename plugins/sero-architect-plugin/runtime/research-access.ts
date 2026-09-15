/**
 * A research Room's planner question, answered on the project page.
 *
 * A read-only Room cannot run anything. When its planner asks for a shell, the
 * Architect used to block the whole project with that question as the reason
 * and no decision to answer. Here the question becomes a decision: the user can
 * widen the Room to edit-workspace, hand the Architect a note, or withdraw the
 * question. The runtime applies the answer; the owner is only told about it.
 */

import { toDecision } from '../shared/decision-shape';
import { settle } from '../shared/lifecycle';
import type { DecisionOption, PendingResearch, ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';

interface ResearchAccessDeps {
  host: Pick<ArchitectHost, 'now' | 'newId'>;
  store: RecordStore;
}

const ALLOW_COMMANDS: DecisionOption = {
  id: 'allow-commands',
  label: 'Let the Room run commands',
  consequence: 'The research is planned again with edit-workspace access: each member gets its own worktree and may run tests and builds. It still must not implement the product.',
};
const ANSWER_NOTE: DecisionOption = {
  id: 'answer-note',
  label: 'Answer in a note',
  consequence: 'The research is withdrawn and your note is given to the Architect, which rewords the question.',
};
const WITHDRAW: DecisionOption = {
  id: 'withdraw',
  label: 'Withdraw the question',
  consequence: 'The research is dropped. The Architect is told and continues without it.',
};

/** Whether this research already waits on an unanswered planner question. */
export function hasOpenResearchAccessDecision(record: ProjectRecord, researchId: string): boolean {
  return record.decisions.some((decision) => decision.answer === null
    && decision.proposal?.kind === 'research-access' && decision.proposal.researchId === researchId);
}

export async function raiseResearchAccessDecision(
  deps: ResearchAccessDeps,
  projectId: string,
  pending: PendingResearch,
  questions: string[],
): Promise<void> {
  const now = deps.host.now();
  const canWiden = (pending.access ?? 'read-only') === 'read-only';
  const options = canWiden ? [ALLOW_COMMANDS, ANSWER_NOTE, WITHDRAW] : [ANSWER_NOTE, WITHDRAW];
  const decision = toDecision({
    question: `The research Room asked: ${questions.join(' ')}`,
    options,
    recommendation: canWiden ? ALLOW_COMMANDS.id : ANSWER_NOTE.id,
    reason: `The Room planner cannot plan research ${pending.id} without this answer. The Room was asked for ${pending.access ?? 'read-only'} access.`,
    dependsOn: [],
  }, deps.host.newId('dec'), now, { kind: 'research-access', researchId: pending.id });
  await deps.store.update(projectId, (fresh) => {
    if (hasOpenResearchAccessDecision(fresh, pending.id)) return null;
    return settle({
      ...fresh,
      stateLine: 'The research Room needs an answer from you.',
      decisions: [...fresh.decisions, decision],
      history: [...fresh.history, { at: now, phase: fresh.phase, overlay: fresh.overlay, cause: `decision ${decision.id} raised: the research Room asked a question` }],
    }, now);
  });
}

/**
 * Applies the user's answer. Widening restarts the same research entry with
 * edit-workspace access and a fresh attempt count; the other answers drop it.
 */
export async function applyResearchAccessAnswer(
  deps: ResearchAccessDeps & { restartResearch(record: ProjectRecord, researchId: string): void },
  projectId: string,
  researchId: string,
  optionId: string,
): Promise<void> {
  const now = deps.host.now();
  if (optionId === ALLOW_COMMANDS.id) {
    const updated = await deps.store.update(projectId, (fresh) => settle({
      ...fresh,
      stateLine: 'The research Room is planned again with command access.',
      pendingResearch: fresh.pendingResearch?.map((entry) => entry.id === researchId
        ? { ...entry, access: 'edit-workspace' as const, attempts: 0 }
        : entry),
    }, now));
    if (updated) deps.restartResearch(updated, researchId);
    return;
  }
  await deps.store.update(projectId, (fresh) => settle({
    ...fresh,
    stateLine: optionId === WITHDRAW.id ? 'The research question was withdrawn.' : 'The research question goes back to the Architect with your note.',
    pendingResearch: fresh.pendingResearch?.filter((entry) => entry.id !== researchId),
  }, now));
}
