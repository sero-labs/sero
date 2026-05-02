/**
 * ActivityObserver — watches agent activity and auto-logs significant
 * events to the daily log without requiring explicit user instruction.
 *
 * Hooks into:
 *   - agent_end: Builds a compact summary of files modified and commands run
 *   - tool_call: Captures tool inputs so we can classify/log outcomes later
 *   - tool_execution_end: Records only successful work and saves failures
 *
 * Logging is compact: one line per turn listing only files modified and
 * notable commands. Only logs turns with real successful work.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import {
  resolveMemoryRoot,
  ensureDirectories,
  getDailyPath,
  todayStr,
  readFile,
} from './memory-manager';
import { nowTimestamp } from './memory-format';
import { scheduleQmdUpdate } from './qmd';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ── State (per session / extension instance) ───────────────────

interface TurnSummary {
  editedPaths: Set<string>;
  notableCommands: string[];
}

interface PendingToolCall {
  toolName: string;
  cwd: string;
  path?: string;
  notableCommand?: string;
  inputSummary: string;
}

const AUTO_LOG_COOLDOWN_MS = 60_000; // 1 minute

function freshTurn(): TurnSummary {
  return { editedPaths: new Set(), notableCommands: [] };
}

// ── Classification ─────────────────────────────────────────────

const FILE_WRITE_TOOLS = new Set(['write', 'edit', 'create_file', 'create_directory']);
const NOTABLE_CMD_RE = /\b(git |npm |pnpm |yarn |cargo |make |pytest|jest|vitest|tsc|build|deploy|docker)\b/i;

/** Keep last 3 path segments for readability. */
function shortenPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length <= 3 ? p : '.../' + parts.slice(-3).join('/');
}

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 3)}...`;
}

function singleLine(text: string, maxChars: number): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), maxChars);
}

function stringifyUnknown(value: unknown, maxChars: number): string {
  if (value == null) return '';
  if (typeof value === 'string') return truncate(value, maxChars);
  try {
    return truncate(JSON.stringify(value, null, 2), maxChars);
  } catch {
    return truncate(String(value), maxChars);
  }
}

function summarizeInput(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return '(no input captured)';

  switch (toolName) {
    case 'bash':
      return `command=${singleLine(String(input.command ?? ''), 300)}`;
    case 'write':
      return [
        `path=${String(input.path ?? '')}`,
        typeof input.content === 'string' ? `contentLength=${input.content.length}` : '',
      ].filter(Boolean).join(', ');
    case 'edit':
      return [
        `path=${String(input.path ?? '')}`,
        typeof input.oldText === 'string' ? `oldTextLength=${input.oldText.length}` : '',
        typeof input.newText === 'string' ? `newTextLength=${input.newText.length}` : '',
      ].filter(Boolean).join(', ');
    case 'read':
      return [
        `path=${String(input.path ?? '')}`,
        typeof input.offset === 'number' ? `offset=${input.offset}` : '',
        typeof input.limit === 'number' ? `limit=${input.limit}` : '',
      ].filter(Boolean).join(', ');
    default:
      return stringifyUnknown(input, 800);
  }
}

function extractResultText(result: unknown): string {
  if (typeof result === 'string') return truncate(result, 1500);

  if (result && typeof result === 'object') {
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const text = content
        .filter((item): item is { type?: string; text?: string } => typeof item === 'object' && item !== null)
        .filter((item) => item.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('\n');
      if (text.trim()) return truncate(text, 1500);
    }
  }

  return stringifyUnknown(result, 1500);
}

// ── Compact log builder ────────────────────────────────────────

function buildCompactEntry(t: TurnSummary, lastAutoLogTime: number): string | null {
  const hasEdits = t.editedPaths.size > 0;
  const hasCmds = t.notableCommands.length > 0;

  // Only log if there's something meaningful: successful file edits or notable commands
  if (!hasEdits && !hasCmds) return null;

  // Cooldown (per session instance)
  const now = Date.now();
  if (now - lastAutoLogTime < AUTO_LOG_COOLDOWN_MS) return null;

  const parts: string[] = [];

  if (hasEdits) {
    const paths = [...t.editedPaths].slice(0, 5);
    const suffix = t.editedPaths.size > 5 ? ` +${t.editedPaths.size - 5} more` : '';
    parts.push(`modified: ${paths.join(', ')}${suffix}`);
  }

  if (hasCmds) {
    const cmds = t.notableCommands.slice(0, 3).map((c) => `\`${c}\``);
    parts.push(`ran: ${cmds.join(', ')}`);
  }

  return `- ${parts.join(' | ')}`;
}

