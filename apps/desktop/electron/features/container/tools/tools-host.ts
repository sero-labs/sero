import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { Static } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

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
  detectMimeFromMagicHex,
  BashParams,
  ReadParams,
  WriteParams,
  EditParams,
} from './tool-schemas';
import {
  commandTouchesProtectedMemory,
  getProtectedMemoryAccessError,
  isProtectedMemoryPath,
} from './memory-file-guard';

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
      env: process.env,
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
    description:
      `Execute a bash command in the current working directory. ` +
      `Returns stdout and stderr. Output is truncated to last ` +
      `${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB ` +
      `(whichever is hit first). Optionally provide a timeout in seconds.`,
    parameters: BashParams,
    execute: async (_toolCallId, params: Static<typeof BashParams>, signal?) => {
      if (signal?.aborted) throw new Error('Command aborted');
      if (commandTouchesProtectedMemory(params.command)) {
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
      if (isProtectedMemoryPath(absPath)) {
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

        return {
          content: [
            { type: 'text', text: `Read image file [${mimeType}]` },
            { type: 'image', data: base64, mimeType },
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

function createHostWrite(basedir: string): ToolDefinition {
  return {
    name: 'write',
    label: 'write',
    description:
      "Write content to a file. Creates the file if it doesn't exist, " +
      'overwrites if it does. Automatically creates parent directories.',
    parameters: WriteParams,
    execute: async (_toolCallId, params: Static<typeof WriteParams>, signal?) => {
      if (signal?.aborted) throw new Error('Operation aborted');

      const absPath = resolveHostPath(params.path, basedir);
      if (isProtectedMemoryPath(absPath)) {
        throw new Error(getProtectedMemoryAccessError('write'));
      }

      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, params.content, 'utf8');
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

function createHostEdit(basedir: string): ToolDefinition {
  return {
    name: 'edit',
    label: 'edit',
    description:
      'Edit a file by replacing exact text. The oldText must match exactly ' +
      '(including whitespace). Use this for precise, surgical edits.',
    parameters: EditParams,
    execute: async (_toolCallId, params: Static<typeof EditParams>, signal?) => {
      if (signal?.aborted) throw new Error('Operation aborted');

      const absPath = resolveHostPath(params.path, basedir);
      if (isProtectedMemoryPath(absPath)) {
        throw new Error(getProtectedMemoryAccessError('edit'));
      }

      let rawContent: string;
      try {
        rawContent = await fs.readFile(absPath, 'utf8');
      } catch {
        throw new Error(`File not found: ${params.path}`);
      }

      const { bom, text: content } = stripBom(rawContent);
      const originalEnding = detectLineEnding(content);
      const normalizedContent = normalizeToLF(content);
      const normalizedOldText = normalizeToLF(params.oldText);
      const normalizedNewText = normalizeToLF(params.newText);

      const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);
      if (!matchResult.found) {
        throw new Error(
          `Could not find the exact text in ${params.path}. ` +
            'The old text must match exactly including all whitespace and newlines.',
        );
      }

      const occurrences = countFuzzyOccurrences(normalizedContent, normalizedOldText);
      if (occurrences > 1) {
        throw new Error(
          `Found ${occurrences} occurrences of the text in ${params.path}. ` +
            'The text must be unique. Please provide more context to make it unique.',
        );
      }

      const baseContent = matchResult.contentForReplacement;
      const newContent =
        baseContent.substring(0, matchResult.index) +
        normalizedNewText +
        baseContent.substring(matchResult.index + matchResult.matchLength);

      if (baseContent === newContent) {
        throw new Error(
          `No changes made to ${params.path}. The replacement produced identical content.`,
        );
      }

      const finalContent = bom + restoreLineEndings(newContent, originalEnding);
      await fs.writeFile(absPath, finalContent, 'utf8');
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
