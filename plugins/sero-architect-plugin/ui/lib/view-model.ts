/**
 * Pure derivations from a project record: what the four parts of the page
 * show. Nothing here touches the bridge, so every rule has a unit test.
 */

import type {
  Decision,
  Directive,
  EvidenceRecord,
  Milestone,
  MilestoneStatus,
  ProjectRecord,
  VerificationState,
} from '../../shared/record';
import { openDecisions } from '../../shared/record';
import type { PillTone } from './format';

export type NeedsYouItem =
  | { kind: 'decision'; decision: Decision }
  | { kind: 'charter' }
  | { kind: 'milestone'; milestone: Milestone };

/** Open decisions first, then the charter gate, then plan approvals, the order the runtime counts them. */
export function needsYouItems(record: ProjectRecord): NeedsYouItem[] {
  const items: NeedsYouItem[] = openDecisions(record).map((decision) => ({ kind: 'decision', decision }));
  if (record.phase === 'charter' && record.charter && record.charter.approvedAt === null) items.push({ kind: 'charter' });
  if (record.autonomy === 'milestones' && record.phase === 'build') {
    for (const milestone of record.milestones) {
      if (milestone.status === 'planned' && milestone.plan !== null) items.push({ kind: 'milestone', milestone });
    }
  }
  return items;
}

/** The label of the recommended option, for the one-action answer button. */
export function recommendedOption(decision: Decision): Decision['options'][number] | null {
  return decision.options.find((option) => option.id === decision.recommendation) ?? decision.options[0] ?? null;
}

/** Milestone titles a decision parks, for the card's footer line. */
export function parkedTitles(decision: Decision, record: ProjectRecord): string[] {
  return decision.dependsOn
    .map((id) => record.milestones.find((milestone) => milestone.id === id)?.title ?? id);
}

export type RailDot = 'check' | 'ring' | 'verify' | 'parked' | 'hollow';

export interface RailRow {
  milestone: Milestone;
  dot: RailDot;
  /** The pill text: planned / approved / running / verifying / accepted / parked. */
  label: string;
  tone: PillTone;
  sub: string | null;
  /** 0-3 on the reported/verified/accepted/delivered ladder, or null when no claim exists yet. */
  ladder: number | null;
  link: { kind: 'workflow' | 'room'; id: string; workspaceId: string } | null;
}

const LADDER: readonly VerificationState[] = ['reported', 'verified', 'accepted', 'delivered'];

export function ladderLevel(state: VerificationState | null): number | null {
  return state === null ? null : LADDER.indexOf(state);
}

const DOT: Record<MilestoneStatus, RailDot> = {
  planned: 'hollow',
  approved: 'hollow',
  running: 'ring',
  verifying: 'verify',
  done: 'check',
  parked: 'parked',
};

const TONE: Record<MilestoneStatus, PillTone> = {
  planned: 'plain',
  approved: 'plain',
  running: 'ok',
  verifying: 'info',
  done: 'ok',
  parked: 'warn',
};

function subLine(milestone: Milestone, record: ProjectRecord): string | null {
  if (milestone.status === 'parked' && milestone.parkedBy) {
    const decision = record.decisions.find((d) => d.id === milestone.parkedBy);
    return decision ? `Parked on: ${decision.question}` : 'Parked on a decision';
  }
  if (milestone.status === 'running' && milestone.dispatch) {
    const where = milestone.dispatch.destination ? ` · delivers to ${milestone.dispatch.destination}` : '';
    return `${milestone.dispatch.kind === 'room' ? 'Room' : 'Workflow'} running${where}`;
  }
  if (milestone.status === 'verifying') return 'Reported complete; the runtime is checking the evidence';
  if (milestone.preview && milestone.status !== 'done') return `Closes with a capture of ${milestone.preview.route}`;
  if (milestone.status === 'done' && milestone.receipt) return `Delivered · ${milestone.receipt}`;
  return null;
}

export function railRows(record: ProjectRecord): RailRow[] {
  return record.milestones.map((milestone) => ({
    milestone,
    dot: DOT[milestone.status],
    label: milestone.status === 'done' ? 'accepted' : milestone.status,
    tone: TONE[milestone.status],
    sub: subLine(milestone, record),
    ladder: ladderLevel(milestone.verification),
    link: milestone.dispatch
      ? { kind: milestone.dispatch.kind, id: milestone.dispatch.id, workspaceId: milestone.dispatch.workspaceId }
      : null,
  }));
}

export function acceptedCount(record: ProjectRecord): number {
  return record.milestones.filter((milestone) => milestone.status === 'done').length;
}

export interface EvidenceLine {
  state: 'ok' | 'err' | 'dim';
  check: string;
  result: string;
}

/** One line per evidence item, in the order the runtime ran them. */
export function evidenceLines(evidence: EvidenceRecord): EvidenceLine[] {
  const lines: EvidenceLine[] = evidence.commands.map((command) => ({
    state: command.exitCode === 0 ? 'ok' : 'err',
    check: command.command,
    result: `exit ${command.exitCode} · ${Math.round(command.durationMs / 100) / 10}s`,
  }));
  if (evidence.diffSummary) lines.push({ state: 'ok', check: 'git diff', result: evidence.diffSummary });
  if (evidence.preview) {
    lines.push({
      state: evidence.preview.smokePassed ? 'ok' : 'err',
      check: `smoke ${evidence.preview.route}`,
      result: evidence.preview.smokePassed ? 'responded' : 'failed',
    });
    lines.push({
      state: evidence.preview.capturePath ? 'ok' : 'dim',
      check: `capture ${evidence.preview.route}`,
      result: evidence.preview.capturePath ? '1 screenshot' : 'none',
    });
  }
  return lines;
}

export interface DirectiveThread {
  latest: Directive | null;
  older: Directive[];
}

/** The newest directive is the thread the composer sits under; the rest sit behind a disclosure. */
export function directiveThread(record: ProjectRecord): DirectiveThread {
  const sorted = record.directives.toSorted((a, b) => b.sentAt.localeCompare(a.sentAt));
  return { latest: sorted[0] ?? null, older: sorted.slice(1) };
}

/** Whether the runtime will wake the owner for events right now. */
export function isAwake(record: ProjectRecord): boolean {
  return !record.paused && record.overlay !== 'limited' && record.overlay !== 'blocked' && record.phase !== 'intake';
}

export const AUTONOMY_LABEL: Record<ProjectRecord['autonomy'], string> = {
  milestones: 'You approve each milestone plan',
  'charter-only': 'You approve the charter only',
  'model-judged': 'The Architect decides what to raise',
};

/** The suggested new cap when the user raises it: the next round $20 above the current cap. */
export function suggestedCap(capUsd: number | null): number {
  if (capUsd === null) return 20;
  return Math.ceil((capUsd + 20) / 10) * 10;
}
