import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import { vcsManager } from './ipc/shared-infra';

const WORKSPACE_LINK_ENTRY = 'git-workspace-link';
const CHECKPOINT_ENTRY = 'git-checkpoint';

type MixedEditCheckpointPolicy = 'merge-working-copy' | 'require-manual-first';

// Chosen UX policy:
// If users have manual working-copy edits and the agent mutates files in a prompt cycle,
// create a single turn checkpoint that includes the full resulting workspace state.
const MIXED_EDIT_CHECKPOINT_POLICY: MixedEditCheckpointPolicy = 'merge-working-copy';

/** Mutating git commands that the agent should not run directly. */
const MUTATING_GIT_SUBCOMMANDS = new Set([
  'add',
  'commit',
  'push',
  'pull',
  'checkout',
  'switch',
  'branch',
  'merge',
  'rebase',
  'reset',
  'stash',
  'clone',
  'init',
  'tag',
  'rm',
  'mv',
  'restore',
  'remote',
  'config',
  'clean',
  'cherry-pick',
  'revert',
  'bisect',
  'submodule',
  'worktree',
]);

/** Read-only git commands the agent is allowed to use. */
const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'status',
  'log',
  'diff',
  'show',
  'blame',
  'grep',
  'shortlog',
  'describe',
  'rev-parse',
  'ls-files',
  'ls-tree',
  'cat-file',
  'reflog',
  'branch', // read-only when used without flags
  'remote', // read-only when used without add/remove
  'fetch',  // fetch is safe to allow as read-only
]);

const READ_ONLY_SHELL_COMMANDS = new Set([
  'ls',
  'pwd',
  'cat',
  'head',
  'tail',
  'wc',
  'stat',
  'which',
  'whereis',
  'echo',
  'printf',
  'find',
  'rg',
  'grep',
  'cut',
  'tr',
  'sort',
  'uniq',
  'jq',
  'diff',
  'tree',
  'realpath',
  'basename',
  'dirname',
  'awk',
]);

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block: any) => block.text)
    .join('\n')
    .trim();
}

function extractGitSubcommands(command: string): string[] {
  const segments = command
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);

  const subs: string[] = [];
  for (const segment of segments) {
    const match = segment.match(/(?:^|\s)git\s+([a-zA-Z-]+)/);
    if (match?.[1]) subs.push(match[1]);
  }
  return subs;
}

function hasMutatingGit(command: string): boolean {
  const subcommands = extractGitSubcommands(command);
  for (const sub of subcommands) {
    if (MUTATING_GIT_SUBCOMMANDS.has(sub)) return true;
    // If it's an unknown git subcommand, treat as mutating by default
    if (!READ_ONLY_GIT_SUBCOMMANDS.has(sub)) return true;
  }
  return false;
}

function isLikelyReadOnlySegment(segment: string): boolean {
  if (!segment) return true;
  if (/[><]{1,2}/.test(segment)) return false;

  const trimmed = segment.trim();
  const withoutEnv = trimmed.replace(/^(\w+=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*/, '').trim();
  if (!withoutEnv) return true;

  const tokens = withoutEnv.split(/\s+/);
  const cmd = tokens[0] ?? '';
  if (!cmd) return true;

  if (cmd === 'git') {
    return !hasMutatingGit(withoutEnv);
  }

  if (cmd === 'sed') {
    const args = tokens.slice(1);
    return args.includes('-n') && !args.includes('-i');
  }

  return READ_ONLY_SHELL_COMMANDS.has(cmd);
}

function isLikelyReadOnlyBash(command: string): boolean {
  const segments = command
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every(isLikelyReadOnlySegment);
}

function summarizeAssistantMessage(message: unknown): string {
  const text = extractTextContent((message as any)?.content);
  if (!text) return 'checkpoint: turn';
  const first = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? 'checkpoint: turn';
  return `checkpoint: ${first.trim().slice(0, 220)}`;
}

function summarizeAgentRun(messages: unknown): string {
  if (Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as { role?: unknown; content?: unknown };
      if (msg?.role !== 'assistant') continue;
      const summary = summarizeAssistantMessage(msg);
      if (summary !== 'checkpoint: turn') return summary;
    }
  }
  return 'checkpoint: turn';
}

