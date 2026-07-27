import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { OutputTarget } from '../../shared/design';
import type { EmittedFile } from '../../shared/targets';
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  TARGET_CONTRACTS,
  refuseFileName,
  remoteReferencesOf,
  unapprovedImports,
} from '../../shared/targets';

/**
 * How a generated page reaches the runtime.
 *
 * The obvious approach — ask for one JSON object containing the files — makes the
 * model escape several hundred lines of markup and CSS into JSON string literals,
 * and it gets that wrong often enough to matter. A tool call per file avoids the
 * escaping entirely and buys two things worth more than the tidiness:
 *
 * 1. Each file is checked as it arrives, so an import the target does not
 *    approve comes back as an error the model can act on rather than a build
 *    failure minutes later.
 * 2. The runtime knows whether anything was written at all. A run that produced
 *    no file is rejected on that fact rather than on the reply's word — the same
 *    rule the Librarian's image tool enforces, for the same reason.
 *
 * Nothing here touches the filesystem. Files are collected in memory and written
 * once, by the caller, after the run is accepted.
 */

export interface EmitFileTool {
  definition: ToolDefinition;
  /** Files written so far, in the order the model wrote them. */
  files(): EmittedFile[];
  /** Names of files the tool refused, so the run can explain a thin result. */
  refusals(): string[];
  /**
   * Whether this run changed anything of its own.
   *
   * Only meaningful for a revise, where the tool starts holding the previous
   * revision's files: `files()` is non-empty from the first moment, so it can no
   * longer answer "did the model produce anything". A revise that changed nothing
   * has not revised — it has agreed with itself — and storing that as a new
   * revision would put an identical page in the history under an instruction it
   * never carried out.
   *
   * Compared against the files the run started from, not merely counted: writing
   * a file back byte for byte is the same non-event as never writing it, and a
   * model that restates the page it was given would otherwise pass this check and
   * retire the original in favour of a copy of itself.
   */
  touched(): string[];
}

function byteLength(content: string): number {
  return Buffer.byteLength(content, 'utf8');
}

/**
 * @param seed Files the run starts from — the revision being revised. A file the
 * model never rewrites is carried through unchanged, so a revise can change one
 * stylesheet without restating the markup.
 */
export function createEmitFileTool(target: OutputTarget, seed: EmittedFile[] = []): EmitFileTool {
  const contract = TARGET_CONTRACTS[target];
  const seeded = new Map<string, string>(seed.map((file) => [file.name, file.content]));
  const written = new Map<string, string>(seeded);
  const touched = new Set<string>();
  const refused: string[] = [];

  const reject = (message: string, name: string) => {
    refused.push(name);
    return {
      content: [{ type: 'text' as const, text: message }],
      details: { ok: false },
      isError: true,
    };
  };

  const definition: ToolDefinition = {
    name: 'design_library_write_file',
    label: 'Write Design File',
    description: `Writes one file of the design you are producing. Call it once per file. The entry point must be \`${contract.entry}\`. Allowed file types: ${contract.extensions.join(', ')}. Writing the same name twice replaces the earlier contents.${
      seed.length === 0
        ? ''
        : ` This design already has ${seed.map((file) => `\`${file.name}\``).join(', ')} — write the complete new contents of each file you are changing, and leave the rest alone.`
    }`,
    promptSnippet: `design_library_write_file — writes one file of the design (entry: ${contract.entry})`,
    parameters: Type.Object({
      name: Type.String({ description: `File name, e.g. \`${contract.entry}\`. No directories.` }),
      content: Type.String({ description: 'The complete file contents.' }),
    }),
    async execute(_toolCallId, params) {
      const { name, content } = params as { name: string; content: string };

      const badName = refuseFileName(target, name);
      if (badName) return reject(badName, name);

      if (!written.has(name) && written.size >= MAX_FILES) {
        return reject(
          `A design may contain at most ${MAX_FILES} files. Fold this into one you have already written.`,
          name,
        );
      }

      const bytes = byteLength(content);
      if (bytes > MAX_FILE_BYTES) {
        return reject(
          `\`${name}\` is ${Math.round(bytes / 1024)} KB, over the ${MAX_FILE_BYTES / 1024} KB limit for one file. Split it or make it less repetitive.`,
          name,
        );
      }
      if (content.trim() === '') return reject(`\`${name}\` is empty.`, name);

      // The build resolves nothing outside the approved set, so an unapproved
      // import is a certain build failure. Saying so now costs one tool call;
      // saying so later costs the whole run.
      const unapproved = unapprovedImports(target, content);
      if (unapproved.length > 0) {
        return reject(
          `\`${name}\` imports ${unapproved.map((entry) => `\`${entry}\``).join(', ')}, which this design cannot use. The preview has no network and no installed packages. Allowed imports: ${
            contract.approvedImports.length === 0
              ? 'none — write plain HTML, CSS and JavaScript'
              : contract.approvedImports.map((entry) => `\`${entry}\``).join(', ')
          }. Write the behaviour yourself instead.`,
          name,
        );
      }

      const remote = remoteReferencesOf(content);
      if (remote.length > 0) {
        return reject(
          `\`${name}\` points at ${remote.slice(0, 3).join(', ')}. The preview has no network, so remote fonts, images, scripts and stylesheets never load. Use the Sero theme's sans or mono stack, inline SVG, and CSS gradients or shapes instead.`,
          name,
        );
      }

      written.set(name, content);
      touched.add(name);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Wrote \`${name}\` (${bytes} bytes). ${written.size} file(s) so far.`,
          },
        ],
        details: { ok: true, name, bytes },
      };
    },
  };

  return {
    definition,
    files: () => [...written].map(([name, content]) => ({ name, content })),
    refusals: () => [...refused],
    // Written *and* different from what it started as. A file rewritten and then
    // put back is not a change either, which is why this compares final contents
    // rather than remembering that a write happened.
    touched: () => [...touched].filter((name) => written.get(name) !== seeded.get(name)),
  };
}

/**
 * Why the collected files are not a usable design, or null when they are.
 * Doubles as the repair message: it is written to be read by the model.
 */
export function refuseEmittedSet(target: OutputTarget, files: EmittedFile[]): string | null {
  const contract = TARGET_CONTRACTS[target];
  if (files.length === 0) {
    return `You have not written any files yet. Call \`design_library_write_file\` for each file, starting with \`${contract.entry}\`.`;
  }
  if (!files.some((file) => file.name === contract.entry)) {
    return `There is no \`${contract.entry}\`. Every design needs one — it is where the preview starts. You wrote: ${files
      .map((file) => `\`${file.name}\``)
      .join(', ')}.`;
  }
  return null;
}
