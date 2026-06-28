/**
 * Human-input (ask-the-user) runtime helpers. See specs/07-human-input.md.
 *
 * A step or the planner can raise a question; the loop parks (a durable
 * `pendingInput`) until the user answers, then resumes. These helpers are pure
 * (no host I/O) except `parkForInput`/`parkPlannerQuestions`, which need the
 * host's id/clock/notify — so the model decides WHEN to ask; code only validates
 * the envelope shape and applies the recorded answer.
 */

import type {
  AnsweredInput,
  HumanChoice,
  HumanQuestion,
  InputAnswer,
  Loop,
  PendingInput,
  StepRuntimeState,
} from '../shared/types';
import type { OrchestratorHost } from './host';
import { isRecord } from './structured-call';
import { mergeVariables } from './outcomes';

// ── Parsing model-emitted questions ─────────────────────────

function parseChoices(raw: unknown): HumanChoice[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const choices: HumanChoice[] = [];
  raw.forEach((c, i) => {
    if (typeof c === 'string' && c.trim()) {
      choices.push({ id: `c${i + 1}`, label: c.trim() });
    } else if (isRecord(c) && typeof c.label === 'string' && c.label.trim()) {
      const id = typeof c.id === 'string' && c.id.trim() ? c.id : `c${i + 1}`;
      choices.push({ id, label: c.label.trim() });
    }
  });
  return choices.length ? choices : undefined;
}

/**
 * Parses a raw `questions`/`clarifyingQuestions` array from a model reply into
 * HumanQuestion[]. Lenient on content (skips malformed entries, fills positional
 * ids), strict on the overall shape: returns null when nothing usable is present,
 * so a caller can treat "no questions" and "garbage" identically.
 */
export function parseHumanQuestions(raw: unknown): HumanQuestion[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: HumanQuestion[] = [];
  raw.forEach((q, i) => {
    const prompt =
      typeof q === 'string' ? q : isRecord(q) && typeof q.prompt === 'string' ? q.prompt : '';
    if (!prompt.trim()) return;
    const id = isRecord(q) && typeof q.id === 'string' && q.id.trim() ? q.id : `q${i + 1}`;
    const choices = isRecord(q) ? parseChoices(q.choices) : undefined;
    out.push(choices ? { id, prompt: prompt.trim(), choices } : { id, prompt: prompt.trim() });
  });
  return out.length ? out : null;
}

// ── Parking the loop on a question ──────────────────────────

function notifyAsked(host: OrchestratorHost, loop: Loop, count: number): void {
  const label = count === 1 ? 'a question' : `${count} questions`;
  host.notify(`Loop "${loop.title}" is waiting on you to answer ${label}.`, 'info');
}

/** Sets a step-raised pending question on the loop and nudges the user. */
export function parkForInput(
  host: OrchestratorHost,
  loop: Loop,
  stepId: string,
  questions: HumanQuestion[],
): Loop {
  const now = host.now();
  const pendingInput: PendingInput = { id: host.newId('input'), source: 'step', stepId, questions, askedAt: now };
  notifyAsked(host, loop, questions.length);
  return { ...loop, runtime: { ...loop.runtime, pendingInput }, updatedAt: now };
}

/** Sets a planner-raised pending question on a draft loop and nudges the user. */
export function parkPlannerQuestions(host: OrchestratorHost, draft: Loop, questions: HumanQuestion[]): Loop {
  const now = host.now();
  const pendingInput: PendingInput = { id: host.newId('input'), source: 'planner', questions, askedAt: now };
  notifyAsked(host, draft, questions.length);
  return {
    ...draft,
    status: 'draft',
    summary: 'The planner needs answers to a few questions before it can build the plan.',
    runtime: { ...draft.runtime, pendingInput, block: undefined },
    updatedAt: now,
  };
}

// ── Answering ───────────────────────────────────────────────

