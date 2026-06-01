import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { GitRunner } from './git-runner';

const SNAPSHOT_ID_PREFIX = 'turn-undo:';
const SNAPSHOT_REF_PREFIX = 'refs/sero/turn-undo/';
const SNAPSHOT_INDEX_REF_PREFIX = 'refs/sero/turn-undo-index/';
const MAX_SNAPSHOT_COUNT = 40;
const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

interface WorkingTreeSnapshot {
  headId: string | null;
  treeId: string;
  indexTreeId: string;
}

interface InternalSnapshotRef {
  id: string;
  refName: string;
  createdAtMs: number;
}

function buildSnapshotId(id: string): string {
  return `${SNAPSHOT_ID_PREFIX}${id}`;
}

function isValidSnapshotKey(value: string): boolean {
  return /^[0-9]{13}-[0-9a-f-]+$/i.test(value);
}

function stripSnapshotIdPrefix(snapshotId: string): string {
  if (!snapshotId.startsWith(SNAPSHOT_ID_PREFIX)) {
    throw new Error(`Unknown internal snapshot id: ${snapshotId}`);
  }

  const id = snapshotId.slice(SNAPSHOT_ID_PREFIX.length).trim();
  if (!isValidSnapshotKey(id)) {
    throw new Error(`Invalid internal snapshot id: ${snapshotId}`);
  }

  return id;
}

function buildSnapshotRefName(snapshotId: string): string {
  return `${SNAPSHOT_REF_PREFIX}${stripSnapshotIdPrefix(snapshotId)}`;
}

function buildSnapshotIndexRefName(snapshotId: string): string {
  return `${SNAPSHOT_INDEX_REF_PREFIX}${stripSnapshotIdPrefix(snapshotId)}`;
}

function parseSnapshotRef(refName: string): InternalSnapshotRef | null {
  if (!refName.startsWith(SNAPSHOT_REF_PREFIX)) return null;

  const id = refName.slice(SNAPSHOT_REF_PREFIX.length).trim();
  if (!isValidSnapshotKey(id)) return null;

  const [timestampToken] = id.split('-', 1);
  const createdAtMs = Number.parseInt(timestampToken ?? '', 10);
  if (!Number.isFinite(createdAtMs)) return null;

  return {
    id,
    refName,
    createdAtMs,
  };
}

