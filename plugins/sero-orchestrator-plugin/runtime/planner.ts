// The verification planner (spec 05 §5, D-19) — the new LLM step that authors a
// loop's definition of "done". It is a read-only `planner` worker: given the
// plain-English goal (and read-only repo access to learn what is verifiable) it
// derives success criteria and, per criterion, how best to evaluate it (D-20).
//
// Like the implementer/reviewer contract (D-08), no schema is sent to the
// subagent: the prompt asks for a trailing fenced JSON block and the coordinator
// parses it here. A parse miss returns null → the loop stays `draft` with a
// reason (it never silently "completes" with no definition of done). The planner
// returns DATA only; the coordinator writes the plan under its own state mutation
// (single-writer preserved).

import { createHash } from 'node:crypto';

import type { AppRuntimeHost, AppRuntimeSubagentResult } from '@sero-ai/common';

import type {
  Decision,
  EvidenceStep,
  LoopGoal,
  StopCondition,
  SuccessCriterion,
  ThresholdAggregate,
  ThresholdOp,
  VerificationPlan,
} from '../shared/types';
import { writeArtifact } from './artifacts';
import { extractJsonObject, toolPolicyForRole } from './workers';

/** A derived plan minus provenance — the coordinator stamps `derivedFrom`. */
export interface PlanDerivation {
  criteria: SuccessCriterion[];
  stopConditions: StopCondition[];
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; cost?: number };
}

/** Runs the planner for a loop; returns the derived plan, or null on failure. */
export type PlannerRunner = (loop: LoopGoal, prior?: VerificationPlan) => Promise<PlanDerivation | null>;

export interface PlannerRunnerDeps {
  host: AppRuntimeHost;
  workspaceId: string;
  cwd: string;
  /** State file path — the planner's raw output is retained beside it for diagnosis. */
  stateFilePath: string;
}

/** A planner run is retried a few times because model JSON output is not deterministic. */
const PLANNER_MAX_ATTEMPTS = 3;

/** Stable hash of the goal text; a plan is stale when the goal's hash drifts. */
export function goalHash(goal: string): string {
  return createHash('sha1').update(goal.trim()).digest('hex');
}

const PLANNER_SYSTEM_PROMPT = [
  'You are the verification planner for a Sero Orchestrator loop. A loop pursues a',
  'plain-English goal by repeatedly making changes and checking them. Your ONLY job,',
  'before any work begins, is to author how the loop will know it has succeeded — as',
  'the JSON plan described below.',
  '',
  'You are NOT the implementer. You never make the change, and you neither have nor',
  'need a file-edit tool — not having one is expected, never a blocker. Do not',
  'describe the edit to make; describe how to VERIFY the goal was met.',
  '',
  'You have read-only access to the workspace. Explore as needed to learn what is',
  'actually verifiable here — is there a build? a test runner? a linter? how could a',
  'quantitative target be measured? Make no changes.',
  '',
  'Every goal gets a plan, even a tiny or obvious one. When no command or measurement',
  "fits, a single judge criterion that reads the change's diff (or the relevant file)",
  'and confirms the goal was met is a complete plan. Never refuse for being too small.',
  '',
  'Produce success criteria. For EACH criterion:',
  '1. Gather evidence first (read-only or a measurement): run a command, read a file,',
  "   inspect the change's diff, or look at recent commits.",
  '2. Choose how that evidence becomes pass/fail:',
  '   - exit-zero: a command’s exit status settles it (build passes, tests pass, lint clean).',
  '   - threshold: a measurement yields a number to compare against a target you set',
  '     (e.g. a latency under a bound). Shape the measurement command to emit just the',
  '     number(s) so it can be compared mechanically.',
  '   - judge: the criterion is a judgement no command can settle (is this genuinely',
  '     dead code? does the changelog capture what users should know?). A read-only',
  '     judge reads your gathered evidence and rules.',
  '',
  'Use mechanical evaluation (exit-zero / threshold) when the evidence is conclusive,',
  'and judge when it is a genuine judgement. Mark each criterion required (must pass',
  'to finish) or informational. If the goal needs human sign-off before the loop may',
  'finish, add an "approval-required" stop condition.',
  '',
  'End your reply with a single fenced JSON block and nothing after it:',
  '```json',
  '{',
  '  "criteria": [',
  '    {',
  '      "id": "<short-id>",',
  '      "description": "<what this criterion means, in plain English>",',
  '      "evidence": [ { "kind": "run", "command": "<cmd>" } ],',
  '      "decision": { "kind": "exit-zero" },',
  '      "required": true',
  '    }',
  '  ],',
  '  "stopConditions": []',
  '}',
  '```',
  '',
  'decision may instead be',
  '  { "kind": "threshold", "metric": "<name>", "op": "<|<=|>|>=|==", "value": <number>, "aggregate": { "kind": "all" } }',
  'or',
  '  { "kind": "judge", "rubric": "<what the judge should check>" }.',
  'evidence items may be { "kind": "read", "path": "<file>" }, { "kind": "diff" },',
  'or { "kind": "gitLog", "since": "<window>" }.',
  '',
  'Reply with the plan only. If you catch yourself writing the code change, stop and',
  'write how to verify it instead. End with the fenced JSON block, nothing after it.',
].join('\n');

