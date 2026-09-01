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

import type { DeferredRunResult, DirtyWorkspaceDecision, Loop, LoopRun, ResolvedWorkspaceContext } from '../shared/types';
import type { OrchestratorHost, ReattachWorktreeRequest, WorktreeLease } from './host';
import type { WorkspaceResolver } from './engine-types';

/**
 * Per-RUN worktree key for a loop. EVERY fresh run — a scheduled iteration or a
 * manual "Run again"/Restart — gets its own branch off the base, rather than
 * reusing the previous run's branch. Reuse was the bug: a one-shot loop keyed by
 * `loop.id` re-created its worktree on the SAME branch, which still held that
 * run's commits, so a re-run saw the work as "already done", asked to approve
 * changes already committed, and classified inconsistently. Each run now starts
 * clean. Unmerged branches and PRs are preserved, while no-op or merged local
 * branches can be removed safely during cleanup. A branch still embeds the loop
 * id, so PR reconciliation keeps matching it. The iteration
 * number is the monotonic run counter — NOT `runs.length`, which repeats once
 * run-history pruning caps it and would reuse a branch across runs.
 */
export function worktreeKeyFor(loop: Loop): string {
  return `${loop.id}-r${loop.runtime.runSeq ?? loop.runs.length}`;
}

const RUN_CHOICES = [
  { id: 'create-managed-worktree', label: 'Run isolated', description: 'Uses a separate worktree and leaves your current changes alone.', emphasis: 'primary' as const },
  { id: 'defer-workflow', label: 'Skip this run', description: 'Keeps the loop scheduled for its next normal run.' },
  { id: 'run-in-workspace-root', label: 'Run here once', description: 'Works alongside the current uncommitted changes.', menu: 'Run here' },
  { id: 'run-in-workspace-root-always', label: 'Always run here for this loop', description: 'Stops asking when this loop finds uncommitted changes.', menu: 'Run here' },
  { id: 'stash-current-changes', label: 'Stash changes and run here', description: 'Moves the current changes into a Git stash before starting.', menu: 'Run here' },
];

const SNOOZE_CHOICES = [
  { id: 'snooze-15m', label: '15 minutes', menu: 'Snooze' },
  { id: 'snooze-1h', label: '1 hour', menu: 'Snooze' },
  { id: 'snooze-4h', label: '4 hours', menu: 'Snooze' },
  { id: 'snooze-tomorrow-9', label: 'Tomorrow at 9:00 AM', menu: 'Snooze' },
];

export interface ResolveResult {
  loop: Loop;
  workspace?: ResolvedWorkspaceContext;
  deferred?: DeferredRunResult;
  /** Hard stop with a visible reason (event-pr branch unresolvable, FR-P1). */
  blocked?: string;
}

/**
 * Which firing events can name a PR branch, and how. Resolution is
 * source-aware because a generic `payload.branch` read is unsafe: the
 * `github:main-updated` payload carries `branch: <default branch>`, so a bare
 * field read would check out main as the "PR branch" and the event-pr planner
 * rules would then push straight to it. Only PR-scoped GitHub events resolve —
 * through the field that genuinely carries the PR head ref for that source.
 */
const PR_HEAD_BRANCH_SOURCES = new Set(['github:ci-failed', 'github:ci-passed', 'github:pr-opened']);
const PR_NUMBER_SOURCES = new Set(['github:pr-approved', 'github:review-comment', 'github:review-requested']);

/**
 * The PR branch an `event-pr` run works on, from the run's firing-event
 * observation. PR-head-branch sources use payload `branch` directly; other
 * PR-scoped sources resolve `prNumber`/`number` through the open-PR list.
 * Deterministic field reads — the payload shapes are our own adapters'
 * (github-kinds.ts), never guessed.
 */
type EventPrBranch = { branch: string; pullRequestNumber?: number } | { error: string };

