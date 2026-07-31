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

/** The model single frames are repaired with (D10). */
export const REPAIR_MODEL = 'fal-ai/nano-banana-pro/edit';

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