/**
 * Build the planner task. The framing matters as much as the system prompt: the
 * planner runs on the base coding-agent prompt (our instructions are only a
 * suffix), so a bare "# Goal: make the text red" reads as a command and the model
 * tries to DO it. We frame the goal as a separate implementer's job and the
 * planner's deliverable as the acceptance test — the same analytical framing the
 * judge task uses successfully through the same suffix mechanism.
 */
export function buildPlannerTask(loop: LoopGoal, prior?: VerificationPlan): string {
  const sections: string[] = [
    [
      'A separate implementer agent will carry out the goal below. You are NOT that',
      'agent and must not perform the goal yourself. Your only deliverable is the',
      'verification plan — the acceptance test that decides whether the implementer',
      'succeeded — as the JSON described in your instructions.',
    ].join('\n'),
    `## Goal the implementer will pursue\n${loop.title}\n${loop.goal}`,
  ];
  if (prior?.criteria.length) {
    sections.push(
      [
        '## Previous plan (the goal changed — revise it)',
        ...prior.criteria.map((c) => `- ${c.description} [${c.decision.kind}${c.required ? ', required' : ''}]`),
      ].join('\n'),
    );
  }
  return sections.filter(Boolean).join('\n\n');
}

/**
 * Create the planner runner the coordinator invokes at create / on goal change.
 * The model's raw reply is ALWAYS retained to an artifact (success or failure) so
 * a "could not derive a plan" outcome is diagnosable, and the run is retried a few
 * times because the model's JSON output is not deterministic.
 */
export function createPlannerRunner(deps: PlannerRunnerDeps): PlannerRunner {
  return async (loop, prior) => {
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= PLANNER_MAX_ATTEMPTS; attempt += 1) {
      const result = await deps.host.subagents.runStructured({
        task: buildPlannerTask(loop, prior),
        systemPrompt: PLANNER_SYSTEM_PROMPT,
        platformTools: toolPolicyForRole('planner'),
        parentSessionId: loop.sessionId ?? `orchestrator:${loop.id}`,
        workspaceId: deps.workspaceId,
        cwd: deps.cwd,
      });
      lastError = result.error;
      const parsed = result.error ? null : parsePlannerOutput(result.response);
      await retainPlannerOutput(deps.stateFilePath, loop.id, attempt, result, parsed);
      if (parsed) return { ...parsed, model: result.modelId, usage: result.usage };
    }
    console.error(
      `[orchestrator] planner could not derive a plan for "${loop.title}" after ${PLANNER_MAX_ATTEMPTS} attempt(s)` +
        ` (${lastError ? `error: ${lastError}` : 'no parseable plan'}); raw output at artifacts/planner-${loop.id}/planner-response.txt`,
    );
    return null;
  };
}

/** Retain the planner's raw reply beside the state file so failures are diagnosable. */
async function retainPlannerOutput(
  stateFilePath: string,
  loopId: string,
  attempt: number,
  result: AppRuntimeSubagentResult,
  parsed: { criteria: SuccessCriterion[] } | null,
): Promise<void> {
  const header = [
    `attempt: ${attempt}/${PLANNER_MAX_ATTEMPTS}`,
    `parsed: ${parsed ? `${parsed.criteria.length} criteria` : 'NO — no parseable plan'}`,
    result.error ? `subagent error: ${result.error}` : undefined,
    `model: ${result.modelId ?? 'unknown'}`,
    '--- raw response ---',
    result.response ?? '(empty)',
  ]
    .filter((line) => line !== undefined)
    .join('\n');
  try {
    await writeArtifact(stateFilePath, `planner-${loopId}`, 'planner-response.txt', header);
  } catch {
    // Diagnostics are best-effort; never let artifact I/O break planning.
  }
}

// ── Parsing (defensive — the subagent is not schema-validated, D-08) ──────────

interface ParsedPlan {
  criteria: SuccessCriterion[];
  stopConditions: StopCondition[];
}

/**
 * Extract and validate the planner's JSON. Malformed criteria are dropped; a plan
 * with no valid criteria returns null (a real failure). The decision/evidence
 * shapes are validated so the evaluator never sees junk. We tolerate the shapes
 * real models actually emit (observed live): a fenced block OR a bare JSON object,
 * an outer wrapper key (e.g. `verification_plan`), and `checks` as an alias for
 * `criteria`. This is field-name tolerance, not heuristic scoring — what each
 * criterion MEANS still comes from the model.
 */
export function parsePlannerOutput(response: string): ParsedPlan | null {
  const root = extractJsonObject(response);
  if (!root) return null;
  const plan = unwrapPlan(root);

  const rawCriteria = firstArray(plan, ['criteria', 'checks']);
  const criteria = rawCriteria
    .map((value, index) => parseCriterion(value, index))
    .filter((c): c is SuccessCriterion => c !== null);

  const stopConditions = Array.isArray(plan.stopConditions)
    ? plan.stopConditions.map(parseStopCondition).filter((c): c is StopCondition => c !== null)
    : [];

  // A plan needs criteria, unless the planner explicitly flagged that the goal
  // cannot be verified here (spec 05 §7) — that is a valid, actionable plan too.
  const unavailable = stopConditions.some((condition) => condition.kind === 'verification-unavailable');
  if (criteria.length === 0 && !unavailable) return null;

  return { criteria, stopConditions };
}

