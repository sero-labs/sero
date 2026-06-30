/**
 * Loop reflection (self-improvement). See specs/06-reflection.md.
 *
 * `proposeImprovements` reads a loop's durable run history and asks the model for
 * concrete improvements to the plan / step instructions — or for nothing, when
 * nothing is clearly worth changing (the no-heuristics guarantee: the model
 * judges; the engine only validates the format and drops what won't validate).
 *
 * The apply helpers are pure: `applyReflection` records the model's output,
 * `approveSuggestion` routes an accepted plan through the SAME validated revise
 * path manual Refine uses (recording a PlanRevision), and `rejectSuggestion`
 * records the rejection + reason for the reflection feed.
 */

import type {
  Loop,
  LoopInsight,
  LoopPlan,
  LoopStepDefinition,
  LoopSuggestion,
  RecoveryDecision,
  RunDigest,
  SuggestionConfidence,
} from '../shared/types';
import type { OrchestratorHost } from './host';
import { isRecord, runStructuredJson, type ParseResult } from './structured-call';
import { validateLoopPlan } from './schema';
import { applyRecovery } from './recovery-apply';
import { loopArtifactDir } from './artifacts';

const CONFIDENCES: readonly SuggestionConfidence[] = ['low', 'medium', 'high'];
const MAX_INSIGHTS = 20;

const REFLECT_SYSTEM = `You are the REFLECTOR for a Sero Orchestrator loop. You read the loop's own run history and propose how its step plan could run better next time. You do NOT do the loop's work; you only suggest improvements to the plan.

Return ONLY one JSON object, in a \`\`\`json fence and nothing else, with this shape:

\`\`\`json
{
  "insights": [ { "summary": "a durable lesson about how this loop runs" } ],
  "suggestions": [
    {
      "rationale": "what's wrong, grounded in the run history, and why this change helps",
      "confidence": "low" | "medium" | "high",
      "plan": { "schemaVersion": 1, "revision": 0, "objective": "...", "steps": [ ...full step list... ] }
    }
  ]
}
\`\`\`

RULES — read carefully:
- Propose changes ONLY to the plan or a step's instructions: rewrite vague instructions, add a missing step, reorder, split or merge steps. Keep step ids STABLE for steps you are not changing.
- Each "plan" MUST be a COMPLETE LoopPlan (every step, not a diff), valid on its own: unique ids, acyclic dependsOn, and funnelling to exactly one final step. A "model" step cannot read files; only "background-agent" steps touch the workspace.
- Base every suggestion on EVIDENCE in the run history (a step that repeatedly failed/retried/was revised, an ordering problem, instructions that caused rework). Do not speculate.
- If nothing is clearly worth changing, return "suggestions": []. NEVER invent a change to seem useful — no churn.
- Record "insights" (durable lessons) even when you propose no change. Keep them short and specific.
- Do NOT re-propose anything listed under PREVIOUSLY REJECTED.
- Be sparing: at most a few high-value suggestions.`;

function joinResponses(responses: string[]): string {
  return responses.join('\n\n--- repair ---\n\n');
}

function renderHistory(history: RunDigest[]): string {
  return history
    .map((d) => {
      const steps = d.steps
        .map(
          (s) =>
            `    - ${s.id} "${s.title}": ${s.status}` +
            `${s.attempts > 1 ? ` (${s.attempts} attempts)` : ''}` +
            `${s.failureSummary ? ` — ${s.failureSummary}` : ''}`,
        )
        .join('\n');
      const rec = d.recoveries.length
        ? `\n    recoveries: ${d.recoveries.map((r) => `${r.stepId}:${r.decision} (${r.reason})`).join('; ')}`
        : '';
      return `  Run ${d.runNumber} [${d.status}${d.completion ? `/${d.completion}` : ''}]:\n${steps}${rec}`;
    })
    .join('\n');
}

function renderInsights(loop: Loop): string {
  const insights = loop.insights ?? [];
  return insights.length ? insights.map((i) => `  - ${i.summary}`).join('\n') : '(none)';
}

