/**
 * Shape validation for a decision. The owner authors the content; this checks
 * only that every part the user needs to answer in one action is present.
 */

import type { Decision, DecisionOption } from './record';

export interface DecisionDraft {
  question: string;
  options: DecisionOption[];
  recommendation: string;
  reason: string;
  dependsOn: string[];
}

export type DecisionParse = { ok: true; draft: DecisionDraft } | { ok: false; error: string };

const fail = (error: string): DecisionParse => ({ ok: false, error });

function parseOptions(raw: string | undefined): DecisionOption[] | string {
  if (!raw?.trim()) return 'optionsJson is required: at least two options, each with id, label and consequence.';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'optionsJson is not valid JSON.';
  }
  if (!Array.isArray(parsed) || parsed.length < 2) return 'A decision needs at least two options.';
  const options: DecisionOption[] = [];
  for (const [index, entry] of parsed.entries()) {
    const option = entry as Partial<DecisionOption> | null;
    const id = typeof option?.id === 'string' ? option.id.trim() : '';
    const label = typeof option?.label === 'string' ? option.label.trim() : '';
    const consequence = typeof option?.consequence === 'string' ? option.consequence.trim() : '';
    if (!id) return `Option ${index + 1} has no id.`;
    if (!label) return `Option "${id}" has no label.`;
    if (!consequence) return `Option "${id}" has no consequence. Every option must say what happens if it is chosen.`;
    if (options.some((existing) => existing.id === id)) return `Option id "${id}" is used twice.`;
    options.push({ id, label, consequence });
  }
  return options;
}

export function parseDecision(input: {
  question?: string;
  optionsJson?: string;
  recommendation?: string;
  reason?: string;
  parks?: string[];
}): DecisionParse {
  const question = input.question?.trim() ?? '';
  if (!question) return fail('question is required.');
  const options = parseOptions(input.optionsJson);
  if (typeof options === 'string') return fail(options);
  const recommendation = input.recommendation?.trim() ?? '';
  if (!recommendation) return fail('recommendation is required: the option id you recommend, so answering takes one action.');
  if (!options.some((option) => option.id === recommendation)) {
    return fail(`recommendation "${recommendation}" is not one of the option ids (${options.map((o) => o.id).join(', ')}).`);
  }
  const reason = input.reason?.trim() ?? '';
  if (!reason) return fail('reason is required: why this is escalated to the user.');
  const dependsOn = [...new Set((input.parks ?? []).map((id) => id.trim()).filter(Boolean))];
  return { ok: true, draft: { question, options, recommendation, reason, dependsOn } };
}

export function toDecision(draft: DecisionDraft, id: string, now: string, proposal: Decision['proposal'] = null): Decision {
  return { id, ...draft, raisedAt: now, proposal, answer: null };
}
