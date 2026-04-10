import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

import { vcsManager } from '@electron/shared/infra/shared-infra';
import { hasMutatingGit, isLikelyReadOnlyBash } from '@electron/platform/security/git-command-filter';

const WORKSPACE_LINK_ENTRY = 'git-workspace-link';
const CHECKPOINT_ENTRY = 'git-checkpoint';

type MixedEditCheckpointPolicy = 'merge-working-copy' | 'require-manual-first';

// Chosen UX policy:
// If users have manual working-copy edits and the agent mutates files in a prompt cycle,
// create a single turn checkpoint that includes the full resulting workspace state.
const MIXED_EDIT_CHECKPOINT_POLICY: MixedEditCheckpointPolicy = 'merge-working-copy';

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block: any) => block.text)
    .join('\n')
    .trim();
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

    // Block mutating git commands — VCS operations are handled by the sero-cli tool
    if (hasMutatingGit(command)) {
      return {
        block: true,
        reason:
          'Mutating git commands are managed by Sero — use the sero-cli tool instead:\n' +
          '  sero vcs status              Working copy status\n' +
          '  sero vcs checkpoint [msg]    Commit all changes\n' +
          '  sero vcs push [branch]       Push to remote\n' +
          '  sero vcs remote              List remotes\n' +
          '  sero vcs remote add <n> <u>  Add a remote\n' +
          '  sero vcs log                 Recent commits\n' +
          '  sero vcs fetch               Fetch from remote\n' +
          'Read-only bash git commands (status, log, diff, show, blame, remote -v, branch) are still allowed.',
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
