/**
 * Where a Room's members edit, and how their work survives (spec §20).
 *
 * Three placements, and only three:
 *
 *  1. **Read-only shared** — the workspace root, read-only. Every member that
 *     cannot write lands here, whatever its blueprint asked for: a member with
 *     no write permission gains nothing from its own checkout.
 *  2. **Own worktree** — the default for anyone that edits. One managed worktree
 *     per editing member, created through the unified Git service (AD-024).
 *  3. **Shared working tree** — writing in the workspace root itself. Reachable
 *     ONLY when the Room's policy names that mode AND the user approved it.
 *     `mode` alone is never enough: a blueprint can name a mode the user never
 *     agreed to, so both halves are checked here as well as at validation.
 *
 * Placement is the single source of truth for where a member works. It writes
 * `worktreePath` and aligns `configuration.needsWorktree`, because that flag is
 * how the already-built grant projection (`memberCwdRoots`) reads this decision.
 * Aligning it can only narrow a member's reach — an editing member moves from
 * the shared root to its own tree, and a read-only member keeps read access to
 * the same files either way — and it happens before any grant exists.
 *
 * ## How uncommitted work is preserved
 *
 * "We do not delete it" is not a mechanism, so there are two:
 *
 *  - **No removal on the failure and cancellation paths.** `preserveRoom` is the
 *    only call those paths make, and it removes nothing. Cancelling a Room
 *    therefore cannot reach a `removeWorktree` at all.
 *  - **Removal is gated on a successful checkpoint.** Every path that does
 *    remove a checkout first calls `host.createCheckpoint`, which commits the
 *    member's uncommitted edits onto its own branch. If the checkpoint throws,
 *    the checkout is KEPT and the failure is reported. Removal then passes
 *    `deleteMergedBranch` and never `deleteBranch`, so the branch holding those
 *    commits survives unless Git itself confirms the work is already merged.
 *
 * The residue this leaves is files Git ignores: a checkpoint commits what Git
 * tracks, so `.gitignore`d scratch files in a removed worktree do go. That is
 * the same contract loop worktrees have always had.
 */

import type { RoomMember } from '../../shared/room-types';
import type { OrchestratorHost, WorktreeLease } from '../host';
import { timelineEvent } from './room-actions';
import type { RoomRecord } from './room-state';
import type { RoomStore } from './room-store';

export type MemberPlacementKind = 'read-only-shared' | 'own-worktree' | 'shared-tree';

export interface MemberPlacement {
  memberId: string;
  kind: MemberPlacementKind;
  /** The directory this member works in. */
  cwd: string;
  /** The branch its worktree is on; null in either shared placement. */
  branch: string | null;
  writable: boolean;
  /** Plain-English, for the timeline and the UI. */
  reason: string;
}

export interface PreservedWork {
  memberId: string;
  worktreePath: string;
  branch: string | null;
  /** Commit that now holds the member's uncommitted edits; null when it had none. */
  commit: string | null;
  /** Set when the checkpoint failed. The checkout is then kept, never removed. */
  error: string | null;
}

export interface ReleaseResult {
  memberId: string;
  preserved: PreservedWork | null;
  /** False when the checkout was kept — `reason` says why. */
  removed: boolean;
  reason: string;
}

/** One editing member's branch, as the Conductor collects it. */
export interface MemberBranch {
  memberId: string;
  displayName: string;
  branch: string | null;
  worktreePath: string;
  /** Commit made from work that was still uncommitted when collection ran. */
  checkpoint: string | null;
  changedFiles: string[];
  error: string | null;
}

/** A file two or more members changed. Integration has to reconcile it. */
export interface BranchConflict {
  path: string;
  memberIds: string[];
}

export interface CommitCollection {
  ok: true;
  branches: MemberBranch[];
  conflicts: BranchConflict[];
  /** One paragraph the Conductor can act on directly. */
  summary: string;
}

export interface CollectionDenied {
  ok: false;
  code: 'unknown-room' | 'not-conductor';
  message: string;
}

export type CollectionResult = CommitCollection | CollectionDenied;

export interface RoomWorkspacesContext {
  host: OrchestratorHost;
  store: RoomStore;
}

export interface RoomWorkspaces {
  /** Places every member. Runs BEFORE the grant — the grant reads the placement. */
  prepare(roomId: string): Promise<MemberPlacement[]>;
  /** Places one member, for a roster revision that adds or replaces one. */
  prepareMember(roomId: string, memberId: string): Promise<MemberPlacement | null>;
  /** Commits every editing member's uncommitted work. Removes nothing. */
  preserveRoom(roomId: string, reason: string): Promise<PreservedWork[]>;
  /** Retirement: preserve the member's work, then release its checkout. */
  releaseMember(roomId: string, memberId: string, reason: string): Promise<ReleaseResult>;
  /** Cleanup after a finished Room: preserve everything, then release the checkouts. */
  releaseRoom(roomId: string, reason: string): Promise<ReleaseResult[]>;
  /** Conductor-only: collect member branches and report overlapping edits. */
  collectCommits(roomId: string, callerMemberId: string): Promise<CollectionResult>;
}

