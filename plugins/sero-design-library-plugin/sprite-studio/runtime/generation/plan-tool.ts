/**
 * The tool the planning run declares its batch through.
 *
 * A tool rather than prose, for the reason the Design Library's naming tool
 * gives: the call either happened or it did not, and a plan read out of a
 * paragraph is a guess about where the numbers start and stop. Here it matters
 * more than usual, because the numbers decide what gets paid for.
 *
 * The validation is deliberately unkind. Everything it refuses is something that
 * would otherwise be discovered after the money was spent: a frame count that
 * cannot hold a movement, a play rate that is not a rate, an airborne range that
 * runs past the end of the animation.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { AnimationPlan, LoopMode } from '../../shared/character';

/** Enough frames to read as a movement, few enough to be a sprite. */
export const MIN_FRAMES = 2;
export const MAX_FRAMES = 24;
/** Five animations at about a clip each is a batch; more is a bill. */
export const MAX_ANIMATIONS = 8;

const LOOP_MODES: readonly LoopMode[] = ['once', 'forward', 'pingpong'];

export interface PlanTool {
  definition: ToolDefinition;
  /** The declared plan, or null while the tool has not been called. */
  plan(): AnimationPlan[] | null;
  /** Why the last call was refused, for the repair message. */
  problem(): string | null;
}

interface RawAnimation {
  name?: unknown;
  instruction?: unknown;
  frameCount?: unknown;
  playRate?: unknown;
  loop?: unknown;
  airborneFrom?: unknown;
  airborneTo?: unknown;
  extremes?: unknown;
}

function refuse(animation: RawAnimation, index: number): string | null {
  const at = `Animation ${index + 1}`;
  if (typeof animation.name !== 'string' || animation.name.trim() === '') {
    return `${at} has no name.`;
  }
  if (typeof animation.instruction !== 'string' || animation.instruction.trim().length < 12) {
    return `${at} has no motion instruction. Describe the movement in a sentence the video model can follow.`;
  }
  const frames = Number(animation.frameCount);
  if (!Number.isInteger(frames) || frames < MIN_FRAMES || frames > MAX_FRAMES) {
    return `${at} asks for ${String(animation.frameCount)} frames. It must be a whole number between ${MIN_FRAMES} and ${MAX_FRAMES}.`;
  }
  const rate = Number(animation.playRate);
  if (!Number.isFinite(rate) || rate < 1 || rate > 60) {
    return `${at} has a play rate of ${String(animation.playRate)}. It must be between 1 and 60 frames per second.`;
  }
  if (!LOOP_MODES.includes(animation.loop as LoopMode)) {
    return `${at} has a loop of ${String(animation.loop)}. It must be once, forward or pingpong.`;
  }
  const from = animation.airborneFrom;
  const to = animation.airborneTo;
  if (from !== undefined || to !== undefined) {
    const start = Number(from);
    const end = Number(to);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > frames) {
      return `${at} says the feet leave the ground for frames ${String(from)} to ${String(to)}, which is not a range inside 1 to ${frames}.`;
    }
  }
  return null;
}

function toPlan(animation: RawAnimation): AnimationPlan {
  const frameCount = Number(animation.frameCount);
  const from = animation.airborneFrom === undefined ? undefined : Number(animation.airborneFrom);
  const to = animation.airborneTo === undefined ? undefined : Number(animation.airborneTo);
  const extremes = Array.isArray(animation.extremes)
    ? animation.extremes
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= frameCount)
    : [];
  return {
    name: String(animation.name).trim().slice(0, 48),
    instruction: String(animation.instruction).trim(),
    frameCount,
    playRate: Number(animation.playRate),
    loop: animation.loop as LoopMode,
    ...(from === undefined || to === undefined ? {} : { airborne: { from, to } }),
    ...(extremes.length === 0 ? {} : { extremes }),
  };
}

export function createPlanTool(onExecute?: () => void): PlanTool {
  let plan: AnimationPlan[] | null = null;
  let problem: string | null = null;

  const definition: ToolDefinition = {
    name: 'sprite_studio_declare_plan',
    label: 'Declare animation plan',
    description:
      'Declares the animations you are proposing. Call it once, with every animation the request asks for. Nothing is generated until the user has seen this and accepted it.',
    promptSnippet: 'sprite_studio_declare_plan — declares the animations you propose',
    parameters: Type.Object({
      animations: Type.Array(
        Type.Object({
          name: Type.String({ description: 'What the animation is called, e.g. "Whip attack · overhead".' }),
          instruction: Type.String({
            description:
              'The motion instruction sent to the video model. One or two sentences describing the movement from start to finish, in the order it happens.',
          }),
          frameCount: Type.Integer({
            description: `How many drawings the action needs, between ${MIN_FRAMES} and ${MAX_FRAMES}. This is not the play rate: a resting loop needs about six drawings however fast it plays.`,
          }),
          playRate: Type.Number({ description: 'Frames per second for playback, usually 12 to 30.' }),
          loop: Type.Union([Type.Literal('once'), Type.Literal('forward'), Type.Literal('pingpong')], {
            description:
              'once for a jump, an attack or a death. forward for a walk or a run. pingpong for breathing, hovering or bobbing — it plays out and back, so it always joins, and it does not suit a walk.',
          }),
          airborneFrom: Type.Optional(
            Type.Integer({ description: 'First frame where the feet leave the ground, counting from 1.' }),
          ),
          airborneTo: Type.Optional(
            Type.Integer({ description: 'Last frame where the feet are off the ground.' }),
          ),
          extremes: Type.Optional(
            Type.Array(Type.Integer(), {
              description:
                'The frames where the action turns around — the top of the jump, the moment the whip cracks. Counting from 1.',
            }),
          ),
        }),
        { description: 'One entry per animation, in the order they should be made.' },
      ),
    }),
    async execute(_toolCallId, params) {
      onExecute?.();
      const { animations } = params as { animations: RawAnimation[] };
      if (!Array.isArray(animations) || animations.length === 0) {
        problem = 'The plan held no animations.';
        return {
          content: [{ type: 'text' as const, text: problem }],
          details: { ok: false },
          isError: true,
        };
      }
      if (animations.length > MAX_ANIMATIONS) {
        problem = `The plan holds ${animations.length} animations. ${MAX_ANIMATIONS} is the most one batch may ask for, because each one costs a video call.`;
        return {
          content: [{ type: 'text' as const, text: problem }],
          details: { ok: false },
          isError: true,
        };
      }
      for (const [index, animation] of animations.entries()) {
        const refusal = refuse(animation, index);
        if (refusal !== null) {
          problem = refusal;
          return {
            content: [{ type: 'text' as const, text: refusal }],
            details: { ok: false },
            isError: true,
          };
        }
      }
      problem = null;
      plan = animations.map((animation) => toPlan(animation));
      return {
        content: [
          {
            type: 'text' as const,
            text: `Planned ${plan.length} animation(s): ${plan.map((entry) => entry.name).join(', ')}.`,
          },
        ],
        details: { ok: true, animations: plan.length },
      };
    },
  };

  return { definition, plan: () => plan, problem: () => problem };
}
