/**
 * ActivityObserver — watches agent activity and auto-logs significant
 * events to the daily log without requiring explicit user instruction.
 *
 * Hooks into:
 *   - agent_end: Analyzes the turn's tool calls and auto-logs summaries
 *     of file edits, project patterns, errors resolved, etc.
 *   - tool_call: Tracks tool usage within a turn for aggregation
 *
 * This makes memory proactive — the agent doesn't need to be told
 * to remember things; the extension observes and logs automatically.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import {
  resolveMemoryRoot,
  ensureDirectories,
  getDailyPath,
  todayStr,
  readFile,
} from './memory-manager';
import { scheduleQmdUpdate } from './qmd';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ── Types ────────────────────────────────────────────────────────

interface ToolActivity {
  name: string;
  args: Record<string, unknown>;
  timestamp: number;
}

// ── State (reset per agent turn) ─────────────────────────────────

let turnActivities: ToolActivity[] = [];
let lastAutoLogTime = 0;

// Minimum interval between auto-logs (avoid flooding daily log)
const AUTO_LOG_COOLDOWN_MS = 60_000; // 1 minute

// ── Activity classification ──────────────────────────────────────

/** Tool names that indicate significant file-system work. */
const FILE_TOOLS = new Set(['write', 'edit', 'create_file', 'create_directory']);
const READ_TOOLS = new Set(['read', 'read_file']);
const BASH_TOOL = 'bash';

/** Extract a short summary of file paths edited/created in this turn. */
function extractFileEdits(activities: ToolActivity[]): string[] {
  const paths = new Set<string>();
  for (const a of activities) {
    if (FILE_TOOLS.has(a.name)) {
      const p = (a.args.file_path ?? a.args.path ?? a.args.filepath) as string | undefined;
      if (p) paths.add(shortenPath(p));
    }
  }
  return [...paths];
}

/** Extract files that were read (for context tracking). */
function extractFilesRead(activities: ToolActivity[]): string[] {
  const paths = new Set<string>();
  for (const a of activities) {
    if (READ_TOOLS.has(a.name)) {
      const p = (a.args.file_path ?? a.args.path ?? a.args.filepath) as string | undefined;
      if (p) paths.add(shortenPath(p));
    }
  }
  return [...paths];
}

/** Extract bash commands run (for activity tracking). */
function extractBashCommands(activities: ToolActivity[]): string[] {
  const cmds: string[] = [];
  for (const a of activities) {
    if (a.name === BASH_TOOL) {
      const cmd = (a.args.command ?? a.args.cmd) as string | undefined;
      if (cmd) {
        // Truncate very long commands
        const short = cmd.length > 120 ? cmd.slice(0, 117) + '...' : cmd;
        cmds.push(short);
      }
    }
  }
  return cmds;
}

/** Shorten a file path for readability (keep last 3 segments). */
function shortenPath(p: string): string {
  const parts = p.split('/');
  if (parts.length <= 4) return p;
  return '.../' + parts.slice(-3).join('/');
}

/** Check if the turn had meaningful work worth logging. */
function isSignificantTurn(activities: ToolActivity[]): boolean {
  // At least 2 tool calls, or any file write, or bash with git/build/test
  if (activities.length < 2) return false;

  const hasFileEdit = activities.some((a) => FILE_TOOLS.has(a.name));
  if (hasFileEdit) return true;

  const hasBash = activities.some((a) => a.name === BASH_TOOL);
  if (hasBash && activities.length >= 3) return true;

  return false;
}

// ── Auto-log builder ─────────────────────────────────────────────

function buildAutoLogEntry(activities: ToolActivity[]): string | null {
  if (!isSignificantTurn(activities)) return null;

  const now = Date.now();
  if (now - lastAutoLogTime < AUTO_LOG_COOLDOWN_MS) return null;

  const parts: string[] = [];
  parts.push('### Activity (auto-logged)');

  const edits = extractFileEdits(activities);
  if (edits.length > 0) {
    parts.push(`**Files modified:** ${edits.join(', ')}`);
  }

  const reads = extractFilesRead(activities);
  // Only log reads if there are no edits (pure research turns)
  if (reads.length > 0 && edits.length === 0 && reads.length <= 8) {
    parts.push(`**Files explored:** ${reads.join(', ')}`);
  }

  const bashCmds = extractBashCommands(activities);
  // Log notable bash commands (git, build, test, install)
  const notableBash = bashCmds.filter((cmd) =>
    /\b(git |npm |pnpm |yarn |cargo |make |pytest|jest|vitest|tsc|build|deploy|docker)/i.test(cmd),
  );
  if (notableBash.length > 0) {
    parts.push(`**Commands:** ${notableBash.slice(0, 5).map((c) => `\`${c}\``).join(', ')}`);
  }

  // Tool usage summary
  const toolCounts = new Map<string, number>();
  for (const a of activities) {
    toolCounts.set(a.name, (toolCounts.get(a.name) ?? 0) + 1);
  }
  const toolSummary = [...toolCounts.entries()]
    .map(([name, count]) => `${name}(${count})`)
    .join(', ');
  parts.push(`**Tools used:** ${toolSummary}`);

  // Only log if we have more than just the header and tool summary
  if (parts.length <= 2 && edits.length === 0) return null;

  return parts.join('\n');
}

// ── Filesystem append (lightweight, no memory-manager overhead) ──

async function appendToDailyLog(entry: string): Promise<void> {
  const root = resolveMemoryRoot();
  await ensureDirectories(root);
  const filePath = getDailyPath(root, todayStr());
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const existing = await readFile(filePath);
  const separator = existing?.trim() ? '\n\n' : '';
  const timestamp = new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '');
  const stamped = `<!-- ${timestamp} -->\n${entry}`;
  await fs.writeFile(filePath, (existing ?? '') + separator + stamped, 'utf-8');
}

// ── Register hooks ───────────────────────────────────────────────

export function registerActivityObserver(pi: ExtensionAPI): void {
  // Reset turn state at the start of each agent run
  pi.on('agent_start', () => {
    turnActivities = [];
  });

  // Track tool calls within the turn (tool_call fires before execution
  // and provides event.input with the tool parameters)
  pi.on('tool_call', (event) => {
    if (!event.toolName) return;
    turnActivities.push({
      name: event.toolName,
      args: (event.input ?? {}) as Record<string, unknown>,
      timestamp: Date.now(),
    });
  });

  // At the end of each agent turn, evaluate and auto-log
  pi.on('agent_end', async () => {
    if (turnActivities.length === 0) return;

    try {
      const entry = buildAutoLogEntry(turnActivities);
      if (entry) {
        await appendToDailyLog(entry);
        lastAutoLogTime = Date.now();
        scheduleQmdUpdate();
      }
    } catch {
      // Best-effort — never fail the agent turn
    } finally {
      turnActivities = [];
    }
  });
}
