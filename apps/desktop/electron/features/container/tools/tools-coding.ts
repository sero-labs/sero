/**
 * Core coding tool factories: bash, read, write, edit.
 *
 * These mirror Pi SDK's createCodingTools() behaviour as closely as
 * possible — same truncation, fuzzy matching, diff output, error
 * signalling (reject on failure), and image support.
 *
 * IMPORTANT: Errors are thrown (rejected), not returned with isError.
 * The Pi SDK agent-loop only sets isError=true when the tool rejects;
 * returning { isError: true } from a resolved promise is silently
 * ignored by the framework.
 */

import type { Static } from 'typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import {
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateTail,
} from '../filesystem/truncate';
import {
  stripBom,
  detectLineEnding,
  normalizeToLF,
  restoreLineEndings,
  fuzzyFindText,
  countFuzzyOccurrences,
  generateDiffString,
} from '../filesystem/edit-helpers';
import {
  WORKSPACE_DIR,
  resolveContainerPath,
  shellEscape,
  detectMimeFromMagicHex,
  BashParams,
  ReadParams,
  WriteParams,
  EditParams,
} from './tool-schemas';
import {
  commandTouchesProtectedMemory,
  commandTouchesProtectedMemoryWithResolver,
  getProtectedMemoryAccessError,
  isProtectedMemoryPath,
} from './memory-file-guard';
import { prepareToolImage } from '@electron/shared/media/image-resize';

function normalizeContainerGuardPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function buildResolveContainerPathCommand(targetPath: string): string {
  const escaped = shellEscape(targetPath);
  return [
    `python3 - '${escaped}' <<'PY'`,
    'import os, sys',
    'target = os.path.abspath(sys.argv[1])',
    'current = target',
    'missing = []',
    'while True:',
    '    if os.path.lexists(current):',
    '        resolved = os.path.realpath(current)',
    '        if missing:',
    '            resolved = os.path.join(resolved, *reversed(missing))',
    '        print(resolved)',
    '        break',
    '    parent = os.path.dirname(current)',
    '    if parent == current:',
    '        print(target)',
    '        break',
    '    missing.append(os.path.basename(current))',
    '    current = parent',
    'PY',
  ].join('\n');
}

async function resolveContainerPathForGuard(
  runtime: RuntimeBackend,
  targetPath: string,
  cwd: string,
): Promise<string> {
  const result = await runtime.exec({
    command: buildResolveContainerPathCommand(targetPath),
    cwd,
    timeoutMs: 10_000,
  });
  return normalizeContainerGuardPath(result.stdout.trim() || targetPath);
}

// ── Bash ────────────────────────────────────────────────────

export function createBash(runtime: RuntimeBackend, containerCwd?: string): ToolDefinition {
  const cwd = containerCwd ?? WORKSPACE_DIR;
  return {
    name: 'bash',
    label: 'bash',
    description:
      `Execute a bash command in the current working directory. ` +
      `Returns stdout and stderr. Output is truncated to last ` +
      `${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB ` +
      `(whichever is hit first). Optionally provide a timeout in seconds.`,
    parameters: BashParams,
    execute: async (_toolCallId, params: Static<typeof BashParams>, signal?) => {
      if (signal?.aborted) throw new Error('Command aborted');
      if (
        commandTouchesProtectedMemory(params.command)
        || await commandTouchesProtectedMemoryWithResolver({
          command: params.command,
          basedir: cwd,
          resolvePath: (candidatePath) => resolveContainerPathForGuard(runtime, candidatePath, cwd),
        })
      ) {
        throw new Error(getProtectedMemoryAccessError('bash'));
      }

      const timeoutMs = params.timeout ? params.timeout * 1000 : undefined;
      const result = await runtime.exec({
        command: params.command,
        cwd,
        timeoutMs,
      });
      const combined = (
        result.stdout + (result.stderr ? '\n' + result.stderr : '')
      ).trim();

      // Line-aware tail truncation (matches Pi SDK)
      const truncation = truncateTail(combined);
      let outputText = truncation.content || '(no output)';

      if (truncation.truncated) {
        const startLine = truncation.totalLines - truncation.outputLines + 1;
        const endLine = truncation.totalLines;

        if (truncation.lastLinePartial) {
          const lastLineSize = formatSize(
            Buffer.byteLength(combined.split('\n').pop() || '', 'utf-8'),
          );
          outputText += `\n\n[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${lastLineSize}).]`;
        } else if (truncation.truncatedBy === 'lines') {
          outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}.]`;
        } else {
          outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit).]`;
        }
      }

      if (result.exitCode !== 0 && result.exitCode !== null) {
        outputText += `\n\nCommand exited with code ${result.exitCode}`;
      }

      // Non-zero exit → reject (Pi SDK behaviour: agent-loop sets isError)
      if (result.exitCode !== 0) {
        throw new Error(outputText);
      }

      return {
        content: [{ type: 'text', text: outputText }],
        details: { exitCode: result.exitCode, ...(truncation.truncated ? { truncation } : {}) },
      };
    },
  };
}