export function registerGitCheckpointFeatures(
  pi: ExtensionAPI,
  workspaceId: string,
): void {
  let agentRunHasMutatingToolCalls = false;
  let hadWorkingCopyChangesAtAgentStart = false;

  function appendWorkspaceLink(changeId: string | null): void {
    pi.appendEntry(WORKSPACE_LINK_ENTRY, {
      workspaceId,
      changeId,
      recordedAt: new Date().toISOString(),
    });
  }

  function appendCheckpointEntry(
    checkpoint: { changeId: string; description: string; source: string },
  ): void {
    pi.appendEntry(CHECKPOINT_ENTRY, {
      workspaceId,
      changeId: checkpoint.changeId,
      description: checkpoint.description,
      source: checkpoint.source,
      recordedAt: new Date().toISOString(),
    });
  }

  pi.on('session_start', async () => {
    try {
      const changeId = await vcsManager.getCurrentChangeId(workspaceId);
      appendWorkspaceLink(changeId);
    } catch {
      // Non-fatal: repo may initialize lazily on first action.
    }
  });

  pi.on('session_switch', async () => {
    try {
      const changeId = await vcsManager.getCurrentChangeId(workspaceId);
      appendWorkspaceLink(changeId);
    } catch {
      // non-fatal
    }
  });

  pi.on('agent_start', async () => {
    agentRunHasMutatingToolCalls = false;
    hadWorkingCopyChangesAtAgentStart = false;
    if (MIXED_EDIT_CHECKPOINT_POLICY !== 'require-manual-first') return;

    try {
      hadWorkingCopyChangesAtAgentStart = await vcsManager.hasWorkingCopyChanges(workspaceId);
    } catch {
      hadWorkingCopyChangesAtAgentStart = false;
    }
  });

  pi.on('tool_call', async (event) => {
    if (event.toolName === 'write' || event.toolName === 'edit') {
      agentRunHasMutatingToolCalls = true;
      return;
    }

    if (event.toolName !== 'bash') return;

    const command = String((event.input as { command?: string }).command ?? '');
    if (!command.trim()) return;

    // Block mutating git commands — checkpoint management is handled by Sero
    if (hasMutatingGit(command)) {
      return {
        block: true,
        reason: 'Mutating git commands (commit, push, checkout, reset, etc.) are managed by Sero. Use read-only git commands (status, log, diff, show) instead.',
      };
    }

    if (!isLikelyReadOnlyBash(command)) agentRunHasMutatingToolCalls = true;
  });

  pi.on('agent_end', async (event) => {
    if (!agentRunHasMutatingToolCalls) return;
    if (MIXED_EDIT_CHECKPOINT_POLICY === 'require-manual-first' && hadWorkingCopyChangesAtAgentStart) {
      return;
    }

    const description = summarizeAgentRun((event as { messages?: unknown[] }).messages);
    try {
      const checkpoint = await vcsManager.createCheckpoint(workspaceId, {
        source: 'turn',
        description,
      });

      if (checkpoint) {
        appendCheckpointEntry(checkpoint);
      }
    } catch {
      // Transparent-by-default: do not emit chat noise for automatic turn checkpoints.
    }
  });

  pi.registerCommand('checkpoint', {
    description: 'Create a Git checkpoint from the current workspace state',
    handler: async (args) => {
      const description = args?.trim() || undefined;
      try {
        const checkpoint = await vcsManager.createCheckpoint(workspaceId, {
          source: 'manual',
          description,
        });

        if (!checkpoint) {
          pi.sendMessage({
            customType: 'git-checkpoint',
            content: 'No file changes to checkpoint.',
            display: true,
          });
          return;
        }

        appendCheckpointEntry(checkpoint);
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: `Checkpoint created: **${checkpoint.changeId}**`,
          display: true,
          details: checkpoint,
        });
      } catch (err) {
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: `Checkpoint failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          display: true,
        });
      }
    },
  });

  pi.registerCommand('checkpoints', {
    description: 'List recent Git checkpoints',
    handler: async (args) => {
      const parsed = Number.parseInt(args?.trim() || '10', 10);
      const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 10;

      try {
        const checkpoints = await vcsManager.listCheckpoints(workspaceId, limit);
        if (!checkpoints.length) {
          pi.sendMessage({
            customType: 'git-checkpoint',
            content: 'No checkpoints found.',
            display: true,
          });
          return;
        }

        const lines = checkpoints.map((cp) => `- \`${cp.changeId}\` ${cp.description}`);
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: `**Recent checkpoints (${checkpoints.length})**\n${lines.join('\n')}`,
          display: true,
        });
      } catch (err) {
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: `Failed to list checkpoints: ${err instanceof Error ? err.message : 'unknown error'}`,
          display: true,
        });
      }
    },
  });

  pi.registerCommand('restore', {
    description: 'Restore the workspace files to a checkpoint: /restore <commit-sha>',
    handler: async (args) => {
      const changeId = args?.trim();
      if (!changeId) {
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: 'Usage: /restore <commit-sha>',
          display: true,
        });
        return;
      }

      try {
        await vcsManager.restoreCheckpoint(workspaceId, changeId);
        appendWorkspaceLink(changeId);
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: `Workspace restored to **${changeId}**.`,
          display: true,
        });
      } catch (err) {
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: `Restore failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          display: true,
        });
      }
    },
  });

  pi.registerCommand('diffcp', {
    description: 'Show diff between checkpoints: /diffcp <from> [to]',
    handler: async (args) => {
      const parts = (args || '').trim().split(/\s+/).filter(Boolean);
      const from = parts[0];
      const to = parts[1];

      if (!from) {
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: 'Usage: /diffcp <from-commit-sha> [to-commit-sha]',
          display: true,
        });
        return;
      }

      try {
        const diff = await vcsManager.diff(workspaceId, from, to);
        pi.sendMessage({
          customType: 'git-checkpoint-diff',
          content: diff || '(no diff output)',
          display: true,
          details: { from, to: to ?? 'HEAD' },
        });
      } catch (err) {
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: `Diff failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          display: true,
        });
      }
    },
  });
}