/** The criteria may sit under a single wrapper key (e.g. `{ verification_plan: {...} }`). */
function unwrapPlan(obj: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(obj.criteria) || Array.isArray(obj.checks)) return obj;
  for (const value of Object.values(obj)) {
    if (isRecord(value) && (Array.isArray(value.criteria) || Array.isArray(value.checks))) return value;
  }
  return obj;
}

/** First of `keys` whose value is an array; [] if none. */
function firstArray(obj: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

// The parser is deliberately FORGIVING of real model output (a strict parser that
// silently drops criteria leaves a loop stuck in `draft` with no plan). A
// criterion is kept whenever it has a description: a missing/unrecognized decision
// falls back to `judge` (an LLM can evaluate any described criterion), and a judge
// with no evidence gets the diff so it has something to look at. The raw reply is
// always retained, so over-coercion is visible rather than hidden.
function parseCriterion(value: unknown, index: number): SuccessCriterion | null {
  if (!isRecord(value)) return null;
  // Description may arrive under any of these keys (observed across models).
  const description = firstString(value, ['description', 'criterion', 'name', 'title', 'expected']);
  if (!description) return null;
  const decision = parseDecision(value.decision, description) ?? { kind: 'judge', rubric: description };
  let evidence = Array.isArray(value.evidence)
    ? value.evidence.map(parseEvidence).filter((e): e is EvidenceStep => e !== null)
    : [];
  // A judge needs something to look at; default it to the attempt's diff.
  if (decision.kind === 'judge' && evidence.length === 0) evidence = [{ kind: 'diff' }];
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : `criterion-${index + 1}`;
  // Default to required: a derived criterion gates completion unless the planner
  // explicitly marks it informational.
  const required = value.required !== false;
  return { id, description, evidence, decision, required };
}

function parseEvidence(value: unknown): EvidenceStep | null {
  // A bare string is taken as a command to run.
  if (typeof value === 'string') {
    return value.trim() ? { kind: 'run', command: value.trim() } : null;
  }
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'run':
    case 'command':
      return typeof value.command === 'string' && value.command.trim()
        ? { kind: 'run', command: value.command.trim() }
        : null;
    case 'read':
      return typeof value.path === 'string' && value.path.trim()
        ? { kind: 'read', path: value.path.trim() }
        : null;
    case 'diff':
      return { kind: 'diff' };
    case 'gitLog':
      return { kind: 'gitLog', since: typeof value.since === 'string' ? value.since : undefined };
    default:
      return null;
  }
}

const THRESHOLD_OPS: ReadonlyArray<ThresholdOp> = ['<', '<=', '>', '>=', '=='];

function parseDecision(value: unknown, description: string): Decision | null {
  // A bare string names the kind (e.g. "judge", "exit-zero").
  if (typeof value === 'string') {
    const kind = value.trim().toLowerCase();
    if (kind === 'exit-zero' || kind === 'command') return { kind: 'exit-zero' };
    if (kind === 'judge' || kind === 'review') return { kind: 'judge', rubric: description };
    // A bare "threshold"/"measure" lacks metric/op/value, so judge it instead.
    if (kind === 'threshold' || kind === 'measure') return { kind: 'judge', rubric: description };
    return null;
  }
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'exit-zero':
    case 'command':
      return { kind: 'exit-zero' };
    case 'judge':
    case 'review':
      // rubric optional — the judge also receives the criterion description.
      return {
        kind: 'judge',
        rubric: typeof value.rubric === 'string' && value.rubric.trim() ? value.rubric.trim() : description,
      };
    case 'threshold':
    case 'measure': {
      const op = THRESHOLD_OPS.find((candidate) => candidate === value.op);
      const metric = typeof value.metric === 'string' ? value.metric.trim() : '';
      if (!op || !metric || typeof value.value !== 'number' || !Number.isFinite(value.value)) {
        return null; // malformed measurement → fall back to judge (caller default)
      }
      return { kind: 'threshold', metric, op, value: value.value, aggregate: parseAggregate(value.aggregate) };
    }
    default:
      return null;
  }
}

function parseAggregate(value: unknown): ThresholdAggregate | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'all') return { kind: 'all' };
  if (
    value.kind === 'fraction-at-least' &&
    typeof value.fraction === 'number' &&
    Number.isFinite(value.fraction)
  ) {
    return { kind: 'fraction-at-least', fraction: value.fraction };
  }
  return undefined;
}

function parseStopCondition(value: unknown): StopCondition | null {
  if (!isRecord(value)) return null;
  if (value.kind !== 'approval-required' && value.kind !== 'verification-unavailable') return null;
  return { kind: value.kind, reason: typeof value.reason === 'string' ? value.reason : undefined };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** First of `keys` whose value is a non-empty string, trimmed; '' if none. */
function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