/**
 * Validates a set of answers against a pending request: every question must be
 * answered (a picked choice or non-empty text), and a picked choice id must be
 * one the question offered. Returns an error string, or null when valid.
 */
export function validateAnswers(pending: PendingInput, answers: InputAnswer[]): string | null {
  const byId = new Map(pending.questions.map((q) => [q.id, q]));
  for (const q of pending.questions) {
    const answer = answers.find((a) => a.questionId === q.id);
    const hasText = typeof answer?.text === 'string' && answer.text.trim().length > 0;
    const hasChoice = typeof answer?.choiceId === 'string' && answer.choiceId.length > 0;
    if (!answer || (!hasText && !hasChoice)) return `Question "${q.prompt}" was not answered.`;
    if (hasChoice && !(q.choices ?? []).some((c) => c.id === answer!.choiceId)) {
      return `"${answer!.choiceId}" is not one of the offered choices for "${q.prompt}".`;
    }
  }
  for (const a of answers) {
    if (!byId.has(a.questionId)) return `Answer references unknown question "${a.questionId}".`;
  }
  return null;
}

/** Renders one answer as readable text (the picked option's label and/or free text). */
function renderAnswer(q: HumanQuestion, a: InputAnswer): string {
  const picked = a.choiceId ? (q.choices ?? []).find((c) => c.id === a.choiceId)?.label : undefined;
  const text = a.text?.trim();
  return [picked, text].filter(Boolean).join(' — ') || '(no answer)';
}

/**
 * Builds the note merged into the loop's shared scratchpad when a STEP question
 * is answered, so the asking step sees the answer on its next attempt and does
 * not ask again.
 */
export function formatAnswerNote(answered: AnsweredInput): string {
  const lines = answered.questions.map((q) => {
    const a = answered.answers.find((x) => x.questionId === q.id);
    return `- "${q.prompt}" → ${a ? renderAnswer(q, a) : '(no answer)'}`;
  });
  return `You asked the user and they answered — use this, and do not ask again:\n${lines.join('\n')}`;
}

function resetStepPending(loop: Loop, stepId: string, now: string): Loop {
  const prev = loop.runtime.stepStates[stepId];
  if (!prev) return loop;
  const next: StepRuntimeState = { ...prev, status: 'pending', outcome: undefined, updatedAt: now };
  return { ...loop, runtime: { ...loop.runtime, stepStates: { ...loop.runtime.stepStates, [stepId]: next } } };
}

export interface RecordAnswerResult {
  loop: Loop;
  source: PendingInput['source'];
}

/**
 * Records an answer to the loop's pending question: clears `pendingInput`, appends
 * an AnsweredInput, and — for a step question — merges the answer into the shared
 * notes and resets the asking step to pending so it re-runs with the answer in
 * view. The caller persists the loop and (for a step) resumes the run; for a
 * planner question the caller re-runs the planner.
 */
export function recordAnswer(
  loop: Loop,
  pending: PendingInput,
  answers: InputAnswer[],
  now: string,
): RecordAnswerResult {
  const answered: AnsweredInput = {
    requestId: pending.id,
    source: pending.source,
    stepId: pending.stepId,
    questions: pending.questions,
    answers,
    answeredAt: now,
  };
  let next: Loop = {
    ...loop,
    answeredInputs: [...(loop.answeredInputs ?? []), answered],
    runtime: { ...loop.runtime, pendingInput: undefined },
    updatedAt: now,
  };
  if (pending.source === 'step' && pending.stepId) {
    const variables = mergeVariables(next.runtime.variables, { notes: formatAnswerNote(answered) });
    next = { ...next, runtime: { ...next.runtime, variables } };
    next = resetStepPending(next, pending.stepId, now);
  }
  return { loop: next, source: pending.source };
}

/** True when the loop is parked waiting for the user to answer a question. */
export function isAwaitingInput(loop: Loop): boolean {
  return loop.runtime.pendingInput !== undefined;
}
