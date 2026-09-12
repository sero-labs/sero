/**
 * Shared edit and write tool implementations.
 *
 * Both runtime factories (container-proxied and host) build their `edit` and
 * `write` tools here. The caller supplies a file-I/O port and a path resolver,
 * so protected-path and memory-file guards stay backend-specific.
 *
 * Every mutation runs through one per-file queue. The queue key combines the
 * backend filesystem identity with the canonical target path.
 */

import type { Static } from 'typebox';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import {
  detectLineEnding,
  generateDiffString,
  normalizeToLF,
  restoreLineEndings,
  stripBom,
} from '../filesystem/edit-helpers';
import { applyEditsToNormalizedContent, type EditReplacement } from '../filesystem/edit-batch';
import { withFileMutationQueue } from '../filesystem/file-mutation-queue';
import { EditParams, WriteParams } from './tool-schemas';

/** Serialization key plus the canonical path used for protected-path checks. */
export interface MutationTarget {
  key: string;
  canonicalPath: string;
}

/** Backend file access. One adapter wraps `runtime.readFile`/`writeFile`; one wraps `node:fs`. */
export interface FileMutationPort {
  resolveTarget(absolutePath: string): Promise<MutationTarget>;
  readFile(absolutePath: string): Promise<string>;
  writeFile(absolutePath: string, content: string): Promise<void>;
}

export interface FileToolConfig {
  port: FileMutationPort;
  /** Resolve a model-supplied path to a backend-absolute path. */
  resolvePath(requestedPath: string): string;
  /** Reject a target. Runs inside the mutation queue. */
  assertAllowed(target: MutationTarget, requestedPath: string): void;
}

/**
 * Model-visible diff cap, set from the recorded before/after run on DeepSeek V4
 * Flash. The largest observed edit result was 14 lines and 376 bytes, so this
 * cap leaves about 5x headroom for normal edits and bounds a pathological diff
 * near 500 tokens instead of letting history grow with change size.
 */
export const EDIT_DIFF_MAX_LINES = 40;
export const EDIT_DIFF_MAX_BYTES = 2 * 1024;

const ABORT_MESSAGE = 'Operation aborted';

function throwIfAborted(signal: AbortSignal | undefined): void {
  // Do not reject from an abort listener: that would release the mutation queue
  // while a filesystem write is still in flight. Checking after each await
  // observes the same aborts and keeps the lock until the write settles.
  if (signal?.aborted) throw new Error(ABORT_MESSAGE);
}

/** Bound the model-visible diff and mark truncation explicitly. */
export function boundDiffText(
  diff: string,
  maxLines = EDIT_DIFF_MAX_LINES,
  maxBytes = EDIT_DIFF_MAX_BYTES,
): string {
  const lines = diff.length === 0 ? [] : diff.split('\n');
  const markerFor = (kept: number) =>
    `[diff truncated: showing ${kept} of ${lines.length} lines]`;

  const kept: string[] = [];
  let bodyBytes = 0;
  for (const line of lines) {
    if (kept.length >= maxLines) break;
    // Each kept line is written with a trailing newline before the marker.
    const lineBytes = Buffer.byteLength(line, 'utf-8') + 1;
    const markerBytes = Buffer.byteLength(markerFor(kept.length + 1), 'utf-8');
    if (bodyBytes + lineBytes + markerBytes > maxBytes) break;
    kept.push(line);
    bodyBytes += lineBytes;
  }

  if (kept.length === lines.length) return diff;
  const body = kept.length > 0 ? `${kept.join('\n')}\n` : '';
  return `${body}${markerFor(kept.length)}`;
}

/**
 * Accept the ordered array, the legacy single fields, or both. When `edits` is
 * present it is authoritative, so an empty array is an error and never falls
 * back to the legacy fields.
 */
export function resolveEditReplacements(
  params: Static<typeof EditParams>,
  requestedPath: string,
): EditReplacement[] {
  if (Array.isArray(params.edits)) {
    if (params.edits.length === 0) {
      throw new Error(`edits[] must contain at least one replacement in ${requestedPath}.`);
    }
    return params.edits.map((edit) => ({ oldText: edit.oldText, newText: edit.newText }));
  }
  if (typeof params.oldText === 'string' && typeof params.newText === 'string') {
    return [{ oldText: params.oldText, newText: params.newText }];
  }
  throw new Error(
    `edit needs a non-empty edits[] array or both oldText and newText in ${requestedPath}.`,
  );
}

