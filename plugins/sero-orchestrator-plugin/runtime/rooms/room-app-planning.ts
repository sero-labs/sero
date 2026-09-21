/**
 * How the Room panel describes a Team it has not created yet.
 *
 * Split from `room-app-actions.ts` (500-LOC limit): that file owns what the
 * user's surface DOES to an existing Room, and this one owns the shape of a
 * planning request — the input, the delivery default, and the preset prose the
 * planner starts from.
 */

import type { BlueprintClamp } from '../../shared/room-clamp';
import type { RoomProposalSummary } from '../../shared/room-blueprint-types';
import type { HumanQuestion } from '../../shared/human-input-types';
import type { RoomStatus } from '../../shared/room-types';
import type { RoomTemplate } from '../../shared/room-templates';
import type { UsageSummary } from '../../shared/usage-types';
import { INVOKING_CHAT_DESTINATION } from './room-delivery';
import type { RoomUserLimits } from './planner';
import type { RoomPresetSeed } from './planner-prompt';

export interface PrepareRoomInput {
  requestId?: string;
  /** The user's own words, kept verbatim. */
  problem: string;
  /** Project/run attribution from a typed dispatch handle. Retention only. */
  project?: import('@sero-ai/common').OrchestratorProjectContext;
  /** A built-in preset to start from. Seeds the planner's prose, nothing else. */
  presetId?: string;
  limits?: RoomUserLimits;
  /** Answers to the planner's earlier questions, folded into a re-plan. */
  clarifications?: { prompt: string; answer: string }[];
  /** The chat that asked for the Room, when there was one. */
  originSessionId?: string | null;
}

/**
 * A Room a chat asked for answers that chat (FR-029) unless the caller named
 * somewhere else. The planner never chooses a destination, so the choice is
 * made here — the only place that knows a chat is behind this Room.
 */
export function limitsForOrigin(input: PrepareRoomInput): RoomUserLimits | undefined {
  if (!input.originSessionId || input.limits?.deliveryDestination) return input.limits;
  return { ...input.limits, deliveryDestination: INVOKING_CHAT_DESTINATION };
}

export interface RoomPlanned {
  status?: RoomStatus;
  ok: true;
  roomId: string;
  proposal: RoomProposalSummary;
  /** What the user's limits took away from the model's suggestion. */
  clamps: BlueprintClamp[];
  usage?: UsageSummary;
}

export type PrepareRoomOutcome =
  | RoomPlanned
  | { ok: false; needsInput: true; questions: HumanQuestion[]; usage?: UsageSummary }
  | { ok: false; needsInput?: false; error: string; usage?: UsageSummary };

/**
 * A preset as the planner sees it: a label, how this kind of problem is usually
 * staffed, and the roles it tends to use.
 *
 * Deliberately prose ONLY. A template also carries preferred limits, a
 * permission ceiling and a delivery destination, and none of those are read
 * here: authority comes from the user's own choices, so picking a preset can
 * never widen what the team may do.
 */
export function presetSeed(template: RoomTemplate): RoomPresetSeed {
  return {
    label: template.name,
    guidance: [template.planningStrategy, template.collaborationInstructions, template.outputExpectations]
      .filter(Boolean)
      .join('\n\n'),
    exampleRoles: template.exampleRoles.map((role) => `${role.role} — ${role.responsibility}`),
  };
}