// ── Filesystem append ──────────────────────────────────────────

async function appendToDailyLog(entry: string): Promise<void> {
  const root = resolveMemoryRoot();
  await ensureDirectories(root);
  const filePath = getDailyPath(root, todayStr());
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const existing = await readFile(filePath);
  const timestamp = nowTimestamp();

  // Append under a "## Activity" heading if it doesn't exist yet
  const heading = '## Activity (auto)';
  if (existing && existing.includes(heading)) {
    await fs.writeFile(
      filePath,
      existing + `\n<!-- ${timestamp} -->\n${entry}`,
      'utf-8',
    );
  } else {
    const separator = existing?.trim() ? '\n\n' : '';
    await fs.writeFile(
      filePath,
      (existing ?? '') + separator + `${heading}\n\n<!-- ${timestamp} -->\n${entry}`,
      'utf-8',
    );
  }
}

function getErrorLogPath(root: string): string {
  return path.join(root, '.sero', 'error_log.txt');
}

async function appendToErrorLog(entry: string): Promise<void> {
  const root = resolveMemoryRoot();
  await ensureDirectories(root);
  const filePath = getErrorLogPath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const existing = await readFile(filePath);
  const separator = existing?.trim() ? '\n\n' : '';
  await fs.writeFile(filePath, (existing ?? '') + separator + entry, 'utf-8');
}

async function logToolFailure(
  pending: PendingToolCall | undefined,
  toolName: string,
  cwd: string,
  result: unknown,
): Promise<void> {
  const entry = [
    `[${nowTimestamp()}] ${pending?.toolName ?? toolName}`,
    `cwd: ${pending?.cwd ?? cwd}`,
    `input: ${pending?.inputSummary ?? '(input unavailable)'}`,
    'result:',
    extractResultText(result) || '(no output)',
    '---',
  ].join('\n');

  await appendToErrorLog(entry);
}

// ── Register hooks ─────────────────────────────────────────────

export function registerActivityObserver(pi: ExtensionAPI): void {
  let turn = freshTurn();
  let lastAutoLogTime = 0;
  const pendingCalls = new Map<string, PendingToolCall>();

  // Reset turn state at the start of each agent run
  pi.on('agent_start', () => {
    turn = freshTurn();
    pendingCalls.clear();
  });

  // Capture tool inputs so successful/failed execution can be handled later
  pi.on('tool_call', (event, ctx) => {
    const name = event.toolName;
    if (!name) return;

    const input = event.input as Record<string, unknown> | undefined;
    const rawPath = input ? (input.file_path ?? input.path) : undefined;
    const pathValue = typeof rawPath === 'string' ? rawPath : undefined;
    const command = input && typeof input.command === 'string' ? input.command : undefined;
    const notableCommand = name === 'bash' && command && NOTABLE_CMD_RE.test(command)
      ? singleLine(command, 80)
      : undefined;

    pendingCalls.set(event.toolCallId, {
      toolName: name,
      cwd: ctx.cwd,
      path: pathValue,
      notableCommand,
      inputSummary: summarizeInput(name, input),
    });
  });

  // Record only successful work in the daily log; save failures separately
  pi.on('tool_execution_end', async (event, ctx) => {
    const pending = pendingCalls.get(event.toolCallId);
    pendingCalls.delete(event.toolCallId);

    if (event.isError) {
      try {
        await logToolFailure(pending, event.toolName, ctx.cwd, event.result);
      } catch {
        // Best-effort — never fail the agent turn
      }
      return;
    }

    if (FILE_WRITE_TOOLS.has(event.toolName) && pending?.path) {
      turn.editedPaths.add(shortenPath(pending.path));
    }

    if (event.toolName === 'bash' && pending?.notableCommand) {
      if (!turn.notableCommands.includes(pending.notableCommand) && turn.notableCommands.length < 5) {
        turn.notableCommands.push(pending.notableCommand);
      }
    }
  });

  // At the end of each agent turn, evaluate and auto-log
  pi.on('agent_end', async () => {
    const snapshot = turn;
    turn = freshTurn();
    pendingCalls.clear();

    try {
      const entry = buildCompactEntry(snapshot, lastAutoLogTime);
      if (entry) {
        await appendToDailyLog(entry);
        lastAutoLogTime = Date.now();
        scheduleQmdUpdate();
      }
    } catch {
      // Best-effort — never fail the agent turn
    }
  });
}
