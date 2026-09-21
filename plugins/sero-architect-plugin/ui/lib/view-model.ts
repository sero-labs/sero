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
import { shortTime, type PillTone } from './format';

export type NeedsYouItem =
  | { kind: 'decision'; decision: Decision }
  | { kind: 'charter' }
  | { kind: 'milestone'; milestone: Milestone };

/** Open decisions first, then the charter gate, then plan approvals, the order the runtime counts them. */
export function needsYouItems(record: ProjectRecord): NeedsYouItem[] {
  const items: NeedsYouItem[] = openDecisions(record).map((decision) => ({ kind: 'decision', decision }));
  if (record.phase === 'charter' && record.charter && record.charter.approvedAt === null) items.push({ kind: 'charter' });
  const working = record.phase === 'build' || record.phase === 'release' || record.phase === 'maintain';
  if (record.autonomy === 'milestones' && working) {
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

/** The maintenance milestone is a standing subscription: running means watching, not executing. */
function isSubscription(milestone: Milestone): boolean {
  return milestone.id === 'maintenance' && milestone.status === 'running' && !milestone.dispatch?.failure;
}

function subLine(milestone: Milestone, record: ProjectRecord): string | null {
  if (milestone.dispatch?.failure) return milestone.dispatch.failure;
  if (milestone.status === 'parked' && milestone.parkedBy) {
    const decision = record.decisions.find((d) => d.id === milestone.parkedBy);
    return decision ? `Waiting for your answer: ${decision.question}` : 'Waiting for your answer';
  }
  if (isSubscription(milestone)) {
    // One item, the nearest fact: the next fire when the schedule is known, else the last run.
    if (milestone.dispatch?.nextRunAt) return `Next run ${shortTime(milestone.dispatch.nextRunAt)}`;
    if (milestone.dispatch?.lastRunAt) return `Last run ${shortTime(milestone.dispatch.lastRunAt)}`;
    return null;
  }
  if (milestone.status === 'running' && milestone.dispatch) {
    const where = milestone.dispatch.destination ? ` · delivers to ${milestone.dispatch.destination}` : '';
    return `${milestone.dispatch.kind === 'room' ? 'Room' : 'Workflow'} is running${where}`;
  }
  if (milestone.status === 'verifying') return 'The run reported completion. Evidence is being checked.';
  if (milestone.preview && milestone.status !== 'done') return `Ends with a capture of ${milestone.preview.route}`;
  if (milestone.status === 'done' && milestone.receipt) return `Delivered · ${milestone.receipt}`;
  return null;
}

export function railRows(record: ProjectRecord): RailRow[] {
  return record.milestones.map((milestone) => ({
    milestone,
    dot: DOT[milestone.status],
    label: milestone.dispatch?.failure ? 'interrupted' : milestone.status === 'done' ? 'accepted' : isSubscription(milestone) ? 'watching' : milestone.status,
    tone: milestone.dispatch?.failure ? 'warn' : TONE[milestone.status],
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

export interface EvidenceCheck {
  /** How the check ended. `dim` is "nothing to report", which is not a failure. */
  state: 'ok' | 'err' | 'dim';
  /**
   * The row's label — the command, or what the check was with its outcome,
   * where the outcome IS the point ("17 new files", "Page / responded").
   */
  name: string;
  /** An outcome the label cannot carry, such as why a smoke check failed. */
  detail?: string;
  /**
   * The check's own duration. Absent when the record holds none — a list of
   * files and a capture have no duration, and one is never invented for them.
   */
  durationMs?: number;
  /** The check's own COMPLETE output, which opens from its own row. */
  output?: string;
  /** Set on the capture row: it opens the project preview rather than text. */
  opensPreview?: boolean;
}

/**
 * What changed, as the drawn row reads it: "17 new files".
 *
 * The summary is `git diff --stat` for tracked files followed by an
 * `untracked:` block, so the two are counted apart rather than added together:
 * a file git already tracks did not arrive new.
 */
function changedFilesName(diffSummary: string): string {
  const marker = diffSummary.indexOf('untracked:');
  const tracked = marker < 0 ? diffSummary.trim() : diffSummary.slice(0, marker).trim();
  const untracked = marker < 0
    ? []
    : diffSummary.slice(marker + 'untracked:'.length).split('\n').filter((line) => line.trim().length > 0);
  const parts: string[] = [];
  if (tracked.length > 0) parts.push('changed files');
  if (untracked.length > 0) parts.push(`${untracked.length} new file${untracked.length === 1 ? '' : 's'}`);
  return parts.join(' · ') || 'changed files';
}

/**
 * One row per check, in the order the runtime ran them.
 *
 * Each row owns its own output, so nothing prints every command's log at once
 * and no output is cut to fit a summary line.
 */
export function evidenceLines(evidence: EvidenceRecord): EvidenceCheck[] {
  const checks: EvidenceCheck[] = evidence.commands.map((command) => ({
    state: command.exitCode === 0 ? 'ok' : 'err',
    name: command.command,
    durationMs: command.durationMs,
    ...(command.output.trim() ? { output: command.output } : {}),
  }));
  if (evidence.diffSummary) {
    checks.push({
      state: 'ok',
      name: changedFilesName(evidence.diffSummary),
      output: evidence.diffSummary,
    });
  }
  if (evidence.preview) {
    checks.push(evidence.preview.smokePassed
      ? { state: 'ok', name: `Page ${evidence.preview.route} responded` }
      : { state: 'err', name: `Page ${evidence.preview.route}`, detail: evidence.preview.failure ?? 'did not respond' });
    checks.push(evidence.preview.capturePath
      ? { state: 'ok', name: `Screenshot of ${evidence.preview.route}`, opensPreview: true }
      : { state: 'dim', name: `No screenshot of ${evidence.preview.route}` });
  }
  return checks;
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

export function projectActivity(record: ProjectRecord): string {
  if (record.blockedReason) return 'Work is on hold';
  if (record.paused) return 'Paused';
  if (record.session.workingSince) return 'Architect is working';
  if (record.preparingMaintenance) return 'Preparing the maintenance Workflow';
  const research = record.pendingResearch?.find((entry) => entry.kind);
  if (research) return research.roomId ? 'A Room is working on a project task' : research.workflowId ? 'A Workflow is working on a project question' : 'Preparing research or review';
  const pending = record.milestones.find((milestone) => milestone.pendingDispatch);
  if (pending) return `Starting ${pending.title}. Waiting for the workflow to respond.`;
  const running = record.milestones.filter((milestone) => milestone.status === 'running');
  if (running.length) return `Work in progress: ${running.map((milestone) => milestone.title).join(', ')}`;
  return isAwake(record) ? 'Waiting for the next event' : 'Architect is stopped';
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
