/**
 * Naming the pieces, and saying where they join (Dan's suggestion).
 *
 * Cutting a parts sheet is measurement and stays in code: the pieces are found
 * by connected components, their sizes are counted, their colours are read.
 * What the code cannot know is what any of them ARE — which piece is a
 * pauldron and which a knee cop, which bone it belongs to, what stacks in
 * front of what, and where inside a piece its joint sits. Those are judgements
 * about a picture.
 *
 * Hand-guessing them is what the spike did, twice: an offset per part produced
 * a heap, and hanging every piece from its top-centre produced a figure with
 * its shoulders in the wrong place. So the judgement goes to something that
 * can see, and the code keeps only the validation — the same division that the
 * rest of this pipeline runs on.
 *
 * The anchor is a FRACTION of the piece's own width and height, not a pixel
 * offset. A model reading a picture can say "the shoulder is about a fifth
 * down the arm, in the middle" far more reliably than it can count pixels, and
 * a fraction survives the piece being cut a little larger or smaller.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import { Type } from 'typebox';

import type { ModelSelection } from '../../../shared/settings';
import { modelSelectionIsEmpty } from '../../../shared/settings';

const RUN_TIMEOUT_MS = 240_000;

/**
 * The slots a side-on figure has. Deliberately coarse: a sheet may cut a whole
 * leg or a thigh and a shin separately, and forcing a finer vocabulary than
 * the artwork has would make the model invent pieces that are not there.
 */
export const RIG_SLOTS = [
  'head',
  'torso',
  'hips',
  'upper_arm',
  'forearm',
  'thigh',
  'shin',
  'leg',
  'foot',
  'held_main',
  'held_off',
  'accessory',
  'unused',
] as const;
export type RigSlot = (typeof RIG_SLOTS)[number];

/** Which of a pair a piece is. 'both' means one drawing serves both sides —
 * the far one is the same artwork darkened. */
export const RIG_SIDES = ['near', 'far', 'both'] as const;
export type RigSide = (typeof RIG_SIDES)[number];

export interface RigPiece {
  index: number;
  /** What it is, in the model's own words — for the transcript and the author. */
  name: string;
  slot: RigSlot;
  side: RigSide;
  /** Draw order, low is furthest back. */
  z: number;
  /** Where the joint sits inside the piece, as a fraction of its own size. */
  anchorX: number;
  anchorY: number;
}

export interface RigPlan {
  pieces: RigPiece[];
  /** What the model could not place, said plainly. */
  note: string;
}

export type RigPlanOutcome =
  | { status: 'planned'; plan: RigPlan }
  | { status: 'unavailable'; reason: string };

/** A piece is unusable if it is placed nowhere or anchored outside itself. */
function usable(piece: RigPiece, count: number): boolean {
  return (
    Number.isInteger(piece.index) &&
    piece.index >= 0 &&
    piece.index < count &&
    piece.anchorX >= 0 &&
    piece.anchorX <= 1 &&
    piece.anchorY >= 0 &&
    piece.anchorY <= 1
  );
}

/** The slots a rig cannot do without. Anything less is not a figure, and
 * carrying on would produce the heap the spike already produced by hand. */
const ESSENTIAL: RigSlot[] = ['head', 'torso'];

export function planProblems(plan: RigPlan, count: number): string[] {
  const problems: string[] = [];
  const placed = plan.pieces.filter((piece) => piece.slot !== 'unused');
  for (const piece of plan.pieces) {
    if (!usable(piece, count)) {
      problems.push(
        `piece ${piece.index} (${piece.name}) has an anchor outside itself or an index that is not one of the ${count} pieces`,
      );
    }
  }
  const seen = new Set(plan.pieces.map((piece) => piece.index));
  if (seen.size !== plan.pieces.length) problems.push('the same piece was placed more than once');
  for (const slot of ESSENTIAL) {
    if (!placed.some((piece) => piece.slot === slot)) problems.push(`nothing was placed as the ${slot}`);
  }
  if (placed.length < 4) problems.push('fewer than four pieces were placed — that is not a figure');
  return problems;
}

export function createRigSheetTool(images: { sheet: Buffer; assembled: Buffer }): {
  definition: ToolDefinition;
  looked(): boolean;
} {
  let looked = false;
  const definition: ToolDefinition = {
    name: 'puppet_rig_show',
    label: 'Show the pieces',
    description:
      'Shows the character assembled, and the same character cut into numbered pieces. Call it first; you cannot name pieces you have not seen.',
    promptSnippet: 'puppet_rig_show — the assembled character and its pieces',
    parameters: Type.Object({}),
    async execute() {
      looked = true;
      return {
        content: [
          { type: 'text' as const, text: 'The character assembled, seen from the side:' },
          { type: 'image' as const, data: images.assembled.toString('base64'), mimeType: 'image/png' },
          {
            type: 'text' as const,
            text:
              'The same character cut into pieces, laid out FOUR PER ROW, left to right and then top to bottom. ' +
              'Piece 0 is top-left, piece 1 is next to it, and so on. Each piece stands on the bottom of its own cell.',
          },
          { type: 'image' as const, data: images.sheet.toString('base64'), mimeType: 'image/png' },
        ],
        details: { ok: true },
      };
    },
  };
  return { definition, looked: () => looked };
}

