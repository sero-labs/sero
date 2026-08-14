/**
 * Index attention payload — the compact "needs you" content embedded in each
 * loop summary so the cross-loop home inbox can render questions (with inline
 * answers) and suggestions (with approve/reject) by watching the single
 * index.json, without opening every loop file. See specs/09-ui-redesign.md.
 *
 * Rooms join the SAME inbox (agent-rooms spec §22, FR-026): a Room summary
 * carries its pending approvals here, so one queue covers every member of every
 * Room beside the Workflow items. Each mode keeps its own entry shape — a
 * question with answers and an approval with a consequence are different
 * things, and a merged interface would give each mode fields it never uses.
 *
 * Split from types.ts (500-LOC limit) and re-exported there. Type-only imports,
 * so the re-export cycle is harmless.
 */

import type { HumanQuestion } from './human-input-types';
import type { SuggestionConfidence } from './reflection-types';
import type { RoomApprovalRequest } from './room-message-types';

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

/**
 * One Room approval waiting on the user. Every field is COMPUTED from Room
 * records — the requesting member writes none of this text except its own
 * `reason` (§22), which is labelled as the member's words in the UI.
 */
export interface RoomAttentionApproval {
  /** RoomApprovalRequest.id — the id the resolve action names. */
  approvalId: string;
  /** The member that asked. The inbox groups by Room and member. */
  memberId: string;
  memberName: string;
  /** The requested operation, in one user-facing line. */
  title: string;
  /** Why the member says it needs this. */
  reason: string;
  /** What it would change, from the same access mapping as the proposal tiles. */
  consequence: string;
  /** The workspace, external service or limit it touches. */
  affects: string;
  kind: RoomApprovalRequest['kind'];
  /** Present only where an estimate is meaningful (a spend expansion). */
  estimatedCostUsd: number | null;
  createdAt: string;
}

/**
 * The "needs you" content for one Room, attached to its summary. Present only
 * while something is pending, so the index stays small.
 */
export interface RoomAttention {
  approvals: RoomAttentionApproval[];
}