async function withTempIndex<T>(
  runner: GitRunner,
  workspaceId: string,
  callback: (env: NodeJS.ProcessEnv) => Promise<T>,
): Promise<T> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'sero-turn-undo-'));
  const env = { GIT_INDEX_FILE: path.join(tempDir, 'index') };

  try {
    return await callback(env);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export class InternalSnapshotManager {
  constructor(private readonly runner: GitRunner) {}

  isInternalSnapshotId(snapshotId: string): boolean {
    return snapshotId.startsWith(SNAPSHOT_ID_PREFIX);
  }

  resolveRevision(snapshotId: string): string {
    return buildSnapshotRefName(snapshotId);
  }

  async createSnapshot(workspaceId: string): Promise<string> {
    await this.runner.ensureRepoInitialized(workspaceId);

    const snapshotState = await this.captureWorkingTreeSnapshot(workspaceId);
    const snapshotKey = `${Date.now()}-${randomUUID()}`;
    const refName = `${SNAPSHOT_REF_PREFIX}${snapshotKey}`;
    const indexRefName = `${SNAPSHOT_INDEX_REF_PREFIX}${snapshotKey}`;

    const commitArgs = ['commit-tree', snapshotState.treeId];
    if (snapshotState.headId) {
      commitArgs.push('-p', snapshotState.headId);
    }
    commitArgs.push('-m', `turn-undo snapshot ${snapshotKey}`);

    const commit = await this.runner.run(workspaceId, commitArgs);
    if (commit.exitCode !== 0) {
      throw new Error(commit.stderr || 'Failed to create internal turn-undo snapshot');
    }

    const commitId = commit.stdout.trim();
    if (!commitId) {
      throw new Error('Internal turn-undo snapshot commit id was empty');
    }

    const updateRef = await this.runner.run(workspaceId, ['update-ref', refName, commitId]);
    if (updateRef.exitCode !== 0) {
      throw new Error(updateRef.stderr || 'Failed to store internal turn-undo snapshot ref');
    }

    const updateIndexRef = await this.runner.run(workspaceId, [
      'update-ref',
      indexRefName,
      snapshotState.indexTreeId,
    ]);
    if (updateIndexRef.exitCode !== 0) {
      await this.runner.run(workspaceId, ['update-ref', '-d', refName]);
      throw new Error(updateIndexRef.stderr || 'Failed to store internal turn-undo snapshot index ref');
    }

    await this.cleanupSnapshots(workspaceId);
    return buildSnapshotId(snapshotKey);
  }

  async cleanupSnapshots(workspaceId: string): Promise<void> {
    await this.runner.ensureRepoInitialized(workspaceId);

    const refs = await this.listSnapshotRefs(workspaceId);
    const now = Date.now();
    const sorted = [...refs].sort((left, right) => right.createdAtMs - left.createdAtMs);
    const toDelete = new Set<string>();

    for (const ref of sorted) {
      if (now - ref.createdAtMs > MAX_SNAPSHOT_AGE_MS) {
        toDelete.add(ref.refName);
      }
    }

    for (const ref of sorted.slice(MAX_SNAPSHOT_COUNT)) {
      toDelete.add(ref.refName);
    }

    await Promise.all([...toDelete].map((refName) => this.deleteSnapshotRefs(workspaceId, refName)));
  }

  async hasWorkingTreeChangesSinceSnapshot(
    workspaceId: string,
    snapshotId: string,
  ): Promise<boolean> {
    await this.runner.ensureRepoInitialized(workspaceId);

    const currentTreeId = await this.captureWorkingTreeTreeId(workspaceId);
    const result = await this.runner.run(workspaceId, [
      'diff',
      '--quiet',
      this.resolveRevision(snapshotId),
      currentTreeId,
    ]);

    if (result.exitCode === 0) return false;
    if (result.exitCode === 1) return true;
    throw new Error(result.stderr || 'Failed to compare internal turn-undo snapshot');
  }

  async diffSnapshotToWorkingTree(workspaceId: string, snapshotId: string): Promise<string> {
    await this.runner.ensureRepoInitialized(workspaceId);

    const currentTreeId = await this.captureWorkingTreeTreeId(workspaceId);
    const result = await this.runner.run(
      workspaceId,
      ['diff', this.resolveRevision(snapshotId), currentTreeId],
      60_000,
    );

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to diff internal turn-undo snapshot');
    }

    return result.stdout;
  }

  async restoreSnapshot(workspaceId: string, snapshotId: string): Promise<void> {
    await this.runner.ensureRepoInitialized(workspaceId);

    const snapshotRef = this.resolveRevision(snapshotId);
    const restore = await this.runner.run(workspaceId, ['read-tree', '--reset', '-u', snapshotRef]);
    if (restore.exitCode !== 0) {
      throw new Error(restore.stderr || `Failed to restore internal snapshot ${snapshotId}`);
    }

    const clean = await this.runner.run(workspaceId, ['clean', '-fd']);
    if (clean.exitCode !== 0) {
      throw new Error(clean.stderr || `Failed to clean workspace for internal snapshot ${snapshotId}`);
    }

    const indexSnapshotRef = buildSnapshotIndexRefName(snapshotId);
    if (await this.hasRef(workspaceId, indexSnapshotRef)) {
      const restoreIndex = await this.runner.run(workspaceId, [
        'read-tree',
        '--reset',
        indexSnapshotRef,
      ]);
      if (restoreIndex.exitCode !== 0) {
        throw new Error(
          restoreIndex.stderr || `Failed to restore staged state for internal snapshot ${snapshotId}`,
        );
      }
      return;
    }

    const head = await this.resolveHeadId(workspaceId);
    if (head) {
      const reset = await this.runner.run(workspaceId, ['reset', '--mixed', 'HEAD']);
      if (reset.exitCode !== 0) {
        throw new Error(reset.stderr || `Failed to unstage restored internal snapshot ${snapshotId}`);
      }
      return;
    }

    const clearIndex = await this.runner.run(workspaceId, ['read-tree', '--empty']);
    if (clearIndex.exitCode !== 0) {
      throw new Error(clearIndex.stderr || `Failed to clear index after restoring ${snapshotId}`);
    }
  }

  private async captureWorkingTreeTreeId(workspaceId: string): Promise<string> {
    const snapshotState = await this.captureWorkingTreeSnapshot(workspaceId);
    return snapshotState.treeId;
  }

  private async captureWorkingTreeSnapshot(workspaceId: string): Promise<WorkingTreeSnapshot> {
    const indexTreeId = await this.captureIndexTreeId(workspaceId);

    return withTempIndex(this.runner, workspaceId, async (env) => {
      const headId = await this.resolveHeadId(workspaceId);
      if (headId) {
        const readHead = await this.runner.runWithEnv(workspaceId, ['read-tree', headId], env);
        if (readHead.exitCode !== 0) {
          throw new Error(readHead.stderr || 'Failed to seed temporary snapshot index');
        }
      }

      const addAll = await this.runner.runWithEnv(workspaceId, ['add', '-A'], env);
      if (addAll.exitCode !== 0) {
        throw new Error(addAll.stderr || 'Failed to capture working tree snapshot');
      }

      const writeTree = await this.runner.runWithEnv(workspaceId, ['write-tree'], env);
      if (writeTree.exitCode !== 0) {
        throw new Error(writeTree.stderr || 'Failed to write internal snapshot tree');
      }

      const treeId = writeTree.stdout.trim();
      if (!treeId) {
        throw new Error('Internal snapshot tree id was empty');
      }

      return {
        headId,
        treeId,
        indexTreeId,
      };
    });
  }

  private async captureIndexTreeId(workspaceId: string): Promise<string> {
    const writeTree = await this.runner.run(workspaceId, ['write-tree']);
    if (writeTree.exitCode !== 0) {
      throw new Error(writeTree.stderr || 'Failed to write internal snapshot index tree');
    }

    const treeId = writeTree.stdout.trim();
    if (!treeId) {
      throw new Error('Internal snapshot index tree id was empty');
    }

    return treeId;
  }

  private async resolveHeadId(workspaceId: string): Promise<string | null> {
    const head = await this.runner.run(workspaceId, ['rev-parse', '--verify', 'HEAD']);
    if (head.exitCode !== 0) return null;

    const headId = head.stdout.trim();
    return headId || null;
  }

  private async hasRef(workspaceId: string, refName: string): Promise<boolean> {
    const result = await this.runner.run(workspaceId, ['rev-parse', '--verify', refName]);
    return result.exitCode === 0;
  }

  private async deleteSnapshotRefs(workspaceId: string, refName: string): Promise<void> {
    const ref = parseSnapshotRef(refName);
    if (!ref) return;

    const remove = await this.runner.run(workspaceId, ['update-ref', '-d', ref.refName]);
    if (remove.exitCode !== 0) {
      throw new Error(remove.stderr || `Failed to delete stale snapshot ref ${ref.refName}`);
    }

    const indexRefName = `${SNAPSHOT_INDEX_REF_PREFIX}${ref.id}`;
    if (!(await this.hasRef(workspaceId, indexRefName))) {
      return;
    }

    const removeIndex = await this.runner.run(workspaceId, ['update-ref', '-d', indexRefName]);
    if (removeIndex.exitCode !== 0) {
      throw new Error(removeIndex.stderr || `Failed to delete stale snapshot ref ${indexRefName}`);
    }
  }

  private async listSnapshotRefs(workspaceId: string): Promise<InternalSnapshotRef[]> {
    const refs = await this.runner.run(workspaceId, [
      'for-each-ref',
      '--format=%(refname)',
      SNAPSHOT_REF_PREFIX,
    ]);

    if (refs.exitCode !== 0) {
      throw new Error(refs.stderr || 'Failed to list internal turn-undo snapshots');
    }

    return refs.stdout
      .split(/\r?\n/)
      .map((line) => parseSnapshotRef(line.trim()))
      .filter((ref): ref is InternalSnapshotRef => ref !== null);
  }
}
