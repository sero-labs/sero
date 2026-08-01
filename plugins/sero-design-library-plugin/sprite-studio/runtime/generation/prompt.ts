/**
 * What the AI is told, and what it is asked for.
 *
 * It does everything that needs judgement and nothing that needs an eye for
 * pixels: it plans the batch, writes the motion instruction, says which frames
 * are on the ground and where the extremes fall, judges what came back and
 * orders repairs. It never writes a pixel and it is never handed a text grid.
 *
 * Two pieces of hard-won guidance are in these prompts, and both are measured:
 *
 *  - **Spend prompt effort on framing, not on cyclicity** (D36). The same six
 *    clips regenerated with stronger wording went from one animation cut off at
 *    the edge to none — "keep a wide margin" worked where "stay inside the
 *    frame" had not. The loops did not move at all: explorer 57→64%, skeleton
 *    61→59%, knight 50→51%, and the one good loop got worse. Cyclicity is a
 *    property of the material, and asking for it wastes the instruction.
 *  - **A stiff animation is the worse failure** (D30). A drifting detail can be
 *    repaired frame by frame; missing character cannot be added back. So the
 *    instruction asks for a real movement rather than a safe one.
 */

import type { AnimationPlan, CharacterRecord } from '../../shared/character';
import { videoModelName } from '../../shared/video-models';

export function buildPlanSystemPrompt(): string {
  return [
    'You plan sprite animations for a pixel art character.',
    '',
    'A video model draws the movement, an image model repairs single frames, and deterministic code turns what comes back into hard pixels on a locked palette. You decide what to make, how long each action needs and how it moves. You never draw anything.',
    '',
    'Frame count and play rate are different things. A resting loop needs about six drawings however fast it plays; each one is held for several ticks. Ask for the drawings the action needs, not for the number of ticks it occupies.',
    '',
    'Say where the feet leave the ground when they do. That declaration is checked against the pixels afterwards — a jump whose airborne frames never leave the baseline is refused — so it is a statement about the movement you are describing, not a wish.',
    '',
    'Loops: a walk or a run is `forward`, and it only survives if the character genuinely returns to a pose it held. Breathing, hovering and bobbing are `pingpong`, which plays out and back and therefore always joins, at the cost of the motion having a direction. A jump, an attack and a death are `once`.',
    '',
    'Call `sprite_studio_declare_plan` exactly once with the whole batch. That call is the only output that counts.',
  ].join('\n');
}

