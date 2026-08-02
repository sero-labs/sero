/**
 * Handing the author its target.
 *
 * A subagent run has no workspace and no read tool, so a picture can only
 * reach it as tool content — the same seam the frame judge uses. The tool is
 * separate from the write tool rather than folded into every bake result
 * because the target never changes: sending it back on all ten bakes would
 * spend the run's context on a picture it already has.
 *
 * Whether it was ever called is tracked. An author that never looked at the
 * target is authoring blind, which is the thing Phase 1b exists to stop, and
 * the run says so instead of reporting a reference-aimed result that was not.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { JudgeVerdict } from './judge';
import type { PreparedReference } from './reference';

export function describeMaterials(reference: PreparedReference): string {
  if (reference.materials.length === 0) return 'No materials could be measured.';
  return reference.materials
    .map(
      (material, index) =>
        `${index + 1}. ${(material.share * 100).toFixed(0).padStart(2)}% of the figure — ` +
        material.shades.map((shade) => `hex('${shade}')`).join(', '),
    )
    .join('\n');
}

export function createTargetTool(
  reference: PreparedReference,
  images: { target: Buffer; parts: Buffer | null },
  canvas: { canvasW: number; canvasH: number; groundRow: number },
): { definition: ToolDefinition; looked(): boolean } {
  let looked = false;
  const definition: ToolDefinition = {
    name: 'puppet_studio_show_target',
    label: 'Show the target',
    description:
      'Shows the character you are drawing: the reference standing on your own canvas, at your own scale, and its colours. Call it before you write anything.',
    promptSnippet: 'puppet_studio_show_target — the picture you are aiming at',
    parameters: Type.Object({}),
    async execute() {
      looked = true;
      const measurements =
        `The target stands ${reference.figureW} x ${reference.figureH} px on the ${canvas.canvasW} x ` +
        `${canvas.canvasH} canvas, feet on row ${canvas.groundRow}. Those are the numbers to match: ` +
        'the same height, the same width, the same head-to-body ratio.';
      return {
        content: [
          {
            type: 'text' as const,
            text:
              'This is the character. It is shown on YOUR canvas at YOUR scale, magnified for looking at, so ' +
              'sizes you read off it are sizes you can paint to directly.\n\n' +
              measurements,
          },
          { type: 'image' as const, data: images.target.toString('base64'), mimeType: 'image/png' },
          ...(images.parts === null || reference.parts === null
            ? []
            : [
                {
                  type: 'text' as const,
                  text:
                    `The same character drawn in pieces, at the same scale — one per bone's worth of shape. ` +
                    `Sizes in canvas pixels: ${reference.parts.sizes}.`,
                },
                { type: 'image' as const, data: images.parts.toString('base64'), mimeType: 'image/png' },
              ]),
          {
            type: 'text' as const,
            text:
              'Its colours, measured and grouped into material ramps, commonest first. Use these — a part ' +
              'declares a ramp, and these are the ramps this character is made of:\n\n' +
              describeMaterials(reference),
          },
        ],
        details: { ok: true },
      };
    },
  };
  return { definition, looked: () => looked };
}

/** The judge's verdict, written for the author's next bake. */
export function verdictAdvice(verdict: JudgeVerdict): string {
  const lines = Object.entries(verdict.scores)
    .map(([aspect, score]) => `  ${aspect.padEnd(12)} ${score}/3`)
    .join('\n');
  return [
    `An independent judge — which has never seen the brief — compared your render with the target.`,
    lines,
    `Total ${verdict.total} of 15. ${verdict.passed ? 'That clears the bar.' : 'The bar is 10 with nothing at zero.'}`,
    `It described your render as: "${verdict.seen}"`,
    `The one thing most worth fixing: ${verdict.missing}`,
  ].join('\n');
}