/**
 * Worktree key for one member. It is derived, not stored: the same string has to
 * name the checkout at create time and at remove time, and a stored copy is one
 * more thing that can disagree with reality.
 */
export function worktreeKeyFor(roomId: string, memberId: string): string {
  return `room-${roomId}-${memberId}`;
}

export function placementKindFor(record: RoomRecord, member: RoomMember): MemberPlacementKind {
  if (member.configuration.permissions === 'read-only') return 'read-only-shared';
  const policy = record.definition.workspacePolicy;
  if (policy.mode === 'shared-working-tree' && policy.sharedTreeApproved) return 'shared-tree';
  // Everything else that writes gets its own tree — including a write-capable
  // member in a Room whose mode is read-only. That combination is a defect
  // upstream, and an isolated checkout is the safe way to be wrong about it.
  return 'own-worktree';
}

function describePlacement(kind: MemberPlacementKind, member: RoomMember): string {
  if (kind === 'own-worktree') return `${member.displayName} edits in its own worktree.`;
  if (kind === 'shared-tree') return `${member.displayName} edits in the shared working tree, which you approved.`;
  return `${member.displayName} reads the shared workspace and cannot change it.`;
}

/** `M\tsrc/a.ts`, `R100\told\tnew` → the path as it exists now. */
export function parseChangedFiles(nameStatus: string): string[] {
  const paths = nameStatus
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t').pop() ?? '')
    .filter((file) => file.length > 0);
  return [...new Set(paths)];
}

export function findBranchConflicts(branches: MemberBranch[]): BranchConflict[] {
  const owners = new Map<string, string[]>();
  for (const branch of branches) {
    for (const path of branch.changedFiles) {
      owners.set(path, [...(owners.get(path) ?? []), branch.memberId]);
    }
  }
  return [...owners]
    .filter(([, memberIds]) => memberIds.length > 1)
    .map(([path, memberIds]) => ({ path, memberIds }));
}

function summarizeCollection(branches: MemberBranch[], conflicts: BranchConflict[]): string {
  if (branches.length === 0) return 'No member is editing, so there is nothing to collect.';
  const lines = [`Collected ${branches.length} member branch(es).`];
  const failed = branches.filter((branch) => branch.error);
  if (failed.length > 0) {
    lines.push(`Could not read ${failed.map((branch) => branch.displayName).join(', ')}.`);
  }
  lines.push(
    conflicts.length === 0
      ? 'No two members changed the same file.'
      : `${conflicts.length} file(s) were changed by more than one member: ${conflicts
          .slice(0, 10)
          .map((conflict) => conflict.path)
          .join(', ')}.`,
  );
  return lines.join(' ');
}

