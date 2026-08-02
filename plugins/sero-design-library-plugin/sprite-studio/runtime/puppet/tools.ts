/**
 * The authoring run's only two ways to act: write the character, or stop.
 *
 * The write tool IS the loop. Each call compiles, bakes, and audits the whole
 * file, and the tool result carries everything the author needs for the next
 * decision — compile errors with line numbers, the ok/FAIL audit lines, and
 * the review pictures as image content (a subagent has no workspace, so
 * pictures can only arrive this way; see the judge's tool for the pattern).
 * Convergence is measured by the runtime (`allClean` on the last bake), never
 * taken from the author's word — finishing is a stop signal, not a verdict.
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { CompileIssue } from './compile';
import type { PuppetBakeOutcome } from './bake';

/** Enough for a whole character with headroom; a file beyond this is lost
 * structure, not detail. */
export const MAX_SOURCE_BYTES = 128 * 1024;
/** Bakes per run. Each is seconds of compute; the budget exists to bound the
 * model's context growth and the run's wall clock, and the author is told the
 * count on every result. */
export const DEFAULT_MAX_BAKES = 10;

export interface PuppetRound {
  round: number;
  hash: string;
  /** 'clean', 'audit-failures', or the failing stage. */
  outcome: 'clean' | 'audit-failures' | 'compile' | 'load' | 'contract';
  failedChecks: number;
  issues?: CompileIssue[];
  sourceBytes: number;
  cached: boolean;
}

export interface BakeRound {
  outcome: PuppetBakeOutcome;
  /** Present when the bake succeeded — read back from the bake directory.
   * Scales live on the report's clips, which is what the captions read. */
  images: { rest: Buffer; strips: Map<string, Buffer> } | null;
}

type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

function issueLines(issues: CompileIssue[]): string {
  return issues
    .map((issue) => (issue.line === undefined ? `- ${issue.text}` : `- line ${issue.line}: ${issue.text}`))
    .join('\n');
}

function reviewContent(round: BakeRound): ToolContent[] {
  if (!round.outcome.ok || round.images === null) return [];
  const report = round.outcome.report;
  const content: ToolContent[] = [
    { type: 'text' as const, text: 'The rest pose, at 8x:' },
    { type: 'image' as const, data: round.images.rest.toString('base64'), mimeType: 'image/png' },
  ];
  for (const [clip, png] of round.images.strips) {
    const scale = report.clips.find((entry) => entry.clip === clip)?.stripScale ?? 1;
    content.push(
      { type: 'text' as const, text: `Clip '${clip}', every frame at ${scale}x:` },
      { type: 'image' as const, data: png.toString('base64'), mimeType: 'image/png' },
    );
  }
  return content;
}

