/**
 * The stub model's side of the `rooms` probe: the Room planner, the adjust
 * call, and the three members the planner staffs. A member is told apart by
 * the name its prompt gives it.
 */
import { STUB_MODEL_ID, STUB_PROVIDER_ID, type StubReply, type StubRequest } from '../../stub-model';
import type { StepContext } from '../types';
import { holdCommand } from './rooms-support';
import { cliCall, identityText, lastUserText, runTurn, userMessages, type ScriptedCall } from './session-script';

export const LEAD = 'tc-lead';
export const WORKER = 'tc-worker';
export const REVIEWER = 'tc-reviewer';
export const ROOM_TITLE = 'Tc Room';
export const ADJUSTED_TITLE = 'Tc Room, adjusted';
export const QUESTION_ONE = 'tc-question-one';
export const QUESTION_TWO = 'tc-question-two';
export const ANSWER_ONE = 'tc-answer-one';
export const ARTIFACT_BODY = 'tc-artifact-body';
export const INTERVENE_NOTE = 'tc-intervene-note';
export const WORKER_TOOL = 'web_search';
export const RAISED_COST = 50;

const MODEL = `${STUB_PROVIDER_ID}/${STUB_MODEL_ID}`;

interface MemberSpec {
  key: string;
  displayName: string;
  role: string;
  isConductor: boolean;
  tools: string[];
  permissions: 'read-only' | 'edit-workspace';
}

const MEMBERS: MemberSpec[] = [
  { key: LEAD, displayName: 'Tc Lead', role: 'Conductor', isConductor: true, tools: ['read', 'write', 'edit', 'bash'], permissions: 'edit-workspace' },
  { key: WORKER, displayName: 'Tc Worker', role: 'Worker', isConductor: false, tools: ['read'], permissions: 'read-only' },
  { key: REVIEWER, displayName: 'Tc Reviewer', role: 'Reviewer', isConductor: false, tools: ['read'], permissions: 'read-only' },
];

function plan(thinking: string): string {
  return JSON.stringify({
    title: ROOM_TITLE,
    approach: 'A lead, a worker and a reviewer talk to each other.',
    objective: 'Give the tool check a Room that asks, answers and changes.',
    successCriteria: ['The members take their turns.'],
    roomInstructions: 'Stay in your working copy. Do what the check asks.',
    collaborationStrategy: 'The lead answers the worker.',
    teamRationale: 'Three members are enough to ask, answer and review.',
    workspacePolicy: { mode: 'worktree-per-member' },
    estimatedDurationMs: 60_000,
    estimatedCostUsd: 0.1,
    openAssumptions: [],
    members: MEMBERS.map((member) => ({
      key: member.key,
      displayName: member.displayName,
      role: member.role,
      responsibility: `${member.displayName} takes part in the check.`,
      mandate: `Do what the tool check asks of ${member.displayName}. Do not touch other files.`,
      reasonForInclusion: 'The check needs this member.',
      isConductor: member.isConductor,
      model: MODEL,
      thinking,
      promptAdditions: [],
      tools: member.tools,
      skills: [],
      permissions: member.permissions,
      needsWorktree: member.isConductor,
    })),
  });
}

/** The blueprint the user approved, from the adjust call's task, with the title changed. */
function adjusted(task: string): string {
  const match = /The user approved this Room blueprint:\n\n([\s\S]*?)\n\nThey now ask for this change:/.exec(task);
  if (!match) throw new Error('the adjust call did not carry the approved blueprint');
  const blueprint = JSON.parse(match[1]!) as Record<string, unknown>;
  delete blueprint.schemaVersion;
  return JSON.stringify({ ...blueprint, title: ADJUSTED_TITLE });
}

/** Answers the Room planner's two calls. */
export function plannerResponder(request: StubRequest): StubReply | undefined {
  const task = userMessages(request)[0]?.text ?? '';
  if (request.system.includes('A user has an approved team blueprint')) return { text: adjusted(task) };
  if (!request.system.includes('You are the ROOM PLANNER')) return undefined;
  const thinking = /AVAILABLE THINKING LEVELS[^\n]*\n([^\n,]+)/.exec(task)?.[1]?.trim() ?? 'off';
  return { text: plan(thinking) };
}

const room = (command: string, params: Record<string, unknown>): ScriptedCall => cliCall('room', { command, ...params });

/**
 * The members. A Room starts only its Conductor, whose first turn wakes the
 * others. It holds its turn open on the first question, so the Room is never
 * "stalled" while the user answers and releases; once the gate opens it
 * proposes two setup changes and a raise of the cost limit.
 */
export function memberResponder(ctx: StepContext): (request: StubRequest) => StubReply | undefined {
  let holdTurn = 0;
  return (request) => {
    const who = identityText(request);
    const said = lastUserText(request);
    const first = userMessages(request).length === 1;

    if (who.includes('You are Tc Reviewer,')) return { text: 'Reviewer ready.' };

    if (who.includes('You are Tc Worker,')) {
      if (said.includes(ANSWER_ONE)) return runTurn(request, [room('ask', { to: LEAD, body: QUESTION_TWO })], 'Asked again.');
      if (said.includes('will not be answered')) {
        return runTurn(request, [room('publish-artifact', { artifactKind: 'report', title: 'tc-report', body: ARTIFACT_BODY })], 'Published.');
      }
      if (said.includes(INTERVENE_NOTE)) return runTurn(request, [room('report-status', { body: 'tc-intervened' })], 'Noted.');
      if (first) return runTurn(request, [room('ask', { to: LEAD, body: QUESTION_ONE })], 'Asked.');
      return runTurn(request, [room('report-status', { body: 'tc-worker-woken' })], 'Awake.');
    }

    if (who.includes('You are Tc Lead,')) {
      if (said.includes(QUESTION_ONE) && (holdTurn === 0 || holdTurn === userMessages(request).length)) {
        holdTurn = userMessages(request).length;
        return runTurn(request, [
          { name: 'bash', arguments: { command: holdCommand(ctx), timeout: 900 } },
          room('propose-revision', { reason: 'tc worker needs a tool', proposalJson: { kind: 'change-configuration', memberId: WORKER, configuration: { tools: ['read', WORKER_TOOL] } } }),
          room('propose-revision', { reason: 'tc reviewer needs a tool', proposalJson: { kind: 'change-configuration', memberId: REVIEWER, configuration: { tools: ['read', WORKER_TOOL] } } }),
          room('propose-revision', { reason: 'tc room needs more budget', proposalJson: { kind: 'request-expansion', field: 'maxCostUsd', value: RAISED_COST } }),
        ], 'Proposed.');
      }
      if (first) {
        return runTurn(request, [
          room('update-work', { title: 'tc-work', status: 'started' }),
          room('report-status', { body: 'tc-lead-ready' }),
          room('send-message', { to: `${WORKER},${REVIEWER}`, body: 'tc-start', wake: true }),
        ], 'Lead ready.');
      }
      return { text: 'Nothing to add.' };
    }
    return undefined;
  };
}
