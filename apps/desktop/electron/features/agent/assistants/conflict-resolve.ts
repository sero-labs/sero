/**
 * AI conflict resolution — the prompt for one conflict, and the validation of
 * what comes back (§7, §10).
 *
 * One conflict per call, deliberately. It is what makes the run's account
 * readable line by line, what lets a question block one conflict instead of the
 * whole run, and what gives the renderer something to apply as it goes rather
 * than at the end.
 *
 * **Declining is the model's call, with its reason — not a confidence score we
 * invented.** A model that always answers is worse than one that declines,
 * because you stop reading its output. So `ask` and `decline` are first-class
 * outcomes here, not failure paths.
 *
 * What is validated is the *format*, never the judgement: the shape must be one
 * of the three, and a resolution must not still contain conflict markers —
 * writing one back would corrupt the file while reporting success.
 */

/** Answers already given in this run, carried forward so related conflicts agree. */
export interface ConflictAnswer {
  question: string;
  answer: string;
}

export interface ConflictResolveInput {
  path: string;
  /** Which conflict in the file, counting from 1 — the number the UI shows. */
  conflictNumber: number;
  conflictCount: number;
  current: string;
  incoming: string;
  base?: string;
  currentLabel: string;
  incomingLabel: string;
  /** Lines around the block, so the model can see what the file is doing. */
  context: string;
  answers: ConflictAnswer[];
}

export interface ConflictQuestionOption {
  /** What the button says — short, and the actual value where there is one. */
  label: string;
  /** Where it comes from, e.g. "current · main". */
  detail: string;
  /** The resolution this option would write. Absent means "let me edit it". */
  content?: string;
}

export type ConflictOutcome =
  | { decision: 'resolve'; content: string; why: string }
  | { decision: 'ask'; question: string; because: string; options: ConflictQuestionOption[] }
  | { decision: 'decline'; why: string };

const MARKER = /^(?:<{7}|={7}|>{7}|\|{7})/m;

export function buildConflictPrompt(input: ConflictResolveInput): string {
  return [
    'You are resolving one merge conflict in a git working tree.',
    `File: ${input.path} (conflict ${input.conflictNumber} of ${input.conflictCount})`,
    '',
    'Output only valid JSON, one of these three shapes:',
    '{"decision":"resolve","content":"<the resolved lines>","why":"<one short line>"}',
    '{"decision":"ask","question":"<the specific question>","because":"<why you cannot decide>",'
      + '"options":[{"label":"<short>","detail":"<where it comes from>","content":"<lines this would write>"}]}',
    '{"decision":"decline","why":"<one short line>"}',
    '',
    'Rules:',
    '- "content" is the lines that replace the whole conflict block. No conflict markers.',
    '- Resolve it yourself when the answer is in the code: one side supersedes the other,',
    '  both sides made the same change, or the two changes compose.',
    '- Ask only when the choice is a product or design decision that the code does not settle.',
    '  Give the real options with their actual values, never "resolve this manually".',
    '- Decline when you cannot understand the change well enough to be trusted with it.',
    '- "why" is what you did and the reason, in one line, for someone reviewing later.',
    '- Match the surrounding indentation and style exactly.',
    ...(input.answers.length > 0
      ? [
          '',
          'Decisions already made in this run — apply them to related conflicts rather than',
          'asking again:',
          ...input.answers.map((a) => `- ${a.question} → ${a.answer}`),
        ]
      : []),
    '',
    `Current side (${input.currentLabel}):`,
    input.current || '(empty)',
    ...(input.base !== undefined
      ? ['', 'Common ancestor:', input.base || '(empty)']
      : []),
    '',
    `Incoming side (${input.incomingLabel}):`,
    input.incoming || '(empty)',
    '',
    'Surrounding file, for context:',
    input.context || '(none)',
  ].join('\n');
}

/**
 * Throws rather than guessing. A malformed reply is a failed conflict the run
 * reports and moves past — it must never become a silent half-resolution.
 */
export function parseConflictOutcome(raw: string): ConflictOutcome {
  const parsed = extractJson(raw);
  if (!parsed) throw new Error('The model did not return a resolution.');

  const decision = parsed.decision;
  if (decision === 'resolve') {
    const content = asString(parsed.content);
    if (content === null) throw new Error('The model returned a resolution with no content.');
    if (MARKER.test(content)) {
      throw new Error('The model left conflict markers in its resolution.');
    }
    return { decision, content, why: asString(parsed.why)?.trim() || 'resolved' };
  }

  if (decision === 'ask') {
    const question = asString(parsed.question)?.trim();
    if (!question) throw new Error('The model asked a question with no question in it.');
    return {
      decision,
      question,
      because: asString(parsed.because)?.trim() || '',
      options: parseOptions(parsed.options),
    };
  }

  if (decision === 'decline') {
    return { decision, why: asString(parsed.why)?.trim() || 'the model declined, without a reason' };
  }

  throw new Error(`The model returned an unknown decision: ${String(decision)}`);
}

function parseOptions(raw: unknown): ConflictQuestionOption[] {
  if (!Array.isArray(raw)) return [];
  const options: ConflictQuestionOption[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const label = asString(candidate.label)?.trim();
    if (!label) continue;

    const content = asString(candidate.content);
    // An option whose content still has markers cannot be offered as a click.
    if (content !== null && MARKER.test(content)) continue;

    options.push({
      label,
      detail: asString(candidate.detail)?.trim() || '',
      ...(content === null ? {} : { content }),
    });
  }
  return options;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last <= first) return null;

  try {
    const parsed: unknown = JSON.parse(text.slice(first, last + 1));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
