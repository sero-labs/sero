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

import path from 'node:path';

import type { Static } from 'typebox';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { RuntimeBackend, RuntimeFileReadResult } from '@electron/features/workspace/runtime/types';
import {
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
} from '../filesystem/truncate';
import { canonicalizeHostPath } from '../filesystem/host-path';
import { toRuntimeIdentityMountPath } from '@electron/features/workspace/runtime/runtime-paths';
import { OutputCapture } from '@electron/features/tool-capture/capture';
import { renderCaptureReport } from '@electron/features/tool-capture/report';
import { recordToolResult } from '@electron/features/tool-capture/tool-results';
import { createEditTool, createWriteTool, type FileMutationPort } from './edit-core';
import {
  WORKSPACE_DIR,
  resolveContainerPath,
  shellEscape,
  detectMimeFromMagicHex,
  BashParams,
  ReadParams,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export function createBash(runtime: RuntimeBackend, containerCwd?: string, sessionId?: string): ToolDefinition {
  const cwd = containerCwd ?? WORKSPACE_DIR;
  return {
    name: 'bash',
    label: 'bash',
    promptSnippet: 'Run a bash command in the workspace and return its output',
    promptGuidelines: [
      'Use bash for project commands and shell or system operations. When run_code is available, use it instead of bash, Python, or jq to read and aggregate structured workspace data.',
    ],
    description:
      `Execute a bash command in the current working directory. ` +
      `Returns stdout and stderr. Output is truncated to last ` +
      `${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB ` +
      `(whichever is hit first). Optionally provide a timeout in seconds. ` +
      `Use bash for project commands and shell or system operations. When run_code is available, do not use bash, Python, or jq to read and aggregate structured workspace data; use run_code instead. ` +
      `Do not hard-code PATH prefixes; inspect package.json and prefer project scripts over ad-hoc npx commands.`,
    parameters: BashParams,
    execute: async (toolCallId, params: Static<typeof BashParams>, signal?) => {
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
      const capture = new OutputCapture({
        producerSessionId: sessionId ?? 'unknown-session',
        toRuntimePath: (hostPath) => (
          runtime.backend === 'host' ? hostPath : toRuntimeIdentityMountPath(hostPath)
        ),
      });
      const result = await runtime.exec({
        command: params.command,
        cwd,
        timeoutMs,
        env: sessionId ? { SERO_SESSION_ID: sessionId } : undefined,
        outputSink: {
          write: (stream, chunk) => capture.write(stream, chunk),
          close: () => {},
        },
      });
      const record = await capture.finish();

      // The bounded tail, not the file, is the source of the model payload.
      const truncation = capture.renderPayload();
      let outputText = truncation.content || '(no output)';

      if (timeoutMs !== undefined && result.exitCode === 124) {
        outputText += `\n\nCommand timed out after ${Math.round(timeoutMs / 1000)}s.`;
      }

      if (truncation.truncated) {
        const startLine = truncation.totalLines - truncation.outputLines + 1;
        const endLine = truncation.totalLines;

        if (truncation.lastLinePartial) {
          const lastLineSize = formatSize(
            Buffer.byteLength(truncation.content.split('\n').pop() || '', 'utf-8'),
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

      const report = renderCaptureReport(record);
      const details = {
        exitCode: result.exitCode,
        ...(truncation.truncated ? { truncation } : {}),
        ...(record ? { capture: record } : {}),
        blocks: report ? { payload: 0, report: 1 } : { payload: 0 },
      };
      const content = report
        ? [{ type: 'text' as const, text: outputText }, { type: 'text' as const, text: report }]
        : [{ type: 'text' as const, text: outputText }];

      // Non-zero exit rejects so the agent loop reports isError. The recorded
      // presentation lets a `tool_result` hook restore the same content blocks
      // and typed metadata, which the rejection path would otherwise drop.
      if (result.exitCode !== 0) {
        recordToolResult(toolCallId, { content, details });
        capture.release();
        const error = new Error([outputText, report].filter(Boolean).join('\n\n'));
        (error as Error & { details?: unknown }).details = details;
        throw error;
      }

      // The reference that keeps this capture alive is inside the result built
      // above, which the agent persists after this handler returns. The
      // retention grace window covers that last step.
      capture.release();
      return { content, details };
    },
  };
}

// ── Read ────────────────────────────────────────────────────

export function createRead(runtime: RuntimeBackend, containerCwd?: string): ToolDefinition {
  const basedir = containerCwd ?? WORKSPACE_DIR;
  return {
    name: 'read',
    label: 'read',
    promptSnippet: 'Read a text or image file, with offset and limit for large files',
    promptGuidelines: [
      'Use read to examine files before editing. Use offset and limit for large files, and continue with offset until the read is complete.',
    ],
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

      // ── Image detection by magic bytes ──────────────────
      // Read through the runtime file primitive so Host mode can translate
      // /workspace paths correctly instead of embedding them in shell commands.
      let binaryResult: RuntimeFileReadResult;
      try {
        binaryResult = await runtime.readFile({ path: absPath, binary: true });
      } catch (error) {
        throw new Error(`Error reading ${params.path}: ${errorMessage(error)}`);
      }
      const fileBytes = Buffer.from(binaryResult.content, 'base64');
      const mimeType = detectMimeFromMagicHex(fileBytes.subarray(0, 12).toString('hex'));

      if (mimeType) {
        // Final sanity check — decoded size should be > 8 bytes for a real image
        if (fileBytes.length < 8) {
          throw new Error(
            `File ${params.path} has image magic bytes but is only ${fileBytes.length} bytes — likely corrupt.`,
          );
        }

        const base64 = binaryResult.content.replace(/[\r\n]/g, '');
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
      let textContent: string;
      try {
        const readResult = await runtime.readFile({ path: absPath });
        textContent = readResult.content;
      } catch (error) {
        throw new Error(`Error reading ${params.path}: ${errorMessage(error)}`);
      }
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

/**
 * Serialization key for a container target.
 *
 * A path under the runtime workspace maps to the host file identity, so host
 * tools and container tools that reach the same backing file share one queue.
 * Other paths stay container-scoped, so separate containers do not collide at
 * an identical absolute path.
 */
export async function containerMutationKey(runtime: RuntimeBackend, canonicalPath: string): Promise<string> {
  const base = runtime.runtimeWorkspacePath;
  const inWorkspace = base
    && (canonicalPath === base || canonicalPath.startsWith(`${base}/`));
  if (inWorkspace) {
    const relative = canonicalPath === base ? '' : canonicalPath.slice(base.length + 1);
    const hostPath = relative
      ? path.join(runtime.hostWorkspacePath, ...relative.split('/'))
      : runtime.hostWorkspacePath;
    // The container path maps onto the host mount, so resolve the host path
    // through host realpath and share the host file identity.
    return `host:${await canonicalizeHostPath(hostPath)}`;
  }
  return `container:${runtime.backend}:${runtime.workspaceId}:${canonicalPath}`;
}

function resolveContainerTarget(runtime: RuntimeBackend, targetPath: string, basedir: string): Promise<string> {
  return isProtectedMemoryPath(targetPath)
    ? Promise.resolve(normalizeContainerGuardPath(targetPath))
    : resolveContainerPathForGuard(runtime, targetPath, basedir);
}

export function createContainerMutationPort(runtime: RuntimeBackend, containerCwd?: string): FileMutationPort {
  const basedir = containerCwd ?? WORKSPACE_DIR;
  return {
    resolveTarget: async (absolutePath) => {
      const canonicalPath = await resolveContainerTarget(runtime, absolutePath, basedir);
      return { key: await containerMutationKey(runtime, canonicalPath), canonicalPath };
    },
    readFile: async (absolutePath) => {
      const result = await runtime.readFile({ path: absolutePath });
      return result.content;
    },
    writeFile: (absolutePath, content) => runtime.writeFile({ path: absolutePath, content }),
  };
}

export function createWrite(runtime: RuntimeBackend, containerCwd?: string): ToolDefinition {
  const basedir = containerCwd ?? WORKSPACE_DIR;
  return createWriteTool({
    port: createContainerMutationPort(runtime, containerCwd),
    resolvePath: (requestedPath) => resolveContainerPath(requestedPath, basedir),
    assertAllowed: (target) => {
      if (isProtectedMemoryPath(target.canonicalPath)) {
        throw new Error(getProtectedMemoryAccessError('write'));
      }
    },
  });
}

// ── Edit ────────────────────────────────────────────────────

export function createEdit(runtime: RuntimeBackend, containerCwd?: string): ToolDefinition {
  const basedir = containerCwd ?? WORKSPACE_DIR;
  return createEditTool({
    port: createContainerMutationPort(runtime, containerCwd),
    resolvePath: (requestedPath) => resolveContainerPath(requestedPath, basedir),
    assertAllowed: (target) => {
      if (isProtectedMemoryPath(target.canonicalPath)) {
        throw new Error(getProtectedMemoryAccessError('edit'));
      }
    },
  });
}