function renderRejected(loop: Loop): string {
  const rejected = (loop.suggestions ?? []).filter((s) => s.status === 'rejected');
  return rejected.length
    ? rejected.map((s) => `  - ${s.rationale}${s.rejectionReason ? ` [rejected: ${s.rejectionReason}]` : ''}`).join('\n')
    : '(none)';
}

function buildReflectTask(loop: Loop, history: RunDigest[]): string {
  return [
    `Loop goal:\n${loop.prompt}`,
    `\nCurrent plan:\n${JSON.stringify(loop.plan, null, 2)}`,
    `\nRun history (oldest first):\n${renderHistory(history)}`,
    `\nExisting insights:\n${renderInsights(loop)}`,
    `\nPREVIOUSLY REJECTED (do not re-propose):\n${renderRejected(loop)}`,
    `\nReturn the reflection JSON now.`,
  ].join('\n');
}

function buildReflectRepair(previous: string, errors: string[]): string {
  return [
    'Your previous reflection JSON was invalid.',
    `\nYour previous reply:\n${previous}`,
    `\nProblems:\n${errors.map((e) => `- ${e}`).join('\n')}`,
    '\nReturn a corrected reflection JSON ({ "insights", "suggestions" }) that fixes every problem. Output ONLY the JSON object.',
  ].join('\n');
}

interface ParsedReflection {
  insights: { summary: string }[];
  suggestions: { rationale: string; confidence: SuggestionConfidence; plan: LoopPlan }[];
  /** Count of malformed/invalid suggestions dropped (logged, not surfaced). */
  dropped: number;
}

/**
 * Lenient on content, strict on shape: a malformed top-level object is rejected
 * (and repaired); individual suggestions that don't validate are DROPPED, not
 * repaired, so one bad plan never sinks the whole pass.
 */
function parseReflection(value: unknown): ParseResult<ParsedReflection> {
  if (!isRecord(value)) {
    return { ok: false, errors: ['Reply must be a JSON object with "insights" and "suggestions" arrays.'] };
  }
  if (value.suggestions !== undefined && !Array.isArray(value.suggestions)) {
    return { ok: false, errors: ['"suggestions" must be an array (or omitted).'] };
  }
  const insights = (Array.isArray(value.insights) ? value.insights : [])
    .map((i) => (isRecord(i) && typeof i.summary === 'string' && i.summary.trim() ? { summary: i.summary.trim() } : null))
    .filter((x): x is { summary: string } => x !== null);

  const suggestions: ParsedReflection['suggestions'] = [];
  let dropped = 0;
  for (const raw of (value.suggestions as unknown[]) ?? []) {
    if (!isRecord(raw)) {
      dropped += 1;
      continue;
    }
    const rationale = typeof raw.rationale === 'string' ? raw.rationale.trim() : '';
    const confidence = raw.confidence as SuggestionConfidence;
    const planValid = isRecord(raw.plan) && validateLoopPlan(raw.plan as unknown as LoopPlan).length === 0;
    if (!rationale || !CONFIDENCES.includes(confidence) || !planValid) {
      dropped += 1;
      continue;
    }
    suggestions.push({ rationale, confidence, plan: raw.plan as unknown as LoopPlan });
  }
  return { ok: true, value: { insights, suggestions, dropped } };
}

/** Steps the proposed plan adds, removes, or changes (vs the current plan). */
export function changedStepIds(current: LoopPlan, proposed: LoopPlan): string[] {
  const key = (step: LoopStepDefinition) => JSON.stringify(step);
  const before = new Map(current.steps.map((s) => [s.id, key(s)]));
  const ids = new Set<string>();
  for (const step of proposed.steps) {
    if (before.get(step.id) !== key(step)) ids.add(step.id);
  }
  for (const step of current.steps) {
    if (!proposed.steps.some((p) => p.id === step.id)) ids.add(step.id); // removed
  }
  return [...ids];
}

export interface ReflectionOutput {
  insights: LoopInsight[];
  suggestions: LoopSuggestion[];
}

/**
 * Runs the reflection model pass over a loop's run history (caller supplies the
 * gathered history). Returns durable insights + pending suggestions; returns
 * empty when the model judges nothing worth changing or the reply is unusable.
 */
