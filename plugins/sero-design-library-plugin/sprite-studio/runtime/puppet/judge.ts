/**
 * The independent judge (Ink & Bones plan, Phase 1b).
 *
 * Phase 1 let the author grade its own pictures, and it graded them kindly: a
 * finish note claimed a "bright visor mark" and a "separate sword edge" that
 * were not in the frames at all. So the bar moves to someone else — a separate
 * session that never sees the brief, is shown the target beside the render, and
 * is asked what is missing.
 *
 * Four rules, each answering a way this kind of check has failed before:
 *
 *  - **Never a boolean.** "Same character?" is gameable by one big emblem: a
 *    red plume on a grey lump passes. Silhouette, proportions, head, equipment
 *    and colour are scored separately, so a figure can be right about its
 *    plume and still fail on being shaped like a person.
 *  - **Same presentation.** Both pictures arrive cropped the same way, at the
 *    same scale, on the same backdrop. Otherwise the judge is comparing
 *    framing.
 *  - **It must have looked.** A verdict from a run that never called the
 *    picture tool is a sentence, not a judgement, and is thrown away.
 *  - **Abstention is not a pass.** A judge that failed to run, timed out, or
 *    declined to answer returns 'unavailable', which the caller must handle as
 *    "not judged" — never as "judged fine". A whole animation was once
 *    presented as checked because every frame's judge had quietly failed.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';
import { Type } from 'typebox';

import type { ModelSelection } from '../../../shared/settings';
import { modelSelectionIsEmpty } from '../../../shared/settings';

const RUN_TIMEOUT_MS = 240_000;

/** The five things scored, in the order they decide whether a sprite reads. */
export const JUDGE_ASPECTS = ['silhouette', 'proportions', 'head', 'equipment', 'colour'] as const;
export type JudgeAspect = (typeof JUDGE_ASPECTS)[number];

/** 0 nothing like it · 1 recognisably attempted · 2 close · 3 as good as the
 * target at this size. Four steps because three forces a middle, and a middle
 * is where an unsure judge parks everything. */
export const MAX_SCORE = 3;

/** What a render must reach to be finished. Every aspect at 2 would be a
 * perfect copy in five ways at once, which no procedural puppet reaches; every
 * aspect at 1 is "attempted", which is what Phase 1 already produced. The bar
 * is a total of 10 of 15 with NOTHING at zero — a figure may be a little wrong
 * everywhere, but it may not be entirely missing anything. */
export const PASS_TOTAL = 10;

export interface JudgeScores {
  silhouette: number;
  proportions: number;
  head: number;
  equipment: number;
  colour: number;
}

export interface JudgeVerdict {
  scores: JudgeScores;
  total: number;
  /** True when the total clears the bar and no aspect scored zero. */
  passed: boolean;
  /** What the render is missing, in the author's next-step terms. */
  missing: string;
  /** What the judge saw in the render, without being told what it should be. */
  seen: string;
}

export type JudgeOutcome =
  | { status: 'judged'; verdict: JudgeVerdict }
  | { status: 'unavailable'; reason: string };

export interface JudgeImages {
  /** The reference, on the character's canvas, magnified. */
  target: Buffer;
  /** The render's rest pose, same canvas, same magnification, same backdrop. */
  render: Buffer;
  /** The character's parts, when a parts sheet was bought. */
  parts: Buffer | null;
}

export function createComparisonTool(images: JudgeImages): {
  definition: ToolDefinition;
  looked(): boolean;
} {
  let looked = false;
  const definition: ToolDefinition = {
    name: 'puppet_judge_show',
    label: 'Show the two pictures',
    description:
      'Shows the target picture and the render, at the same size on the same background. Call it first; you cannot judge what you have not seen.',
    promptSnippet: 'puppet_judge_show — shows the target and the render',
    parameters: Type.Object({}),
    async execute() {
      looked = true;
      return {
        content: [
          { type: 'text' as const, text: 'THE TARGET — what the character is meant to be:' },
          { type: 'image' as const, data: images.target.toString('base64'), mimeType: 'image/png' },
          ...(images.parts === null
            ? []
            : [
                { type: 'text' as const, text: "The target's parts, drawn separately:" },
                { type: 'image' as const, data: images.parts.toString('base64'), mimeType: 'image/png' },
              ]),
          { type: 'text' as const, text: 'THE RENDER — what was actually drawn:' },
          { type: 'image' as const, data: images.render.toString('base64'), mimeType: 'image/png' },
        ],
        details: { ok: true },
      };
    },
  };
  return { definition, looked: () => looked };
}

const score = (what: string): ReturnType<typeof Type.Integer> =>
  Type.Integer({
    minimum: 0,
    maximum: MAX_SCORE,
    description: `${what} — 0 nothing like the target, 1 recognisably attempted, 2 close, 3 as good as the target at this size.`,
  });