export function createRoomWorkspaces(ctx: RoomWorkspacesContext): RoomWorkspaces {
  const { host, store } = ctx;

  async function acquire(roomId: string, record: RoomRecord, member: RoomMember): Promise<WorktreeLease> {
    const outcome = await host.acquireWorktree({
      holder: worktreeKeyFor(roomId, member.id),
      title: `${record.definition.title} — ${member.displayName}`,
    });
    if (outcome.status !== 'acquired') {
      throw new Error(`${member.displayName} could not be given a worktree: ${outcome.reason}`);
    }
    return outcome.lease;
  }

  /**
   * Proves a checkout the member already has. Failure THROWS rather than
   * falling back: the alternatives are pinning the member to the shared tree —
   * the exact reach a worktree exists to prevent — or minting a second branch
   * and orphaning the work on the first. A Room that cannot prove one member's
   * checkout does not start, and nothing on disk is touched.
   */
  async function proveExistingCheckout(roomId: string, member: RoomMember): Promise<WorktreeLease> {
    const worktreePath = member.worktreePath;
    if (!worktreePath) throw new Error(`${member.displayName} has no checkout to prove.`);
    const holder = worktreeKeyFor(roomId, member.id);
    const outcome = await host.reattachWorktree(
      member.worktreeSlotId && member.worktreeLeaseId
        ? { kind: 'lease', holder, slotId: member.worktreeSlotId, leaseId: member.worktreeLeaseId }
        : { kind: 'legacy', holder, worktreePath, branchName: member.worktreeBranch },
    );
    if (outcome.status !== 'attached') {
      throw new Error(`${member.displayName}'s worktree could not be verified, so it was left untouched: ${outcome.reason}`);
    }
    return outcome.lease;
  }

  /** Places one member, creating its worktree when it needs one it does not have. */
  async function place(record: RoomRecord, member: RoomMember): Promise<MemberPlacement> {
    const roomId = record.definition.id;
    const kind = placementKindFor(record, member);
    const reason = describePlacement(kind, member);
    if (kind !== 'own-worktree') {
      // `worktreePath` is deliberately NOT cleared. A member that had a checkout
      // and later stopped needing one (a revision lowered it to read-only) still
      // has work in that tree; dropping the pointer would orphan it on disk with
      // nothing left in the Room that names it. The path is cleared in exactly
      // one place — after a checkpoint and a successful removal.
      await store.updateMember(roomId, member.id, (current) => ({
        ...current,
        configuration: { ...current.configuration, needsWorktree: false },
      }));
      return {
        memberId: member.id,
        kind,
        cwd: host.workspacePath,
        branch: null,
        writable: kind === 'shared-tree',
        reason,
      };
    }
    // Reuse an existing checkout: a restart or a second prepare must not mint a
    // second branch and orphan the work already on the first. A persisted path
    // is a memory, so the host proves it before the member is let back in.
    const lease = member.worktreePath
      ? await proveExistingCheckout(roomId, member)
      : await acquire(roomId, record, member);
    await store.updateMember(roomId, member.id, (current) => ({
      ...current,
      worktreePath: lease.worktreePath,
      worktreeBranch: lease.branchName,
      worktreeSlotId: lease.slotId,
      worktreeLeaseId: lease.leaseId,
      configuration: { ...current.configuration, needsWorktree: true },
    }));
    return {
      memberId: member.id,
      kind,
      cwd: lease.worktreePath,
      branch: lease.branchName,
      writable: true,
      reason,
    };
  }

  /**
   * Commits whatever is uncommitted in a member's checkout. A member with no
   * checkout has nothing that can be lost, so it returns null rather than an
   * empty record.
   */
  async function checkpoint(member: RoomMember, reason: string): Promise<PreservedWork | null> {
    if (!member.worktreePath) return null;
    const base: PreservedWork = {
      memberId: member.id,
      worktreePath: member.worktreePath,
      branch: member.worktreeBranch,
      commit: null,
      error: null,
    };
    const outcome = await host
      .createCheckpoint(member.worktreePath, `Room checkpoint (${reason}): ${member.displayName}`)
      .then((commit) => ({ commit }))
      .catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
    return 'error' in outcome ? { ...base, error: outcome.error } : { ...base, commit: outcome.commit };
  }

  async function preserveAll(roomId: string, record: RoomRecord, reason: string): Promise<PreservedWork[]> {
    const preserved: PreservedWork[] = [];
    for (const member of record.members) {
      const result = await checkpoint(member, reason);
      if (result) preserved.push(result);
    }
    if (preserved.length === 0) return preserved;
    const committed = preserved.filter((entry) => entry.commit);
    const failed = preserved.filter((entry) => entry.error);
    await store.appendTimeline(roomId, [
      timelineEvent(
        host,
        roomId,
        'work',
        null,
        failed.length === 0
          ? `Saved uncommitted work in ${committed.length} of ${preserved.length} worktree(s): ${reason}.`
          : `Could not save work in ${failed.length} worktree(s), so they were kept as they are.`,
        { reason, committed: committed.length, failed: failed.length },
      ),
    ]);
    return preserved;
  }

  /**
   * Preserve, then remove — in that order, and only in that order. A failed
   * checkpoint keeps the checkout, because removing it is the one action that
   * cannot be undone.
   */
  async function release(roomId: string, member: RoomMember, reason: string): Promise<ReleaseResult> {
    const preserved = await checkpoint(member, reason);
    if (!preserved) return { memberId: member.id, preserved: null, removed: false, reason: 'This member has no worktree.' };
    if (preserved.error) {
      return {
        memberId: member.id,
        preserved,
        removed: false,
        reason: `Its work could not be committed (${preserved.error}), so the worktree was kept.`,
      };
    }
    // Fenced on the member's exact lease. A checkout with no lease identity
    // predates the pool: it is kept, not removed, because nothing here can
    // prove whose it is. `deleteMergedBranch`, never `deleteBranch`: Git
    // decides whether the branch is redundant, so a checkpoint that is not yet
    // merged keeps its branch.
    if (!member.worktreeSlotId || !member.worktreeLeaseId) {
      return {
        memberId: member.id,
        preserved,
        removed: false,
        reason: 'Its worktree predates the worktree pool, so it was kept rather than released.',
      };
    }
    const outcome = await host.releaseWorktree({
      slotId: member.worktreeSlotId,
      expectedLeaseId: member.worktreeLeaseId,
      disposition: 'recycle',
      deleteMergedBranch: true,
    });
    if (outcome.checkout !== 'removed') {
      return {
        memberId: member.id,
        preserved,
        removed: false,
        reason: `Its worktree was kept (${outcome.status}): ${outcome.reason}`,
      };
    }
    await store.updateMember(roomId, member.id, (current) => ({
      ...current,
      worktreePath: null,
      worktreeSlotId: null,
      worktreeLeaseId: null,
    }));
    await store.appendTimeline(roomId, [
      timelineEvent(host, roomId, 'work', member.id, `${member.displayName}'s worktree was released: ${reason}.`, {
        branch: preserved.branch ?? '',
        commit: preserved.commit ?? '',
      }),
    ]);
    return {
      memberId: member.id,
      preserved,
      removed: true,
      reason: preserved.commit
        ? `Its work was committed to ${preserved.branch ?? 'its branch'} before the worktree was removed.`
        : 'It had nothing uncommitted.',
    };
  }

  return {
    async prepare(roomId) {
      const record = await store.readRoom(roomId);
      if (!record) return [];
      const placements: MemberPlacement[] = [];
      for (const member of record.members) {
        if (member.status === 'retired') continue;
        placements.push(await place(record, member));
      }
      const worktrees = placements.filter((placement) => placement.kind === 'own-worktree').length;
      await store.appendTimeline(roomId, [
        timelineEvent(
          host,
          roomId,
          'session',
          null,
          `Workspace ready: ${worktrees} member(s) edit in their own worktree, ${placements.length - worktrees} share the workspace.`,
          { mode: record.definition.workspacePolicy.mode },
        ),
      ]);
      return placements;
    },

    async prepareMember(roomId, memberId) {
      const record = await store.readRoom(roomId);
      const member = record?.members.find((candidate) => candidate.id === memberId);
      if (!record || !member) return null;
      return place(record, member);
    },

    async preserveRoom(roomId, reason) {
      const record = await store.readRoom(roomId);
      return record ? preserveAll(roomId, record, reason) : [];
    },

    async releaseMember(roomId, memberId, reason) {
      const record = await store.readRoom(roomId);
      const member = record?.members.find((candidate) => candidate.id === memberId);
      if (!member) return { memberId, preserved: null, removed: false, reason: 'There is no such member.' };
      return release(roomId, member, reason);
    },

    async releaseRoom(roomId, reason) {
      const record = await store.readRoom(roomId);
      if (!record) return [];
      const results: ReleaseResult[] = [];
      for (const member of record.members) {
        if (!member.worktreePath) continue;
        results.push(await release(roomId, member, reason));
      }
      return results;
    },

    async collectCommits(roomId, callerMemberId) {
      const record = await store.readRoom(roomId);
      if (!record) return { ok: false, code: 'unknown-room', message: `There is no Room ${roomId}.` };
      // Authority is checked against the caller's member id in runtime code. A
      // message claiming to be from the Conductor proves nothing (spec §18).
      const caller = record.members.find((member) => member.id === callerMemberId);
      if (!caller?.isConductor) {
        return { ok: false, code: 'not-conductor', message: 'Only the Conductor collects the Room\'s commits.' };
      }
      const branches: MemberBranch[] = [];
      for (const member of record.members) {
        if (!member.worktreePath) continue;
        // Checkpoint first: work still sitting uncommitted in a member's tree is
        // part of what the Conductor is collecting, and it would otherwise be
        // invisible to every Git read that follows.
        const preserved = await checkpoint(member, 'collection');
        const summary = await host
          .getDiffSummary(member.worktreePath)
          .catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
        branches.push({
          memberId: member.id,
          displayName: member.displayName,
          branch: member.worktreeBranch,
          worktreePath: member.worktreePath,
          checkpoint: preserved?.commit ?? null,
          changedFiles: typeof summary === 'string' ? parseChangedFiles(summary) : [],
          error: preserved?.error ?? (typeof summary === 'string' ? null : summary.error),
        });
      }
      const conflicts = findBranchConflicts(branches);
      const summary = summarizeCollection(branches, conflicts);
      await store.appendTimeline(roomId, [
        timelineEvent(host, roomId, 'work', callerMemberId, summary, {
          branches: branches.length,
          conflicts: conflicts.length,
        }),
      ]);
      return { ok: true, branches, conflicts, summary };
    },
  };
}