function prepareEditArguments(input: unknown): Static<typeof EditParams> {
  if (!input || typeof input !== 'object') return input as Static<typeof EditParams>;
  const args = { ...(input as Record<string, unknown>) };
  // Some models send edits as a JSON string instead of an array.
  if (typeof args.edits === 'string') {
    try {
      const parsed = JSON.parse(args.edits);
      if (Array.isArray(parsed)) args.edits = parsed;
    } catch {
      // Leave the raw value in place so schema validation reports the problem.
    }
  }
  return args as Static<typeof EditParams>;
}

const EDIT_DESCRIPTION =
  'Edit a file with exact text replacement. Put one or more disjoint replacements in `edits[]`; each is matched against the '
  + 'original file content and all entries apply in one write. Legacy single replacements via `oldText`/`newText` still work, '
  + 'and `edits[]` wins when both forms are present. The matcher tolerates trailing whitespace per line and normalizes smart '
  + 'quotes, dashes, and special spaces, but every `edits[].oldText` must stay unique. Same-file mutations run in order and '
  + 'each call validates the current content.';

const EDIT_GUIDELINES = [
  'Put every independent change to one file into a single edit call with several edits[] entries instead of several edit calls.',
  'Each edits[].oldText is matched against the original file content, not against the result of an earlier entry. Do not send overlapping or nested regions.',
  'Keep edits[].oldText as small as possible while it stays unique in the file. Do not pad with large unchanged regions.',
  'Same-file mutations run in sequence and each edit validates the current content. A conflicting edit fails without writing, and a later whole-file write replaces earlier edits.',
];

const WRITE_GUIDELINES = [
  'Use write for new files and complete rewrites. Same-file writes and edits run in sequence, and a write replaces earlier content instead of merging with it.',
];

export function createEditTool(config: FileToolConfig): ToolDefinition {
  return {
    name: 'edit',
    label: 'edit',
    description: EDIT_DESCRIPTION,
    promptSnippet: 'Make exact-text file edits, including several disjoint replacements in one call',
    promptGuidelines: [...EDIT_GUIDELINES],
    parameters: EditParams,
    prepareArguments: prepareEditArguments,
    execute: async (_toolCallId, params: Static<typeof EditParams>, signal?) => {
      const requestedPath = params.path;
      const replacements = resolveEditReplacements(params, requestedPath);
      const absolutePath = config.resolvePath(requestedPath);

      throwIfAborted(signal);
      const target = await config.port.resolveTarget(absolutePath);
      throwIfAborted(signal);

      return withFileMutationQueue(target.key, async () => {
        throwIfAborted(signal);
        config.assertAllowed(target, requestedPath);

        let rawContent: string;
        try {
          rawContent = await config.port.readFile(absolutePath);
        } catch {
          throw new Error(`File not found: ${requestedPath}`);
        }
        throwIfAborted(signal);

        const { bom, text: content } = stripBom(rawContent);
        const originalEnding = detectLineEnding(content);
        const normalizedContent = normalizeToLF(content);

        const { baseContent, newContent } = applyEditsToNormalizedContent(
          normalizedContent,
          replacements,
          requestedPath,
        );
        throwIfAborted(signal);

        const finalContent = bom + restoreLineEndings(newContent, originalEnding);
        await config.port.writeFile(absolutePath, finalContent);
        throwIfAborted(signal);

        const diffResult = generateDiffString(baseContent, newContent);
        const count = replacements.length;
        const summary = `Replaced ${count} block${count === 1 ? '' : 's'} in ${requestedPath}.`;

        return {
          content: [{ type: 'text' as const, text: `${summary}\n\n${boundDiffText(diffResult.diff)}` }],
          details: {
            path: absolutePath,
            diff: diffResult.diff,
            firstChangedLine: diffResult.firstChangedLine,
            replacements: count,
          },
        };
      });
    },
  };
}

export function createWriteTool(config: FileToolConfig): ToolDefinition {
  return {
    name: 'write',
    label: 'write',
    description:
      "Write content to a file. Creates the file if it doesn't exist, " +
      'overwrites if it does. Automatically creates parent directories.',
    promptSnippet: 'Create or overwrite a file with full content',
    promptGuidelines: [...WRITE_GUIDELINES],
    parameters: WriteParams,
    execute: async (_toolCallId, params: Static<typeof WriteParams>, signal?) => {
      const requestedPath = params.path;
      const absolutePath = config.resolvePath(requestedPath);

      throwIfAborted(signal);
      const target = await config.port.resolveTarget(absolutePath);
      throwIfAborted(signal);

      return withFileMutationQueue(target.key, async () => {
        throwIfAborted(signal);
        config.assertAllowed(target, requestedPath);
        throwIfAborted(signal);

        await config.port.writeFile(absolutePath, params.content);
        throwIfAborted(signal);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Successfully wrote ${params.content.length} bytes to ${requestedPath}`,
            },
          ],
          details: { path: absolutePath },
        };
      });
    },
  };
}
