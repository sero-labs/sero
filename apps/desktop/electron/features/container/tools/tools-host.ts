import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Static } from 'typebox';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import {
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateTail,
} from '../filesystem/truncate';
import { createEditTool, createWriteTool, type FileMutationPort } from './edit-core';
import {
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

interface HostCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function resolveHostPath(filePath: string, basedir: string): string {
  return path.resolve(path.isAbsolute(filePath) ? filePath : path.join(basedir, filePath));
}

function readFileErrorMessage(filePath: string, err: unknown): string {
  return err instanceof Error ? err.message : `Could not access ${filePath}`;
}

import { canonicalizeHostPath } from '../filesystem/host-path';

const SAFE_HOST_TOOL_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'TERM',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
]);

function createSafeHostToolEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (SAFE_HOST_TOOL_ENV_KEYS.has(key) || key.startsWith('LC_')) env[key] = value;
  }
  return env;
}

async function runHostCommand(
  command: string,
  cwd: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<HostCommandResult> {
  if (signal?.aborted) throw new Error('Command aborted');

  return await new Promise<HostCommandResult>((resolve, reject) => {
    const child = spawn('/bin/bash', ['-lc', command], {
      cwd,
      env: createSafeHostToolEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finishResolve = (result: HostCommandResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      resolve(result);
    };

    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      reject(error);
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      finishReject(error instanceof Error ? error : new Error(String(error)));
    });

    child.on('close', (code) => {
      finishResolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    const abortHandler = () => {
      child.kill('SIGTERM');
      finishReject(new Error('Command aborted'));
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    if (timeoutMs) {
      timeout = setTimeout(() => {
        child.kill('SIGTERM');
        finishReject(new Error(`Command timed out after ${Math.ceil(timeoutMs / 1000)}s`));
      }, timeoutMs);
    }
  });
}

export function createHostCodingTools(basedir: string): ToolDefinition[] {
  return [
    createHostBash(basedir),
    createHostRead(basedir),
    createHostWrite(basedir),
    createHostEdit(basedir),
  ];
}

function createHostBash(basedir: string): ToolDefinition {
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
    execute: async (_toolCallId, params: Static<typeof BashParams>, signal?) => {
      if (signal?.aborted) throw new Error('Command aborted');
      if (
        commandTouchesProtectedMemory(params.command)
        || await commandTouchesProtectedMemoryWithResolver({
          command: params.command,
          basedir,
          resolvePath: canonicalizeHostPath,
        })
      ) {
        throw new Error(getProtectedMemoryAccessError('bash'));
      }

      const timeoutMs = params.timeout ? params.timeout * 1000 : undefined;
      const result = await runHostCommand(params.command, basedir, timeoutMs, signal);
      const combined = (
        result.stdout + (result.stderr ? '\n' + result.stderr : '')
      ).trim();

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

      if (result.exitCode !== 0) {
        outputText += `\n\nCommand exited with code ${result.exitCode}`;
        throw new Error(outputText);
      }

      return {
        content: [{ type: 'text', text: outputText }],
        details: { exitCode: result.exitCode, ...(truncation.truncated ? { truncation } : {}) },
      };
    },
  };
}

function createHostRead(basedir: string): ToolDefinition {
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

      const absPath = resolveHostPath(params.path, basedir);
      const guardedPath = isProtectedMemoryPath(absPath)
        ? absPath
        : await canonicalizeHostPath(absPath);
      if (isProtectedMemoryPath(guardedPath)) {
        throw new Error(getProtectedMemoryAccessError('read'));
      }

      let fileBuffer: Buffer;
      try {
        fileBuffer = await fs.readFile(absPath);
      } catch (err) {
        throw new Error(`Error reading ${params.path}: ${readFileErrorMessage(params.path, err)}`);
      }

      const magicHex = fileBuffer.subarray(0, 12).toString('hex').toLowerCase();
      const mimeType = detectMimeFromMagicHex(magicHex);
      if (mimeType) {
        const base64 = fileBuffer.toString('base64');
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

      const textContent = fileBuffer.toString('utf8');
      const allLines = textContent.split('\n');
      const totalFileLines = allLines.length;
      const startLine = params.offset ? Math.max(0, params.offset - 1) : 0;
      const startLineDisplay = startLine + 1;

      if (startLine >= allLines.length) {
        throw new Error(
          `Offset ${params.offset} is beyond end of file (${allLines.length} lines total)`,
        );
      }

      let selectedContent: string;
      let userLimitedLines: number | undefined;
      if (params.limit !== undefined) {
        const endLine = Math.min(startLine + params.limit, allLines.length);
        selectedContent = allLines.slice(startLine, endLine).join('\n');
        userLimitedLines = endLine - startLine;
      } else {
        selectedContent = allLines.slice(startLine).join('\n');
      }

      const truncation = truncateHead(selectedContent);
      let outputText: string;

      if (truncation.firstLineExceedsLimit) {
        const firstLineSize = formatSize(
          Buffer.byteLength(allLines[startLine] || '', 'utf-8'),
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
        userLimitedLines !== undefined
        && startLine + userLimitedLines < allLines.length
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

/**
 * Serialization key for a host target. Host sessions, factories, and the host
 * side of a live-mounted container share one filesystem namespace and one key.
 */
function createHostMutationPort(): FileMutationPort {
  return {
    resolveTarget: async (absolutePath) => {
      const canonicalPath = await canonicalizeHostPath(absolutePath);
      return { key: `host:${canonicalPath}`, canonicalPath };
    },
    readFile: (absolutePath) => fs.readFile(absolutePath, 'utf8'),
    writeFile: async (absolutePath, content) => {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, 'utf8');
    },
  };
}

function createHostWrite(basedir: string): ToolDefinition {
  return createWriteTool({
    port: createHostMutationPort(),
    resolvePath: (requestedPath) => resolveHostPath(requestedPath, basedir),
    assertAllowed: (target) => {
      if (isProtectedMemoryPath(target.canonicalPath)) {
        throw new Error(getProtectedMemoryAccessError('write'));
      }
    },
  });
}

function createHostEdit(basedir: string): ToolDefinition {
  return createEditTool({
    port: createHostMutationPort(),
    resolvePath: (requestedPath) => resolveHostPath(requestedPath, basedir),
    assertAllowed: (target) => {
      if (isProtectedMemoryPath(target.canonicalPath)) {
        throw new Error(getProtectedMemoryAccessError('edit'));
      }
    },
  });
}
