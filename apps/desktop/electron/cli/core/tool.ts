import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { containerManager, workspaceManager } from '../../shared/infra/shared-infra';
import { tokenizeCliInput, splitCommandLines } from './parser';
import type { CliCommandContext, CliInvocation, CliResult } from './types';
import type { CliRegistry } from './registry';
import { getCliSessionBridge } from '../bridges/session-bridge';
import {
  resolveCommandTimeoutMs,
  buildBatchDeadline,
} from './timeouts';

const MAX_OUTPUT_BYTES = 50 * 1024;
const MAX_OUTPUT_LINES = 2000;
const TURN_COMMAND_LIMIT = 50;

const SeroCliToolParams = Type.Object({
  command: Type.String({
    description:
      'Sero CLI command string (e.g. "todo list"). Supports multi-line input for chaining (one command per line).',
  }),
  timeout: Type.Optional(
    Type.Number({ description: 'Batch timeout in seconds (default: 120)' }),
  ),
});

class CommandTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandTimeoutError';
  }
}

interface CliBatchResult {
  output: string;
  exitCode: number;
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

async function runWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number | null,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new Error('Operation aborted');
  if (!timeoutMs && !signal) return fn();

  let timeout: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;

  try {
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (cb: () => void) => {
        if (settled) return;
        settled = true;
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

      fn().then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    if (signal && abortListener) signal.removeEventListener('abort', abortListener);
  }
}

function normalizeCliResult(result: CliResult): CliResult {
  return {
    output: typeof result.output === 'string' ? result.output : String(result.output ?? ''),
    exitCode: result.exitCode ?? 0,
  };
}

function isHelpCommand(name: string): boolean {
  return name === 'help';
}

function formatBatchEntry(line: string, output: string): string {
  if (!output.trim()) return `$ sero ${line}`;
  return `$ sero ${line}\n${output}`;
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let result: CliResult;
    let timedOut = false;

    try {
      const tokens = tokenizeCliInput(line);
      const resolved = registry.resolveTokens(tokens);

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

      const perCommandTimeout = context.invocation.source === 'terminal'
        ? null
        : timeoutForCommand(batchDeadline, resolved.command.timeoutMs);
      const commandOnUpdate = withBatchUpdateContext(onUpdate, line, i + 1, lines.length);
      result = normalizeCliResult(
        await runWithTimeout(
          () => resolved.command.execute(resolved.args, context, commandOnUpdate),
          perCommandTimeout,
          context.invocation.signal,
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

    if (single) {
      const output = context.invocation.source === 'terminal'
        ? result.output
        : truncateOutput(result.output);
      return { output, exitCode: finalExitCode };
    }

    sections.push(formatBatchEntry(line, result.output));

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
  return { output, exitCode: finalExitCode };
}

function buildInvocation(
  workspaceId: string,
  sessionId: string,
  signal?: AbortSignal,
): CliInvocation {
  const bridge = getCliSessionBridge();
  return {
    workspaceId,
    sessionId,
    turnId: bridge.getActiveTurnId(sessionId),
    source: 'tool',
    signal,
  };
}

export function createSeroCliTool(
  registry: CliRegistry,
  workspaceId: string,
  sessionId: string,
): ToolDefinition {
  return {
    name: 'sero-cli',
    label: 'Sero CLI',
    description:
      'Execute Sero platform commands. Run `sero help` for commands. Supports multi-line input to chain commands (one per line).',
    parameters: SeroCliToolParams,
    async execute(_toolCallId, params, signal, onUpdate, toolCtx) {
      const cliParams = params as { command: string; timeout?: number };
      const wsPath = workspaceManager.getPath(workspaceId);
      if (!wsPath) {
        return { content: [{ type: 'text', text: `ERROR: Workspace not found: ${workspaceId}` }], details: { exitCode: 1 } };
      }

      const context: CliCommandContext = {
        workspaceId,
        cwd: toolCtx?.cwd ?? wsPath,
        invocation: buildInvocation(workspaceId, sessionId, signal),
        workspaceManager,
        containerManager,
      };

      const batch = await executeCliBatch(registry, cliParams.command, context, cliParams.timeout, onUpdate as any);
      return {
        content: parseOutputContent(batch.output),
        details: { exitCode: batch.exitCode },
      };
    },
  };
}

/**
 * Parse CLI output for embedded image content.
 *
 * Commands like `sero app screenshot` return JSON with
 * `{ type: 'image', format: 'png', base64: '...' }`. Converts to
 * Pi SDK ImageContent so the agent can see screenshots.
 */
function parseOutputContent(
  output: string,
): Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> {
  try {
    const parsed = JSON.parse(output);
    if (parsed?.type === 'image' && parsed.base64) {
      const blocks: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];
      if (parsed.message) blocks.push({ type: 'text', text: parsed.message });
      if (parsed.description) blocks.push({ type: 'text', text: parsed.description });
      blocks.push({ type: 'image', data: parsed.base64, mimeType: parsed.format === 'png' ? 'image/png' : 'image/jpeg' });
      return blocks;
    }
  } catch { /* not JSON */ }
  return [{ type: 'text', text: output }];
}