export async function proposeImprovements(host: OrchestratorHost, loop: Loop, history: RunDigest[]): Promise<ReflectionOutput> {
  const result = await runStructuredJson<ParsedReflection>(host, {
    systemPrompt: REFLECT_SYSTEM,
    task: buildReflectTask(loop, history),
    parse: parseReflection,
    buildRepair: buildReflectRepair,
    parentSessionId: loop.runtime.parentSessionId,
  });
  if (result.responses.length) {
    await host.writeArtifact(`${loopArtifactDir(loop.id)}/reflection/${host.newId('refl')}.txt`, joinResponses(result.responses));
  }
  if (!result.ok || !result.value) {
    host.log(`reflection failed for ${loop.id}: ${result.errors[0] ?? 'invalid response'}`);
    return { insights: [], suggestions: [] };
  }
  const parsed = result.value;
  if (parsed.dropped) host.log(`reflection dropped ${parsed.dropped} invalid suggestion(s) for ${loop.id}`);
  const now = host.now();
  return {
    insights: parsed.insights.map((i) => ({ id: host.newId('insight'), summary: i.summary, createdAt: now })),
    suggestions: parsed.suggestions.map((s) => ({
      id: host.newId('suggestion'),
      createdAt: now,
      target: 'plan',
      rationale: s.rationale,
      confidence: s.confidence,
      proposedPlan: s.plan,
      changedStepIds: changedStepIds(loop.plan, s.plan),
      status: 'pending',
    })),
  };
}

/** Records reflection output on the loop: bounded insights + appended pending suggestions. */
export function applyReflection(loop: Loop, output: ReflectionOutput, now: string): Loop {
  return {
    ...loop,
    insights: [...(loop.insights ?? []), ...output.insights].slice(-MAX_INSIGHTS),
    suggestions: [...(loop.suggestions ?? []), ...output.suggestions],
    updatedAt: now,
  };
}

export interface SuggestionOutcome {
  loop?: Loop;
  error?: string;
}

function findPending(loop: Loop, suggestionId: string): LoopSuggestion | { error: string } {
  const target = (loop.suggestions ?? []).find((s) => s.id === suggestionId);
  if (!target) return { error: `Suggestion not found: ${suggestionId}` };
  if (target.status !== 'pending') return { error: `Suggestion already ${target.status}.` };
  return target;
}

/**
 * Approves a suggestion: re-validates its plan against the CURRENT loop (it may
 * have changed since the suggestion was made), applies it through the existing
 * revise-plan path (recording a PlanRevision), and marks the suggestion approved.
 */
export function approveSuggestion(host: OrchestratorHost, loop: Loop, suggestionId: string): SuggestionOutcome {
  const found = findPending(loop, suggestionId);
  if ('error' in found) return found;
  const errors = validateLoopPlan(found.proposedPlan);
  if (errors.length > 0) return { error: `Proposed plan no longer valid: ${errors.join('; ')}` };

  const now = host.now();
  const decision: RecoveryDecision = {
    id: host.newId('recovery'),
    stepId: loop.plan.steps[0]?.id ?? '',
    failedAttemptId: '',
    decision: 'revise-plan',
    reason: `reflection: ${found.rationale}`,
    revisedPlan: found.proposedPlan,
    createdAt: now,
  };
  const applied = applyRecovery(host, loop, decision);
  if (applied.rejection) return { error: applied.rejection };

  const suggestions = (applied.loop.suggestions ?? []).map((s) =>
    s.id === suggestionId ? { ...s, status: 'approved' as const, decidedAt: now } : s,
  );
  return { loop: { ...applied.loop, suggestions, updatedAt: now } };
}

/** Rejects a suggestion with the user's reason; kept for the reflection feed. */
export function rejectSuggestion(loop: Loop, suggestionId: string, reason: string, now: string): SuggestionOutcome {
  const found = findPending(loop, suggestionId);
  if ('error' in found) return found;
  const suggestions = (loop.suggestions ?? []).map((s) =>
    s.id === suggestionId ? { ...s, status: 'rejected' as const, rejectionReason: reason, decidedAt: now } : s,
  );
  return { loop: { ...loop, suggestions, updatedAt: now } };
}
