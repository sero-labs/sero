/**
 * Index attention payload — the compact "needs you" content embedded in each
 * loop summary so the cross-loop home inbox can render questions (with inline
 * answers) and suggestions (with approve/reject) by watching the single
 * index.json, without opening every loop file. See specs/09-ui-redesign.md.
 *
 * Split from types.ts (500-LOC limit) and re-exported there. Type-only imports,
 * so the re-export cycle is harmless.
 */

import type { HumanQuestion } from './human-input-types';
import type { SuggestionConfidence } from './reflection-types';

/** A loop's pending input request, enough to answer it from the home inbox. */
export interface LoopAttentionInput {
  /** runtime.pendingInput.id — pass to the `answer_input` action. */
  requestId: string;
  source: 'planner' | 'step';
  questions: HumanQuestion[];
}

/** One pending reflection suggestion, enough to approve/reject from the inbox. */
export interface LoopAttentionSuggestion {
  id: string;
  rationale: string;
  confidence: SuggestionConfidence;
  changedStepCount: number;
}

/**
 * The "needs you" content for one loop, attached to its summary. Present only
 * when the loop is waiting on the user; absent otherwise (keeps the index small).
 */
export interface LoopAttention {
  input?: LoopAttentionInput;
  suggestions?: LoopAttentionSuggestion[];
}
