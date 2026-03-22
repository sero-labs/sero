/**
 * ActivityObserver — watches agent activity and auto-logs significant
 * events to the daily log without requiring explicit user instruction.
 *
 * Hooks into:
 *   - agent_end: Builds a compact one-line summary of the turn
 *   - tool_call: Tracks tool usage within a turn for aggregation
 *
 * Logging is compact: one line per turn with a map of tool→count and
 * a short list of notable paths/commands. Only logs turns with real
 * work (file edits or 3+ tool calls including bash).
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

// ── State (reset per agent turn) ─────────────────────────────────

/** Compact accumulator: tool name → count, plus notable paths/commands. */
interface TurnSummary {
  toolCounts: Map<string, number>;
  editedPaths: Set<string>;
  notableCommands: string[];
}

let turn: TurnSummary = freshTurn();
let lastAutoLogTime = 0;

const AUTO_LOG_COOLDOWN_MS = 60_000; // 1 minute

function freshTurn(): TurnSummary {
  return { toolCounts: new Map(), editedPaths: new Set(), notableCommands: [] };
}

// ── Classification ───────────────────────────────────────────────

const FILE_WRITE_TOOLS = new Set(['write', 'edit', 'create_file', 'create_directory']);
const NOTABLE_CMD_RE = /\b(git |npm |pnpm |yarn |cargo |make |pytest|jest|vitest|tsc|build|deploy|docker)/i;

/** Keep last 3 path segments for readability. */
function shortenPath(p: string): string {
  const parts = p.split('/');
  return parts.length <= 3 ? p : '.../' + parts.slice(-3).join('/');
}

// ── Compact log builder ──────────────────────────────────────────

function buildCompactEntry(t: TurnSummary): string | null {
  const totalCalls = [...t.toolCounts.values()].reduce((a, b) => a + b, 0);
  const hasEdits = t.editedPaths.size > 0;

  // Only log significant turns: file edits, or 3+ calls with bash
  if (!hasEdits && totalCalls < 3) return null;
  if (!hasEdits && !t.toolCounts.has('bash')) return null;

  // Cooldown
  const now = Date.now();
  if (now - lastAutoLogTime < AUTO_LOG_COOLDOWN_MS) return null;

  // Build compact map: edit(3), bash(2), read(5)
  const mapStr = [...t.toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}(${count})`)
    .join(', ');

  const parts: string[] = [`tools: {${mapStr}}`];

  if (hasEdits) {
    // Cap at 5 paths to keep it concise
    const paths = [...t.editedPaths].slice(0, 5);
    const suffix = t.editedPaths.size > 5 ? ` +${t.editedPaths.size - 5} more` : '';
    parts.push(`modified: ${paths.join(', ')}${suffix}`);
  }

  if (t.notableCommands.length > 0) {
    const cmds = t.notableCommands.slice(0, 3).map((c) => `\`${c}\``);
    parts.push(`cmds: ${cmds.join(', ')}`);
  }

  return `- ${parts.join(' | ')}`;
}

// ── Filesystem append ────────────────────────────────────────────

async function appendToDailyLog(entry: string): Promise<void> {
  const root = resolveMemoryRoot();
  await ensureDirectories(root);
  const filePath = getDailyPath(root, todayStr());
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const existing = await readFile(filePath);
  const timestamp = new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '');

  // Append under a "## Activity" heading if it doesn't exist yet
  const HEADING = '## Activity (auto)';
  if (existing && existing.includes(HEADING)) {
    // Append to existing activity section
    await fs.writeFile(
      filePath,
      existing + `\n<!-- ${timestamp} -->\n${entry}`,
      'utf-8',
    );
  } else {
    // Create new activity section
    const separator = existing?.trim() ? '\n\n' : '';
    await fs.writeFile(
      filePath,
      (existing ?? '') + separator + `${HEADING}\n\n<!-- ${timestamp} -->\n${entry}`,
      'utf-8',
    );
  }
}

// ── Register hooks ───────────────────────────────────────────────

export function registerActivityObserver(pi: ExtensionAPI): void {
  // Reset turn state at the start of each agent run
  pi.on('agent_start', () => {
    turn = freshTurn();
  });

  // Track tool calls (tool_call fires before execution with event.input)
  pi.on('tool_call', (event) => {
    const name = event.toolName;
    if (!name) return;

    turn.toolCounts.set(name, (turn.toolCounts.get(name) ?? 0) + 1);

    // Cast input to a loose record for property access
    const input = event.input as Record<string, unknown> | undefined;

    // Track file paths for write/edit tools
    if (FILE_WRITE_TOOLS.has(name) && input) {
      const p = (input.file_path ?? input.path) as string | undefined;
      if (p) turn.editedPaths.add(shortenPath(p));
    }

    // Track notable bash commands (git, build, test, etc.)
    if (name === 'bash' && input) {
      const cmd = input.command as string | undefined;
      if (cmd && NOTABLE_CMD_RE.test(cmd)) {
        const short = cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd;
        if (turn.notableCommands.length < 5) {
          turn.notableCommands.push(short);
        }
      }
    }
  });

  // At the end of each agent turn, evaluate and auto-log
  pi.on('agent_end', async () => {
    const snapshot = turn;
    turn = freshTurn();

    if (snapshot.toolCounts.size === 0) return;

    try {
      const entry = buildCompactEntry(snapshot);
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
