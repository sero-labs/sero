/**
 * The video models the user chooses between, and what each one costs them (D29).
 *
 * The model is a **visible choice in the interface, beside the request**, not a
 * setting. Two models were run on the same jump, from the same plate, with the
 * same prompt: Grok produced a real jump — a deep crouch, arms thrown out, legs
 * apart in the air, a proper landing — and drifted the face; Seedance kept the
 * face steady and barely animated, mostly moving a standing pose up and down.
 *
 * Neither is better in general. They fail in opposite directions, and which one
 * is right depends on the animation and on taste. So each card carries its
 * measured character rather than a recommendation, and adding a model means
 * adding a card rather than a line in a configuration file.
 *
 * A stiff sequence is the worse failure of the two, because no repair path can
 * add character back — a drifting detail can be repaired frame by frame (D30).
 */

import type { VideoModelChoice } from './state';

export const VIDEO_MODELS: VideoModelChoice[] = [
  {
    id: 'xai/grok-imagine-video/image-to-video',
    name: 'Grok Imagine',
    strength: 'More character in the movement. A real jump: crouch, arms out, legs apart, a landing.',
    cost: 'The face drifts, which reads as style. It draws a white box around a bright subject about one frame in ten.',
    endFrame: false,
  },
  {
    id: 'bytedance/seedance-2.0/fast/image-to-video',
    name: 'Seedance Fast',
    strength: 'Follows the instruction closely and holds the face steady. Takes an end frame.',
    cost: 'Stiff. It can move a standing pose up and down rather than animate it.',
    endFrame: true,
  },
];

/**
 * The model single frames are repaired with (D10).
 *
 * Six edit endpoints were run on the same refused frame — a mid-strike pose
 * whose green had drifted — each given the frame first, the character reference
 * second, and the prompt the studio actually sends. **Five of the six redrew the
 * reference standing still**: they took the second picture as the thing to draw
 * and lost the movement, and the checks then threw the result away. Grok also
 * returned the shirt in a colour the character does not own, and three returned
 * the reference's portrait shape, which alone breaks the size measurement.
 *
 * Nano Banana 2 was the only one that edited the frame it was given. It is also
 * cheaper than the endpoint it replaces ($0.08 against $0.15) and about twice as
 * fast — so the cost of the mistake was never the price of the call. Before
 * this, 51 repairs had been bought in one profile and none had ever been kept.
 */
export const REPAIR_MODEL = 'fal-ai/nano-banana-2/edit';

/**
 * Repair endpoints that were shipped and then measured as unusable.
 *
 * A settings value written before the measurement outranks the corrected
 * default for ever, so a profile made yesterday would keep buying repairs that
 * cannot be kept. These are replaced at start-up rather than left to the user,
 * who has no interface for this setting and no way to know.
 */
export const SUPERSEDED_REPAIR_MODELS: readonly string[] = ['fal-ai/nano-banana-pro/edit'];

/** The model that draws a character from words alone. */
export const CHARACTER_MODEL = 'fal-ai/nano-banana-pro';

export function videoModel(id: string): VideoModelChoice | undefined {
  return VIDEO_MODELS.find((model) => model.id === id);
}

export function videoModelName(id: string): string {
  return videoModel(id)?.name ?? id;
}

/** Whether a chosen model can be asked to finish where it started (§12.1). */
export function acceptsEndFrame(id: string): boolean {
  return videoModel(id)?.endFrame ?? false;
}
