/**
 * The stub model's answers to the model runs an Orchestrator loop makes
 * outside the chat: the planner, the trigger extractor, each step, the
 * recovery decider, the stop check, reflection, a manual revise and skill
 * extraction. One responder answers all of them, and tells the loops apart by
 * the token their prompt starts with. A run that carries no token is left to
 * the app's default answer.
 *
 * Each system prompt is the plugin's own (`runtime/planner-prompt.ts`,
 * `trigger-extractor.ts`, `executors/prompt.ts`, `llm-decisions.ts`,
 * `stop-condition.ts`, `reflection.ts`, `skill-extract.ts`).
 */
import type { StubReply, StubRequest } from '../../stub-model';
import { firstUserText } from '../driver';
import type { StepContext } from '../types';
import {
  carriesAnswer,
  clarifyingReply,
  outcomeReply,
  planningReply,
  recoveryReply,
  reflectionReply,
  revisionReply,
  skillReply,
  stopReply,
  triggerReply,
} from './orchestrator-plans';
import { ASK, RECOVERY, TOKENS, type LoopToken } from './orchestrator-support';

const PLANNER = 'You are the PLANNER for Sero Orchestrator';
const TRIGGER = 'You decide ONLY how a task should be TRIGGERED';
const STEP = 'You are executing ONE step of a Sero Orchestrator loop';
const RECOVERY_DECIDER = 'You decide how an Orchestrator loop recovers';
const STOP = 'You decide whether THIS run of a recurring loop';
const REFLECT = 'You are the REFLECTOR for a Sero Orchestrator loop';
const REVISE = "You revise an Orchestrator loop based on the user's request";
const EXTRACT = 'You are the SKILL EXTRACTOR for Sero';

/** What a step session was given, kept so a step can check the loop's overrides reached it. */
export interface StepSession {
  token: LoopToken;
  system: string;
  tools: string[];
  task: string;
}

export interface OrchestratorStub {
  steps: StepSession[];
  /** How many times each loop has been reflected on. */
  reflections: Record<string, number>;
  remove?: () => void;
}

function isStub(value: unknown): value is OrchestratorStub {
  return typeof value === 'object' && value !== null && 'steps' in value && 'reflections' in value;
}

export function stubOf(ctx: StepContext): OrchestratorStub {
  const known = ctx.state.orchestratorStub;
  if (isStub(known)) return known;
  const fresh: OrchestratorStub = { steps: [], reflections: {} };
  ctx.state.orchestratorStub = fresh;
  return fresh;
}

/** The recovery loop's step fails on its first two sessions and passes on the third. */
const RECOVERY_FAILURES = 2;

/**
 * A step session's reply. Only the loop's final step may claim the loop is
 * complete, and every plan here has one step, which is final.
 */
function stepReply(token: LoopToken, task: string, sessionsSoFar: number): StubReply {
  if (token === RECOVERY && sessionsSoFar <= RECOVERY_FAILURES) {
    return { text: outcomeReply({ status: 'failed', summary: 'tc-orch: this step fails until it has been retried twice' }) };
  }
  const final = task.includes("This is the loop's FINAL step");
  const completion = final ? { completion: { status: 'complete', reason: `${token} is finished` } } : {};
  return { text: outcomeReply({ status: 'succeeded', summary: `${token} step done`, ...completion }) };
}

function answer(request: StubRequest, stub: OrchestratorStub): StubReply | undefined {
  const task = firstUserText(request);
  const has = (marker: string): boolean => request.system.includes(marker);
  const token = TOKENS.find((candidate) => task.includes(candidate));
  // `reflect_workspace` reflects every loop in the workspace, including ones other probes left.
  if (!token) return has(REFLECT) ? { text: JSON.stringify({ insights: [], suggestions: [] }) } : undefined;

  if (has(PLANNER)) return { text: token === ASK && !carriesAnswer(task) ? clarifyingReply() : planningReply(token) };
  if (has(TRIGGER)) return { text: triggerReply(token) };
  if (has(STEP) || task.includes('Original task requirements')) {
    stub.steps.push({ token, system: request.system, tools: request.tools.map((tool) => tool.name), task });
    return stepReply(token, task, stub.steps.filter((session) => session.token === token).length);
  }
  if (has(RECOVERY_DECIDER)) return { text: recoveryReply() };
  if (has(STOP)) return { text: stopReply() };
  if (has(REFLECT)) {
    const n = (stub.reflections[token] ?? 0) + 1;
    stub.reflections[token] = n;
    return { text: reflectionReply(token, n) };
  }
  if (has(REVISE)) return { text: revisionReply() };
  // The extraction run reads the workspace, so it is a session with tools; its task still names the loop.
  if (has(EXTRACT) || task.includes('Return the extraction JSON now')) return { text: skillReply() };
  return undefined;
}

/** Answers the loops' model runs until `removeOrchestratorResponder` or the end of the app. */
export function installOrchestratorResponder(ctx: StepContext): void {
  if (!ctx.respondWith) throw new Error('this step needs respondWith');
  const stub = stubOf(ctx);
  stub.remove?.();
  stub.remove = ctx.respondWith((request) => answer(request, stub));
}

export function removeOrchestratorResponder(ctx: StepContext): void {
  const stub = stubOf(ctx);
  stub.remove?.();
  stub.remove = undefined;
}
