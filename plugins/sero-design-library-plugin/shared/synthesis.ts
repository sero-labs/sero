/**
 * Combining the guardrails of one to six references (spec §6.1).
 *
 * Order matters: the primary reference leads, and where two references say the
 * same thing the primary's wording is the one kept, so the synthesis reads as
 * that reference's voice rather than a shuffled merge.
 *
 * **What counts as a blocking conflict.** Only the mechanical case is decided
 * here: the same rule appearing in one reference's `always` and another's
 * `never`. That is an exact set operation over text the Librarian already
 * produced — deterministic, and either true or false.
 *
 * Everything subtler is the model's judgement, not this module's. "Generous
 * whitespace" against "dense information display" contradict each other while
 * sharing no words, and a hand-written rule for that would be a worse version
 * of what the synthesis run already does — quietly blocking valid work and
 * missing real conflicts. Model-reported conflicts arrive through
 * `withReportedConflicts` instead, and are treated identically from there on.
 */

import type { AppliedGuardrails, ResolvedConflict } from './design';

export interface ReferenceGuardrails {
  itemId: string;
  /** Position in the Design; 0 is primary. */
  order: number;
  always: string[];
  never: string[];
}

export interface GuardrailConflict {
  /** The rule as the primary-most reference worded it. */
  rule: string;
  /** References that require it. */
  alwaysFrom: string[];
  /** References that forbid it. */
  neverFrom: string[];
}

export interface GuardrailSynthesis {
  always: string[];
  never: string[];
  /** Non-empty means generation is blocked until each is resolved (spec §6.1). */
  conflicts: GuardrailConflict[];
}

/**
 * Compare rules ignoring case, surrounding space and a trailing full stop.
 *
 * This is formatting only. It deliberately does not stem, synonym-match or
 * otherwise interpret — the moment comparison starts guessing at meaning it has
 * taken over the model's job, and it will be wrong in both directions.
 */
function comparable(rule: string): string {
  return rule.trim().toLowerCase().replace(/\.$/, '');
}

interface Claim {
  /** Wording from the most primary reference that stated it. */
  text: string;
  itemIds: string[];
}

/** Collect one side's rules, keyed for comparison, primary wording winning. */
function claimsFor(
  references: ReferenceGuardrails[],
  side: (reference: ReferenceGuardrails) => string[],
): Map<string, Claim> {
  const claims = new Map<string, Claim>();
  for (const reference of references) {
    for (const rule of side(reference)) {
      const key = comparable(rule);
      if (key === '') continue;
      const existing = claims.get(key);
      if (existing) {
        // Already seen from a more primary reference — keep that wording and
        // just record this one as also holding it.
        if (!existing.itemIds.includes(reference.itemId)) existing.itemIds.push(reference.itemId);
        continue;
      }
      claims.set(key, { text: rule.trim(), itemIds: [reference.itemId] });
    }
  }
  return claims;
}

export function synthesizeGuardrails(references: ReferenceGuardrails[]): GuardrailSynthesis {
  const ordered = references.toSorted((a, b) => a.order - b.order);
  const always = claimsFor(ordered, (reference) => reference.always);
  const never = claimsFor(ordered, (reference) => reference.never);

  const conflicts: GuardrailConflict[] = [];
  for (const [key, required] of always) {
    const forbidden = never.get(key);
    if (!forbidden) continue;
    conflicts.push({
      rule: required.text,
      alwaysFrom: [...required.itemIds],
      neverFrom: [...forbidden.itemIds],
    });
  }

  // A conflicted rule appears on neither side until it is resolved. Letting it
  // through on both would hand the generation run a brief that contradicts
  // itself, which is exactly what blocking exists to prevent.
  const conflicted = new Set(conflicts.map((conflict) => comparable(conflict.rule)));
  const survivors = (claims: Map<string, Claim>) =>
    [...claims].flatMap(([key, claim]) => (conflicted.has(key) ? [] : [claim.text]));

  return { always: survivors(always), never: survivors(never), conflicts };
}

/**
 * Fold conflicts the synthesis run reported in prose into the same shape as the
 * mechanical ones, so the dialog and the resolution path treat both alike.
 * Anything already found mechanically is not added twice.
 */
export function withReportedConflicts(
  synthesis: GuardrailSynthesis,
  reported: GuardrailConflict[],
): GuardrailSynthesis {
  const known = new Set(synthesis.conflicts.map((conflict) => comparable(conflict.rule)));
  const added = reported.filter((conflict) => !known.has(comparable(conflict.rule)));
  if (added.length === 0) return synthesis;

  const addedKeys = new Set(added.map((conflict) => comparable(conflict.rule)));
  const without = (rules: string[]) => rules.filter((rule) => !addedKeys.has(comparable(rule)));
  return {
    always: without(synthesis.always),
    never: without(synthesis.never),
    conflicts: [...synthesis.conflicts, ...added],
  };
}

export function isBlocked(synthesis: GuardrailSynthesis): boolean {
  return synthesis.conflicts.length > 0;
}

/** Which side of a conflict the user kept. */
export interface ConflictResolution {
  rule: string;
  /** `always` keeps the requirement; `never` keeps the prohibition. */
  keep: 'always' | 'never';
}

/**
 * Apply the user's choices and produce the guardrails a Design is generated
 * under. Frozen onto the record afterwards, so later edits to a reference
 * cannot rewrite what an existing Design claims it was built with.
 *
 * Returns null while any conflict is still unresolved — generation must not
 * start from a partially-resolved synthesis, and returning a usable-looking
 * object would make that easy to do by accident.
 */
export function applyResolutions(
  synthesis: GuardrailSynthesis,
  resolutions: ConflictResolution[],
): AppliedGuardrails | null {
  const chosen = new Map(resolutions.map((resolution) => [comparable(resolution.rule), resolution.keep]));
  if (synthesis.conflicts.some((conflict) => !chosen.has(comparable(conflict.rule)))) return null;

  const always = [...synthesis.always];
  const never = [...synthesis.never];
  const resolved: ResolvedConflict[] = [];

  for (const conflict of synthesis.conflicts) {
    const keep = chosen.get(comparable(conflict.rule));
    const keptFrom = keep === 'always' ? conflict.alwaysFrom : conflict.neverFrom;
    const droppedFrom = keep === 'always' ? conflict.neverFrom : conflict.alwaysFrom;
    (keep === 'always' ? always : never).push(conflict.rule);
    resolved.push({
      rule: conflict.rule,
      keptFromItemId: keptFrom[0] ?? '',
      droppedFromItemIds: [...droppedFrom],
    });
  }

  return { always, never, resolved };
}