export function createCharacterSourceTool(deps: {
  bake(source: string): Promise<BakeRound>;
  onRound(round: PuppetRound, source: string): Promise<void>;
  maxBakes: number;
}): {
  definition: ToolDefinition;
  rounds(): PuppetRound[];
  source(): string | null;
  converged(): boolean;
  lastCleanHash(): string | null;
} {
  const rounds: PuppetRound[] = [];
  let lastSource: string | null = null;
  let converged = false;
  let lastCleanHash: string | null = null;

  const definition: ToolDefinition = {
    name: 'puppet_studio_write_character',
    label: 'Write the character',
    description:
      'Replaces the whole character file, then compiles, bakes and audits it. ' +
      'The result carries the audit verdict and the review pictures. ' +
      'Send the complete file every time, never a fragment.',
    promptSnippet: 'puppet_studio_write_character — write the file, get the bake back',
    parameters: Type.Object({
      source: Type.String({
        description: "The complete TypeScript character file. Its only import is '@sero-ai/ink-and-bones'.",
      }),
    }),
    async execute(_toolCallId, params) {
      const { source } = params as { source: string };
      if (rounds.length >= deps.maxBakes) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `The bake budget (${deps.maxBakes}) is spent. Call puppet_studio_finish with a short note on where this ended up.`,
            },
          ],
          details: { refused: true },
        };
      }
      if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `That file is over ${Math.round(MAX_SOURCE_BYTES / 1024)} KB. A character fits comfortably; simplify rather than grow.`,
            },
          ],
          details: { refused: true },
        };
      }

      let baked: BakeRound;
      try {
        baked = await deps.bake(source);
      } catch (error) {
        if (error instanceof Error && error.message === 'Aborted') throw error;
        // Infrastructure failing is not the author's mistake and must not
        // spend the author's budget — no round is recorded.
        return {
          content: [
            {
              type: 'text' as const,
              text: `The bake machinery itself failed — this is not your file: ${error instanceof Error ? error.message : String(error)}. Send the same file again to retry.`,
            },
          ],
          details: { infrastructure: true },
        };
      }
      const n = rounds.length + 1;
      const header = `Bake ${n} of ${deps.maxBakes}.`;
      lastSource = source;

      if (!baked.outcome.ok) {
        const round: PuppetRound = {
          round: n,
          hash: baked.outcome.hash,
          outcome: baked.outcome.stage,
          failedChecks: 0,
          issues: baked.outcome.issues,
          sourceBytes: Buffer.byteLength(source, 'utf8'),
          cached: false,
        };
        rounds.push(round);
        converged = false;
        await deps.onRound(round, source);
        const stage =
          baked.outcome.stage === 'compile'
            ? 'It did not compile.'
            : baked.outcome.stage === 'load'
              ? 'It compiled but failed while running.'
              : 'It ran but does not satisfy the character contract.';
        return {
          content: [{ type: 'text' as const, text: `${header} ${stage}\n${issueLines(baked.outcome.issues)}` }],
          details: { stage: baked.outcome.stage },
        };
      }

      const report = baked.outcome.report;
      const failed = report.clips.reduce((sum, clip) => sum + clip.failed, 0);
      const round: PuppetRound = {
        round: n,
        hash: baked.outcome.hash,
        outcome: report.allClean ? 'clean' : 'audit-failures',
        failedChecks: failed,
        sourceBytes: Buffer.byteLength(source, 'utf8'),
        cached: baked.outcome.cached,
      };
      rounds.push(round);
      converged = report.allClean;
      if (report.allClean) lastCleanHash = baked.outcome.hash;
      await deps.onRound(round, source);

      const verdict = report.allClean
        ? 'Every audit gate is green. Now judge the pictures: does the motion read, can you find every part in every frame? ' +
          'If it looks right, call puppet_studio_finish. If not, revise — the audit cannot see value collapse, but you can.'
        : 'Audit failures below. Fix the failing checks first — the guide says how to read each one.';
      const feet =
        report.restFeetRow === report.groundRow
          ? `Rest feet row measured: ${report.restFeetRow} — matches the declared groundRow.`
          : `Rest feet row measured: ${report.restFeetRow}, but groundRow declares ${report.groundRow} — the declaration should match the measurement.`;
      return {
        content: [
          { type: 'text' as const, text: `${header}\n${report.pretty}\n${feet}\n\n${verdict}` },
          ...reviewContent(baked),
        ],
        details: { allClean: report.allClean, failed },
      };
    },
  };

  return {
    definition,
    rounds: () => rounds,
    source: () => lastSource,
    converged: () => converged,
    lastCleanHash: () => lastCleanHash,
  };
}

export function createFinishTool(): { definition: ToolDefinition; note(): string | null } {
  let note: string | null = null;
  const definition: ToolDefinition = {
    name: 'puppet_studio_finish',
    label: 'Finish',
    description:
      'Ends the run. Call it after a bake whose gates are green and whose pictures read right — or when the budget is spent.',
    promptSnippet: 'puppet_studio_finish — end the run with a note',
    parameters: Type.Object({
      note: Type.String({
        description: 'One or two sentences on the state of the character, for the person reviewing the run.',
      }),
    }),
    async execute(_toolCallId, params) {
      note = (params as { note: string }).note.trim().slice(0, 500);
      return { content: [{ type: 'text' as const, text: 'Recorded. The run is over.' }], details: { ok: true } };
    },
  };
  return { definition, note: () => note };
}
