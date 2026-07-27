import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

/**
 * What the run calls its own design.
 *
 * Variants used to be "01", "02", "03", which says nothing about three pages
 * that deliberately took different directions. The run already decides on a
 * direction, so it is asked to name it.
 *
 * A tool rather than the reply text: reading a name out of prose means guessing
 * where it starts and stops, and a guess that goes wrong labels the variant with
 * half a sentence. The tool call either happened or it did not, and the run is
 * sent back for it when it did not.
 */

/** A tab label, not a title. Longer names are cut rather than refused. */
export const MAX_NAME_CHARS = 28;
/** A line under the preview. */
export const MAX_SUMMARY_CHARS = 240;

export interface DesignNaming {
  name: string;
  summary: string;
}

export interface NameDesignTool {
  definition: ToolDefinition;
  /** The naming, or null while the tool has not been called. */
  naming(): DesignNaming | null;
}

export function createNameDesignTool(): NameDesignTool {
  let naming: DesignNaming | null = null;

  const definition: ToolDefinition = {
    name: 'design_library_name_design',
    label: 'Name Design',
    description:
      'Names the design you have written. Call it once, after the files are written. The name labels this variant next to its siblings, so it should say what makes this one different.',
    promptSnippet: 'design_library_name_design — names the design you wrote',
    parameters: Type.Object({
      name: Type.String({
        description: `Two or three words, e.g. "Signal ledger" or "Glass telemetry". No more than ${MAX_NAME_CHARS} characters, and no variant numbers.`,
      }),
      summary: Type.String({
        description: 'One sentence on the direction you took and why it suits the request.',
      }),
    }),
    async execute(_toolCallId, params) {
      const { name, summary } = params as { name: string; summary: string };
      const trimmed = name.trim().slice(0, MAX_NAME_CHARS).trim();
      if (trimmed === '') {
        return {
          content: [{ type: 'text' as const, text: 'The name was empty. Give it two or three words.' }],
          details: { ok: false },
          isError: true,
        };
      }
      naming = { name: trimmed, summary: summary.trim().slice(0, MAX_SUMMARY_CHARS) };
      return {
        content: [{ type: 'text' as const, text: `Named "${trimmed}".` }],
        details: { ok: true, name: trimmed },
      };
    },
  };

  return { definition, naming: () => naming };
}