async function eventPrBranch(host: OrchestratorHost, run: LoopRun | undefined): Promise<EventPrBranch> {
  const source = run?.firedBy?.source;
  const payload = run?.observations.find((o) => o.source === 'event')?.data as
    | { branch?: unknown; prNumber?: unknown; number?: unknown; prNumbers?: unknown }
    | undefined;
  if (!source || !payload) {
    return { error: 'This loop works on the PR branch named by its firing event, but this run was not started by an event.' };
  }
  if (!PR_HEAD_BRANCH_SOURCES.has(source) && !PR_NUMBER_SOURCES.has(source)) {
    return { error: `The firing event (${source}) is not scoped to a pull request, so there is no PR branch to work on.` };
  }
  if (PR_HEAD_BRANCH_SOURCES.has(source) && typeof payload.branch === 'string' && payload.branch.length > 0) {
    const pullRequestNumber = typeof payload.prNumber === 'number'
      ? payload.prNumber
      : typeof payload.number === 'number'
        ? payload.number
        : Array.isArray(payload.prNumbers)
          && payload.prNumbers.length === 1
          && typeof payload.prNumbers[0] === 'number'
          ? payload.prNumbers[0]
          : undefined;
    return { branch: payload.branch, pullRequestNumber };
  }
  const prNumber = typeof payload.prNumber === 'number' ? payload.prNumber : typeof payload.number === 'number' ? payload.number : undefined;
  if (prNumber === undefined) {
    return { error: 'The firing event names neither a branch nor a PR number, so there is no PR branch to work on.' };
  }
  const open = await host
    .listPullRequests()
    .catch((cause: unknown) => (cause instanceof Error ? cause.message : String(cause)));
  if (typeof open === 'string') {
    return { error: `Could not read the open pull-request list to resolve PR #${prNumber}: ${open}` };
  }
  const pr = open.find((candidate) => candidate.number === prNumber);
  if (!pr) return { error: `PR #${prNumber} from the firing event is not in the open-PR list — it may be closed or merged.` };
  return { branch: pr.headRefName, pullRequestNumber: pr.number };
}

/**
 * One acquisition, turned into the run's workspace context. The lease identity
 * travels with the context because `worktreeKey` names only the logical holder:
 * a release fenced on the key would reset whatever that key now points at.
 */
function contextFromLease(
  host: OrchestratorHost,
  lease: WorktreeLease,
  worktreeKey: string,
  resolvedBy: ResolvedWorkspaceContext['resolvedBy'],
): ResolvedWorkspaceContext {
  return {
    id: host.newId('ws'),
    type: 'managed-worktree',
    workspaceRoot: host.workspacePath,
    cwd: lease.worktreePath,
    worktreePath: lease.worktreePath,
    branchName: lease.branchName,
    worktreeKey,
    slotId: lease.slotId,
    leaseId: lease.leaseId,
    externalBranch: lease.branchKind === 'external-pr',
    resolvedBy,
    createdAt: host.now(),
  };
}

/** Managed worktree checked out at the PR's own branch (spec 15, FR-P1). */
async function resolveEventPrWorktree(host: OrchestratorHost, loop: Loop, run: LoopRun | undefined): Promise<ResolveResult> {
  const branch = await eventPrBranch(host, run);
  if ('error' in branch) return { loop, blocked: branch.error };
  const worktreeKey = worktreeKeyFor(loop);
  const outcome = await host
    .acquireWorktree({
      holder: worktreeKey,
      title: loop.title,
      existingBranch: branch.branch,
      pullRequestNumber: branch.pullRequestNumber,
    })
    .catch((error: unknown) => ({
      status: 'blocked' as const,
      reason: error instanceof Error ? error.message : String(error),
    }));
  if (outcome.status !== 'acquired') {
    return { loop, blocked: `Could not check out branch "${branch.branch}": ${outcome.reason}` };
  }
  const resolved = contextFromLease(host, outcome.lease, worktreeKey, 'create-option');
  return { loop: withResolved(loop, resolved), workspace: resolved };
}

