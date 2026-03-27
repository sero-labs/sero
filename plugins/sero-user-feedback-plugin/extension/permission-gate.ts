/**
 * Permission Gate — intercepts dangerous bash commands and requires user approval.
 *
 * Hooks `tool_call` events for the `bash` tool and checks the command against
 * a set of dangerous patterns. When matched:
 *   - Simple workspace-scoped `rm -r/-rf` cleanup commands are auto-allowed
 *   - Everything else goes through the approval flow
 *   - Pi CLI mode: shows a warning-styled TUI confirmation via ctx.ui.custom()
 *   - Sero mode:   sends a 'permission' question via the IPC bridge
 *
 * Detection: Sero registers listeners on the user-feedback event bus.
 * If the bus has listeners for 'question-request', we use the IPC bridge.
 * Otherwise we fall back to the TUI prompt.
 *
 * Sero permission prompts auto-timeout and block so background subagents
 * do not hang forever waiting for an answer.
 */

import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import path from 'path';
import { nextQuestionId, askQuestion, hasSeroIPCBridge } from './ipc-bridge';
import { showPermissionWarningTUI } from './tui-permission-warning';

const DANGEROUS_PATTERNS = [
  /\brm\s+(-rf?|--recursive)/i,
  /\bsudo\b/i,
  /\b(chmod|chown)\b.*777/i,
  /\bmkfs\b/i,
  /\bdd\b.*\bof=/i,
  />\s*\/dev\/sd/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
];

const PERMISSION_PROMPT_TIMEOUT_MS = 30_000;
const SHELL_CONTROL_CHARS = /[;&|`$<>()\n]/;
const GLOB_CHARS = /[*?[\]{}]/;

/** Register the permission gate on the `tool_call` event. */
export function registerPermissionGate(pi: ExtensionAPI) {
  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName !== 'bash') return undefined;

    const command = event.input.command as string;
    if (isWorkspaceScopedRecursiveDelete(command, ctx.cwd)) {
      return undefined;
    }

    const isDangerous = DANGEROUS_PATTERNS.some((p) => p.test(command));
    if (!isDangerous) return undefined;

    if (hasSeroIPCBridge()) {
      return askPermissionViaSero(event.toolCallId, command);
    }

    return askPermissionViaTUI(ctx, command);
  });
}

// ── Sero mode: IPC bridge ────────────────────────────────────

async function askPermissionViaSero(
  toolCallId: string,
  command: string,
): Promise<{ block: true; reason: string } | undefined> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PERMISSION_PROMPT_TIMEOUT_MS);

  const id = nextQuestionId();
  const response = await askQuestion(
    {
      id,
      type: 'permission',
      toolCallId,
      questions: [
        {
          id: 'perm',
          label: 'Permission',
          prompt: `⚠️ Dangerous command detected:\n\n  ${command}\n\nAllow this command to run?`,
          options: [
            { value: 'allow', label: 'Allow' },
            { value: 'block', label: 'Block' },
          ],
          allowOther: false,
        },
      ],
      timestamp: new Date().toISOString(),
    },
    controller.signal,
  ).finally(() => {
    clearTimeout(timeoutId);
  });

  if (response.cancelled || response.answers.length === 0) {
    return {
      block: true,
      reason: timedOut
        ? `Dangerous command blocked — approval timed out after ${Math.round(PERMISSION_PROMPT_TIMEOUT_MS / 1000)}s`
        : 'Blocked by user — cancelled',
    };
  }

  if (response.answers[0].value !== 'allow') {
    return { block: true, reason: 'Blocked by user — dangerous command rejected' };
  }

  return undefined;
}

function isWorkspaceScopedRecursiveDelete(command: string, cwd?: string): boolean {
  if (!cwd) return false;

  const tokens = tokenizeSimpleShellCommand(command);
  if (!tokens || tokens.length === 0) return false;

  const executable = path.basename(tokens[0]).toLowerCase();
  if (executable !== 'rm') return false;

  let recursive = false;
  let sawDoubleDash = false;
  const targets: string[] = [];

  for (const token of tokens.slice(1)) {
    if (!sawDoubleDash && token === '--') {
      sawDoubleDash = true;
      continue;
    }

    if (!sawDoubleDash && token.startsWith('-')) {
      if (token === '--recursive') {
        recursive = true;
        continue;
      }

      if (/^-[A-Za-z]+$/.test(token)) {
        if (/[rR]/.test(token)) recursive = true;
        continue;
      }

      return false;
    }

    targets.push(token);
  }

  if (!recursive || targets.length === 0) return false;

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  return targets.every((target) => isAllowedWorkspaceDeleteTarget(target, cwd, workspaceRoot));
}

function tokenizeSimpleShellCommand(command: string): string[] | null {
  if (SHELL_CONTROL_CHARS.test(command)) return null;

  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of command.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaped || quote) return null;
  if (current) tokens.push(current);
  return tokens;
}

function resolveWorkspaceRoot(cwd: string): string {
  const resolved = path.resolve(cwd);
  const worktreeMarker = `${path.sep}.sero${path.sep}worktrees${path.sep}`;
  const worktreeIndex = resolved.indexOf(worktreeMarker);
  if (worktreeIndex >= 0) {
    return resolved.slice(0, worktreeIndex);
  }

  if (resolved === '/workspace' || resolved.startsWith(`/workspace${path.sep}`)) {
    return '/workspace';
  }

  return resolved;
}

function isAllowedWorkspaceDeleteTarget(target: string, cwd: string, workspaceRoot: string): boolean {
  if (!target || GLOB_CHARS.test(target)) return false;

  const resolved = path.isAbsolute(target)
    ? path.resolve(target)
    : path.resolve(cwd, target);

  if (resolved === workspaceRoot) return false;

  const rel = path.relative(workspaceRoot, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;

  const normalizedRel = rel.split(path.sep).join('/');
  if (
    normalizedRel === '.git' ||
    normalizedRel.startsWith('.git/') ||
    normalizedRel.includes('/.git/') ||
    normalizedRel.endsWith('/.git')
  ) {
    return false;
  }

  return true;
}

// ── Pi CLI mode: TUI warning ─────────────────────────────────

async function askPermissionViaTUI(
  ctx: ExtensionContext,
  command: string,
): Promise<{ block: true; reason: string } | undefined> {
  if (!ctx.hasUI) {
    // Non-interactive mode (e.g. print/RPC) — block by default
    return { block: true, reason: 'Dangerous command blocked (no UI for confirmation)' };
  }

  const allowed = await showPermissionWarningTUI(ctx.ui, command);
  if (!allowed) {
    return { block: true, reason: 'Blocked by user — dangerous command rejected' };
  }

  return undefined;
}
