/**
 * Shape validation for a charter proposal: milestones, an escalation policy,
 * an autonomy setting and the cost cap. The cap is the one field that cannot
 * be defaulted, because the user's approval of the charter approves the cap.
 */

import type { AutonomySetting, Milestone } from './record';

export const AUTONOMY_SETTINGS: readonly AutonomySetting[] = ['milestones', 'charter-only', 'model-judged'];

export interface CharterDraft {
  milestones: { title: string; plan: string | null; previewRoute: string | null }[];
  escalationPolicy: string;
  autonomy: AutonomySetting;
  capUsd: number;
}

export type CharterParse = { ok: true; draft: CharterDraft } | { ok: false; error: string };

const fail = (error: string): CharterParse => ({ ok: false, error });

export function parseCharter(input: {
  milestonesJson?: string;
  escalationPolicy?: string;
  autonomy?: string;
  capUsd?: number;
}): CharterParse {
  if (input.capUsd === undefined || input.capUsd === null) {
    return fail('capUsd is required: the charter must propose a cost cap in USD for the user to approve.');
  }
  if (!(Number.isFinite(input.capUsd) && input.capUsd > 0)) return fail('capUsd must be a positive number.');
  if (!input.milestonesJson?.trim()) return fail('milestonesJson is required: at least one milestone with a title.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.milestonesJson);
  } catch {
    return fail('milestonesJson is not valid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return fail('A charter needs at least one milestone.');
  const milestones: CharterDraft['milestones'] = [];
  for (const [index, entry] of parsed.entries()) {
    const raw = entry as { title?: unknown; plan?: unknown; previewRoute?: unknown } | null;
    const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
    if (!title) return fail(`Milestone ${index + 1} has no title.`);
    milestones.push({
      title,
      plan: typeof raw?.plan === 'string' && raw.plan.trim() ? raw.plan.trim() : null,
      previewRoute: typeof raw?.previewRoute === 'string' && raw.previewRoute.trim() ? raw.previewRoute.trim() : null,
    });
  }
  const escalationPolicy = input.escalationPolicy?.trim() ?? '';
  if (!escalationPolicy) return fail('escalationPolicy is required: what you will raise to the user and what you decide yourself.');
  const autonomy = (input.autonomy ?? 'milestones') as AutonomySetting;
  if (!AUTONOMY_SETTINGS.includes(autonomy)) return fail(`autonomy must be one of ${AUTONOMY_SETTINGS.join(', ')}.`);
  return { ok: true, draft: { milestones, escalationPolicy, autonomy, capUsd: input.capUsd } };
}

export function toMilestone(draft: CharterDraft['milestones'][number], id: string): Milestone {
  return {
    id,
    title: draft.title,
    status: 'planned',
    plan: draft.plan,
    preview: draft.previewRoute ? { route: draft.previewRoute } : null,
    dispatch: null,
    evidence: null,
    verification: null,
    parkedBy: null,
    parkedFrom: null,
    receipt: null,
  };
}
