/**
 * Workspace isolation resolution (D-06, FR-20/FR-21). Workspace isolation is a
 * user-level loop setting, never an LLM-authored plan choice.
 *
 *  - Managed worktree (default): create or reuse one worktree; never prompt
 *    about dirty workspace-root changes.
 *  - Workspace root: if the root is dirty, show a 30s choice notification
 *    (stash / create worktree / defer). On timeout, create a managed worktree.
 *
 * Resolution runs only when background-agent filesystem work is about to start.
 */

import type { DirtyWorkspaceDecision, Loop, ResolvedWorkspaceContext } from '../shared/types';
import type { OrchestratorHost } from './host';
import type { WorkspaceResolver } from './engine-types';

const DIRTY_CHOICES = [
  { id: 'stash-current-changes', label: 'Stash current changes and run in the workspace root' },
  { id: 'create-managed-worktree', label: 'Create an isolated worktree and run there' },
  { id: 'defer-workflow', label: 'Defer — do not start steps now' },
];

export interface ResolveResult {
  loop: Loop;
  workspace?: ResolvedWorkspaceContext;
  deferred?: string;
}

async function resolveManagedWorktree(
  host: OrchestratorHost,
  loop: Loop,
  resolvedBy: ResolvedWorkspaceContext['resolvedBy'],
): Promise<ResolvedWorkspaceContext> {
  const handle = await host.createWorktree(loop.id, loop.title);
  return {
    id: host.newId('ws'),
    type: 'managed-worktree',
    workspaceRoot: host.workspacePath,
    cwd: handle.worktreePath,
    worktreePath: handle.worktreePath,
    branchName: handle.branchName,
    resolvedBy,
    createdAt: host.now(),
  };
}

function workspaceRootContext(host: OrchestratorHost, resolvedBy: ResolvedWorkspaceContext['resolvedBy']): ResolvedWorkspaceContext {
  return {
    id: host.newId('ws'),
    type: 'workspace-root',
    workspaceRoot: host.workspacePath,
    cwd: host.workspacePath,
    resolvedBy,
    createdAt: host.now(),
  };
}

function withResolved(loop: Loop, resolved: ResolvedWorkspaceContext, decision?: DirtyWorkspaceDecision): Loop {
  return {
    ...loop,
    runtime: {
      ...loop.runtime,
      workspace: {
        ...loop.runtime.workspace,
        resolved,
        lastDirtyCheckAt: loop.runtime.workspace.lastDirtyCheckAt,
        dirtyPrompt: decision
          ? { id: loop.runtime.workspace.dirtyPrompt?.id ?? 'dirty', status: 'resolved', detectedAt: decision.decidedAt, expiresAt: decision.decidedAt, decision }
          : loop.runtime.workspace.dirtyPrompt,
      },
    },
  };
}

/** The default resolver used by the runtime. */
export const workspaceResolver: WorkspaceResolver = { resolve };

export async function resolve(host: OrchestratorHost, loop: Loop): Promise<ResolveResult> {
  // Reuse an already-resolved workspace for the loop's lifetime.
  if (loop.runtime.workspace.resolved) {
    return { loop, workspace: loop.runtime.workspace.resolved };
  }

  if (loop.workspace.useManagedWorktree) {
    const resolved = await resolveManagedWorktree(host, loop, 'create-option');
    return { loop: withResolved(loop, resolved), workspace: resolved };
  }

  // Workspace-root mode: dirty preflight before background filesystem work.
  const status = await host.getWorkspaceStatus();
  if (!status.isGitRepository || !status.hasUncommittedChanges) {
    const resolved = workspaceRootContext(host, 'clean-workspace');
    return { loop: withResolved(loop, resolved), workspace: resolved };
  }
  return resolveDirty(host, loop, status.summary);
}

async function resolveDirty(host: OrchestratorHost, loop: Loop, summary: string): Promise<ResolveResult> {
  const choice = await host.requestChoice({
    title: 'Workspace has uncommitted changes',
    body: `The workspace root has uncommitted changes (${summary}). Choose how this loop should run.`,
    choices: DIRTY_CHOICES,
    timeoutMs: loop.workspace.dirtyWorkspacePromptTimeoutMs,
  });

  const now = host.now();
  const action = choice.timedOut ? 'create-managed-worktree' : choice.choiceId;

  if (action === 'create-managed-worktree') {
    const resolvedBy = choice.timedOut ? 'dirty-workspace-timeout' : 'dirty-workspace-choice';
    const resolved = await resolveManagedWorktree(host, loop, resolvedBy);
    const decision: DirtyWorkspaceDecision = { action: 'create-managed-worktree', source: choice.timedOut ? 'timeout' : 'user', decidedAt: now };
    return { loop: withResolved(loop, resolved, decision), workspace: resolved };
  }

  if (action === 'stash-current-changes') {
    const stash = await host.stashWorkspaceChanges(`orchestrator loop ${loop.id}`);
    const resolved = workspaceRootContext(host, 'dirty-workspace-choice');
    const decision: DirtyWorkspaceDecision = { action: 'stash-current-changes', source: 'user', decidedAt: now, stashRef: stash.stashRef ?? undefined };
    return { loop: withResolved(loop, resolved, decision), workspace: resolved };
  }

  // defer-workflow (or an unknown choice): leave the loop waiting without steps.
  const deferred = 'User deferred the workflow on a dirty workspace root.';
  return {
    loop: { ...loop, runtime: { ...loop.runtime, workspace: { ...loop.runtime.workspace, deferredReason: deferred } } },
    deferred,
  };
}
