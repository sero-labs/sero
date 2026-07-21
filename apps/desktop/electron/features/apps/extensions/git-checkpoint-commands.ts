import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { vcsManager } from '@electron/shared/infra/shared-infra';
import type { GitCheckpointSessionEntries } from './git-checkpoint-session-entries';

export function registerManualGitCheckpointCommands(
  pi: ExtensionAPI,
  workspaceId: string,
  entries: GitCheckpointSessionEntries,
): void {
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

        entries.appendCheckpointEntry(checkpoint);
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: `Checkpoint created: **${checkpoint.sha}**`,
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

        const lines = checkpoints.map((cp) => `- \`${cp.sha}\` ${cp.description}`);
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
      const checkpointId = args?.trim();
      if (!checkpointId) {
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: 'Usage: /restore <commit-sha>',
          display: true,
        });
        return;
      }

      try {
        await vcsManager.restoreCheckpoint(workspaceId, checkpointId);
        entries.appendWorkspaceLink(checkpointId);
        pi.sendMessage({
          customType: 'git-checkpoint',
          content: `Workspace restored to **${checkpointId}**.`,
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