async function resolveManagedWorktree(
  host: OrchestratorHost,
  loop: Loop,
  resolvedBy: ResolvedWorkspaceContext['resolvedBy'],
): Promise<ResolvedWorkspaceContext> {
  const worktreeKey = worktreeKeyFor(loop);
  const outcome = await host.acquireWorktree({ holder: worktreeKey, title: loop.title });
  if (outcome.status !== 'acquired') {
    throw new Error(`Could not lease a worktree for "${loop.title}": ${outcome.reason}`);
  }
  return contextFromLease(host, outcome.lease, worktreeKey, resolvedBy);
}

/**
 * Proves a persisted checkout still belongs to this run before the run is
 * allowed back into it. A restart, a moved directory, or a checkout Git no
 * longer registers all reach the same fail-closed answer: the run is blocked
 * with the host's reason, and nothing on disk is touched.
 */
async function reattachResolved(
  host: OrchestratorHost,
  loop: Loop,
  resolved: ResolvedWorkspaceContext,
): Promise<ResolveResult> {
  if (resolved.type !== 'managed-worktree' || !resolved.worktreePath) return { loop, workspace: resolved };
  const holder = resolved.worktreeKey ?? worktreeKeyFor(loop);
  const request: ReattachWorktreeRequest = resolved.slotId && resolved.leaseId
    ? { kind: 'lease', holder, slotId: resolved.slotId, leaseId: resolved.leaseId }
    : { kind: 'legacy', holder, worktreePath: resolved.worktreePath, branchName: resolved.branchName ?? null };
  const outcome = await host.reattachWorktree(request).catch((error: unknown) => ({
    status: 'recovery-required' as const,
    reason: error instanceof Error ? error.message : String(error),
  }));
  if (outcome.status !== 'attached') {
    return { loop, blocked: `This run's checkout could not be verified, so it was left untouched: ${outcome.reason}` };
  }
  // A legacy checkout is adopted under a new migration lease. Persist that
  // identity now, so the next release is fenced rather than key-addressed.
  const attached: ResolvedWorkspaceContext = {
    ...resolved,
    cwd: outcome.lease.worktreePath,
    worktreePath: outcome.lease.worktreePath,
    branchName: outcome.lease.branchName,
    slotId: outcome.lease.slotId,
    leaseId: outcome.lease.leaseId,
    externalBranch: resolved.externalBranch || outcome.lease.branchKind === 'external-pr',
  };
  return { loop: withResolved(loop, attached), workspace: attached };
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

export async function resolve(host: OrchestratorHost, loop: Loop, run?: LoopRun): Promise<ResolveResult> {
  // Reuse an already-resolved workspace for the loop's lifetime — but a
  // persisted path is a memory, not a proof, so the host validates it first.
  const resolved = loop.runtime.workspace.resolved;
  if (resolved) return reattachResolved(host, loop, resolved);

  if (loop.workspace.useManagedWorktree) {
    if (loop.workspace.worktreeBranchSource === 'event-pr') {
      return resolveEventPrWorktree(host, loop, run);
    }
    const resolved = await resolveManagedWorktree(host, loop, 'create-option');
    return { loop: withResolved(loop, resolved), workspace: resolved };
  }

  // Workspace-root mode with the user-owned override: run in place as-is and
  // skip the dirty preflight entirely (no git status call, no prompt).
  if (loop.workspace.allowDirtyWorkspaceRoot) {
    const resolved = workspaceRootContext(host, 'dirty-workspace-allowed');
    return { loop: withResolved(loop, resolved), workspace: resolved };
  }

  // Workspace-root mode: dirty preflight before background filesystem work.
  const status = await host.getWorkspaceStatus();
  if (!status.isGitRepository || !status.hasUncommittedChanges) {
    const resolved = workspaceRootContext(host, 'clean-workspace');
    return { loop: withResolved(loop, resolved), workspace: resolved };
  }
  return resolveDirty(host, loop, status.summary, run);
}

async function resolveDirty(host: OrchestratorHost, loop: Loop, summary: string, run?: LoopRun): Promise<ResolveResult> {
  const scheduled = Boolean(run?.triggerId);
  const canSnooze = !run?.firedBy;
  const choice = await host.requestChoice({
    title: `${loop.title} wants to run`,
    body: `This workspace has uncommitted changes (${summary}). Choose where this run should work.`,
    choices: canSnooze ? [...RUN_CHOICES, ...SNOOZE_CHOICES] : RUN_CHOICES,
    timeoutMs: loop.workspace.dirtyWorkspacePromptTimeoutMs,
    fallbackLabel: 'run isolated',
    context: {
      source: 'Sero Orchestrator',
      workspaceId: host.workspaceId,
      trigger: run?.firedBy ? 'Event-triggered loop' : scheduled ? 'Scheduled loop' : 'Loop',
    },
    openTarget: {
      appId: 'orchestrator',
      workspaceId: host.workspaceId,
      params: { loopId: loop.id },
      label: 'Open workflow',
    },
  });

  const now = host.now();
  const action = choice.timedOut ? 'create-managed-worktree' : choice.choiceId;

  const snoozedUntil = canSnooze ? snoozeUntil(action, now) : undefined;
  if (snoozedUntil) {
    const deferred: DeferredRunResult = {
      status: 'snoozed',
      reason: 'User snoozed the run because the workspace has uncommitted changes.',
      retryAt: snoozedUntil,
    };
    return {
      loop: {
        ...loop,
        runtime: {
          ...loop.runtime,
          snoozedUntil,
          pendingTriggerId: run?.triggerId,
        },
      },
      deferred,
    };
  }

  if (action === 'create-managed-worktree') {
    const resolvedBy = choice.timedOut ? 'dirty-workspace-timeout' : 'dirty-workspace-choice';
    const resolved = await resolveManagedWorktree(host, loop, resolvedBy);
    const decision: DirtyWorkspaceDecision = { action: 'create-managed-worktree', source: choice.timedOut ? 'timeout' : 'user', decidedAt: now };
    return { loop: withResolved(loop, resolved, decision), workspace: resolved };
  }

  if (action === 'run-in-workspace-root' || action === 'run-in-workspace-root-always') {
    // Run in the workspace root as-is — no stash. The "-always" variant persists
    // the override on the loop so later runs skip the prompt entirely.
    const base = action === 'run-in-workspace-root-always'
      ? { ...loop, workspace: { ...loop.workspace, allowDirtyWorkspaceRoot: true } }
      : loop;
    const resolved = workspaceRootContext(host, 'dirty-workspace-choice');
    const decision: DirtyWorkspaceDecision = { action: 'run-in-workspace-root', source: 'user', decidedAt: now };
    return { loop: withResolved(base, resolved, decision), workspace: resolved };
  }

  if (action === 'stash-current-changes') {
    const stash = await host.stashWorkspaceChanges(`orchestrator loop ${loop.id}`);
    const resolved = workspaceRootContext(host, 'dirty-workspace-choice');
    const decision: DirtyWorkspaceDecision = { action: 'stash-current-changes', source: 'user', decidedAt: now, stashRef: stash.stashRef ?? undefined };
    return { loop: withResolved(loop, resolved, decision), workspace: resolved };
  }

  // defer-workflow (or closing the prompt): record a skipped run without steps.
  const deferred: DeferredRunResult = {
    status: 'skipped',
    reason: 'User skipped the run because the workspace has uncommitted changes.',
  };
  return {
    loop,
    deferred,
  };
}

function snoozeUntil(action: string | null, now: string): string | undefined {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) return undefined;
  if (action === 'snooze-15m') date.setMinutes(date.getMinutes() + 15);
  else if (action === 'snooze-1h') date.setHours(date.getHours() + 1);
  else if (action === 'snooze-4h') date.setHours(date.getHours() + 4);
  else if (action === 'snooze-tomorrow-9') {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
  } else return undefined;
  return date.toISOString();
}
