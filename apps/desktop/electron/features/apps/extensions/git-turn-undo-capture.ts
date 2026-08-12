import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

import { vcsManager } from '@electron/shared/infra/shared-infra';
import { gitWorkspaceStateManager } from '@electron/features/apps/git-app/manager';
import { hasMutatingGit, isLikelyReadOnlyBash } from '@electron/platform/security/git-command-filter';
import type { GitCheckpointSessionEntries } from './git-checkpoint-session-entries';
import { buildTurnUndoLabel } from './turn-undo-labels';

type MixedEditCheckpointPolicy = 'merge-working-copy' | 'require-manual-first';
type TextContentBlock = { type: 'text'; text: string };
type MessageLike = { role?: unknown; content?: unknown };
type PendingMutation = { paths: string[] };
type LatestUserTurn = { id: string; text: string };

// Chosen UX policy:
// If users have manual working-copy edits and the agent mutates files in a prompt cycle,
// create a single turn checkpoint that includes the full resulting workspace state.
const MIXED_EDIT_CHECKPOINT_POLICY: MixedEditCheckpointPolicy = 'merge-working-copy';
const SHELL_SEPARATORS = new Set(['&&', '||', ';', '|']);
const PATH_ACTION_COMMANDS = new Set(['touch', 'mkdir', 'rm', 'rmdir', 'tee']);
const TWO_PATH_COMMANDS = new Set(['cp', 'mv']);

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

function getInputPath(input: unknown): string | null {
  if (!isRecord(input)) return null;
  const path = typeof input.path === 'string' ? input.path.trim() : '';
  return path || null;
}

function normalizePath(path: string): string {
  return path.trim().replace(/^['"]|['"]$/g, '').replace(/\\/g, '/');
}

function tokenizeShell(command: string): string[] {
  const tokens: string[] = [];
  const pattern = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|&&|\|\||>>|>|;|\||[^\s]+/g;
  for (const match of command.matchAll(pattern)) {
    tokens.push(match[0]);
  }
  return tokens;
}

function addShellPath(paths: Set<string>, rawPath: string): void {
  const normalized = normalizePath(rawPath);
  if (!normalized || normalized === '/dev/null') return;
  if (normalized.startsWith('-')) return;
  paths.add(normalized);
}

function collectCommandPaths(tokens: string[], startIndex: number, count: number): string[] {
  const paths: string[] = [];

  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || SHELL_SEPARATORS.has(token)) break;
    if (token.startsWith('-')) continue;
    paths.push(token);
    if (paths.length >= count) break;
  }

  return paths;
}

function extractPathsFromRedirections(command: string): string[] {
  const paths = new Set<string>();
  const pattern = /(?:^|[\s;&|])(?:>|>>|1>|1>>|2>|2>>)\s*("(?:\\.|[^"\\])+"|'(?:\\.|[^'\\])+'|[^\s;&|]+)/g;

  for (const match of command.matchAll(pattern)) {
    const candidate = match[1];
    if (!candidate) continue;
    addShellPath(paths, candidate);
  }

  return [...paths];
}

function extractTargetedPathsFromBash(command: string): string[] {
  const paths = new Set<string>(extractPathsFromRedirections(command));
  const tokens = tokenizeShell(command);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (PATH_ACTION_COMMANDS.has(token)) {
      for (const path of collectCommandPaths(tokens, index + 1, token === 'tee' ? 3 : 1)) {
        addShellPath(paths, path);
      }
      continue;
    }

    if (TWO_PATH_COMMANDS.has(token)) {
      for (const path of collectCommandPaths(tokens, index + 1, 2)) {
        addShellPath(paths, path);
      }
    }
  }

  return [...paths];
}