/** What the character is, in the words the model has to preserve. */
export function characterBrief(character: CharacterRecord): string {
  const ramps = character.ramps.map((ramp) => ramp.name).join(', ');
  return [
    `Character: ${character.name}.`,
    `Drawn at ${character.artWidth} × ${character.artHeight} art pixels on a locked palette of ${character.palette.length} colours${ramps === '' ? '' : ` grouped as ${ramps}`}.`,
    character.styleNotes === ''
      ? ''
      : `What must never change: ${character.styleNotes}`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function buildPlanTask(options: {
  character: CharacterRecord;
  request: string;
  videoModel: string;
}): string {
  return [
    characterBrief(options.character),
    '',
    `The user asked for: ${options.request}`,
    '',
    `The movement will be drawn by ${videoModelName(options.videoModel)}, one clip per animation, at 720p.`,
    '',
    'Write one motion instruction per animation. Describe the movement from start to finish in the order it happens, in plain words a video model can follow. Ask for a real movement with weight in it — a stiff result cannot be repaired afterwards, while a drifting detail can be redrawn frame by frame.',
    '',
    'Two things about the instruction that are measured rather than assumed:',
    '- Say that the character must stay well inside the frame with a wide margin around it. A limb that runs off the edge of the video arrives already cut, and nothing downstream can put it back.',
    '- Do not ask for the animation to loop, to repeat exactly, or to end where it started. It was tested six ways and it does not work; the loop is found afterwards by searching the clip.',
    '',
    'Then call `sprite_studio_declare_plan` once with every animation.',
  ].join('\n');
}

/**
 * The instruction actually sent to the video model.
 *
 * The AI's sentence, plus the framing and background rules that hold for every
 * clip. Those are appended here rather than left to the model to remember,
 * because they are the difference between a usable clip and a wasted one and
 * they never change.
 */
export function buildMotionPrompt(plan: AnimationPlan, character: CharacterRecord): string {
  return [
    `Pixel art sprite animation of the same character, drawn in the same style, on a flat magenta background.`,
    plan.instruction,
    character.styleNotes === '' ? '' : `Keep the character exactly as drawn: ${character.styleNotes}`,
    'Keep the whole character well inside the frame with a wide margin on every side, and never let any part of it touch or cross the edge.',
    'The background is flat magenta everywhere, with no shadow, no gradient, no ground plane and no border of any kind around the character.',
    'The camera does not move, zoom or pan. No text, no watermark, no letterboxing.',
  ]
    .filter((line) => line !== '')
    .join(' ');
}

/**
 * The instruction for a single redrawn pose (D10, §6.1).
 *
 * The frame, the character beside it, and what is wrong named plainly. A repair
 * redraws 14% to 78% of the sprite, so it is asked for a correction rather than
 * an interpretation.
 */
export function buildRepairPrompt(options: {
  character: CharacterRecord;
  problem: string;
  instruction?: string;
}): string {
  return [
    'Redraw this single pixel art frame, keeping everything about it the same except the fault named below.',
    `The second picture is the character as he must look: ${options.character.styleNotes || 'match him exactly'}.`,
    `What is wrong: ${options.problem}`,
    options.instruction === undefined || options.instruction === '' ? '' : `The user says: ${options.instruction}`,
    'Keep the pose, the position in the frame, the size and the colours. Flat magenta background, no shadow, no border, nothing touching the edge.',
  ]
    .filter((line) => line !== '')
    .join(' ');
}

/**
 * Drawing a character from words alone (spec §2.1).
 *
 * Everything ingestion needs is asked for here, because none of it can be
 * recovered afterwards: one character, standing, facing the camera, on flat
 * magenta, drawn as real pixel art rather than as a smooth illustration of
 * pixel art. The enlargement is deliberately not specified — it is measured.
 */
export function buildCharacterPrompt(description: string): string {
  return [
    `Pixel art sprite of ${description}.`,
    'A single character, standing straight, facing the camera, arms at their sides, the whole body visible.',
    'Hard-edged pixel art with flat blocks of colour and a small palette. No anti-aliasing, no gradients, no blur, no outline glow.',
    'Flat magenta background everywhere, with no shadow, no ground plane, no border and no frame.',
    'The whole character well inside the picture with a wide margin on every side. No text and no watermark.',
  ].join(' ');
}

/**
 * What the judge is asked (D24, softened by D30).
 *
 * It sees one frame at a time at 8×, beside the base pose and the frame's two
 * neighbours — never a contact sheet, which arrives shrunk far below the detail
 * being judged. Its verdict **warns and never repairs on its own**: an unproven
 * judge that can order a redraw is worse than no judge, because the repair
 * rewrites the evidence.
 */
/**
 * Who the judge is.
 *
 * A run needs one of these or a named agent, and the judge had neither: every
 * call was refused with "Either agent name or systemPrompt is required" before
 * it started, so the identity check had never run once. What made that survive
 * is that the judge is advisory — the sequence finished, nothing was flagged,
 * and a run that never happened looked exactly like a clean one.
 */
export function buildJudgeSystemPrompt(): string {
  return [
    'You check whether a frame of a sprite animation is still the same character.',
    '',
    'You are shown pictures through a tool, and pictures are the only evidence there is: call `sprite_studio_show_frames` before you say anything. A verdict from a run that has not looked is worthless.',
    '',
    'You are looking for identity, not quality. Clothing, equipment, proportions and face. Movement is the point of an animation — a shifted weight, a turned head, a different expression or a change of lighting across a movement is not a fault. A missing satchel, a hat of a different shape, a limb that has changed length, or equipment that has turned into something else is.',
    '',
    'Your verdict is advice for the person deciding whether to keep the sequence. Nothing is redrawn on the strength of it, so say what you see plainly and do not soften it.',
    '',
    'Call `sprite_studio_judge_frame` exactly once. That call is the only output that counts.',
  ].join('\n');
}

export function buildJudgeTask(options: {
  character: CharacterRecord;
  animation: string;
  frameNumber: number;
  frameCount: number;
}): string {
  return [
    characterBrief(options.character),
    '',
    `This is frame ${options.frameNumber} of ${options.frameCount} of "${options.animation}".`,
    'You are shown the base pose first, then the frame before this one, then this frame, then the frame after it. All at 8× so the detail is visible.',
    '',
    'Say whether this frame is still the same character: the clothing, the equipment, the proportions and the face. A change of lighting or expression across a movement is not a fault. A missing satchel, a different hat, a limb that has changed length, or a piece of equipment that has turned into something else is.',
    '',
    'Call `sprite_studio_judge_frame` once with your verdict. It is advice for the user, not an order — nothing is redrawn on the strength of it.',
  ].join('\n');
}
