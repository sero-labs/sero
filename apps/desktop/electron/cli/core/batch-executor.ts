import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type {
  CliCommandContext,
  CliCommandUpdate,
  CliContentBlock,
  CliResult,
} from './types';
import type { CliRegistry } from './registry';
import { tokenizeCliInput, splitCommandLines } from './parser';
import { getCliSessionBridge } from '../bridges/session-bridge';
import { tryParseImageJson, summarizeImageJson } from '@electron/ipc/agent/core/tool-result-images';
import { prepareToolImage } from '@electron/shared/media/image-resize';
import {
  resolveCommandTimeoutMs,
  buildBatchDeadline,
} from './timeouts';

const MAX_OUTPUT_BYTES = 50 * 1024;
const MAX_OUTPUT_LINES = 2000;
const TURN_COMMAND_LIMIT = 50;

export class CommandTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandTimeoutError';
  }
}

export interface CliBatchResult {
  output: string;
  exitCode: number;
  content?: CliContentBlock[];
  details?: unknown;
  richOutputFallback?: boolean;
}

interface CommandExecutionControl {
  signal: AbortSignal;
  onUpdate?: (update: Parameters<NonNullable<Parameters<CliRegistry['executeResolved']>[3]>>[0]) => void;
  markCompleted: () => void;
}

function truncateOutput(text: string): string {
  const lines = text.split('\n');
  let outLines = lines;
  let truncated = false;

  if (lines.length > MAX_OUTPUT_LINES) {
    outLines = lines.slice(0, MAX_OUTPUT_LINES);
    truncated = true;
  }

  let out = outLines.join('\n');
  while (Buffer.byteLength(out, 'utf8') > MAX_OUTPUT_BYTES && outLines.length > 1) {
    outLines = outLines.slice(0, -1);
    out = outLines.join('\n');
    truncated = true;
  }

  if (!truncated) return out;
  return `${out}\n\n[output truncated to 50KB / 2000 lines]`;
}

function timeoutForCommand(
  batchDeadline: number | null,
  commandTimeoutMs?: number,
): number | null {
  const timeoutMs = resolveCommandTimeoutMs(batchDeadline, commandTimeoutMs);
  if (timeoutMs === null) return null;
  if (timeoutMs <= 0) throw new CommandTimeoutError('Batch timeout exceeded');
  return timeoutMs;
}

function createCommandExecutionControl(
  signal: AbortSignal | undefined,
  onUpdate: Parameters<CliRegistry['executeResolved']>[3] | undefined,
): CommandExecutionControl {
  const timeoutController = new AbortController();
  const completionController = new AbortController();
  const forwardSignal = AbortSignal.any(
    [timeoutController.signal, completionController.signal, signal].filter(
      (value): value is AbortSignal => Boolean(value),
    ),
  );

  return {
    signal: forwardSignal,
    onUpdate: onUpdate
      ? (update) => {
          if (forwardSignal.aborted) return;
          onUpdate(update);
        }
      : undefined,
    markCompleted: () => {
      if (!completionController.signal.aborted) {
        completionController.abort();
      }
    },
  };
}

async function runWithTimeout<T>(
  fn: (control: CommandExecutionControl) => Promise<T>,
  timeoutMs: number | null,
  signal?: AbortSignal,
  onUpdate?: Parameters<CliRegistry['executeResolved']>[3],
): Promise<T> {
  if (signal?.aborted) throw new Error('Operation aborted');

  const control = createCommandExecutionControl(signal, onUpdate);
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;

  try {
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (cb: () => void) => {
        if (settled) return;
        settled = true;
        control.markCompleted();
        cb();
      };

      if (timeoutMs) {
        timeout = setTimeout(() => {
          finish(() => reject(new CommandTimeoutError(`Command timed out after ${Math.ceil(timeoutMs / 1000)}s`)));
        }, timeoutMs);
      }

      if (signal) {
        abortListener = () => finish(() => reject(new Error('Operation aborted')));
        signal.addEventListener('abort', abortListener, { once: true });
      }

      fn(control).then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  } finally {
    control.markCompleted();
    if (timeout) clearTimeout(timeout);
    if (signal && abortListener) signal.removeEventListener('abort', abortListener);
  }
}

function normalizeCliResult(result: CliResult): CliResult {
  return {
    output: typeof result.output === 'string' ? result.output : String(result.output ?? ''),
    exitCode: result.exitCode ?? 0,
    content: Array.isArray(result.content) ? result.content : undefined,
    details: result.details,
  };
}

function isHelpCommand(name: string): boolean {
  return name === 'help';
}

function formatBatchEntry(line: string, output: string): string {
  if (!output.trim()) return `$ sero ${line}`;
  return `$ sero ${line}\n${output}`;
}

function contentFromLegacyImageJson(output: string): CliContentBlock[] | null {
  const parsed = tryParseImageJson(output);
  if (!parsed) return null;

  const image = prepareToolImage(parsed.data, parsed.mimeType, parsed.description);
  const content: CliContentBlock[] = [];
  if (image.text) {
    content.push({ type: 'text', text: image.text });
  }
  content.push({ type: 'image', data: image.data, mimeType: image.mimeType });
  return content;
}