function getToolCallId(event: unknown): string | null {
  if (!isRecord(event)) return null;
  return typeof event.toolCallId === 'string' && event.toolCallId.trim()
    ? event.toolCallId
    : null;
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';

  return content
    .filter(isTextContentBlock)
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function findLatestUserTurn(
  sessionManager: ExtensionContext['sessionManager'],
): LatestUserTurn | null {
  const branch = sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i -= 1) {
    const entry = branch[i];
    if (entry?.type !== 'message' || entry.message.role !== 'user') continue;
    return {
      id: entry.id,
      text: extractTextContent(entry.message.content),
    };
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
  const pendingMutations = new Map<string, PendingMutation>();
  const changedPaths = new Set<string>();

  function resetTurnState(): void {
    agentRunHasMutatingToolCalls = false;
    hadWorkingCopyChangesAtAgentStart = false;
    preTurnSnapshotId = null;
    pendingMutations.clear();
    changedPaths.clear();
  }

  pi.on('session_start', async () => {
    try {
      const sha = await vcsManager.getCurrentCommitSha(workspaceId);
      entries.appendWorkspaceLink(sha);
    } catch {
      // Non-fatal: repo may initialize lazily on first action.
    }
  });

  pi.on('agent_start', async () => {
    resetTurnState();
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
      preTurnSnapshotId = await vcsManager.createInternalSnapshot(workspaceId);
      console.log(
        `[turn-undo] Captured pre-turn snapshot for workspace=${workspaceId}: ${preTurnSnapshotId ?? 'null'}`,
      );
    } catch (error) {
      preTurnSnapshotId = null;
      console.warn(`[turn-undo] Failed to capture pre-turn snapshot for workspace=${workspaceId}:`, error);
    }
  }

  pi.on('tool_call', async (event) => {
    const toolCallId = getToolCallId(event);

    if (event.toolName === 'write' || event.toolName === 'edit') {
      await markMutatingTurn();
      if (toolCallId) {
        const path = getInputPath(event.input);
        pendingMutations.set(toolCallId, { paths: path ? [path] : [] });
      }
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
          '  sero git status              Working tree status\n' +
          '  sero git checkpoint [msg]    Commit all changes\n' +
          '  sero git push [branch]       Push to remote\n' +
          '  sero git remote              List remotes\n' +
          '  sero git remote add <n> <u>  Add a remote\n' +
          '  sero git log                 Recent commits\n' +
          '  sero git fetch               Fetch from remote\n' +
          'Read-only bash git commands (status, log, diff, show, blame, remote -v, '
          + 'branch, tag --list) are still allowed.',
      };
    }

    if (!isLikelyReadOnlyBash(command)) {
      await markMutatingTurn();
      if (toolCallId) {
        pendingMutations.set(toolCallId, {
          paths: extractTargetedPathsFromBash(command),
        });
      }
    }
  });

  pi.on('tool_execution_end', (event) => {
    const toolCallId = getToolCallId(event);
    if (!toolCallId) return;

    const pending = pendingMutations.get(toolCallId);
    pendingMutations.delete(toolCallId);
    if (!pending || event.isError) return;

    for (const path of pending.paths) {
      changedPaths.add(path);
    }
  });

  pi.on('agent_end', async (_event, ctx) => {
    if (!agentRunHasMutatingToolCalls) return;
    if (MIXED_EDIT_CHECKPOINT_POLICY === 'require-manual-first' && hadWorkingCopyChangesAtAgentStart) {
      return;
    }

    try {
      if (!preTurnSnapshotId) {
        console.warn(`[turn-undo] Missing pre-turn snapshot for workspace=${workspaceId}`);
        return;
      }

      const hasSnapshotDiff = await vcsManager.hasSnapshotDiff(workspaceId, preTurnSnapshotId);
      if (!hasSnapshotDiff) {
        console.log(`[turn-undo] Skipping no-op undo snapshot for workspace=${workspaceId}: ${preTurnSnapshotId}`);
        preTurnSnapshotId = null;
        return;
      }

      const latestUserTurn = findLatestUserTurn(ctx.sessionManager);
      if (!latestUserTurn) {
        console.warn(`[turn-undo] Missing target user entry for workspace=${workspaceId}; snapshot=${preTurnSnapshotId}`);
        return;
      }

      const label = buildTurnUndoLabel({
        targetedPaths: changedPaths,
        changedPaths,
        promptText: latestUserTurn.text,
      });

      console.log(
        `[turn-undo] Recording turn undo for workspace=${workspaceId}: preTurn=${preTurnSnapshotId}, userEntry=${latestUserTurn.id}`,
      );
      entries.appendTurnUndoEntry({
        snapshotId: preTurnSnapshotId,
        targetUserEntryId: latestUserTurn.id,
        label,
      });
      preTurnSnapshotId = null;
      gitWorkspaceStateManager.invalidateWorkspace(workspaceId, 'agent:mutating-turn');
    } catch (error) {
      console.warn(`[turn-undo] Failed to finalize turn undo for workspace=${workspaceId}:`, error);
      // Transparent-by-default: do not emit chat noise for automatic turn checkpoints.
    }
  });
}
