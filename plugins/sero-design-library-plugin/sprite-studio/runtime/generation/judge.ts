/**
 * The identity judge — advisory, and honest about being unproven (D24, D30).
 *
 * It is shown **one frame at a time at 8×, beside the base pose and the frame's
 * two neighbours**. Not a contact sheet: a whip attack sheet is nearly 7,000
 * pixels wide, and a vision model receives it shrunk far below the detail being
 * judged. The shirt survives that; the belt buckle, the face and the hands do
 * not.
 *
 * Its verdict **warns and never repairs on its own**. An unproven judge that can
 * silently order a redraw is worse than no judge, because a repair redraws 14%
 * to 78% of the sprite — it would be treating a suspicion by rewriting the
 * evidence. And a model that draws the character with a little life in it must
 * not be penalised by a check that rewards a still pose.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import { Type } from 'typebox';

import type { ModelSelection } from '../../../shared/settings';
import { modelSelectionIsEmpty } from '../../../shared/settings';
import type { CharacterRecord } from '../../shared/character';
import { buildJudgeSystemPrompt, buildJudgeTask } from './prompt';

const RUN_TIMEOUT_MS = 180_000;

export interface JudgeVerdict {
  sameCharacter: boolean;
  /** What changed, in the user's words. Empty when nothing did. */
  note: string;
}

export interface JudgeImages {
  basePose: Buffer;
  previous: Buffer | null;
  frame: Buffer;
  next: Buffer | null;
}

/**
 * The tool that hands the pictures over.
 *
 * A subagent run has no workspace and no read tool, so it cannot reach a file in
 * the plugin's storage even if it were told the path. Images therefore arrive as
 * tool content — and whether the tool was ever called is tracked, because a
 * verdict from a run that never looked at anything is a sentence, not a
 * judgement.
 */
export function createFrameImagesTool(images: JudgeImages): {
  definition: ToolDefinition;
  looked(): boolean;
} {
  let looked = false;
  const definition: ToolDefinition = {
    name: 'sprite_studio_show_frames',
    label: 'Show the frames',
    description:
      'Shows you the base pose, the frame before this one, this frame, and the frame after it, all at 8×. Call it first; you cannot judge what you have not seen.',
    promptSnippet: 'sprite_studio_show_frames — shows the frames to judge',
    parameters: Type.Object({}),
    async execute() {
      looked = true;
      const content = [
        { type: 'text' as const, text: 'The base pose, as the character must look:' },
        { type: 'image' as const, data: images.basePose.toString('base64'), mimeType: 'image/png' },
        ...(images.previous === null
          ? []
          : [
              { type: 'text' as const, text: 'The frame before this one:' },
              { type: 'image' as const, data: images.previous.toString('base64'), mimeType: 'image/png' },
            ]),
        { type: 'text' as const, text: 'This frame:' },
        { type: 'image' as const, data: images.frame.toString('base64'), mimeType: 'image/png' },
        ...(images.next === null
          ? []
          : [
              { type: 'text' as const, text: 'The frame after this one:' },
              { type: 'image' as const, data: images.next.toString('base64'), mimeType: 'image/png' },
            ]),
      ];
      return { content, details: { ok: true } };
    },
  };
  return { definition, looked: () => looked };
}

export function createJudgeTool(): { definition: ToolDefinition; verdict(): JudgeVerdict | null } {
  let verdict: JudgeVerdict | null = null;
  const definition: ToolDefinition = {
    name: 'sprite_studio_judge_frame',
    label: 'Judge the frame',
    description: 'Records whether this frame is still the same character. Call it once, after looking.',
    promptSnippet: 'sprite_studio_judge_frame — records your verdict',
    parameters: Type.Object({
      sameCharacter: Type.Boolean({
        description: 'True when the clothing, the equipment and the proportions are all still his.',
      }),
      note: Type.String({
        description:
          'One sentence naming what changed, or empty when nothing did. Written for the person who will decide what to do about it.',
      }),
    }),
    async execute(_toolCallId, params) {
      const { sameCharacter, note } = params as { sameCharacter: boolean; note: string };
      verdict = { sameCharacter, note: note.trim().slice(0, 240) };
      return {
        content: [{ type: 'text' as const, text: sameCharacter ? 'Recorded: still him.' : 'Recorded: something changed.' }],
        details: { ok: true },
      };
    },
  };
  return { definition, verdict: () => verdict };
}

export interface JudgeContext {
  host: AppRuntimeHost;
  workspaceId: string;
  parentSessionId: string;
  model: ModelSelection;
  signal: AbortSignal;
}

/**
 * What came back, including the case where nothing did.
 *
 * A judgement that could not be made is not the same as a clean frame, and the
 * two must not arrive at the caller looking alike. They did once: the judge
 * failed on every frame of a sequence, returned nothing each time, and the
 * animation was presented as checked.
 */
export type JudgeOutcome =
  | { status: 'judged'; verdict: JudgeVerdict }
  | { status: 'unavailable'; reason: string };

/**
 * Judge one frame.
 *
 * A run that fails is not a failure of the animation — the sequence carries on.
 * But it is reported, because "the identity check found nothing" and "the
 * identity check never ran" mean opposite things to the person deciding whether
 * to approve.
 */
export async function judgeFrame(
  character: CharacterRecord,
  options: { animation: string; frameNumber: number; frameCount: number; images: JudgeImages },
  context: JudgeContext,
): Promise<JudgeOutcome> {
  const shower = createFrameImagesTool(options.images);
  const judge = createJudgeTool();

  const params: AppRuntimeSubagentRunParams = {
    task: buildJudgeTask({
      character,
      animation: options.animation,
      frameNumber: options.frameNumber,
      frameCount: options.frameCount,
    }),
    // Required. Without it — or a named agent — the run is refused before it
    // starts, which is how this check managed to never run at all.
    systemPrompt: buildJudgeSystemPrompt(),
    parentSessionId: context.parentSessionId,
    workspaceId: context.workspaceId,
    platformTools: 'none',
    customTools: [shower.definition, judge.definition],
    timeoutMs: RUN_TIMEOUT_MS,
    signal: context.signal,
    repair: {
      maxAttempts: 1,
      validate: () => {
        if (!shower.looked()) {
          return 'You have not looked at the frames. Call `sprite_studio_show_frames` first, then judge what you saw.';
        }
        return judge.verdict() === null
          ? 'You have not recorded a verdict. Call `sprite_studio_judge_frame` once.'
          : null;
      },
    },
    ...(modelSelectionIsEmpty(context.model) ? {} : { model: context.model.modelId }),
  };

  const result = await context.host.subagents.runStructured(params);
  if (result.error !== undefined && result.error !== '') {
    return { status: 'unavailable', reason: result.error };
  }
  // A verdict from a run that never called the image tool is about nothing at
  // all, however confident it sounds.
  if (!shower.looked()) {
    return { status: 'unavailable', reason: 'The run never looked at the frames.' };
  }
  const verdict = judge.verdict();
  return verdict === null
    ? { status: 'unavailable', reason: 'The run finished without recording a verdict.' }
    : { status: 'judged', verdict };
}