function summarizeLegacyImageOutput(output: string): string {
  return summarizeImageJson(output) ?? output;
}

function withBatchUpdateContext(
  onUpdate: Parameters<CliRegistry['executeResolved']>[3] | undefined,
  line: string,
  commandIndex: number,
  commandCount: number,
): Parameters<CliRegistry['executeResolved']>[3] | undefined {
  if (!onUpdate) return undefined;
  if (commandCount <= 1) return onUpdate;

  return (update) => {
    const baseDetails = update.details && typeof update.details === 'object'
      ? update.details as Record<string, unknown>
      : {};

    onUpdate({
      ...update,
      details: {
        ...baseDetails,
        commandLine: line,
        commandIndex,
        commandCount,
      },
    });
  };
}

export async function executeCliBatch(
  registry: CliRegistry,
  commandText: string,
  context: CliCommandContext,
  batchTimeoutSec?: number,
  onUpdate?: Parameters<CliRegistry['executeResolved']>[3],
): Promise<CliBatchResult> {
  const lines = splitCommandLines(commandText);
  if (lines.length === 0) {
    return { output: 'ERROR: No command provided', exitCode: 1 };
  }

  const single = lines.length === 1;
  const batchDeadline = buildBatchDeadline(
    context.invocation.source,
    batchTimeoutSec,
    single,
  );

  const sections: string[] = [];
  let finalExitCode = 0;
  let richOutputFallback = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let result: CliResult;
    let timedOut = false;

    try {
      const tokens = tokenizeCliInput(line);
      const resolved = registry.resolveTokens(tokens, {
        workspaceId: context.workspaceId,
        sessionId: context.invocation.sessionId,
      });

      const turnId = context.invocation.turnId;
      if (
        context.invocation.source !== 'terminal' &&
        turnId &&
        !isHelpCommand(resolved.command.name)
      ) {
        const budget = getCliSessionBridge().consumeTurnBudget(context.workspaceId, turnId);
        if (!budget.allowed) {
          result = {
            output: `ERROR: Rate limit: ${TURN_COMMAND_LIMIT} CLI commands per turn exceeded. Wait for the next turn.`,
            exitCode: 1,
          };
          finalExitCode = 1;
          if (single) {
            return { output: truncateOutput(result.output), exitCode: 1 };
          }
          sections.push(formatBatchEntry(line, result.output));
          sections.push(`[command ${i + 1}/${lines.length} failed with exit code 1 — remaining commands skipped]`);
          break;
        }
      }

      const perCommandTimeout = context.invocation.source === 'terminal' || resolved.command.interactive
        ? null
        : timeoutForCommand(batchDeadline, resolved.command.timeoutMs);
      const commandOnUpdate = withBatchUpdateContext(onUpdate, line, i + 1, lines.length);
      result = normalizeCliResult(
        await runWithTimeout(
          (control) => resolved.command.execute(
            resolved.args,
            {
              ...context,
              invocation: {
                ...context.invocation,
                signal: control.signal,
              },
            },
            control.onUpdate,
          ),
          perCommandTimeout,
          context.invocation.signal,
          commandOnUpdate,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CLI command failed';
      timedOut = error instanceof CommandTimeoutError;
      result = {
        output: `ERROR: ${message}`,
        exitCode: 1,
      };
    }

    finalExitCode = result.exitCode ?? 0;
    const hasLegacyInlineImage = !!contentFromLegacyImageJson(result.output);
    if (!single && (
      (Array.isArray(result.content) && result.content.some((block) => block.type !== 'text')) ||
      hasLegacyInlineImage
    )) {
      richOutputFallback = true;
    }

    if (single) {
      const output = context.invocation.source === 'terminal'
        ? result.output
        : truncateOutput(result.output);
      return {
        output,
        exitCode: finalExitCode,
        content: result.content,
        details: result.details,
      };
    }

    sections.push(formatBatchEntry(line, summarizeLegacyImageOutput(result.output)));

    if (finalExitCode !== 0) {
      const suffix = timedOut
        ? `[command ${i + 1}/${lines.length} timed out — remaining commands skipped]`
        : `[command ${i + 1}/${lines.length} failed with exit code ${finalExitCode} — remaining commands skipped]`;
      sections.push(suffix);
      break;
    }
  }

  const joined = sections.join('\n\n');
  const output = context.invocation.source === 'terminal' ? joined : truncateOutput(joined);
  return { output, exitCode: finalExitCode, richOutputFallback };
}

export function getSingleResultContent(batch: CliBatchResult): CliContentBlock[] {
  if (Array.isArray(batch.content) && batch.content.length > 0) {
    return batch.content;
  }
  const legacyImageContent = contentFromLegacyImageJson(batch.output);
  if (legacyImageContent) return legacyImageContent;
  return [{ type: 'text', text: batch.output }];
}

export function getMultiCommandFallbackContent(
  batch: CliBatchResult,
  hadRichOutput: boolean,
): CliContentBlock[] {
  const lines = [batch.output];
  if (hadRichOutput) {
    lines.push('', '[rich output omitted in multi-command batch; rerun the image-producing command alone to view images]');
  }
  return [{ type: 'text', text: lines.join('\n') }];
}