export function createRigPlanTool(): { definition: ToolDefinition; plan(): RigPlan | null } {
  let plan: RigPlan | null = null;
  const definition: ToolDefinition = {
    name: 'puppet_rig_plan',
    label: 'Place the pieces',
    description: 'Records what each piece is, where it joins and what it sits in front of. Call it once, after looking.',
    promptSnippet: 'puppet_rig_plan — records the rig',
    parameters: Type.Object({
      pieces: Type.Array(
        Type.Object({
          index: Type.Integer({ description: 'Which piece, counting from 0 in the order shown.' }),
          name: Type.String({ description: 'What it is, in your own words — "left pauldron", "sword".' }),
          slot: Type.Union(RIG_SLOTS.map((slot) => Type.Literal(slot)), {
            description:
              "Where it belongs on a side-on figure. 'held_main' is what the near hand carries, 'held_off' the far hand. 'unused' for anything that is not part of the character.",
          }),
          side: Type.Union(RIG_SIDES.map((side) => Type.Literal(side)), {
            description:
              "Which of a pair it is. Use 'both' when one drawing has to serve both sides — the far copy is darkened automatically.",
          }),
          z: Type.Integer({
            description: 'Draw order: 0 is furthest back, higher is nearer the viewer. Far limbs behind the body, near limbs in front.',
          }),
          anchorX: Type.Number({
            minimum: 0,
            maximum: 1,
            description:
              'Where this piece JOINS the body, across its own width: 0 is its left edge, 1 its right, 0.5 the middle.',
          }),
          anchorY: Type.Number({
            minimum: 0,
            maximum: 1,
            description:
              'Where this piece JOINS the body, down its own height: 0 is its top edge, 1 its bottom. An upper arm joins near its top; a helmet joins at its bottom, where the neck is.',
          }),
        }),
      ),
      note: Type.String({ description: 'Anything you could not place, or that looks wrong. Empty if nothing.' }),
    }),
    async execute(_toolCallId, params) {
      const input = params as RigPlan;
      plan = {
        pieces: input.pieces.map((piece) => ({ ...piece, name: String(piece.name).slice(0, 60) })),
        note: String(input.note ?? '').trim().slice(0, 400),
      };
      return {
        content: [{ type: 'text' as const, text: `Recorded ${plan.pieces.length} pieces.` }],
        details: { pieces: plan.pieces.length },
      };
    },
  };
  return { definition, plan: () => plan };
}

function buildSystemPrompt(): string {
  return `You are preparing a character's artwork to be animated on a skeleton.

You are shown the character assembled, and the same character cut into separate numbered pieces. For each piece, say what it is, which part of the body it belongs to, what it stacks in front of, and — the important one — WHERE IT JOINS THE BODY.

The join is what a skeleton rotates around. Give it as a fraction of the piece's own size, not in pixels:
- An upper arm hangs from the shoulder, so its join is near its TOP: about anchorY 0.1, anchorX 0.5.
- A forearm hangs from the elbow: again near its top.
- A helmet sits ON the neck, so its join is at its BOTTOM: anchorY about 0.95.
- A torso hangs from the base of the neck: anchorY about 0.05.
- A foot pivots at the ankle, which is near its top and towards its heel: perhaps anchorX 0.3, anchorY 0.2.
- A sword or a shield joins at the grip — wherever the hand would hold it.

Get the join wrong and the piece swings around the wrong point, which looks worse than not animating at all. Look at where the piece would attach if you put the character back together.

Draw order: the far arm and far leg go BEHIND the body, the near ones in FRONT. A shield carried on the far arm sits behind the torso; a sword in the near hand sits in front.

A piece that is not part of the character — a stray mark, a duplicate — is 'unused'. Do not invent pieces that are not shown, and do not place the same piece twice.`;
}

export interface RigPlanContext {
  host: AppRuntimeHost;
  workspaceId: string;
  parentSessionId: string;
  model: ModelSelection;
  signal: AbortSignal;
}

/** Ask for the rig, and refuse an answer that is not one. */
export async function planRig(
  images: { sheet: Buffer; assembled: Buffer },
  pieces: readonly { width: number; height: number }[],
  context: RigPlanContext,
): Promise<RigPlanOutcome> {
  const shower = createRigSheetTool(images);
  const planner = createRigPlanTool();
  const sizes = pieces.map((piece, index) => `${index}: ${piece.width} x ${piece.height} px`).join(', ');

  const params: AppRuntimeSubagentRunParams = {
    task:
      `Call puppet_rig_show to see the character and its ${pieces.length} pieces, then puppet_rig_plan once ` +
      `with an entry for every piece.\n\nThe pieces, in order, with their sizes: ${sizes}.`,
    systemPrompt: buildSystemPrompt(),
    parentSessionId: context.parentSessionId,
    workspaceId: context.workspaceId,
    thinking: 'high',
    platformTools: 'none',
    customTools: [shower.definition, planner.definition],
    timeoutMs: RUN_TIMEOUT_MS,
    signal: context.signal,
    ...(modelSelectionIsEmpty(context.model) ? {} : { model: context.model.modelId }),
  };

  const result = await context.host.subagents.runStructured(params).catch((error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
  }));

  if (!shower.looked()) {
    return { status: 'unavailable', reason: 'The planner never looked at the pieces.' };
  }
  const plan = planner.plan();
  if (plan === null) {
    const error = (result as { error?: string }).error;
    return { status: 'unavailable', reason: error ?? 'The planner ended without recording a rig.' };
  }
  const problems = planProblems(plan, pieces.length);
  if (problems.length > 0) {
    return { status: 'unavailable', reason: `The rig it recorded is not usable: ${problems.join('; ')}.` };
  }
  return { status: 'planned', plan };
}
