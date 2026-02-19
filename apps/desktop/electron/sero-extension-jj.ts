import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import { vcsManager } from './ipc/shared-infra';

const WORKSPACE_LINK_ENTRY = 'jj-workspace-link';
const CHECKPOINT_ENTRY = 'jj-checkpoint';

type MixedEditCheckpointPolicy = 'merge-working-copy' | 'require-manual-first';

// Chosen UX policy:
// If users have manual working-copy edits and the agent mutates files in a prompt cycle,
// create a single turn checkpoint that includes the full resulting workspace state.
const MIXED_EDIT_CHECKPOINT_POLICY: MixedEditCheckpointPolicy = 'merge-working-copy';

const GIT_COMMANDS_PATTERN =
  /(^|&&|\|\||;|\|)\s*git\s+(commit|push|pull|checkout|branch|merge|rebase|status|diff|log|add|reset|stash|clone|init|fetch|tag|show|rm|mv|restore|switch|remote|config|clean|cherry-pick|revert|bisect|blame|grep|shortlog|describe|archive|bundle|submodule|worktree|reflog)/;

const READ_ONLY_JJ = new Set([
  'status',
  'st',
  'log',
  'diff',
  'show',
  'file',
  'workspace',
  'op',
  'help',
  'version',
  'config',
  'root',
]);

const MUTATING_JJ = new Set([
  'new',
  'commit',
  'ci',
  'describe',
  'desc',
  'squash',
  'split',
  'rebase',
  'abandon',
  'edit',
  'bookmark',
  'undo',
  'restore',
  'resolve',
  'git',
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

function extractJjSubcommands(command: string): string[] {
  const segments = command
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);

  const subs: string[] = [];
  for (const segment of segments) {
    const match = segment.match(/(?:^|\s)jj\s+([a-zA-Z-]+)/);
    if (match?.[1]) subs.push(match[1]);
  }
  return subs;
}

function hasMutatingJj(command: string): boolean {
  const subcommands = extractJjSubcommands(command);
  for (const sub of subcommands) {
    if (MUTATING_JJ.has(sub)) return true;
    if (!READ_ONLY_JJ.has(sub)) return true;
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
  const args = tokens.slice(1);
  if (!cmd) return true;

  if (cmd === 'jj') {
    return !hasMutatingJj(withoutEnv);
  }

  if (cmd === 'sed') {
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

export function registerJjCheckpointFeatures(
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
      // Non-fatal: if detection fails, do not block automatic turn checkpointing.
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

    if (GIT_COMMANDS_PATTERN.test(command)) {
      return {
        block: true,
        reason: 'Git commands are blocked for agent tool calls. Use JJ-backed checkpoint tools and read-only jj commands.',
      };
    }

    if (hasMutatingJj(command)) {
      return {
        block: true,
        reason: 'Mutating jj commands are blocked in agent bash calls. Use read-only jj commands (status/log/diff/show).',
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
    description: 'Create a JJ checkpoint from the current workspace state',
    handler: async (args) => {
      const description = args?.trim() || undefined;
      try {
        const checkpoint = await vcsManager.createCheckpoint(workspaceId, {
          source: 'manual',
          description,
        });

        if (!checkpoint) {
          pi.sendMessage({
            customType: 'jj-checkpoint',
            content: 'No file changes to checkpoint.',
            display: true,
          });
          return;
        }

        appendCheckpointEntry(checkpoint);
        pi.sendMessage({
          customType: 'jj-checkpoint',
          content: `Checkpoint created: **${checkpoint.changeId}**`,
          display: true,
          details: checkpoint,
        });
      } catch (err) {
        pi.sendMessage({
          customType: 'jj-checkpoint',
          content: `Checkpoint failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          display: true,
        });
      }
    },
  });

  pi.registerCommand('checkpoints', {
    description: 'List recent JJ checkpoints',
    handler: async (args) => {
      const parsed = Number.parseInt(args?.trim() || '10', 10);
      const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 10;

      try {
        const checkpoints = await vcsManager.listCheckpoints(workspaceId, limit);
        if (!checkpoints.length) {
          pi.sendMessage({
            customType: 'jj-checkpoint',
            content: 'No checkpoints found.',
            display: true,
          });
          return;
        }

        const lines = checkpoints.map((cp) => `- \`${cp.changeId}\` ${cp.description}`);
        pi.sendMessage({
          customType: 'jj-checkpoint',
          content: `**Recent checkpoints (${checkpoints.length})**\n${lines.join('\n')}`,
          display: true,
        });
      } catch (err) {
        pi.sendMessage({
          customType: 'jj-checkpoint',
          content: `Failed to list checkpoints: ${err instanceof Error ? err.message : 'unknown error'}`,
          display: true,
        });
      }
    },
  });

  pi.registerCommand('restore', {
    description: 'Restore the workspace files to a checkpoint: /restore <change-id>',
    handler: async (args) => {
      const changeId = args?.trim();
      if (!changeId) {
        pi.sendMessage({
          customType: 'jj-checkpoint',
          content: 'Usage: /restore <change-id>',
          display: true,
        });
        return;
      }

      try {
        await vcsManager.restoreCheckpoint(workspaceId, changeId);
        appendWorkspaceLink(changeId);
        pi.sendMessage({
          customType: 'jj-checkpoint',
          content: `Workspace restored to **${changeId}**.`,
          display: true,
        });
      } catch (err) {
        pi.sendMessage({
          customType: 'jj-checkpoint',
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
          customType: 'jj-checkpoint',
          content: 'Usage: /diffcp <from-change-id> [to-change-id]',
          display: true,
        });
        return;
      }

      try {
        const diff = await vcsManager.diff(workspaceId, from, to);
        pi.sendMessage({
          customType: 'jj-checkpoint-diff',
          content: diff || '(no diff output)',
          display: true,
          details: { from, to: to ?? '@' },
        });
      } catch (err) {
        pi.sendMessage({
          customType: 'jj-checkpoint',
          content: `Diff failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          display: true,
        });
      }
    },
  });
}
