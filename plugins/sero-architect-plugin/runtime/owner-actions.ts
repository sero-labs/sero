/**
 * The runtime side of the `architect` tool. The owner session asks; this
 * module checks who is asking, validates the shape, changes the record, and
 * hands research, dispatch and evidence to the services that perform them.
 * The record is written here and nowhere else on the owner's behalf.
 */

import path from 'node:path';

import { parseCharter, toMilestone } from '../shared/charter-shape';
import { parseDecision, toDecision } from '../shared/decision-shape';
import { advancePhase, block, mayDispatch, mayWakeForWork, settle } from '../shared/lifecycle';
import {
  EVIDENCE_RESERVED_KEYS,
  type DispatchKind,
  type OwnerActionInput,
  type OwnerActionOutcome,
  type OwnerCallerSignals,
} from '../shared/owner-actions';
import type { Charter, Milestone, ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';
import type { TurnOutcomes } from './turn-outcomes';

export interface OwnerServices {
  research(record: ProjectRecord, request: { question: string; stoppingCondition: string }): Promise<{ id: string }>;
  dispatch(
    record: ProjectRecord,
    milestone: Milestone,
    request: { kind: DispatchKind; prompt: string },
  ): Promise<{ id: string; workspaceId: string }>;
  evidence(record: ProjectRecord, milestone: Milestone, request: { commands: string[]; route: string | null }): Promise<void>;
  /** True when files changed since the evidence was taken. The runtime marks it stale and reruns it. */
  evidenceIsStale(record: ProjectRecord, milestone: Milestone): Promise<boolean>;
}

export interface OwnerActionsDeps {
  host: Pick<ArchitectHost, 'now' | 'newId' | 'log'>;
  store: RecordStore;
  outcomes: TurnOutcomes;
  services: OwnerServices;
}

export interface OwnerActions {
  /** The project whose owner session is the caller, or null. */
  owns(signals: OwnerCallerSignals): Promise<ProjectRecord | null>;
  execute(signals: OwnerCallerSignals, input: OwnerActionInput): Promise<OwnerActionOutcome>;
}

const ok = (text: string, details: Record<string, unknown> = {}): OwnerActionOutcome => ({ ok: true, text, details });
const refuse = (text: string): OwnerActionOutcome => ({ ok: false, text });

const same = (a: string, b: string): boolean => path.resolve(a) === path.resolve(b);

function withHistory(record: ProjectRecord, now: string, cause: string): ProjectRecord {
  const settled = settle(record, now);
  return { ...settled, history: [...settled.history, { at: now, phase: settled.phase, overlay: settled.overlay, cause }] };
}

/** Why a milestone cannot close yet, in the owner's words. Empty means it can. */
export function missingEvidence(milestone: Milestone): string[] {
  const evidence = milestone.evidence;
  if (!evidence) return ['no evidence run has happened'];
  const missing: string[] = [];
  if (evidence.stale) missing.push('the evidence is stale: files changed after it was taken, so it must be rerun');
  if (evidence.commands.length === 0) missing.push('no command was run');
  for (const command of evidence.commands) {
    if (command.exitCode !== 0) missing.push(`command "${command.command}" failed with exit code ${command.exitCode}`);
  }
  if (milestone.preview) {
    if (!evidence.preview) missing.push(`the preview route ${milestone.preview.route} has no smoke check`);
    else {
      if (!evidence.preview.smokePassed) missing.push('the dev-server smoke check failed');
      if (!evidence.preview.capturePath) missing.push('no capture was recorded for the preview');
    }
  }
  return missing;
}

export function createOwnerActions(deps: OwnerActionsDeps): OwnerActions {
  const { host, store, outcomes, services } = deps;

  const owns = async (signals: OwnerCallerSignals): Promise<ProjectRecord | null> => {
    if (!signals.sessionPath) return null;
    const records = await store.list();
    return records.find((record) => record.session.sessionPath && same(record.session.sessionPath, signals.sessionPath ?? '')) ?? null;
  };

  const milestoneOf = (record: ProjectRecord, id: string | undefined): Milestone | string => {
    if (!id) return 'milestoneId is required.';
    return record.milestones.find((m) => m.id === id) ?? `Milestone "${id}" is not on this project.`;
  };

  const replace = (record: ProjectRecord, milestone: Milestone): ProjectRecord => ({
    ...record,
    milestones: record.milestones.map((m) => (m.id === milestone.id ? milestone : m)),
  });

  const unansweredDirective = (record: ProjectRecord) => record.directives.find((d) => d.reply === null);

  async function charter(record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome> {
    const parsed = parseCharter(input);
    if (!parsed.ok) return refuse(parsed.error);
    const { draft } = parsed;
    const milestones = draft.milestones.map((m, index) => toMilestone(m, `m${index + 1}`));
    const proposed: Charter = {
      milestoneIds: milestones.map((m) => m.id),
      escalationPolicy: draft.escalationPolicy,
      autonomy: draft.autonomy,
      capUsd: draft.capUsd,
      proposedAt: now,
      approvedAt: null,
    };
    if (record.charter?.approvedAt) {
      // Forced escalation: an approved charter changes only by a user decision.
      const decision = toDecision(
        {
          question: 'The owner proposes a change to the approved charter. Apply it?',
          options: [
            { id: 'apply', label: 'Apply the new charter', consequence: `The charter changes to ${milestones.length} milestone(s) with a $${draft.capUsd} cap and autonomy "${draft.autonomy}".` },
            { id: 'keep', label: 'Keep the current charter', consequence: 'Nothing changes; the owner continues under the approved charter.' },
          ],
          recommendation: 'apply',
          reason: 'the owner asked to change an approved charter',
          dependsOn: [],
        },
        host.newId('dec'),
        now,
        { kind: 'charter', charter: proposed, milestones },
      );
      const next = withHistory({ ...record, decisions: [...record.decisions, decision] }, now, `decision ${decision.id} raised: charter change proposed`);
      await store.write(next);
      outcomes.declare(record.id, 'decide');
      return ok(`The charter is already approved, so the change is recorded as decision ${decision.id} for the user to answer. Nothing was applied.`, { decisionId: decision.id });
    }
    if (record.phase !== 'discovery' && record.phase !== 'charter') {
      return refuse(`A charter is proposed during discovery, and the project is in ${record.phase}.`);
    }
    let next: ProjectRecord = { ...record, charter: proposed, milestones, stateLine: 'Charter proposed. Waiting for your approval.' };
    if (next.phase === 'discovery') {
      const advanced = advancePhase(next, 'charter', now, 'the owner proposed the charter');
      if (!advanced.ok) return refuse(advanced.error);
      next = advanced.record;
    } else {
      next = withHistory(next, now, 'the owner proposed a revised charter');
    }
    await store.write(next);
    return ok(`Charter proposed with ${milestones.length} milestone(s) and a $${draft.capUsd} cap. The user must approve it before any work starts; call sleep.`, {
      milestoneIds: proposed.milestoneIds,
    });
  }

  async function milestone(record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome> {
    if (!input.milestoneId) {
      const title = input.title?.trim();
      if (!title) return refuse('A new milestone needs a title.');
      if (record.phase !== 'build' && record.phase !== 'maintain') return refuse(`Milestones are added during build or maintain, and the project is in ${record.phase}. Propose them in the charter.`);
      const id = `m${record.milestones.length + 1}`;
      const created = toMilestone({ title, plan: input.plan?.trim() || null, previewRoute: input.previewRoute?.trim() || null }, id);
      await store.write(withHistory({ ...record, milestones: [...record.milestones, created] }, now, `milestone ${id} added`));
      return ok(`Milestone ${id} "${title}" added as planned.`, { milestoneId: id });
    }
    const found = milestoneOf(record, input.milestoneId);
    if (typeof found === 'string') return refuse(found);
    if (input.done) {
      if (found.status === 'done') return refuse(`Milestone ${found.id} is already done.`);
      if (found.status === 'running') return refuse(`Milestone ${found.id} is still running: the dispatched work has not reported completion, and there is no evidence yet.`);
      if (found.evidence && !found.evidence.stale && (await services.evidenceIsStale(record, found))) {
        // Files moved under the evidence: mark it, rerun the same commands, refuse.
        const stale: Milestone = { ...found, evidence: { ...found.evidence, stale: true }, verification: 'reported' };
        await store.write(settle(replace(record, stale), now));
        await services.evidence(replace(record, stale), stale, { commands: found.evidence.commands.map((c) => c.command), route: found.preview?.route ?? null });
        return refuse(`Milestone ${found.id} cannot close: files changed after the evidence was taken, so it is stale. The runtime is rerunning it; you are woken with the result.`);
      }
      const missing = missingEvidence(found);
      if (found.status !== 'verifying' || missing.length > 0) {
        const reasons = missing.length > 0 ? missing : [`the milestone is ${found.status}, not verifying`];
        return refuse(`Milestone ${found.id} cannot close. Missing: ${reasons.join('; ')}. Ask for an evidence run and wait for it to pass.`);
      }
      const accepted: Milestone = { ...found, status: 'done', verification: 'accepted' };
      await store.write(withHistory(replace(record, accepted), now, `milestone ${found.id} accepted on passed evidence`));
      return ok(`Milestone ${found.id} is done: accepted on evidence checked at ${found.evidence?.commit ?? 'unknown commit'}.`);
    }
    const updated: Milestone = {
      ...found,
      title: input.title?.trim() || found.title,
      plan: input.plan?.trim() || found.plan,
      preview: input.previewRoute?.trim() ? { route: input.previewRoute.trim() } : found.preview,
    };
    await store.write(settle(replace(record, updated), now));
    const approvalNote = record.autonomy === 'milestones' && updated.status === 'planned' && updated.plan
      ? ' The plan waits for the user\'s approval before it can dispatch.'
      : '';
    return ok(`Milestone ${updated.id} updated.${approvalNote}`);
  }

  async function decide(record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome> {
    const parsed = parseDecision(input);
    if (!parsed.ok) return refuse(parsed.error);
    for (const id of parsed.draft.dependsOn) {
      const found = record.milestones.find((m) => m.id === id);
      if (!found) return refuse(`parks names milestone "${id}", which is not on this project.`);
      if (found.status === 'done') return refuse(`Milestone ${id} is done and cannot be parked.`);
    }
    const decision = toDecision(parsed.draft, host.newId('dec'), now);
    const milestones = record.milestones.map((m) =>
      decision.dependsOn.includes(m.id) && m.status !== 'parked'
        ? { ...m, status: 'parked' as const, parkedBy: decision.id, parkedFrom: m.status }
        : m,
    );
    const next = withHistory(
      { ...record, decisions: [...record.decisions, decision], milestones },
      now,
      `decision ${decision.id} raised: ${decision.question}`,
    );
    await store.write(next);
    outcomes.declare(record.id, 'decide');
    return ok(`Decision ${decision.id} raised. ${decision.dependsOn.length > 0 ? `Parked: ${decision.dependsOn.join(', ')}. ` : ''}The user will answer; this wake is over.`, { decisionId: decision.id });
  }

  async function research(record: ProjectRecord, input: OwnerActionInput): Promise<OwnerActionOutcome> {
    const question = input.question?.trim();
    const stoppingCondition = input.stoppingCondition?.trim();
    if (!question) return refuse('question is required.');
    if (!stoppingCondition) return refuse('stoppingCondition is required: when the researcher should stop.');
    if (record.phase === 'intake') return refuse('Research starts once the workspace exists.');
    if (!mayWakeForWork(record)) return refuse(`The project is ${record.overlay}; no new research may start.`);
    const { id } = await services.research(record, { question, stoppingCondition });
    return ok(`Research ${id} started. Its result is attached to the record before your next wake. Call sleep if nothing else is needed now.`, { researchId: id });
  }

  async function dispatch(record: ProjectRecord, input: OwnerActionInput, now: string): Promise<OwnerActionOutcome> {
    const found = milestoneOf(record, input.milestoneId);
    if (typeof found === 'string') return refuse(found);
    if (!input.kind) return refuse('kind is required: workflow or room.');
    const prompt = input.prompt?.trim();
    if (!prompt) return refuse('prompt is required: the Workflow prompt or the Room mandate.');
    if (!mayDispatch(record)) {
      return refuse(record.overlay ? `The project is ${record.overlay}; no new dispatch may start.` : `Dispatch happens during build or maintain, and the project is in ${record.phase}.`);
    }
    if (found.status === 'parked') return refuse(`Milestone ${found.id} is parked by decision ${found.parkedBy}; it cannot dispatch until the user answers.`);
    if (found.status === 'running' || found.status === 'verifying' || found.status === 'done') {
      return refuse(`Milestone ${found.id} is ${found.status}; only a planned or approved milestone dispatches.`);
    }
    if (found.status === 'planned' && record.autonomy === 'milestones') {
      return refuse(`Milestone ${found.id} needs the user's approval of its plan first (autonomy is "milestones"). Write the plan and call sleep.`);
    }
    const link = await services.dispatch(record, found, { kind: input.kind, prompt });
    const running: Milestone = {
      ...found,
      status: 'running',
      verification: null,
      dispatch: { kind: input.kind, id: link.id, workspaceId: link.workspaceId, dispatchedAt: now, chargedUsd: 0 },
    };
    await store.write(withHistory(replace(record, running), now, `milestone ${found.id} dispatched as ${input.kind} ${link.id}`));
    return ok(`Milestone ${found.id} is running as ${input.kind} ${link.id}. You are woken when it completes, blocks or asks a question; call sleep.`, {
      milestoneId: found.id, dispatchKind: input.kind, dispatchId: link.id,
    });
  }

  async function evidence(record: ProjectRecord, input: OwnerActionInput): Promise<OwnerActionOutcome> {
    const reserved = (input.extraKeys ?? []).filter((key) => (EVIDENCE_RESERVED_KEYS as readonly string[]).includes(key));
    if (reserved.length > 0) {
      return refuse(`Evidence is produced by the runtime, never attached: the call carried ${reserved.join(', ')}. Name the commands to run and, for a preview milestone, the route; nothing else.`);
    }
    const found = milestoneOf(record, input.milestoneId);
    if (typeof found === 'string') return refuse(found);
    const commands = (input.commands ?? []).map((c) => c.trim()).filter(Boolean);
    if (commands.length === 0) return refuse('commands is required: at least one command for the runtime to run.');
    if (found.status === 'done') return refuse(`Milestone ${found.id} is already done.`);
    if (found.status === 'parked') return refuse(`Milestone ${found.id} is parked by decision ${found.parkedBy}.`);
    await services.evidence(record, found, { commands, route: input.route?.trim() || found.preview?.route || null });
    return ok(`Evidence run started for milestone ${found.id}: ${commands.length} command(s)${found.preview || input.route ? ' and the preview smoke check' : ''}. You are woken with the result; call sleep.`);
  }

  async function execute(signals: OwnerCallerSignals, input: OwnerActionInput): Promise<OwnerActionOutcome> {
    const owned = await owns(signals);
    if (!owned) return refuse('The architect tool is for a project\'s owner session, and this session is not one.');
    if (input.projectId !== owned.id) {
      return refuse(`Project "${input.projectId}" is not this session's project (${owned.id}). The record is unchanged.`);
    }
    const record = owned;
    const now = host.now();
    const text = input.text?.trim() ?? '';
    switch (input.action) {
      case 'brief': {
        if (!text) return refuse('text is required: the brief.');
        await store.write(settle({ ...record, brief: text }, now));
        return ok('Brief recorded.');
      }
      case 'status': {
        if (!text) return refuse('text is required: one line for the user.');
        await store.write(settle({ ...record, stateLine: text.split('\n')[0]?.slice(0, 160) ?? text }, now));
        return ok('State line updated. Remember to end the wake with sleep, decide or blocked.');
      }
      case 'reply': {
        if (!input.directiveId) return refuse('directiveId is required.');
        if (!text) return refuse('text is required: the reply.');
        const directive = record.directives.find((d) => d.id === input.directiveId);
        if (!directive) return refuse(`Directive "${input.directiveId}" is not on this project.`);
        if (directive.reply) return refuse(`Directive ${directive.id} already has a reply.`);
        const directives = record.directives.map((d) => (d.id === directive.id ? { ...d, reply: { text, repliedAt: now } } : d));
        await store.write(settle({ ...record, directives }, now));
        return ok(`Reply recorded for directive ${directive.id}.`);
      }
      case 'blocked': {
        if (!text) return refuse('text is required: why you cannot go on.');
        const pending = unansweredDirective(record);
        if (pending) return refuse(`Reply to directive ${pending.id} before you end the wake.`);
        const blocked = block(record, now, text);
        if (!blocked.ok) return refuse(blocked.error);
        await store.write(blocked.record);
        outcomes.declare(record.id, 'blocked');
        return ok('The project is blocked; the user decides what happens next. This wake is over.');
      }
      case 'sleep': {
        const pending = unansweredDirective(record);
        if (pending) return refuse(`Reply to directive ${pending.id} before you sleep.`);
        outcomes.declare(record.id, 'sleep');
        return ok('Sleeping. You are woken by the next event.');
      }
      case 'decide': {
        const pending = unansweredDirective(record);
        if (pending) return refuse(`Reply to directive ${pending.id} before you end the wake.`);
        return decide(record, input, now);
      }
      case 'charter':
        return charter(record, input, now);
      case 'milestone':
        return milestone(record, input, now);
      case 'research':
        return research(record, input);
      case 'dispatch':
        return dispatch(record, input, now);
      case 'evidence':
        return evidence(record, input);
    }
  }

  return { owns, execute };
}
