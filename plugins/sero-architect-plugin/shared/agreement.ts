// The delivery agreement, the working interpretation and the overview summary.
//
// Three things that used to be one charter document, kept apart on purpose:
//
//   agreement  what the USER asked for and allowed. Only a user action or the
//              host approval writes it. The request itself is `record.idea` and
//              later instructions are `record.directives`, both verbatim, so
//              neither is copied here.
//   working    what the ARCHITECT currently thinks the work is. It revises this
//              as it learns. Nothing in it grants authority.
//   overview   short user-facing sentences the Architect writes. Display only:
//              no state, liveness or authority is ever read from them.
//
// No field here classifies a request. There is no quality, readiness or
// solution category, and none may be added: the route is the agent's judgment.

import type { PersistentSessionSubjectPolicy } from '@sero-ai/common';

/** What the host stored when the user approved the start. */
export interface AgreementAuthority {
  /** The host-issued delegation policy. The host checks linked grants against its own copy. */
  policyId: string;
  workspaceId: string;
  /** The clamped access per role, as approved. Kept so the record can show it. */
  roles: Record<string, PersistentSessionSubjectPolicy>;
  maxLiveSessions: number;
  maxTotalSessions: number;
}

export interface DeliveryAgreement {
  /** Increments each time the user approves changed authority. */
  revision: number;
  /** The cost/start cap the user set at intake. It becomes the budget cap on approval. */
  capUsd: number;
  proposedAt: string;
  /** Null until the user approves the host-clamped start. */
  approvedAt: string | null;
  /** Null until approved, and again after the authority is revoked. */
  authority: AgreementAuthority | null;
  /** When the user last refused the start approval. The intake stays reopenable. */
  refusedAt?: string | null;
}

/** One thing the delivered result must do. */
export interface AcceptanceCriterion {
  id: string;
  text: string;
  /**
   * True when the user stated it. The Architect may reword or add checks for
   * it, and may not drop it without a user decision.
   */
  userStated: boolean;
  /**
   * Set when the criterion is not met or cannot be proved, with the reason.
   * A stated gap is shown to the user; it is never left out to claim delivery.
   */
  gap?: string;
}

/** A choice the Architect made without asking, and why. */
export interface Assumption {
  text: string;
  why?: string;
}

/** One shape for both: a plain string is an assumption with no reason. */
export function assumptionOf(entry: string | Assumption): Assumption {
  return typeof entry === 'string' ? { text: entry } : entry;
}

export interface WorkingInterpretation {
  /**
   * Increments when a requirement, criterion or check changes. Evidence names
   * the revision it proved, so a late result for an old revision stays history.
   */
  revision: number;
  objective: string;
  approach: string;
  /** A record saved before reasons existed holds plain strings. */
  assumptions: Array<string | Assumption>;
  criteria: AcceptanceCriterion[];
  /** Why it last changed. Null on the first version. */
  reason: string | null;
  updatedAt: string;
}

export const OVERVIEW_FIELDS = ['outcome', 'objective', 'result', 'acknowledgement'] as const;
export type OverviewField = (typeof OVERVIEW_FIELDS)[number];

/** Where a summary came from, so the overview can link to the full work. */
export interface SummarySource {
  kind: 'plan' | 'milestone' | 'research' | 'evidence' | 'directive';
  id: string;
}

export interface SummaryText {
  text: string;
  at: string;
  source?: SummarySource;
}

/**
 * Short sentences for the overview: what the result will be, what the current
 * objective is, what there is to use, and the answer to the last directive.
 */
export type OverviewSummary = Partial<Record<OverviewField, SummaryText>>;

/**
 * The most a summary field may hold. A technical limit on a stored payload,
 * not a writing recipe: content over it goes back to its author to shorten.
 */
export const OVERVIEW_LIMITS: Record<OverviewField, number> = {
  outcome: 200,
  objective: 200,
  result: 400,
  acknowledgement: 400,
};

/**
 * Checks one summary. Oversized content is refused, never cut: a clipped
 * sentence can lose the condition that made it true.
 */
export function checkSummary(field: OverviewField, text: string): { ok: true; text: string } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: `The ${field} summary is empty.` };
  const limit = OVERVIEW_LIMITS[field];
  if (trimmed.length > limit) {
    return { ok: false, error: `The ${field} summary has ${trimmed.length} characters and the limit is ${limit}. Shorten it and keep the full text in the work it summarises.` };
  }
  return { ok: true, text: trimmed };
}

/** Is this project run under a delivery agreement, rather than the deprecated charter flow? */
export function hasAgreement(record: { agreement?: DeliveryAgreement | null }): boolean {
  return record.agreement != null;
}

/** The host policy id a Room dispatch names, so the host can skip a repeat approval. */
export function delegationPolicyId(record: { agreement?: DeliveryAgreement | null }): string | undefined {
  return record.agreement?.authority?.policyId;
}

/**
 * Does the approved access let a worker run commands? Read from the roles the
 * host stored at the start approval. A project without an agreement has none.
 */
export function agreementAllowsCommands(record: { agreement?: DeliveryAgreement | null }): boolean {
  const roles = record.agreement?.approvedAt ? record.agreement.authority?.roles : undefined;
  return Object.values(roles ?? {}).some((role) => role.permissionProfile.commands === 'all');
}

/** May paid work start? Only an approved agreement with stored host authority says yes. */
export function agreementApproved(record: { agreement?: DeliveryAgreement | null }): boolean {
  return record.agreement?.approvedAt != null && record.agreement.authority !== null;
}