export function createVerdictTool(): {
  definition: ToolDefinition;
  verdict(): JudgeVerdict | null;
} {
  let verdict: JudgeVerdict | null = null;
  const definition: ToolDefinition = {
    name: 'puppet_judge_score',
    label: 'Score the render',
    description: 'Records the five scores and what is missing. Call it once, after looking.',
    promptSnippet: 'puppet_judge_score — records your scores',
    parameters: Type.Object({
      seen: Type.String({
        description:
          'What the RENDER shows, described as if you had never seen the target. One or two sentences.',
      }),
      silhouette: score('The outline alone: would it be taken for the same thing'),
      proportions: score('Height against width, and the size of each part against the others'),
      head: score('The head: its size, its shape, and whether a face mark reads'),
      equipment: score('Everything carried or worn: is each item present and readable on the outline'),
      colour: score('The colours and where they sit on the body'),
      missing: Type.String({
        description:
          'The single most important thing the render is missing or has wrong, said plainly enough to act on.',
      }),
    }),
    async execute(_toolCallId, params) {
      const input = params as JudgeScores & { seen: string; missing: string };
      const scores: JudgeScores = {
        silhouette: input.silhouette,
        proportions: input.proportions,
        head: input.head,
        equipment: input.equipment,
        colour: input.colour,
      };
      const total = JUDGE_ASPECTS.reduce((sum, aspect) => sum + scores[aspect], 0);
      const anyZero = JUDGE_ASPECTS.some((aspect) => scores[aspect] === 0);
      verdict = {
        scores,
        total,
        passed: total >= PASS_TOTAL && !anyZero,
        missing: input.missing.trim().slice(0, 400),
        seen: input.seen.trim().slice(0, 400),
      };
      return {
        content: [{ type: 'text' as const, text: `Recorded: ${total} of ${JUDGE_ASPECTS.length * MAX_SCORE}.` }],
        details: { total },
      };
    },
  };
  return { definition, verdict: () => verdict };
}

function buildSystemPrompt(): string {
  return `You are judging whether a small pixel-art sprite reads as the character in a target picture.

You have not been told what the character is, and you must not be. Everything you know comes from the two pictures.

How to judge:
- Look at the target and the render at the same size, on the same background. They are framed identically on purpose, so any difference you see is a difference in what was drawn.
- Score the five things separately. A render can carry one striking feature and be wrong about everything else; that is why "is it the same character" is not the question.
- Judge at THIS size. The render is a few dozen pixels tall and cannot hold detail the target holds — score whether the shape and the placement are right, not whether the brushwork matches.
- 0 means the aspect is absent or unrecognisable, not merely poor. Use it when it is true and never to be kind about the rest.
- If you cannot see one of the pictures, say so in 'missing' and score nothing higher than 1. Never guess a score.

Then name the single most important thing to fix. One thing, the biggest one, said so that someone redrawing the sprite knows what to do.`;
}

function buildTask(): string {
  return `Call puppet_judge_show to see the two pictures, then puppet_judge_score once with your five scores, what you saw in the render, and the one thing most worth fixing.`;
}

export interface JudgeContext {
  host: AppRuntimeHost;
  workspaceId: string;
  parentSessionId: string;
  model: ModelSelection;
  signal: AbortSignal;
}

/** Judge one render against the target. */
export async function judgeAgainstTarget(
  images: JudgeImages,
  context: JudgeContext,
): Promise<JudgeOutcome> {
  const shower = createComparisonTool(images);
  const scorer = createVerdictTool();

  const params: AppRuntimeSubagentRunParams = {
    task: buildTask(),
    systemPrompt: buildSystemPrompt(),
    parentSessionId: context.parentSessionId,
    workspaceId: context.workspaceId,
    // Comparing two small pictures aspect by aspect is the same judgement work
    // the authoring runs needed effort for; a low-effort judge waves things
    // through, which is the failure this whole check exists to answer.
    thinking: 'high',
    platformTools: 'none',
    customTools: [shower.definition, scorer.definition],
    timeoutMs: RUN_TIMEOUT_MS,
    signal: context.signal,
    ...(modelSelectionIsEmpty(context.model) ? {} : { model: context.model.modelId }),
  };

  const result = await context.host.subagents.runStructured(params).catch((error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
  }));

  const verdict = scorer.verdict();
  if (!shower.looked()) {
    return { status: 'unavailable', reason: 'The judge never looked at the pictures.' };
  }
  if (verdict === null) {
    const error = (result as { error?: string }).error;
    return { status: 'unavailable', reason: error ?? 'The judge ended without recording a verdict.' };
  }
  return { status: 'judged', verdict };
}
