import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';

import { vcsManager } from '@electron/shared/infra/shared-infra';
import { gitWorkspaceStateManager } from '@electron/features/apps/git-app/manager';
import { hasMutatingGit, isLikelyReadOnlyBash } from '@electron/platform/security/git-command-filter';
import type { GitCheckpointSessionEntries } from './git-checkpoint-session-entries';

type MixedEditCheckpointPolicy = 'merge-working-copy' | 'require-manual-first';

type TextContentBlock = { type: 'text'; text: string };
type MessageLike = { role?: unknown; content?: unknown };

// Chosen UX policy:
// If users have manual working-copy edits and the agent mutates files in a prompt cycle,
// create a single turn checkpoint that includes the full resulting workspace state.
const MIXED_EDIT_CHECKPOINT_POLICY: MixedEditCheckpointPolicy = 'merge-working-copy';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTextContentBlock(block: unknown): block is TextContentBlock {
  if (!isRecord(block)) return false;
  return block.type === 'text' && typeof block.text === 'string';
}

function getMessageLike(value: unknown): MessageLike | null {
  if (!isRecord(value)) return null;
  return value;
}

function getBashCommand(input: unknown): string {
  if (!isRecord(input)) return '';
  return typeof input.command === 'string' ? input.command : '';
}

function getAgentMessages(event: unknown): unknown[] {
  if (!isRecord(event)) return [];
  return Array.isArray(event.messages) ? event.messages : [];
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter(isTextContentBlock)
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function summarizeAssistantMessage(message: unknown): string {
  const candidate = getMessageLike(message);
  const text = extractTextContent(candidate?.content);
  if (!text) return 'checkpoint: turn';
  const first = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? 'checkpoint: turn';
  return `checkpoint: ${first.trim().slice(0, 220)}`;
}

function summarizeAgentRun(messages: unknown): string {
  if (!Array.isArray(messages)) return 'checkpoint: turn';

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = getMessageLike(messages[i]);
    if (message?.role !== 'assistant') continue;
    const summary = summarizeAssistantMessage(message);
    if (summary !== 'checkpoint: turn') return summary;
  }

  return 'checkpoint: turn';
}

function findLatestUserEntryId(
  sessionManager: ExtensionContext['sessionManager'],
): string | null {
  const branch = sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i -= 1) {
    const entry = branch[i];
    if (entry?.type === 'message' && entry.message.role === 'user') {
      return entry.id;
    }
  }
  return null;
}

export function registerGitTurnUndoCapture(
  pi: ExtensionAPI,
  workspaceId: string,
  entries: GitCheckpointSessionEntries,
): void {
  let agentRunHasMutatingToolCalls = false;
  let hadWorkingCopyChangesAtAgentStart = false;
  let preTurnSnapshotId: string | null = null;

  pi.on('session_start', async () => {
    try {
      const changeId = await vcsManager.getCurrentChangeId(workspaceId);
      entries.appendWorkspaceLink(changeId);
    } catch {
      // Non-fatal: repo may initialize lazily on first action.
    }
  });

  pi.on('session_switch', async () => {
    try {
      const changeId = await vcsManager.getCurrentChangeId(workspaceId);
      entries.appendWorkspaceLink(changeId);
    } catch {
      // non-fatal
    }
  });

  pi.on('agent_start', async () => {
    agentRunHasMutatingToolCalls = false;
    hadWorkingCopyChangesAtAgentStart = false;
    preTurnSnapshotId = null;
    if (MIXED_EDIT_CHECKPOINT_POLICY !== 'require-manual-first') return;

    try {
      hadWorkingCopyChangesAtAgentStart = await vcsManager.hasWorkingCopyChanges(workspaceId);
    } catch {
      hadWorkingCopyChangesAtAgentStart = false;
    }
  });

  async function markMutatingTurn(): Promise<void> {
    agentRunHasMutatingToolCalls = true;
    if (preTurnSnapshotId) return;

    try {
      preTurnSnapshotId = await vcsManager.getCurrentChangeId(workspaceId);
      console.log(
        `[turn-undo] Captured pre-turn snapshot for workspace=${workspaceId}: ${preTurnSnapshotId ?? 'null'}`,
      );
    } catch (error) {
      preTurnSnapshotId = null;
      console.warn(`[turn-undo] Failed to capture pre-turn snapshot for workspace=${workspaceId}:`, error);
    }
  }

  pi.on('tool_call', async (event) => {
    if (event.toolName === 'write' || event.toolName === 'edit') {
      await markMutatingTurn();
      return;
    }

    if (event.toolName !== 'bash') return;

    const command = getBashCommand(event.input);
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

    if (!isLikelyReadOnlyBash(command)) await markMutatingTurn();
  });

  pi.on('agent_end', async (event, ctx) => {
    if (!agentRunHasMutatingToolCalls) return;
    if (MIXED_EDIT_CHECKPOINT_POLICY === 'require-manual-first' && hadWorkingCopyChangesAtAgentStart) {
      return;
    }

    const description = summarizeAgentRun(getAgentMessages(event));
    try {
      const checkpoint = await vcsManager.createCheckpoint(workspaceId, {
        source: 'turn',
        description,
      });

      if (!checkpoint) {
        console.warn(`[turn-undo] No auto checkpoint created for workspace=${workspaceId}; working copy may have been clean by agent_end`);
        return;
      }

      const targetUserEntryId = findLatestUserEntryId(ctx.sessionManager);
      if (!targetUserEntryId) {
        console.warn(`[turn-undo] Missing target user entry for workspace=${workspaceId}; checkpoint=${checkpoint.changeId}`);
        return;
      }

      if (!preTurnSnapshotId) {
        console.warn(`[turn-undo] Missing pre-turn snapshot for workspace=${workspaceId}; checkpoint=${checkpoint.changeId}`);
        return;
      }

      console.log(
        `[turn-undo] Recording turn undo for workspace=${workspaceId}: preTurn=${preTurnSnapshotId}, postTurn=${checkpoint.changeId}, userEntry=${targetUserEntryId}`,
      );
      entries.appendTurnUndoEntry({
        snapshotId: preTurnSnapshotId,
        targetUserEntryId,
        label: checkpoint.description,
      });
      preTurnSnapshotId = null;
      void gitWorkspaceStateManager.refreshWorkspace(workspaceId);
    } catch (error) {
      console.warn(`[turn-undo] Failed to finalize turn undo for workspace=${workspaceId}:`, error);
      // Transparent-by-default: do not emit chat noise for automatic turn checkpoints.
    }
  });
}
