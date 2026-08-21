/**
 * Skill extraction types (see specs/18-skill-extraction.md).
 *
 * A proven Workflow can be distilled into one reusable SKILL.md. The pass
 * produces a DRAFT: nothing reaches the profile's skills directory until the
 * user has reviewed it, may edit every field, and saves.
 *
 * Split from types.ts (500-LOC limit) and re-exported there, the same way
 * reflection-types.ts is.
 */

export type SkillDraftStatus = 'pending' | 'saved' | 'discarded';

/**
 * A proposed skill awaiting the user's review. One per loop — a later pass
 * replaces it, so the loop never accumulates stale drafts.
 */
export interface SkillDraft {
  id: string;
  createdAt: string;
  /** Proposed skill name, already validated against ^[a-z0-9][a-z0-9-]*$. */
  name: string;
  /** Frontmatter description — the trigger text, so it says what AND when. */
  description: string;
  /** Artifact ref for the SKILL.md body (kept off the hot state file). */
  bodyRef: string;
  /** Runs the draft was extracted from, for the review header. */
  fromRunNumbers: number[];
  /** One line on what the model judged worth teaching. */
  rationale: string;
  status: SkillDraftStatus;
  decidedAt?: string;
}

/** Set once a draft from this loop has been saved as a skill. */
export interface LoopSkillLink {
  name: string;
  filePath: string;
  savedAt: string;
}