// ── Read ────────────────────────────────────────────────────

export function createRead(runtime: RuntimeBackend, containerCwd?: string): ToolDefinition {
  const basedir = containerCwd ?? WORKSPACE_DIR;
  return {
    name: 'read',
    label: 'read',
    description:
      `Read the contents of a file. Supports text files and images ` +
      `(jpg, png, gif, webp). Images are sent as attachments. For text ` +
      `files, output is truncated to ${DEFAULT_MAX_LINES} lines or ` +
      `${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use ` +
      `offset/limit for large files. When you need the full file, ` +
      `continue with offset until complete.`,
    parameters: ReadParams,
    execute: async (_toolCallId, params: Static<typeof ReadParams>, signal?) => {
      if (signal?.aborted) throw new Error('Operation aborted');

      const absPath = resolveContainerPath(params.path, basedir);
      const guardedPath = isProtectedMemoryPath(absPath)
        ? absPath
        : await resolveContainerPathForGuard(runtime, absPath, basedir);
      if (isProtectedMemoryPath(guardedPath)) {
        throw new Error(getProtectedMemoryAccessError('read'));
      }
      const escaped = shellEscape(absPath);

      // ── Image detection by magic bytes ──────────────────
      // Read the first 12 bytes as hex to sniff the real file type.
      // This matches Pi SDK behaviour (file-type package) and avoids
      // sending broken data to the API for misnamed / corrupt files.
      const hexResult = await runtime.exec({
        command: `od -A n -t x1 -N 12 '${escaped}' | tr -d ' \\n'`,
      });
      const magicHex = hexResult.stdout.trim().toLowerCase();
      const mimeType = detectMimeFromMagicHex(magicHex);

      if (mimeType) {
        const b64Result = await runtime.exec({
          command: `base64 -w 0 '${escaped}' 2>/dev/null || base64 '${escaped}'`,
        });
        if (b64Result.exitCode !== 0) {
          throw new Error(`Error reading image ${params.path}: ${b64Result.stderr}`);
        }
        const base64 = b64Result.stdout.replace(/[\r\n]/g, '');

        // Final sanity check — decoded size should be > 8 bytes for a real image
        const estimatedBytes = Math.floor((base64.length * 3) / 4);
        if (estimatedBytes < 8) {
          throw new Error(
            `File ${params.path} has image magic bytes but is only ${estimatedBytes} bytes — likely corrupt.`,
          );
        }

        const image = prepareToolImage(base64, mimeType);
        const text = [`Read image file [${image.mimeType}]`, image.text].filter(Boolean).join('\n');
        return {
          content: [
            { type: 'text' as const, text },
            { type: 'image' as const, data: image.data, mimeType: image.mimeType },
          ],
          details: { path: absPath },
        };
      }

      // ── Text handling ───────────────────────────────────
      const readResult = await runtime.exec({ command: `cat '${escaped}'` });
      if (readResult.exitCode !== 0) {
        throw new Error(`Error reading ${params.path}: ${readResult.stderr}`);
      }

      const textContent = readResult.stdout;
      const allLines = textContent.split('\n');
      const totalFileLines = allLines.length;

      // Apply offset (1-indexed)
      const startLine = params.offset ? Math.max(0, params.offset - 1) : 0;
      const startLineDisplay = startLine + 1;

      if (startLine >= allLines.length) {
        throw new Error(
          `Offset ${params.offset} is beyond end of file (${allLines.length} lines total)`,
        );
      }

      // Apply user limit
      let selectedContent: string;
      let userLimitedLines: number | undefined;
      if (params.limit !== undefined) {
        const endLine = Math.min(startLine + params.limit, allLines.length);
        selectedContent = allLines.slice(startLine, endLine).join('\n');
        userLimitedLines = endLine - startLine;
      } else {
        selectedContent = allLines.slice(startLine).join('\n');
      }

      // Line-aware head truncation (matches Pi SDK)
      const truncation = truncateHead(selectedContent);
      let outputText: string;

      if (truncation.firstLineExceedsLimit) {
        const firstLineSize = formatSize(
          Buffer.byteLength(allLines[startLine], 'utf-8'),
        );
        outputText =
          `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ` +
          `${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n ` +
          `'${startLineDisplay}p' ${params.path} | head -c ${DEFAULT_MAX_BYTES}]`;
      } else if (truncation.truncated) {
        const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
        const nextOffset = endLineDisplay + 1;
        outputText = truncation.content;

        if (truncation.truncatedBy === 'lines') {
          outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
        } else {
          outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
        }
      } else if (
        userLimitedLines !== undefined &&
        startLine + userLimitedLines < allLines.length
      ) {
        const remaining = allLines.length - (startLine + userLimitedLines);
        const nextOffset = startLine + userLimitedLines + 1;
        outputText = truncation.content;
        outputText += `\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
      } else {
        outputText = truncation.content;
      }

      return {
        content: [{ type: 'text', text: outputText }],
        details: { path: absPath, ...(truncation.truncated ? { truncation } : {}) },
      };
    },
  };
}

// ── Write ───────────────────────────────────────────────────

export function createWrite(runtime: RuntimeBackend, containerCwd?: string): ToolDefinition {
  const basedir = containerCwd ?? WORKSPACE_DIR;
  return {
    name: 'write',
    label: 'write',
    description:
      "Write content to a file. Creates the file if it doesn't exist, " +
      'overwrites if it does. Automatically creates parent directories.',
    parameters: WriteParams,
    execute: async (_toolCallId, params: Static<typeof WriteParams>, signal?) => {
      if (signal?.aborted) throw new Error('Operation aborted');

      const absPath = resolveContainerPath(params.path, basedir);
      const guardedPath = isProtectedMemoryPath(absPath)
        ? absPath
        : await resolveContainerPathForGuard(runtime, absPath, basedir);
      if (isProtectedMemoryPath(guardedPath)) {
        throw new Error(getProtectedMemoryAccessError('write'));
      }
      await runtime.writeFile({ path: absPath, content: params.content });
      return {
        content: [
          {
            type: 'text',
            text: `Successfully wrote ${params.content.length} bytes to ${params.path}`,
          },
        ],
        details: { path: absPath },
      };
    },
  };
}

// ── Edit ────────────────────────────────────────────────────

export function createEdit(runtime: RuntimeBackend, containerCwd?: string): ToolDefinition {
  const basedir = containerCwd ?? WORKSPACE_DIR;
  return {
    name: 'edit',
    label: 'edit',
    description:
      'Edit a file by replacing exact text. The oldText must match exactly ' +
      '(including whitespace). Use this for precise, surgical edits.',
    parameters: EditParams,
    execute: async (_toolCallId, params: Static<typeof EditParams>, signal?) => {
      if (signal?.aborted) throw new Error('Operation aborted');

      const absPath = resolveContainerPath(params.path, basedir);
      const guardedPath = isProtectedMemoryPath(absPath)
        ? absPath
        : await resolveContainerPathForGuard(runtime, absPath, basedir);
      if (isProtectedMemoryPath(guardedPath)) {
        throw new Error(getProtectedMemoryAccessError('edit'));
      }
      const escaped = shellEscape(absPath);

      // Read current file content
      const readResult = await runtime.exec({ command: `cat '${escaped}'` });
      if (readResult.exitCode !== 0) {
        throw new Error(`File not found: ${params.path}`);
      }

      const rawContent = readResult.stdout;

      // Strip BOM before matching (LLMs never include invisible BOM)
      const { bom, text: content } = stripBom(rawContent);

      // Normalise line endings for matching
      const originalEnding = detectLineEnding(content);
      const normalizedContent = normalizeToLF(content);
      const normalizedOldText = normalizeToLF(params.oldText);
      const normalizedNewText = normalizeToLF(params.newText);

      // Fuzzy find (exact first, then trailing-ws / smart-quote tolerant)
      const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);

      if (!matchResult.found) {
        throw new Error(
          `Could not find the exact text in ${params.path}. ` +
            'The old text must match exactly including all whitespace and newlines.',
        );
      }

      // Reject ambiguous edits (multiple matches)
      const occurrences = countFuzzyOccurrences(normalizedContent, normalizedOldText);
      if (occurrences > 1) {
        throw new Error(
          `Found ${occurrences} occurrences of the text in ${params.path}. ` +
            'The text must be unique. Please provide more context to make it unique.',
        );
      }

      // Perform replacement
      const baseContent = matchResult.contentForReplacement;
      const newContent =
        baseContent.substring(0, matchResult.index) +
        normalizedNewText +
        baseContent.substring(matchResult.index + matchResult.matchLength);

      // Reject no-op edits
      if (baseContent === newContent) {
        throw new Error(
          `No changes made to ${params.path}. The replacement produced identical content.`,
        );
      }

      // Restore original line endings + BOM, then write
      const finalContent = bom + restoreLineEndings(newContent, originalEnding);
      await runtime.writeFile({ path: absPath, content: finalContent });

      // Generate unified diff for the response
      const diffResult = generateDiffString(baseContent, newContent);

      return {
        content: [
          { type: 'text', text: `Successfully replaced text in ${params.path}.` },
        ],
        details: {
          path: absPath,
          diff: diffResult.diff,
          firstChangedLine: diffResult.firstChangedLine,
        },
      };
    },
  };
}
